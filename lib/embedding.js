import { GoogleGenerativeAI } from '@google/generative-ai'

// text-embedding-004는 v1beta에서 제거됨. gemini-embedding-001 사용 (768차원으로 요청해 기존 DB 호환)
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768

const embedRequestOptions = { outputDimensionality: EMBEDDING_DIMENSIONS }

/**
 * 단일 텍스트를 벡터로 임베딩 (Gemini gemini-embedding-001, 768차원)
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for embeddings')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL })
  const res = await model.embedContent({
    content: { parts: [{ text: String(text).slice(0, 8000) }] },
    ...embedRequestOptions,
  })
  const values = res?.embedding?.values
  if (!Array.isArray(values)) throw new Error('Invalid embedding response')
  return values
}

/**
 * 여러 텍스트를 한 번에 임베딩 (rate limit 고려해 소량만 권장)
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function getEmbeddings(texts) {
  if (!texts?.length) return []
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for embeddings')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL })
  const requests = texts.map((t) => ({
    content: { parts: [{ text: String(t).slice(0, 8000) }] },
    ...embedRequestOptions,
  }))
  const res = await model.batchEmbedContents({ requests })
  const embeddings = res?.embeddings
  if (!Array.isArray(embeddings)) throw new Error('Invalid batch embedding response')
  return embeddings.map((e) => e?.values ?? []).filter((arr) => arr.length > 0)
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS }
