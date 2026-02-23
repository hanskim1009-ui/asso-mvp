import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { saveIntegratedAnalysis, getGoodExamples, getDocument } from '@/lib/database'
import { supabase } from '@/lib/supabase'

/** documentIds로 문서 텍스트를 서버에서 불러와 클라이언트와 동일한 형식의 texts 배열 반환 */
async function loadTextsFromDocumentIds(documentIds) {
  const texts = []
  for (let i = 0; i < documentIds.length; i++) {
    const doc = await getDocument(documentIds[i])
    if (!doc?.txt_url) continue
    let pageTexts = null
    if (doc.txt_file_name) {
      const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
      const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
      try {
        const ptRes = await fetch(pageJsonUrl)
        if (ptRes.ok) {
          const pageJson = await ptRes.json()
          if (pageJson && typeof pageJson === 'object' && Object.keys(pageJson).length > 0) {
            pageTexts = pageJson
          }
        }
      } catch (_) {}
    }
    if (pageTexts) {
      const pageNumbers = Object.keys(pageTexts)
        .map((n) => parseInt(n, 10))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
      const parts = pageNumbers.map(
        (p) => `[문서 ${i + 1} - ${p}페이지]\n${(pageTexts[String(p)] ?? '').trim()}`
      )
      texts.push(parts.join('\n\n'))
    } else {
      const res = await fetch(doc.txt_url)
      const text = await res.text()
      texts.push(text)
    }
  }
  return texts
}

const CHUNK_PAGE_SIZE = 50
const MAX_CHUNK_CHARS = 180000

/** "[문서 N - k페이지]" 패턴으로 원문을 페이지 블록 단위로 분리 */
function splitIntoPageBlocks(combinedText) {
  const re = /(\[문서\s+\d+\s*-\s*\d+페이지\])/g
  const parts = combinedText.split(re)
  // parts[0] = 앞쪽 잔여, parts[1]=마커1, parts[2]=내용1, parts[3]=마커2, ...
  const blocks = []
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i]
    const text = (parts[i + 1] || '').trim()
    if (label) blocks.push({ label, text })
  }
  return blocks
}

/** 페이지 블록들을 CHUNK_PAGE_SIZE개씩 묶어서 청크 텍스트 배열로 */
function buildChunks(blocks) {
  if (blocks.length === 0) return []
  const chunks = []
  for (let i = 0; i < blocks.length; i += CHUNK_PAGE_SIZE) {
    const slice = blocks.slice(i, i + CHUNK_PAGE_SIZE)
    const chunkText = slice.map((b) => `${b.label}\n${b.text}`).join('\n\n')
    chunks.push(chunkText)
  }
  return chunks
}

/** AI 응답에서 JSON 추출 후 파싱 (trailing comma 등 일부 오류 보정) */
function parseJsonFromResponse(text) {
  let clean = (text || '').replace(/```json|```/g, '').trim()
  const first = clean.indexOf('{')
  const last = clean.lastIndexOf('}')
  const jsonStr = first >= 0 && last > first ? clean.slice(first, last + 1) : clean
  // 제어문자 제거 (JSON 파싱 오류 방지)
  let normalized = jsonStr.replace(/[\x00-\x1f\x7f]/g, ' ')
  // 마지막 } 직전 trailing comma 제거 (예: ,\n})
  normalized = normalized.replace(/,(\s*})/g, '$1')
  try {
    return JSON.parse(normalized)
  } catch (e1) {
    // 한 번 더: "key": value, } 형태의 trailing comma 제거
    const fixed = normalized.replace(/,(\s*})/g, '$1').replace(/,(\s*])/g, '$1')
    return JSON.parse(fixed)
  }
}

