import { supabase } from '@/lib/supabase'
import { getEmbedding } from '@/lib/embedding'

/**
 * 참고자료 청크 벡터 유사도 검색 (RPC 사용)
 * @param {number[]} queryEmbedding - 768차원 벡터
 * @param {number} matchCount
 * @returns {Promise<Array<{ id, reference_document_id, chunk_index, page_number, content, metadata, similarity }>>}
 */
export async function searchReferenceChunks(queryEmbedding, matchCount = 5) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return []
  try {
    const { data, error } = await supabase.rpc('match_reference_chunks', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    })
    if (error) {
      console.error('searchReferenceChunks error:', error)
      return []
    }
    return data ?? []
  } catch (err) {
    console.error('searchReferenceChunks:', err)
    return []
  }
}

/**
 * 쿼리 텍스트로 참고자료 검색 (임베딩 후 검색)
 * @param {string} queryText
 * @param {number} matchCount
 * @returns {Promise<Array>}
 */
export async function searchReferenceChunksByText(queryText, matchCount = 5) {
  if (!queryText?.trim()) return []
  const embedding = await getEmbedding(queryText.trim())
  return searchReferenceChunks(embedding, matchCount)
}

/**
 * 특정 참고자료의 청크 목록 조회 (임베딩 제외)
 */
export async function getReferenceChunksByDocumentId(referenceDocumentId) {
  try {
    const { data, error } = await supabase
      .from('reference_chunks')
      .select('id, chunk_index, page_number, content, metadata, created_at')
      .eq('reference_document_id', referenceDocumentId)
      .order('chunk_index', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getReferenceChunksByDocumentId:', err)
    return []
  }
}

/**
 * 특정 참고자료에서 임베딩이 있는 청크 id 집합 (검증용)
 */
export async function getChunkIdsWithEmbedding(referenceDocumentId) {
  try {
    const { data, error } = await supabase
      .from('reference_chunks')
      .select('id')
      .eq('reference_document_id', referenceDocumentId)
      .not('embedding', 'is', null)
    if (error) throw error
    return new Set((data ?? []).map((r) => r.id))
  } catch (err) {
    console.error('getChunkIdsWithEmbedding:', err)
    return new Set()
  }
}

const CHUNK_INSERT_BATCH_SIZE = 80

/**
 * 참고자료 청크 일괄 삽입 (Supabase 요청 크기 제한 회피를 위해 배치로 삽입)
 * @param {string} referenceDocumentId
 * @param {Array<{ chunk_index: number, page_number?: number, content: string, embedding?: number[], metadata?: object }>} chunks
 */
export async function insertReferenceChunks(referenceDocumentId, chunks) {
  if (!chunks?.length) return
  const rows = chunks.map((c) => ({
    reference_document_id: referenceDocumentId,
    chunk_index: c.chunk_index,
    page_number: c.page_number ?? null,
    content: c.content,
    embedding: c.embedding ?? null,
    metadata: c.metadata ?? {},
  }))
  for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + CHUNK_INSERT_BATCH_SIZE)
    const { error } = await supabase.from('reference_chunks').insert(batch)
    if (error) throw error
  }
}

/**
 * 청크에 임베딩 저장
 */
export async function updateChunkEmbedding(chunkId, embedding) {
  const { error } = await supabase
    .from('reference_chunks')
    .update({ embedding })
    .eq('id', chunkId)
  if (error) throw error
}

/**
 * 청크에 메타데이터 저장
 */
export async function updateChunkMetadata(chunkId, metadata) {
  const { error } = await supabase
    .from('reference_chunks')
    .update({ metadata: metadata ?? {} })
    .eq('id', chunkId)
  if (error) throw error
}

/**
 * 참고자료 문서에 속한 청크들 일괄 임베딩 (배치로 호출 후 DB 업데이트)
 * @param {string} referenceDocumentId
 * @param {number} batchSize
 */
export async function embedChunksForDocument(referenceDocumentId, batchSize = 10) {
  const { data: list, error: listError } = await supabase
    .from('reference_chunks')
    .select('id, content')
    .eq('reference_document_id', referenceDocumentId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(batchSize * 5) // 한 번에 너무 많이 하지 않도록

  if (listError || !list?.length) return { updated: 0 }

  const { getEmbeddings } = await import('@/lib/embedding')
  const texts = list.map((c) => c.content)
  const embeddings = await getEmbeddings(texts)
  let updated = 0
  for (let i = 0; i < list.length && i < embeddings.length; i++) {
    await updateChunkEmbedding(list[i].id, embeddings[i])
    updated++
  }
  return { updated }
}
