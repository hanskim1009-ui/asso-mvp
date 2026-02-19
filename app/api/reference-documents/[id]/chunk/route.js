import { NextResponse } from 'next/server'
import { getReferenceDocument } from '@/lib/database'
import { getReferenceChunksByDocumentId, insertReferenceChunks } from '@/lib/referenceChunks'
import {
  chunkFullText,
  chunkByPageTexts,
  chunkBySections,
  chunkByPageTextsWithSections,
  REFERENCE_DEFAULT_CHUNK_SIZE,
  REFERENCE_MAX_CHUNK_SIZE,
} from '@/lib/chunkText'

export async function POST(request, context) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    const doc = await getReferenceDocument(id)
    if (!doc) return NextResponse.json({ error: '참고자료를 찾을 수 없습니다.' }, { status: 404 })

    const body = await request.json()
    const { fullText, pageTexts, chunkSize: rawChunkSize, chunkBySections: chunkBySectionsFlag, singleChunk: singleChunkFlag } = body
    const chunkSize = rawChunkSize != null ? Math.max(500, Math.min(REFERENCE_MAX_CHUNK_SIZE, Number(rawChunkSize))) : REFERENCE_DEFAULT_CHUNK_SIZE
    const useSections = !!chunkBySectionsFlag
    const singleChunk = !!singleChunkFlag

    let chunks
    if (singleChunk) {
      const full = pageTexts && typeof pageTexts === 'object'
        ? Object.keys(pageTexts)
            .map(Number)
            .sort((a, b) => a - b)
            .map((n) => pageTexts[String(n)] ?? '')
            .join('\n\n')
        : fullText != null
          ? String(fullText)
          : ''
      chunks = full.trim() ? [{ text: full.trim(), pageNumber: 1, chunk_index: 0 }] : []
    } else if (pageTexts && typeof pageTexts === 'object') {
      chunks = useSections ? chunkByPageTextsWithSections(pageTexts, chunkSize) : chunkByPageTexts(pageTexts, chunkSize)
    } else if (fullText != null) {
      chunks = useSections ? chunkBySections(String(fullText), chunkSize) : chunkFullText(String(fullText), chunkSize)
    } else {
      return NextResponse.json(
        { error: 'fullText 또는 pageTexts 중 하나가 필요합니다.' },
        { status: 400 }
      )
    }

    if (chunks.length === 0) {
      return NextResponse.json({ success: true, chunksCount: 0, message: '생성된 청크가 없습니다.' })
    }

    const existing = await getReferenceChunksByDocumentId(id)
    if (existing.length > 0) {
      return NextResponse.json(
        { error: '이미 청크가 있습니다. 문서를 삭제 후 다시 등록하거나, 별도 문서로 등록하세요.' },
        { status: 400 }
      )
    }

    const rows = chunks.map((c) => ({
      chunk_index: c.chunk_index,
      page_number: c.pageNumber,
      content: c.text,
    }))
    await insertReferenceChunks(id, rows)

    return NextResponse.json({ success: true, chunksCount: rows.length })
  } catch (err) {
    console.error('POST reference-documents/[id]/chunk:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
