import { GoogleGenerativeAI } from '@google/generative-ai'

const CONTEXT_PROMPT = `당신은 법률 참고자료(양형기준표, 판례 등)의 조각에 맥락을 붙이는 역할을 합니다.
아래 "문서 제목"과 "문서 앞부분 일부", 그리고 "이 조각"을 보고, 이 조각이 문서 전체에서 어디에 해당하는지 한두 문장으로만 설명해 주세요.
검색 품질 향상을 위해 사용되므로, 문서 내 위치·섹션·주제를 짧게 포함해 주세요. 50자 내외로만 답하세요. 다른 설명 없이 맥락 문장만 출력하세요.

문서 제목: {{TITLE}}

문서 앞부분 (참고용):
"""
{{FULL_EXCERPT}}
"""

이 조각:
"""
{{CHUNK}}
"""`

/**
 * 청크가 문서 내에서 어떤 맥락인지 AI로 생성 (Anthropic Contextual Retrieval 스타일)
 * @param {string} documentTitle - 참고자료 제목
 * @param {string} fullTextExcerpt - 문서 전체 또는 앞부분 (최대 12000자 권장)
 * @param {string} chunkText - 해당 청크 본문
 * @returns {Promise<string>} 맥락 문장 (실패 시 빈 문자열)
 */
export async function getChunkContext(documentTitle, fullTextExcerpt, chunkText) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return ''

  const excerpt = String(fullTextExcerpt ?? '').slice(0, 12000)
  const chunk = String(chunkText ?? '').slice(0, 6000)
  const title = String(documentTitle ?? '참고자료').trim()
  if (!chunk.trim()) return ''

  const prompt = CONTEXT_PROMPT.replace('{{TITLE}}', title)
    .replace('{{FULL_EXCERPT}}', excerpt || '(내용 없음)')
    .replace('{{CHUNK}}', chunk)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const res = await model.generateContent(prompt)
    const text = res?.response?.text?.()?.trim() || ''
    return text.slice(0, 300)
  } catch (err) {
    console.warn('getChunkContext error:', err?.message)
    return ''
  }
}

/**
 * 여러 청크에 대해 맥락 생성 (순차 호출, rate limit 고려)
 * @param {string} documentTitle
 * @param {string} fullTextExcerpt
 * @param {Array<{ text: string }>} chunks
 * @param {number} delayMs - 청크 간 대기 시간
 * @returns {Promise<string[]>} 맥락 배열 (chunks 순서와 동일)
 */
export async function getChunkContexts(documentTitle, fullTextExcerpt, chunks, delayMs = 600) {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms))
  const contexts = []
  for (const c of chunks) {
    const ctx = await getChunkContext(documentTitle, fullTextExcerpt, c.text)
    contexts.push(ctx)
    if (delayMs > 0) await delay(delayMs)
  }
  return contexts
}
