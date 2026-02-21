import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractTextFromNativePdf } from '@/lib/pdfNativeExtract'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * 디지털 원본 PDF에서 텍스트만 추출 (OCR 없음). pdfjs 사용.
 * 응답 형식은 /api/ocr과 동일하게 맞춰 문서 저장·청킹 플로우에서 그대로 사용 가능.
 */
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'PDF 파일(document)이 필요합니다.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { extractedText, pageTexts } = await extractTextFromNativePdf(buffer)

    const timestamp = Date.now()
    const txtFileName = `${timestamp}.txt`
    const textBlob = new Blob([extractedText], { type: 'text/plain; charset=utf-8' })

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(txtFileName, textBlob, {
        contentType: 'text/plain; charset=utf-8',
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('extract-pdf-text: 텍스트 저장 실패', uploadError)
      return NextResponse.json({ error: '텍스트 파일 저장 실패' }, { status: 500 })
    }

    const { data: txtUrlData } = supabase.storage.from('documents').getPublicUrl(txtFileName)

    let pageTextsUrl = null
    if (pageTexts && Object.keys(pageTexts).length > 0) {
      const ptFileName = `${timestamp}_pages.json`
      const ptBlob = new Blob([JSON.stringify(pageTexts)], {
        type: 'application/json; charset=utf-8',
      })
      const { error: ptError } = await supabase.storage
        .from('documents')
        .upload(ptFileName, ptBlob, {
          contentType: 'application/json; charset=utf-8',
          cacheControl: '3600',
        })
      if (!ptError) {
        const { data: ptUrlData } = supabase.storage.from('documents').getPublicUrl(ptFileName)
        pageTextsUrl = ptUrlData?.publicUrl
      }
    }

    return NextResponse.json({
      success: true,
      text: extractedText,
      txtFileUrl: txtUrlData?.publicUrl,
      txtFileName,
      pageTextsUrl,
    })
  } catch (err) {
    console.error('extract-pdf-text error:', err)
    return NextResponse.json(
      { error: err?.message || '디지털 PDF 텍스트 추출 실패' },
      { status: 500 }
    )
  }
}
