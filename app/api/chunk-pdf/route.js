import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { documentId, txtUrl, pageTextsUrl } = await request.json()

    // 방법 1: Upstage elements 기반 페이지별 텍스트 (정확)
    let pageTextsJson = null
    if (pageTextsUrl) {
      try {
        const ptRes = await fetch(pageTextsUrl)
        if (ptRes.ok) {
          pageTextsJson = await ptRes.json()
          console.log('페이지별 텍스트 JSON 사용:', Object.keys(pageTextsJson).length, '페이지')
        }
      } catch (e) {
        console.warn('페이지별 텍스트 JSON 로드 실패, footer 방식 사용:', e.message)
      }
    }

    const txtRes = await fetch(txtUrl)
    const fullText = await txtRes.text()

    const chunks = pageTextsJson
      ? splitIntoChunksByPageJson(pageTextsJson)
      : splitIntoChunks(fullText)

    const chunkRecords = chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      page_number: chunk.pageNumber,
      content: chunk.text,
      content_length: chunk.text.length,
      start_position: chunk.startPos,
      end_position: chunk.endPos,
    }))

    const { error } = await supabase
      .from('document_chunks')
      .insert(chunkRecords)

    if (error) throw error

    return NextResponse.json({
      success: true,
      chunksCount: chunks.length,
    })
  } catch (error) {
    console.error('Chunking error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

function splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = []

  // 1. footer 태그에서 페이지 구분 (PDF 페이지 순서 기준, 1부터)
  const pageRegex = /<footer[^>]*style='font-size:(22|20|18|16)px'[^>]*>(\d+)[^<]*<\/footer>/g

  let matches = []
  let match
  let pdfPageIndex = 0
  while ((match = pageRegex.exec(text)) !== null) {
    pdfPageIndex++
    matches.push({
      pageNumber: pdfPageIndex,        // PDF 내 실제 페이지 (1, 2, 3...)
      originalPageNumber: parseInt(match[2]), // 원본 기록 페이지 (193 등)
      position: match.index
    })
  }

  console.log('발견된 페이지:', matches.length)

  // 2. 페이지가 없으면 전체를 1페이지로
  if (matches.length === 0) {
    const paragraphs = text.split(/\n\n+/)
    let currentChunk = ''
    let chunkIndex = 0

    for (const para of paragraphs) {
      if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          pageNumber: 1,
          startPos: 0,
          endPos: currentChunk.length,
          index: chunkIndex++
        })

        currentChunk = para
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        pageNumber: 1,
        startPos: 0,
        endPos: currentChunk.length,
        index: chunkIndex++
      })
    }

    return chunks
  }

  // 3. 페이지별로 텍스트 분할
  for (let i = 0; i < matches.length; i++) {
    const currentPage = matches[i].pageNumber
    const startPos = matches[i].position
    const endPos = i < matches.length - 1 ? matches[i + 1].position : text.length

    let pageText = text.substring(startPos, endPos)

    // 페이지가 chunkSize보다 작으면 그대로
    if (pageText.length <= chunkSize) {
      chunks.push({
        text: pageText.trim(),
        pageNumber: currentPage,
        startPos: startPos,
        endPos: endPos,
        index: chunks.length
      })
    } else {
      // 페이지가 크면 분할
      const paragraphs = pageText.split(/\n\n+/)
      let currentChunk = ''

      for (const para of paragraphs) {
        if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            pageNumber: currentPage,
            startPos: startPos,
            endPos: startPos + currentChunk.length,
            index: chunks.length
          })

          currentChunk = para
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          pageNumber: currentPage,
          startPos: startPos,
          endPos: startPos + currentChunk.length,
          index: chunks.length
        })
      }
    }
  }

  console.log('생성된 청크:', chunks.length)
  console.log('첫 청크 페이지:', chunks[0]?.pageNumber)
  console.log('마지막 청크 페이지:', chunks[chunks.length - 1]?.pageNumber)

  return chunks
}

/**
 * Upstage elements 기반 페이지별 텍스트로 청크 생성 (정확한 PDF 페이지 번호)
 */
function splitIntoChunksByPageJson(pageTexts, chunkSize = 1000) {
  const chunks = []
  // pageTexts는 { "1": "텍스트...", "2": "텍스트..." } 형태
  const pageNumbers = Object.keys(pageTexts)
    .map(Number)
    .sort((a, b) => a - b)

  for (const pageNum of pageNumbers) {
    const pageText = pageTexts[String(pageNum)] || ''
    if (!pageText.trim()) continue

    if (pageText.length <= chunkSize) {
      chunks.push({
        text: pageText.trim(),
        pageNumber: pageNum,
        startPos: 0,
        endPos: pageText.length,
        index: chunks.length,
      })
    } else {
      // 페이지가 크면 문단 단위로 분할
      const paragraphs = pageText.split(/\n\n+/)
      let currentChunk = ''

      for (const para of paragraphs) {
        if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            pageNumber: pageNum,
            startPos: 0,
            endPos: currentChunk.length,
            index: chunks.length,
          })
          currentChunk = para
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          pageNumber: pageNum,
          startPos: 0,
          endPos: currentChunk.length,
          index: chunks.length,
        })
      }
    }
  }

  console.log('[pageJson] 생성된 청크:', chunks.length)
  console.log('[pageJson] 첫 청크 페이지:', chunks[0]?.pageNumber)
  console.log('[pageJson] 마지막 청크 페이지:', chunks[chunks.length - 1]?.pageNumber)

  return chunks
}
