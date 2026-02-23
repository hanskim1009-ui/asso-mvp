import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractTextFromHanword } from '@/lib/hwpExtract'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * HWP(구 한글) / HWPX(최신 한글) 파일에서 텍스트 추출.
 * 파일 시그니처로 자동 감지 (ZIP = HWPX, 그 외 = HWP).
 * 응답 형식은 /api/ocr, /api/extract-pdf-text와 동일.
 */
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'HWP/HWPX 파일(document)이 필요합니다.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { extractedText, pageTexts } = await extractTextFromHanword(buffer)

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
      console.error('extract-hwp-text: 텍스트 저장 실패', uploadError)
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
    console.error('extract-hwp-text error:', err)
    return NextResponse.json(
      { error: err?.message || 'HWP/HWPX 텍스트 추출 실패' },
      { status: 500 }
    )
  }
}
