import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { currentAnalysis, refinementRequest, originalText } = await request.json()

    if (!currentAnalysis || !refinementRequest || !originalText) {
      return NextResponse.json(
        { error: 'currentAnalysis, refinementRequest, originalText가 필요합니다.' },
        { status: 400 }
      )
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
})

    const prompt = `현재 분석 결과:
${JSON.stringify(currentAnalysis, null, 2)}

사용자 요청: ${refinementRequest}

원본 텍스트:
${originalText.substring(0, 50000)} 

위 요청에 따라 분석을 수정하세요.
기존 분석을 기반으로 요청된 부분만 개선하세요.
JSON 형식으로만 반환:
{
  "summary": "...",
  "issues": [...],
  "evidence": [...],
  "favorable_facts": [...],
  "timeline": [...]
}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    })

    const text = result.response.text()
    const cleanText = text.replace(/```json|```/g, '').trim()
    const refinedAnalysis = JSON.parse(cleanText)

    return NextResponse.json({
      success: true,
      refinedAnalysis,
    })
  } catch (error) {
    console.error('Refine error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
