import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { saveIntegratedAnalysis, getGoodExamples } from '@/lib/database'
import { supabase } from '@/lib/supabase'

const MAX_TEXT_LEN = 200000

/** AI 응답 텍스트에서 JSON 블록 추출 후 파싱 */
function parseJsonFromResponse(text) {
  const clean = (text || '').replace(/```json|```/g, '').trim()
  const first = clean.indexOf('{')
  const last = clean.lastIndexOf('}')
  const jsonStr =
    first >= 0 && last > first ? clean.slice(first, last + 1) : clean
  return JSON.parse(jsonStr)
}

/** 공통 시스템 프롬프트 + 사건 컨텍스트 (evidence 블록 제외) */
function buildSystemPrompt(userContext, examples, caseType) {
  let p = `당신은 한국 형사변호 전문 AI 어시스턴트입니다.

분석 원칙:
1. 피고인/피의자에게 유리한 관점, 검찰(혹은 피해자)에게 유리한 관점에서 모두 분석
2. 피고인/피의자 vs. 검찰(피해자)의 각 주장의 논리적 허점과 증거의 모순점 발견
3. 증거능력과 증명력을 비판적으로 검토
4. 명확한 절차적 위법 사항이 있을 시 언급 (위법수집증거, 영장주의 위반 등)
5. 양형 참작 사유 적극 발굴

한국 형사소송법과 판례를 기준으로 분석하세요.
모든 주장은 증거 기반으로 작성하세요.`

  if (examples?.length > 0) {
    p += `\n\n다음은 좋은 분석 예시들입니다. 이와 유사한 수준으로 분석하세요:\n\n`
    examples.forEach((ex, idx) => {
      p += `예시 ${idx + 1}:\n입력: ${ex.input_summary}\n분석 결과:\n${JSON.stringify(ex.output_analysis, null, 2)}\n\n`
    })
  }

  if (userContext?.representing === 'defendant') {
    p += `\n\n특별 지시: 이 사건에서 피고인/피의자를 대리합니다. 피고인에게 유리한 분석에 더 중점을 두세요.`
  } else if (userContext?.representing === 'plaintiff') {
    p += `\n\n특별 지시: 이 사건에서 피해자/고소인을 대리합니다. 피해자에게 유리한 분석에 더 중점을 두세요.`
  }
  if (userContext?.case_background) p += `\n\n사건 배경:\n${userContext.case_background}`
  if (userContext?.defendant_claim) p += `\n\n피고인/피의자 주장:\n${userContext.defendant_claim}`
  if (userContext?.plaintiff_claim) p += `\n\n검찰/피해자 주장:\n${userContext.plaintiff_claim}`
  if (userContext?.focus_areas) p += `\n\n중점 검토 사항:\n${userContext.focus_areas}`

  return p
}

