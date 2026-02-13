import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')
    
    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다' },
        { status: 400 }
      )
    }

    console.log('=== 파일 정보 ===')
    console.log('파일명:', file.name)
    console.log('타입:', file.type)
    console.log('크기:', file.size)

    // Upstage API로 전송
    const upstageFormData = new FormData()
    upstageFormData.append('document', file)

    const response = await fetch('https://api.upstage.ai/v1/document-ai/document-parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
      },
      body: upstageFormData
    })

    console.log('=== Upstage 응답 ===')
    console.log('상태:', response.status)
    
    const responseText = await response.text()
    console.log('응답 전체:', responseText)
    
    if (!response.ok) {
      throw new Error(`API 에러 (${response.status}): ${responseText}`)
    }

    const data = JSON.parse(responseText)
    
    // 응답 구조 확인용 - 전체 출력
    console.log('=== 파싱된 데이터 구조 ===')
    console.log(JSON.stringify(data, null, 2))
    
    // 다양한 경로로 텍스트 찾기
    const extractedText = 
      data.content?.text ||           // 경로 1
      data.text ||                     // 경로 2
      data.content?.html ||            // 경로 3
      data.html ||                     // 경로 4
      data.elements?.[0]?.text ||     // 경로 5
      JSON.stringify(data)             // 마지막: 전체 데이터
    
    console.log('=== 추출된 텍스트 ===')
    console.log(extractedText.substring(0, 200))
    
    return NextResponse.json({
      success: true,
      text: extractedText,
      rawData: data  // 전체 응답도 같이 보냄
    })
    
  } catch (error) {
    console.error('=== OCR 에러 ===')
    console.error(error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}