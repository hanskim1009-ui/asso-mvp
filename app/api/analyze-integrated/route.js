import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { saveIntegratedAnalysis, getGoodExamples } from '@/lib/database'

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

    const examples = await getGoodExamples(caseType || '폭행', 3)
    console.log('[Few-shot] 사건 유형:', caseType || '폭행', '| 학습 예시 개수:', examples.length)

    let systemPrompt = `당신은 한국 형사변호 전문 AI 어시스턴트입니다.

분석 원칙:
1. 피고인/피의자에게 유리한 관점, 검찰(혹은 피해자)에게 유리한 관점에서 모두 분석
2. 피고인/피의자 vs. 검찰(피해자)의 각 주장의 논리적 허점과 증거의 모순점 발견
3. 증거능력과 증명력을 비판적으로 검토
4. 명확한 절차적 위법 사항이 있을 시 언급 (위법수집증거, 영장주의 위반 등)
5. 양형 참작 사유 적극 발굴

한국 형사소송법과 판례를 기준으로 분석하세요.
모든 주장은 증거 기반으로 작성하세요.`

    if (examples.length > 0) {
      systemPrompt += `\n\n다음은 좋은 분석 예시들입니다. 이와 유사한 수준으로 분석하세요:\n\n`
      examples.forEach((ex, idx) => {
        systemPrompt += `예시 ${idx + 1}:\n`
        systemPrompt += `입력: ${ex.input_summary}\n`
        systemPrompt += `분석 결과:\n${JSON.stringify(ex.output_analysis, null, 2)}\n\n`
      })
    }

    if (userContext?.representing === 'defendant') {
      systemPrompt += `\n\n특별 지시: 이 사건에서 피고인/피의자를 대리합니다. 피고인에게 유리한 분석에 더 중점을 두세요.`
    } else if (userContext?.representing === 'plaintiff') {
      systemPrompt += `\n\n특별 지시: 이 사건에서 피해자/고소인을 대리합니다. 피해자에게 유리한 분석에 더 중점을 두세요.`
    }

    if (userContext?.case_background) {
      systemPrompt += `\n\n사건 배경:\n${userContext.case_background}`
    }

    if (userContext?.defendant_claim) {
      systemPrompt += `\n\n피고인/피의자 주장:\n${userContext.defendant_claim}`
    }

    if (userContext?.plaintiff_claim) {
      systemPrompt += `\n\n검찰/피해자 주장:\n${userContext.plaintiff_claim}`
    }

    if (userContext?.focus_areas) {
      systemPrompt += `\n\n중점 검토 사항:\n${userContext.focus_areas}`
    }

    // 증거기록 분류·분석 참고 자료 (있을 때만). 선택한 문서(documentIds)에 속한 섹션만 사용.
    let evidenceReferenceBlock = ''
    const evidenceSectionsRaw = evidenceContext?.sections ?? []
    const allowedDocIds = Array.isArray(documentIds) && documentIds.length > 0 ? new Set(documentIds) : null
    const evidenceSectionsFiltered = allowedDocIds
      ? evidenceSectionsRaw.filter((s) => s.document_id && allowedDocIds.has(s.document_id))
      : evidenceSectionsRaw
    if (evidenceSectionsFiltered.length > 0) {
      const MAX_EXTRACT_PER_SECTION = 2500
      evidenceReferenceBlock = `\n\n아래는 이미 증거기록으로 분류된 내용과, 분석이 완료된 섹션의 분석 결과입니다. 통합 분석 시 이를 참고하되, 다음에 나오는 수사기록 원문과 상호보완하여 작성하세요. (분석이 없는 섹션은 분류 정보만 참고)\n\n`
      evidenceSectionsFiltered.forEach((s, idx) => {
        evidenceReferenceBlock += `--- 증거 섹션 ${idx + 1}: ${s.section_title || s.section_type} (유형: ${s.section_type}, p.${s.start_page}-${s.end_page}) ---\n`
        if (s.extracted_text?.trim()) {
          const excerpt = s.extracted_text.length > MAX_EXTRACT_PER_SECTION
            ? s.extracted_text.substring(0, MAX_EXTRACT_PER_SECTION) + '...'
            : s.extracted_text
          evidenceReferenceBlock += `[발췌]\n${excerpt}\n\n`
        }
        if (s.analysis_result != null && typeof s.analysis_result === 'object') {
          evidenceReferenceBlock += `[섹션 분석 결과]\n${JSON.stringify(s.analysis_result, null, 2)}\n\n`
        }
      })
      evidenceReferenceBlock += '--- 위 증거기록 분류·분석 참고 끝 ---\n\n'
    }

    const evidenceBlockNote = evidenceReferenceBlock
      ? `\n**참고:** 위 '증거기록 분류·분석 참고' 블록은 이번 분석 대상 문서의 보조 자료입니다. **타임라인과 발견된 모순점(contradictions)은 반드시 아래 '수사기록 원문'에만 나온 내용을 근거로 작성하세요.** 위 참고 블록은 요약·쟁점·증거 목록 보조용이며, 타임라인·모순점 작성 시에는 사용하지 마세요.\n`
      : ''

    const PROMPT = `${systemPrompt}

다음은 여러 수사기록 문서입니다. 이들을 종합적으로 분석하여 JSON 형식으로 반환하세요.
${evidenceReferenceBlock ? `\n${evidenceReferenceBlock}` : ''}
${evidenceBlockNote}
--- 수사기록 원문 (아래만 타임라인·모순점의 근거로 사용) ---

{{TEXT}}

**페이지 번호 규칙 (evidence, timeline, favorable_facts 모두 필수):**
- 원문에 "[문서 N - k페이지]" 표기가 있는 구간은 반드시 해당 k를 page로 사용하세요. 해당 내용이 3페이지에 나오면 page: 3, 5페이지면 page: 5로 쓰세요.
- 문서에 실제로 존재하는 페이지 번호만 사용하고, 원문에 없는 페이지를 만들지 마세요.
- "[문서 N - k페이지]" 표기가 없으면 <footer> 숫자를 참고하세요.

반환 형식 (JSON만):
{
  "summary": "사건 요약",
  "issues": ["쟁점1", "쟁점2"],
  "timeline": [
    {
      "date": "2026-02-03",
      "event": "이벤트 설명",
      "source": "문서명",
      "page": 19
    }
  ],
  "evidence": [
    {
      "type": "물증/인증/서증",
      "description": "증거 설명",
      "page": 12
    }
  ],
  "favorable_facts": [
    { "fact": "유리한 정황 1", "page": 3 },
    { "fact": "유리한 정황 2", "page": 5 }
  ],
  "contradictions": [
    {
      "statement_1": "진술 1",
      "statement_2": "진술 2",
      "analysis": "모순 분석",
      "statement_1_page": 2,
      "statement_2_page": 7
    }
  ]
}

**모든 timeline, evidence 항목에 page 필수. favorable_facts는 { "fact": "내용", "page": k } 형식으로 해당 정황이 나오는 페이지 k를 넣으세요.**`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const fullPrompt = PROMPT.replace(
      '{{TEXT}}',
      combinedText.substring(0, 200000)
    )

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })

    const text = result.response?.text?.() ?? ''
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'AI가 응답을 생성하지 못했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }
    console.log('=== AI 원본 응답 ===')
    console.log(text.substring(0, 500))

    const cleanText = text.replace(/```json|```/g, '').trim()
    // JSON 블록만 추출 (앞뒤 설명문 제거)
    const firstBrace = cleanText.indexOf('{')
    const lastBrace = cleanText.lastIndexOf('}')
    const jsonStr = firstBrace >= 0 && lastBrace > firstBrace
      ? cleanText.slice(firstBrace, lastBrace + 1)
      : cleanText

    let analysis
    try {
      analysis = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('JSON parse error. Extracted string:', jsonStr.substring(0, 800))
      return NextResponse.json(
        { error: '분석 결과 파싱에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    if (caseId && documentIds?.length > 0) {
      try {
        await saveIntegratedAnalysis(caseId, documentIds, analysis)
      } catch (saveErr) {
        console.error('saveIntegratedAnalysis error:', saveErr)
        // 저장 실패해도 분석 결과는 반환 (저장만 스킵)
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      examplesUsed: examples.length,
    })
  } catch (error) {
    console.error('Integrated analysis error:', error)
    return NextResponse.json(
      { error: error.message || '분석 실패' },
      { status: 500 }
    )
  }
}