/** 부분 분석용 프롬프트 (단일 통과, 기존 통합 분석과 동일 JSON 형식) */
function buildPartialPrompt(systemPrompt, evidenceBlock, chunkText) {
  const textSnippet = chunkText.length > MAX_CHUNK_CHARS ? chunkText.slice(0, MAX_CHUNK_CHARS) : chunkText
  return `${systemPrompt}

아래는 수사기록의 **일부 구간**입니다. 이 구간만 보고 요약·쟁점·타임라인·증거·유리한 정황·모순점을 추출하세요. 페이지 번호는 원문에 나온 "[문서 N - k페이지]"의 k를 그대로 사용하세요.
${evidenceBlock}
--- 수사기록 구간 원문 ---

${textSnippet}

반환 형식: 반드시 유효한 JSON만 출력하세요. 모든 키는 큰따옴표로 감싸야 합니다. 다른 설명 없이 JSON만 출력.
{
  "summary": "이 구간에 대한 요약",
  "issues": ["쟁점1", "쟁점2"],
  "timeline": [{ "date": "YYYY-MM-DD", "event": "이벤트", "source": "출처", "page": 1 }],
  "evidence": [{ "type": "물증/인증/서증", "description": "설명", "page": 1 }],
  "favorable_facts": [{ "fact": "유리한 정황", "page": 1 }],
  "contradictions": [{ "statement_1": "...", "statement_2": "...", "analysis": "...", "statement_1_page": 1, "statement_2_page": 2 }]
}
**모든 timeline, evidence 항목에 page 필수.**`
}

/** 종합 단계 프롬프트 (입력이 너무 크면 요약만 전달해 토큰 제한 회피) */
function buildSynthesisPrompt(partialResults) {
  let parts = partialResults.map((r, i) => `[구간 ${i + 1}]\n${JSON.stringify(r, null, 2)}`).join('\n\n')
  if (parts.length > MAX_SYNTHESIS_CHARS) {
    const truncated = partialResults.map((r, i) => ({
      summary: r.summary || '',
      issues: r.issues || [],
      timeline: (r.timeline || []).slice(0, 30),
      evidence: (r.evidence || []).slice(0, 50),
      favorable_facts: (r.favorable_facts || []).slice(0, 20),
      contradictions: (r.contradictions || []).slice(0, 20),
    }))
    parts = truncated.map((r, i) => `[구간 ${i + 1}]\n${JSON.stringify(r, null, 2)}`).join('\n\n')
  }
  return `당신은 한국 형사변호 전문 AI 어시스턴트입니다.
아래는 긴 수사기록을 구간별로 나눠 분석한 **부분 결과**입니다. 이를 하나로 통합하여 최종 분석 JSON을 작성하세요.

- summary: 구간 요약들을 종합한 전체 사건 요약 (중복 제거)
- issues: 쟁점 통합·중복 제거
- timeline: 모든 구간의 타임라인을 시간순으로 합치고, page 번호 유지
- evidence: 증거 통합·중복 제거, page 유지
- favorable_facts: 유리한 정황 통합, page 유지
- contradictions: 모순점 통합·중복 제거, 페이지 유지

부분 결과:
${parts}

**반환: 위와 동일한 키를 가진 JSON 하나만 출력. 다른 설명 없이 JSON만.**`
}

