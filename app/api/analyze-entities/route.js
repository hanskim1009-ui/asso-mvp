import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { updateAnalysisResult } from '@/lib/database'

const ENTITIES_JSON_SCHEMA = `{
  "persons": [
    {
      "name": "실명 또는 호칭",
      "aliases": ["문서에서 불리는 다른 이름/호칭"],
      "role": "피고인|피해자|증인|참고인|수사관|감정인|변호인|기타",
      "description": "한 줄 설명 (나이, 관계 등)",
      "key_statements": [
        { "content": "핵심 진술 발췌", "page": 5, "source": "출처 문서/진술서명" }
      ],
      "credibility_notes": "신빙성 관련 메모 (있으면)",
      "pages": [1, 3, 5]
    }
  ],
  "locations": [
    {
      "name": "장소명 또는 주소",
      "type": "범행장소|목격장소|체포장소|거주지|기타",
      "related_events": ["관련 이벤트 한 줄"],
      "pages": [2, 8]
    }
  ],
  "relationships": [
    {
      "person1": "인물1 이름",
      "person2": "인물2 이름",
      "type": "가족|동료|공모|목격자-당사자|수사관-피의자|기타",
      "description": "관계 설명",
      "evidence_pages": [4, 6]
    }
  ],
  "evidence_items": [
    {
      "name": "증거물명",
      "type": "물증|인증|서증",
      "description": "간단 설명",
      "relevance": "방어/공격 관점에서의 의미",
      "related_persons": ["관련 인물 이름"],
      "pages": [12]
    }
  ]
}`

function buildSystemPrompt(userContext) {
  let p = `당신은 한국 형사사건 수사기록을 분석하는 AI입니다.
목표: 수사기록에 등장하는 모든 인물·장소·증거물을 추출하고, 인물 간 관계를 정리합니다.
- role은 반드시 다음 중 하나: 피고인, 피해자, 증인, 참고인, 수사관, 감정인, 변호인, 기타
- aliases에는 문서에서 해당 인물을 부르는 다른 호칭(예: "피고인", "김씨")을 넣으세요.
- key_statements는 1~3개만, 진술의 핵심만 발췌. page와 source를 꼭 넣으세요.
- relationships의 person1, person2는 persons에 나온 name과 동일하게 쓰세요.`
  if (userContext?.representing === 'defendant') {
    p += '\n\n이 사건은 피고인 측 대리. 방어에 유리한 정황·증인 신빙성 관련 메모를 credibility_notes나 relevance에 반영하세요.'
  }
  return p
}

function buildUserPrompt(analysis, combinedText) {
  const summary = analysis?.summary ? `\n[기존 사건 요약]\n${analysis.summary}\n` : ''
  const issues = analysis?.issues?.length ? `\n[쟁점]\n${analysis.issues.join('\n')}\n` : ''
  return `다음 수사기록과 기존 분석 요약을 바탕으로, 인물·장소·관계·증거물을 추출하세요.
${summary}${issues}

[수사기록 원문]
${combinedText.substring(0, 180000)}

위 내용에서 JSON만 추출하여 아래 형식으로 반환하세요. 다른 설명 없이 JSON만 출력.
${ENTITIES_JSON_SCHEMA}

**persons, locations, relationships, evidence_items 모두 필수이며, 없으면 빈 배열 []로 두세요.**
**모든 항목에 pages 또는 evidence_pages를 포함하세요.**`
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { analysisId, texts, documentIds, analysis, userContext } = body

    if (!analysisId || !analysis || typeof analysis !== 'object') {
      return NextResponse.json(
        { error: 'analysisId와 analysis(선택된 분석 결과)가 필요합니다.' },
        { status: 400 }
      )
    }

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: '분석할 텍스트(texts)가 없습니다. 문서를 선택한 뒤 다시 시도하세요.' },
        { status: 400 }
      )
    }

    const combinedText = texts
      .map((t, idx) => `[문서 ${idx + 1}]\n${t}`)
      .join('\n\n=== 문서 구분 ===\n\n')

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const fullPrompt = `${buildSystemPrompt(userContext || {})}\n\n${buildUserPrompt(analysis, combinedText)}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })

    const text = result.response?.text?.() ?? ''
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '엔티티 추출 응답을 생성하지 못했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    const cleanText = text.replace(/```json|```/g, '').trim()
    const firstBrace = cleanText.indexOf('{')
    const lastBrace = cleanText.lastIndexOf('}')
    const jsonStr =
      firstBrace >= 0 && lastBrace > firstBrace
        ? cleanText.slice(firstBrace, lastBrace + 1)
        : cleanText

    let entities
    try {
      entities = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('Entity JSON parse error:', parseErr)
      return NextResponse.json(
        { error: '엔티티 결과 파싱에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    if (!entities.persons) entities.persons = []
    if (!entities.locations) entities.locations = []
    if (!entities.relationships) entities.relationships = []
    if (!entities.evidence_items) entities.evidence_items = []

    const mergedResult = {
      ...analysis,
      entities,
    }

    await updateAnalysisResult(analysisId, mergedResult)

    return NextResponse.json({
      success: true,
      entities,
    })
  } catch (err) {
    console.error('analyze-entities error:', err)
    return NextResponse.json(
      { error: err?.message || '엔티티 분석 실패' },
      { status: 500 }
    )
  }
}