/** 증거기록 참고 블록 (선택 문서만) */
function buildEvidenceBlock(evidenceContext, documentIds) {
  const sections = evidenceContext?.sections ?? []
  const allowed = Array.isArray(documentIds) && documentIds.length > 0 ? new Set(documentIds) : null
  const filtered = allowed ? sections.filter((s) => s.document_id && allowed.has(s.document_id)) : sections
  if (filtered.length === 0) return ''

  const MAX = 2500
  let block = `\n\n아래는 이미 증거기록으로 분류된 내용과, 분석이 완료된 섹션의 분석 결과입니다. 참고하여 작성하세요.\n\n`
  filtered.forEach((s, idx) => {
    block += `--- 증거 섹션 ${idx + 1}: ${s.section_title || s.section_type} (유형: ${s.section_type}, p.${s.start_page}-${s.end_page}) ---\n`
    if (s.extracted_text?.trim()) {
      const excerpt = s.extracted_text.length > MAX ? s.extracted_text.slice(0, MAX) + '...' : s.extracted_text
      block += `[발췌]\n${excerpt}\n\n`
    }
    if (s.analysis_result != null && typeof s.analysis_result === 'object') {
      block += `[섹션 분석 결과]\n${JSON.stringify(s.analysis_result, null, 2)}\n\n`
    }
  })
  block += '--- 위 증거기록 참고 끝 ---\n\n'
  return block
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { texts, documentIds, caseId, userContext, caseType, evidenceContext } =
      await request.json()

    if (!texts || texts.length === 0) {
      return NextResponse.json(
        { error: '분석할 텍스트가 없습니다.' },
        { status: 400 }
      )
    }

    const combinedText = texts
      .map((t, idx) => `[문서 ${idx + 1}]\n${t}`)
      .join('\n\n=== 문서 구분 ===\n\n')
    const textSnippet = combinedText.substring(0, MAX_TEXT_LEN)

    const examples = await getGoodExamples(caseType || '폭행', 3)
    const systemPrompt = buildSystemPrompt(userContext, examples, caseType)
    const evidenceBlock = buildEvidenceBlock(evidenceContext, documentIds)

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // ——— 1단계: 요약 + 쟁점 ———
    const prompt1 = `${systemPrompt}

다음 수사기록을 읽고, **사건 요약**과 **주요 쟁점**만 추출하세요. 다른 항목은 작성하지 마세요.
${evidenceBlock}
--- 수사기록 원문 ---

${textSnippet}

**반환 형식 (JSON만, 다른 설명 없이):**
{
  "summary": "3~5문장 사건 요약",
  "issues": ["쟁점1", "쟁점2", "쟁점3"]
}`

    let step1
    try {
      const res1 = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt1 }] }],
      })
      const raw1 = res1.response?.text?.() ?? ''
      if (!raw1) throw new Error('1단계: AI 응답 없음')
      step1 = parseJsonFromResponse(raw1)
    } catch (e) {
      console.error('Multistage step1 error:', e)
      return NextResponse.json(
        { error: '1단계(요약·쟁점) 분석 실패: ' + (e?.message || e) },
        { status: 500 }
      )
    }

    // ——— 2단계: 타임라인 (1단계 결과 참고) ———
    const prompt2 = `${systemPrompt}

아래는 이미 추출된 [사건 요약]과 [쟁점]입니다. 이 수사기록 원문을 바탕으로 **타임라인**만 추출하세요.
[사건 요약] ${step1.summary || ''}
[쟁점] ${JSON.stringify(step1.issues || [])}

--- 수사기록 원문 ---

${textSnippet}

**페이지 규칙:** 원문에 "[문서 N - k페이지]" 표기가 있으면 해당 구간은 page: k 로 참조. 없는 페이지 번호를 만들지 마세요.

**반환 형식 (JSON만):**
{
  "timeline": [
    {
      "date": "YYYY-MM-DD",
      "event": "이벤트 설명",
      "source": "문서/출처",
      "page": 1
    }
  ]
}

**모든 timeline 항목에 page 필수.**`

    let step2
    try {
      const res2 = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt2 }] }],
      })
      const raw2 = res2.response?.text?.() ?? ''
      if (!raw2) throw new Error('2단계: AI 응답 없음')
      step2 = parseJsonFromResponse(raw2)
    } catch (e) {
      console.error('Multistage step2 error:', e)
      return NextResponse.json(
        { error: '2단계(타임라인) 분석 실패: ' + (e?.message || e) },
        { status: 500 }
      )
    }

    // ——— 3단계: 증거 + 유리한 정황 + 모순점 (1·2단계 참고) ———
    const prompt3 = `${systemPrompt}

아래는 이미 추출된 [요약], [쟁점], [타임라인]입니다. 이 수사기록 원문을 바탕으로 **증거 목록**, **유리한 정황**, **발견된 모순점**만 추출하세요.
[요약] ${step1.summary || ''}
[쟁점] ${JSON.stringify(step1.issues || [])}
[타임라인] ${JSON.stringify((step2.timeline || []).slice(0, 15))}
${evidenceBlock}
--- 수사기록 원문 (타임라인·모순점은 반드시 이 원문에만 근거) ---

${textSnippet}

**페이지 규칙:** evidence·favorable_facts는 해당 내용이 나오는 페이지의 "[문서 N - k페이지]"에서 k를 사용. 문서에 없는 페이지를 만들지 마세요.

**반환 형식 (JSON만):**
{
  "evidence": [
    { "type": "물증/인증/서증", "description": "증거 설명", "page": 1 }
  ],
  "favorable_facts": [
    { "fact": "유리한 정황 설명", "page": 2 }
  ],
  "contradictions": [
    {
      "statement_1": "진술1",
      "statement_2": "진술2",
      "analysis": "모순 분석",
      "statement_1_page": 1,
      "statement_2_page": 3
    }
  ]
}

**모든 evidence·timeline·favorable_facts에 page 필수.**`

    let step3
    try {
      const res3 = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt3 }] }],
      })
      const raw3 = res3.response?.text?.() ?? ''
      if (!raw3) throw new Error('3단계: AI 응답 없음')
      step3 = parseJsonFromResponse(raw3)
    } catch (e) {
      console.error('Multistage step3 error:', e)
      return NextResponse.json(
        { error: '3단계(증거·유리한 정황·모순점) 분석 실패: ' + (e?.message || e) },
        { status: 500 }
      )
    }

    // 결과 병합 (기존 통합 분석과 동일한 구조)
    const analysis = {
      summary: step1.summary ?? '',
      issues: Array.isArray(step1.issues) ? step1.issues : [],
      timeline: Array.isArray(step2.timeline) ? step2.timeline : [],
      evidence: Array.isArray(step3.evidence) ? step3.evidence : [],
      favorable_facts: Array.isArray(step3.favorable_facts) ? step3.favorable_facts : [],
      contradictions: Array.isArray(step3.contradictions) ? step3.contradictions : [],
    }

    let multistageTitle = '다단계 분석'
    if (caseId && documentIds?.length > 0) {
      try {
        const { data: docs } = await supabase
          .from('documents')
          .select('original_file_name')
          .in('id', documentIds)
        if (docs?.length > 0) {
          multistageTitle =
            docs.length === 1
              ? `${docs[0].original_file_name ?? '문서'} (다단계)`
              : `${docs[0].original_file_name ?? ''} 외 ${docs.length - 1}개 (다단계)`
        }
        await saveIntegratedAnalysis(caseId, documentIds, analysis, multistageTitle)
      } catch (saveErr) {
        console.error('saveIntegratedAnalysis (multistage) error:', saveErr)
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      examplesUsed: examples.length,
      steps: 3,
    })
  } catch (error) {
    console.error('Multistage analysis error:', error)
    return NextResponse.json(
      { error: error.message || '다단계 분석 실패' },
      { status: 500 }
    )
  }
}