const MAX_SYNTHESIS_CHARS = 450000
const MAX_REQUEST_BODY_CHARS = 6 * 1024 * 1024

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch (parseErr) {
      console.error('Chunked analysis request.json error:', parseErr)
      return NextResponse.json(
        { error: '요청 본문이 너무 크거나 잘못된 JSON입니다. 문서 수·분량을 줄이거나 "선택한 문서 분석"을 사용해 보세요.' },
        { status: 413 }
      )
    }

    let { texts, documentIds, caseId, userContext, caseType, evidenceContext, phase, partialResults } = body
    const bodyStr = JSON.stringify(body)
    if (bodyStr.length > MAX_REQUEST_BODY_CHARS) {
      return NextResponse.json(
        { error: `요청 크기가 제한(약 6MB)을 초과합니다. 선택한 문서를 1~2개만 선택하거나 다른 분석을 사용하세요.` },
        { status: 413 }
      )
    }

    const isPhase3Only = phase === 3
    if (isPhase3Only) {
      if (!partialResults || !Array.isArray(partialResults) || partialResults.length === 0) {
        return NextResponse.json(
          { error: '3단계(종합)에는 partialResults가 필요합니다.' },
          { status: 400 }
        )
      }
      const examples = await getGoodExamples(caseType || '폭행', 3)
      let systemPrompt = `당신은 한국 형사변호 전문 AI 어시스턴트입니다.
분석 원칙: 피고인/피의자·검찰 관점 모두 분석, 주장 허점·증거 모순 발견, 증거능력 검토, 양형 참작 발굴. 한국 형사소송법·판례 기준.`
      if (examples.length > 0) {
        systemPrompt += `\n\n좋은 분석 예시:\n`
        examples.forEach((ex, idx) => {
          systemPrompt += `예시 ${idx + 1}: ${ex.input_summary}\n→ ${JSON.stringify(ex.output_analysis).slice(0, 300)}...\n`
        })
      }
      const synthesisPrompt = buildSynthesisPrompt(partialResults)
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const synRes = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      })
      const synRaw = synRes.response?.text?.() ?? ''
      if (!synRaw) {
        return NextResponse.json(
          { error: '종합 단계 분석 실패: AI 응답 없음' },
          { status: 500 }
        )
      }
      let analysis
      try {
        analysis = parseJsonFromResponse(synRaw)
      } catch (e) {
        console.error('Chunked synthesis parse error:', e)
        return NextResponse.json(
          { error: '종합 결과 파싱 실패: ' + (e?.message || e) },
          { status: 500 }
        )
      }
      if (!analysis.summary) analysis.summary = partialResults.map((r) => r.summary).filter(Boolean).join(' ')
      if (!Array.isArray(analysis.issues)) analysis.issues = []
      if (!Array.isArray(analysis.timeline)) analysis.timeline = []
      if (!Array.isArray(analysis.evidence)) analysis.evidence = []
      if (!Array.isArray(analysis.favorable_facts)) analysis.favorable_facts = []
      if (!Array.isArray(analysis.contradictions)) analysis.contradictions = []

      let chunkedTitle = '구간 분석'
      if (caseId && documentIds?.length > 0) {
        try {
          const { data: docs } = await supabase
            .from('documents')
            .select('original_file_name')
            .in('id', documentIds)
          if (docs?.length > 0) {
            chunkedTitle =
              docs.length === 1
                ? `${docs[0].original_file_name ?? '문서'} (구간 분석)`
                : `${docs[0].original_file_name ?? ''} 외 ${docs.length - 1}개 (구간 분석)`
          }
          await saveIntegratedAnalysis(caseId, documentIds, analysis, chunkedTitle)
        } catch (saveErr) {
          console.error('saveIntegratedAnalysis (chunked) error:', saveErr)
        }
      }
      return NextResponse.json({
        success: true,
        phase: 3,
        analysis,
        chunksUsed: partialResults.length,
        totalPages: null,
      })
    }

    if ((!texts || texts.length === 0) && Array.isArray(documentIds) && documentIds.length > 0 && caseId) {
      try {
        texts = await loadTextsFromDocumentIds(documentIds)
      } catch (loadErr) {
        console.error('Chunked analysis loadTextsFromDocumentIds error:', loadErr)
        return NextResponse.json(
          { error: '선택한 문서 텍스트를 불러오지 못했습니다. ' + (loadErr?.message || '') },
          { status: 500 }
        )
      }
    }
    if (!texts || texts.length === 0) {
      return NextResponse.json(
        { error: '분석할 텍스트가 없습니다. 문서를 선택했는지, OCR이 완료되었는지 확인하세요.' },
        { status: 400 }
      )
    }

    const combinedText = texts
      .map((t, idx) => `[문서 ${idx + 1}]\n${t}`)
      .join('\n\n=== 문서 구분 ===\n\n')

    const blocks = splitIntoPageBlocks(combinedText)
    const chunkTexts = blocks.length > 0 ? buildChunks(blocks) : [combinedText.slice(0, MAX_CHUNK_CHARS)]
    const totalPages = blocks.length || 1

    if (phase === 1) {
      return NextResponse.json({
        success: true,
        phase: 1,
        chunksCount: chunkTexts.length,
        totalPages,
      })
    }

    const examples = await getGoodExamples(caseType || '폭행', 3)
    let systemPrompt = `당신은 한국 형사변호 전문 AI 어시스턴트입니다.
분석 원칙: 피고인/피의자·검찰 관점 모두 분석, 주장 허점·증거 모순 발견, 증거능력 검토, 양형 참작 발굴. 한국 형사소송법·판례 기준.`
    if (examples.length > 0) {
      systemPrompt += `\n\n좋은 분석 예시:\n`
      examples.forEach((ex, idx) => {
        systemPrompt += `예시 ${idx + 1}: ${ex.input_summary}\n→ ${JSON.stringify(ex.output_analysis).slice(0, 300)}...\n`
      })
    }
    if (userContext?.representing === 'defendant') systemPrompt += `\n이 사건은 피고인 대리. 피고인 유리 분석 중점.`
    if (userContext?.representing === 'plaintiff') systemPrompt += `\n이 사건은 피해자 대리. 피해자 유리 분석 중점.`
    if (userContext?.case_background) systemPrompt += `\n사건 배경: ${userContext.case_background}`
    if (userContext?.defendant_claim) systemPrompt += `\n피고인 주장: ${userContext.defendant_claim}`
    if (userContext?.plaintiff_claim) systemPrompt += `\n검찰/피해자 주장: ${userContext.plaintiff_claim}`
    if (userContext?.focus_areas) systemPrompt += `\n중점 검토: ${userContext.focus_areas}`

    let evidenceBlock = ''
    const sections = evidenceContext?.sections ?? []
    const allowed = Array.isArray(documentIds) && documentIds.length > 0 ? new Set(documentIds) : null
    const filtered = allowed ? sections.filter((s) => s.document_id && allowed.has(s.document_id)) : sections
    if (filtered.length > 0) {
      evidenceBlock = '\n참고(증거기록 분류):\n'
      filtered.slice(0, 5).forEach((s) => {
        evidenceBlock += `- ${s.section_title || s.section_type} (p.${s.start_page}-${s.end_page})\n`
      })
      evidenceBlock += '\n'
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const partialResults = []
    for (let i = 0; i < chunkTexts.length; i++) {
      const prompt = buildPartialPrompt(systemPrompt, evidenceBlock, chunkTexts[i])
      let raw = ''
      let parsed = null
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        })
        raw = res.response?.text?.() ?? ''
        if (!raw) {
          if (attempt === 1) {
            return NextResponse.json(
              { error: `구간 ${i + 1}/${chunkTexts.length} 분석 실패: AI 응답 없음` },
              { status: 500 }
            )
          }
          continue
        }
        try {
          parsed = parseJsonFromResponse(raw)
          break
        } catch (e) {
          if (attempt === 0) {
            console.warn(`Chunked analysis parse error (chunk ${i + 1}), retrying:`, e?.message)
            continue
          }
          console.error(`Chunked analysis parse error (chunk ${i + 1}):`, e)
          return NextResponse.json(
            { error: `구간 ${i + 1} 결과 파싱 실패: ${e?.message || e}` },
            { status: 500 }
          )
        }
      }
      if (parsed) partialResults.push(parsed)
    }

    if (phase === 2) {
      return NextResponse.json({
        success: true,
        phase: 2,
        partialResults,
        chunksCount: chunkTexts.length,
        totalPages,
      })
    }

    const synthesisPrompt = buildSynthesisPrompt(partialResults)
    const synRes = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
    })
    const synRaw = synRes.response?.text?.() ?? ''
    if (!synRaw) {
      return NextResponse.json(
        { error: '종합 단계 분석 실패: AI 응답 없음' },
        { status: 500 }
      )
    }

    let analysis
    try {
      analysis = parseJsonFromResponse(synRaw)
    } catch (e) {
      console.error('Chunked synthesis parse error:', e)
      return NextResponse.json(
        { error: '종합 결과 파싱 실패: ' + (e?.message || e) },
        { status: 500 }
      )
    }

    if (!analysis.summary) analysis.summary = partialResults.map((r) => r.summary).filter(Boolean).join(' ')
    if (!Array.isArray(analysis.issues)) analysis.issues = []
    if (!Array.isArray(analysis.timeline)) analysis.timeline = []
    if (!Array.isArray(analysis.evidence)) analysis.evidence = []
    if (!Array.isArray(analysis.favorable_facts)) analysis.favorable_facts = []
    if (!Array.isArray(analysis.contradictions)) analysis.contradictions = []

    let chunkedTitle = '구간 분석'
    if (caseId && documentIds?.length > 0) {
      try {
        const { data: docs } = await supabase
          .from('documents')
          .select('original_file_name')
          .in('id', documentIds)
        if (docs?.length > 0) {
          chunkedTitle =
            docs.length === 1
              ? `${docs[0].original_file_name ?? '문서'} (구간 분석)`
              : `${docs[0].original_file_name ?? ''} 외 ${docs.length - 1}개 (구간 분석)`
        }
        await saveIntegratedAnalysis(caseId, documentIds, analysis, chunkedTitle)
      } catch (saveErr) {
        console.error('saveIntegratedAnalysis (chunked) error:', saveErr)
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      chunksUsed: chunkTexts.length,
      totalPages,
    })
  } catch (error) {
    console.error('Chunked analysis error:', error)
    const message =
      error?.message ||
      (error?.cause?.message) ||
      (typeof error?.toString === 'function' ? error.toString() : '구간 분석 실패')
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
