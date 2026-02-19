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
    const outputFormat = (formData.get('outputFormat') || 'text').toString().toLowerCase()
    const includeCoordinates = formData.get('includeCoordinates') === 'true'

    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다' },
        { status: 400 }
      )
    }

    console.log('=== OCR 시작 ===')
    console.log('파일명:', file.name, '| coordinates:', includeCoordinates)

    // 1. Upstage OCR
    const upstageFormData = new FormData()
    upstageFormData.append('document', file)
    if (includeCoordinates) {
      upstageFormData.append('coordinates', 'true')
    }

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
      outputFormat === 'html'
        ? (data.content?.html ?? data.html ?? data.content?.text ?? data.text ?? JSON.stringify(data))
        : (data.content?.text ?? data.text ?? data.content?.html ?? data.html ?? JSON.stringify(data))

    console.log('OCR 완료! 출력 형식:', outputFormat, '길이:', extractedText.length)

    // elements 배열에서 페이지별 텍스트 추출 + 좌표 포함 시 구조 로그
    let pageTexts = null
    const elements = data.elements || data.content?.elements || []
    if (elements.length > 0) {
      const first = elements[0]
      console.log('[OCR elements] 개수:', elements.length, '| 첫 element 키:', Object.keys(first))
      if (first.coordinates != null) {
        console.log('[OCR elements] 첫 element.coordinates:', JSON.stringify(first.coordinates))
      }
      if (first.bounding_box != null) {
        console.log('[OCR elements] 첫 element.bounding_box:', JSON.stringify(first.bounding_box))
      }
      if (first.bbox != null) {
        console.log('[OCR elements] 첫 element.bbox:', JSON.stringify(first.bbox))
      }
      const pageMap = new Map()
      for (const el of elements) {
        const pageNum = el.page ?? el.page_id ?? el.pageNumber ?? null
        if (pageNum != null) {
          const text = el.text || el.content?.text || el.html || el.content?.html || ''
          if (!pageMap.has(pageNum)) pageMap.set(pageNum, [])
          pageMap.get(pageNum).push(text)
        }
      }
      if (pageMap.size > 0) {
        pageTexts = {}
        for (const [page, texts] of pageMap) {
          pageTexts[page] = texts.join('\n')
        }
        console.log(`페이지별 텍스트 추출: ${pageMap.size}페이지`)
      }
    }
    if (!pageTexts) {
      console.log('elements에서 페이지 정보를 찾을 수 없음, footer 태그 방식 사용')
    }

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
    
    // pageTexts도 별도 JSON으로 저장
    let pageTextsUrl = null
    if (pageTexts) {
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
        const { data: ptUrlData } = supabase.storage
          .from('documents')
          .getPublicUrl(ptFileName)
        pageTextsUrl = ptUrlData?.publicUrl
        console.log('페이지별 텍스트 저장 완료:', ptFileName)
      }
    }

    return NextResponse.json({
      success: true,
      text: extractedText,
      txtFileUrl: txtUrlData?.publicUrl,
      txtFileName: txtFileName,
      pageTextsUrl,
      outputFormat: outputFormat === 'html' ? 'html' : 'text',
      rawData: data,
    })
    
  } catch (error) {
    console.error('OCR 에러:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}