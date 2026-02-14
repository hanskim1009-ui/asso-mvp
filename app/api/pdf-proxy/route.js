import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const pdfUrl = searchParams.get('url')
    
    if (!pdfUrl) {
      return NextResponse.json(
        { error: 'PDF URL required' }, 
        { status: 400 }
      )
    }

    console.log('PDF 프록시 요청:', pdfUrl)

    // Supabase에서 PDF 가져오기
    const response = await fetch(pdfUrl, {
      headers: {
        'Accept': 'application/pdf',
      }
    })

    if (!response.ok) {
      throw new Error(`PDF fetch failed: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    
    // PDF를 클라이언트에 반환
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600',
      },
    })
    
  } catch (error) {
    console.error('PDF 프록시 에러:', error)
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}