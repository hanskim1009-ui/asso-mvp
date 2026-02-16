import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getEvidenceSection, updateEvidenceSection } from '@/lib/database'

/**
 * POST /api/evidence-sections/[id]/describe-with-vision
 * Body: { imageBase64: "data:image/png;base64,..." }
 * 클라이언트에서 PDF 페이지를 캔버스로 렌더한 뒤 보낸 이미지를 Gemini Vision으로 분석하고,
 * 결과를 vision_description에 저장합니다.
 */
export async function POST(request, { params }) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { id: sectionId } = await params
    const body = await request.json()
    const { imageBase64 } = body

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64가 필요합니다.' },
        { status: 400 }
      )
    }

    const section = await getEvidenceSection(sectionId)
    if (!section) {
      return NextResponse.json({ error: '섹션을 찾을 수 없습니다.' }, { status: 404 })
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `이 이미지는 한국 형사사건 증거기록의 한 페이지입니다.
페이지에 보이는 내용을 객관적으로 설명해주세요.
- 사진/이미지가 있으면 무엇이 보이는지(인물, 장소, 사물, 부상 부위 등) 구체적으로 기술하세요.
- 문서/텍스트가 있으면 핵심 내용을 2~3문장으로 요약하세요.
- 표나 차트가 있으면 주제와 요지를 적어주세요.
2~5문장으로 작성하고, 법적 분석은 하지 마세요.`

    const imagePart = {
      inlineData: {
        mimeType: 'image/png',
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      },
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
    })

    const description = result.response.text()?.trim() || ''

    await updateEvidenceSection(sectionId, { vision_description: description })

    return NextResponse.json({
      success: true,
      vision_description: description,
    })
  } catch (error) {
    console.error('describe-with-vision error:', error)
    return NextResponse.json(
      { error: error.message || 'Vision 설명 생성 실패' },
      { status: 500 }
    )
  }
}
