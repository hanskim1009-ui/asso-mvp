import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { documentId, txtUrl } = await request.json()

    const txtRes = await fetch(txtUrl)
    const fullText = await txtRes.text()

    const chunks = splitIntoChunks(fullText)

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

  // 1. footer 태그에서 페이지 번호 추출
  const pageRegex = /<footer[^>]*style='font-size:(22|20|18|16)px'[^>]*>(\d+)[^<]*<\/footer>/g

  let matches = []
  let match
  while ((match = pageRegex.exec(text)) !== null) {
    matches.push({
      pageNumber: parseInt(match[2]),
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
