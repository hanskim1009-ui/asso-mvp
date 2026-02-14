import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { saveAnalysisResult } from '@/lib/database'

const PROMPT = `다음은 형사 수사기록입니다. 변호사 관점에서 분석해주세요.

[텍스트]
{{TEXT}}

다음 형식으로 JSON만 반환:
{
  "summary": "사건 요약 (3-5문장)",
  "issues": ["쟁점1", "쟁점2", "쟁점3"],
  "evidence": [
    {"type": "물증/인증/서증", "description": "증거 설명"}
  ],
  "favorable_facts": ["피고인에게 유리한 정황1", "정황2"],
  "timeline": [
    {"date": "날짜", "event": "사건", "source": "출처"}
  ]
}`

function parseJsonFromText(text) {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed]
  const jsonStr = (jsonMatch[1] || trimmed).trim()
  return JSON.parse(jsonStr)
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
    const { text, documentId, userContext } = body ?? {}

    if (!text) {
      return NextResponse.json(
        { error: 'text가 필요합니다.' },
        { status: 400 }
      )
    }

    let systemPrompt = `당신은 한국 형사변호 전문 AI 어시스턴트입니다.

분석 원칙:
1. 피고인/피의자에게 유리한 관점, 검찰(혹은 피해자)에게 유리한 관점에서 모두 분석
2. 피고인/피의자 vs. 검찰(피해자)의 각 주장의 논리적 허점과 증거의 모순점 발견
3. 증거능력과 증명력을 비판적으로 검토
4. 명확한 절차적 위법 사항이 있을 시 언급 (위법수집증거, 영장주의 위반 등)
5. 양형 참작 사유 적극 발굴

한국 형사소송법과 판례를 기준으로 분석하세요.
모든 주장은 증거 기반으로 작성하세요.`

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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
})

    const fullPrompt = systemPrompt + '\n\n' + PROMPT.replace('{{TEXT}}', text)
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })

    const response = result.response
    const rawText = response.text()

    let analysis
    try {
      analysis = parseJsonFromText(rawText)
    } catch (parseErr) {
      console.error('JSON 파싱 실패:', parseErr)
      console.error('Gemini 원문:', rawText)
      return NextResponse.json(
        { error: '분석 결과 JSON 파싱에 실패했습니다.' },
        { status: 500 }
      )
    }

    if (documentId) {
      await saveAnalysisResult(documentId, analysis)
    }

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('analyze API 에러:', error)
    return NextResponse.json(
      { error: error?.message ?? '분석 처리에 실패했습니다.' },
      { status: 500 }
    )
  }
}
