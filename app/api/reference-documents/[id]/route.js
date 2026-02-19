import { NextResponse } from 'next/server'
import { getReferenceDocument, deleteReferenceDocument } from '@/lib/database'
import { getReferenceChunksByDocumentId, getChunkIdsWithEmbedding } from '@/lib/referenceChunks'

export async function GET(request, context) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    const doc = await getReferenceDocument(id)
    if (!doc) return NextResponse.json({ error: '찾을 수 없음' }, { status: 404 })
    const [chunks, idsWithEmbedding] = await Promise.all([
      getReferenceChunksByDocumentId(id),
      getChunkIdsWithEmbedding(id),
    ])
    const chunksWithEmbeddingFlag = chunks.map((c) => ({
      ...c,
      has_embedding: idsWithEmbedding.has(c.id),
    }))
    return NextResponse.json({
      ...doc,
      chunks: chunksWithEmbeddingFlag,
      chunksCount: chunks.length,
    })
  } catch (err) {
    console.error('GET reference-documents/[id]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request, context) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    await deleteReferenceDocument(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE reference-documents/[id]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
