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

    const { texts, documentIds, caseId, userContext, caseType } =
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

    const PROMPT = `${systemPrompt}

다음은 여러 수사기록 문서입니다. 이들을 종합적으로 분석하여 JSON 형식으로 반환하세요:

{{TEXT}}

**중요: 모든 타임라인 이벤트와 증거에는 반드시 페이지 번호를 포함해야 합니다.**

텍스트에서 <footer> 태그의 숫자를 페이지 번호로 사용하세요.
예시:
- <footer id='52' style='font-size:22px'>19.</footer> → page: 19
- <footer id='87' style='font-size:22px'>200</footer> → page: 200

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
    "유리한 정황 1",
    "유리한 정황 2"
  ],
  "contradictions": [
    {
      "statement_1": "진술 1",
      "statement_2": "진술 2",
      "analysis": "모순 분석"
    }
  ]
}

**모든 timeline과 evidence 항목에 page 필드가 필수입니다!**`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const fullPrompt = PROMPT.replace(
      '{{TEXT}}',
      combinedText.substring(0, 200000)
    )

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })

    const text = result.response.text()
    console.log('=== AI 원본 응답 ===')
    console.log(text.substring(0, 500))

    const cleanText = text.replace(/```json|```/g, '').trim()
    console.log('=== 정제된 응답 ===')
    console.log(cleanText.substring(0, 500))

    const analysis = JSON.parse(cleanText)

    if (caseId && documentIds?.length > 0) {
      await saveIntegratedAnalysis(caseId, documentIds, analysis)
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
