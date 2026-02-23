import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPdfPageCount, splitPdfByPageLimit, PAGE_LIMIT } from '@/lib/pdfSplit'
import { saveDocument } from '@/lib/database'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/** Upstage OCR 호출 후 파싱된 텍스트·pageTexts 반환 */
async function callUpstageOcr(fileOrBlob, includeCoordinates, outputFormat = 'text') {
  const form = new FormData()
  const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob], { type: 'application/pdf' })
  form.append('document', blob, typeof fileOrBlob?.name === 'string' ? fileOrBlob.name : 'part.pdf')
  if (includeCoordinates) form.append('coordinates', 'true')
  const res = await fetch('https://api.upstage.ai/v1/document-ai/document-parse', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}` },
    body: form,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Upstage API (${res.status}): ${text}`)
  const data = JSON.parse(text)
  const extractedText =
    outputFormat === 'html'
      ? (data.content?.html ?? data.html ?? data.content?.text ?? data.text ?? JSON.stringify(data))
      : (data.content?.text ?? data.text ?? data.content?.html ?? data.html ?? JSON.stringify(data))
  let pageTexts = null
  const elements = data.elements || data.content?.elements || []
  if (elements.length > 0) {
    const pageMap = new Map()
    for (const el of elements) {
      const pageNum = el.page ?? el.page_id ?? el.pageNumber ?? null
      if (pageNum != null) {
        const t = el.text || el.content?.text || el.html || el.content?.html || ''
        if (!pageMap.has(pageNum)) pageMap.set(pageNum, [])
        pageMap.get(pageNum).push(t)
      }
    }
    if (pageMap.size > 0) {
      pageTexts = {}
      for (const [page, texts] of pageMap) pageTexts[page] = texts.join('\n')
    }
  }
  return { extractedText, pageTexts }
}

/** pageTexts 키를 전역 페이지 번호로 재매핑 (예: part 2 → 101~200) */
function renumberPageTexts(pageTexts, startPage) {
  if (!pageTexts || startPage === 1) return pageTexts
  const out = {}
  for (const [k, v] of Object.entries(pageTexts)) {
    const local = parseInt(k, 10)
    if (!Number.isNaN(local)) out[String(startPage + local - 1)] = v
    else out[k] = v
  }
  return out
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')
    const originalFileName = (formData.get('originalFileName') || file?.name || '').toString()
    const outputFormat = (formData.get('outputFormat') || 'text').toString().toLowerCase()
    const includeCoordinates = formData.get('includeCoordinates') === 'true'
    const caseId = formData.get('caseId') || null

    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다' },
        { status: 400 }
      )
    }

    const isPdf = file.name && /\.pdf$/i.test(file.name)
    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const pageCount = await getPdfPageCount(buffer)
      if (pageCount > PAGE_LIMIT && caseId) {
        // 100페이지 초과 → 자동 분할 후 구간별 OCR 및 문서 생성
        const baseName = originalFileName.replace(/\.pdf$/i, '')
        const { buffers, pageRanges } = await splitPdfByPageLimit(buffer)
        const documentIds = []
        const documents = []
        const timestamp = Date.now()
        for (let i = 0; i < buffers.length; i++) {
          const partPdfName = `${timestamp}_part${i + 1}.pdf`
          const { data: pdfUrlData } = supabase.storage.from('documents').getPublicUrl(partPdfName)
          const { error: pdfErr } = await supabase.storage
            .from('documents')
            .upload(partPdfName, buffers[i], { contentType: 'application/pdf', cacheControl: '3600' })
          if (pdfErr) throw new Error(`Part ${i + 1} PDF 업로드 실패: ${pdfErr.message}`)
          const partBlob = new Blob([buffers[i]], { type: 'application/pdf' })
          const { extractedText, pageTexts: rawPageTexts } = await callUpstageOcr(partBlob, includeCoordinates, outputFormat)
          const startPage = pageRanges[i].start
          const pageTexts = renumberPageTexts(rawPageTexts, startPage)
          const txtFileName = `${timestamp}_part${i + 1}.txt`
          const textBlob = new Blob([extractedText], { type: 'text/plain; charset=utf-8' })
          await supabase.storage.from('documents').upload(txtFileName, textBlob, {
            contentType: 'text/plain; charset=utf-8',
            cacheControl: '3600',
          })
          const { data: txtUrlData } = supabase.storage.from('documents').getPublicUrl(txtFileName)
          let pageTextsUrl = null
          if (pageTexts && Object.keys(pageTexts).length > 0) {
            const ptFileName = `${timestamp}_part${i + 1}_pages.json`
            await supabase.storage.from('documents').upload(ptFileName, new Blob([JSON.stringify(pageTexts)], { type: 'application/json' }), {
              contentType: 'application/json; charset=utf-8',
              cacheControl: '3600',
            })
            const { data: ptUrlData } = supabase.storage.from('documents').getPublicUrl(ptFileName)
            pageTextsUrl = ptUrlData?.publicUrl
          }
          const partLabel = `${baseName} (${startPage}-${pageRanges[i].end}페이지)`
          const docId = await saveDocument({
            pdfUrl: pdfUrlData?.publicUrl,
            txtUrl: txtUrlData?.publicUrl,
            pdfFileName: partPdfName,
            txtFileName,
            originalFileName: partLabel,
            fileSize: buffers[i].length,
            caseId,
          })
          documentIds.push(docId)
          documents.push({ id: docId, txtUrl: txtUrlData?.publicUrl, txtFileName, pageTextsUrl })
        }
        console.log(`[OCR] ${pageCount}페이지 PDF → ${buffers.length}구간 자동 분할·OCR 완료`)
        return NextResponse.json({
          success: true,
          split: true,
          documentIds,
          documents,
          totalPages: pageCount,
          parts: buffers.length,
        })
      }
      if (pageCount > PAGE_LIMIT && !caseId) {
        return NextResponse.json(
          {
            error:
              'Upstage OCR은 한 번에 100페이지까지만 지원합니다. 이 PDF는 ' +
              pageCount +
              '페이지입니다. 사건에 추가한 뒤 업로드하면 100페이지 단위로 자동 분할·OCR됩니다. 또는 "디지털 원본(텍스트 추출)"을 선택하세요.',
          },
          { status: 400 }
        )
      }
    }

    console.log('=== OCR 시작 ===')
    console.log('파일명:', file.name, '| coordinates:', includeCoordinates)

    // 1. Upstage OCR (기존 단일 파일)
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
      let userMessage = `API 에러 (${response.status}): ${responseText}`
      try {
        const errBody = JSON.parse(responseText)
        const msg = errBody?.error?.message || errBody?.message || ''
        if (
          response.status === 413 ||
          /page limit|exceeds the page limit|maximum allowed is 100/i.test(msg)
        ) {
          userMessage =
            'Upstage OCR은 한 번에 100페이지까지만 지원합니다. ' +
            '100페이지를 초과하는 PDF는 (1) 100페이지 단위로 나눠 업로드하거나, ' +
            '(2) 텍스트가 이미 포함된 PDF라면 업로드 시 "디지털 원본(텍스트 추출)"을 선택해 주세요.'
        }
      } catch (_) {}
      throw new Error(userMessage)
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