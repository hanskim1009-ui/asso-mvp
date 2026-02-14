import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')
    const originalFileName = formData.get('originalFileName')
    
    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다' },
        { status: 400 }
      )
    }

    console.log('=== OCR 시작 ===')
    console.log('파일명:', file.name)

    // 1. Upstage OCR
    const upstageFormData = new FormData()
    upstageFormData.append('document', file)

    const response = await fetch('https://api.upstage.ai/v1/document-ai/document-parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
      },
      body: upstageFormData
    })

    const responseText = await response.text()
    
    if (!response.ok) {
      throw new Error(`API 에러 (${response.status}): ${responseText}`)
    }

    const data = JSON.parse(responseText)
    
    const extractedText = 
      data.content?.text ||
      data.text ||
      data.content?.html ||
      data.html ||
      JSON.stringify(data)
    
    console.log('OCR 완료! 텍스트 길이:', extractedText.length)

    // 2. 텍스트를 UTF-8 txt 파일로 저장
    const timestamp = Date.now()
    const txtFileName = `${timestamp}.txt`
    
    // UTF-8 Blob 생성 (한글 깨짐 방지)
    const textBlob = new Blob([extractedText], { 
      type: 'text/plain; charset=utf-8' 
    })

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(txtFileName, textBlob, {
        contentType: 'text/plain; charset=utf-8',
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('텍스트 저장 실패:', uploadError)
    } else {
      console.log('텍스트 파일 저장 완료:', txtFileName)
    }

    // 3. txt 파일 URL 생성
    const { data: txtUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(txtFileName)
    
    return NextResponse.json({
      success: true,
      text: extractedText,
      txtFileUrl: txtUrlData?.publicUrl,
      txtFileName: txtFileName,
      rawData: data
    })
    
  } catch (error) {
    console.error('OCR 에러:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}