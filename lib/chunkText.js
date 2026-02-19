/** 참고자료(양형기준표 등) 권장 청크 크기: 한 덩어리 의미 단위가 담기도록 */
export const REFERENCE_DEFAULT_CHUNK_SIZE = 3500
/** 참고자료 청크 최대 크기(업로드·의견서 참고 블록 공통) */
export const REFERENCE_MAX_CHUNK_SIZE = 15000

/**
 * 단일 텍스트를 고정 크기·문단 단위로 청킹 (참고자료 RAG용)
 * @param {string} text
 * @param {number} chunkSize
 * @returns {Array<{ text: string, pageNumber: number, chunk_index: number }>}
 */
export function chunkFullText(text, chunkSize = 1000) {
  const chunks = []
  const paragraphs = String(text).split(/\n\n+/)
  let currentChunk = ''
  let pageNumber = 1

  for (const para of paragraphs) {
    if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        pageNumber,
        chunk_index: chunks.length,
      })
      currentChunk = para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      pageNumber,
      chunk_index: chunks.length,
    })
  }
  return chunks
}

/**
 * 페이지별 텍스트 객체로 청킹 (키: 페이지 번호 문자열)
 * @param {Record<string, string>} pageTexts - { "1": "텍스트", "2": "..." }
 * @param {number} chunkSize
 * @returns {Array<{ text: string, pageNumber: number, chunk_index: number }>}
 */
export function chunkByPageTexts(pageTexts, chunkSize = 1000) {
  const chunks = []
  const pageNumbers = Object.keys(pageTexts)
    .map(Number)
    .sort((a, b) => a - b)

  for (const pageNum of pageNumbers) {
    const pageText = pageTexts[String(pageNum)] ?? ''
    if (!pageText.trim()) continue

    if (pageText.length <= chunkSize) {
      chunks.push({
        text: pageText.trim(),
        pageNumber: pageNum,
        chunk_index: chunks.length,
      })
    } else {
      const paragraphs = pageText.split(/\n\n+/)
      let currentChunk = ''
      for (const para of paragraphs) {
        if ((currentChunk + para).length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            pageNumber: pageNum,
            chunk_index: chunks.length,
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
          chunk_index: chunks.length,
        })
      }
    }
  }
  return chunks
}

/**
 * 양형기준표 등에서 제목/항 단위로 잘라 청킹 (의미 단위 유지)
 * 제○장, ○. ○○죄, 가. 나. 다. 등으로 구간 나눈 뒤, 구간별로 chunkSize 이하로 유지
 * @param {string} text
 * @param {number} chunkSize
 * @returns {Array<{ text: string, pageNumber: number, chunk_index: number }>}
 */
export function chunkBySections(text, chunkSize = REFERENCE_DEFAULT_CHUNK_SIZE) {
  const lines = String(text).split(/\n/)
  const sections = []
  let current = []
  const sectionStartRe = /^(제\s*\d+\s*[장절]|\d+\.\s*.+|[가나다라마바사아자차카타파하]\s*\.)\s*/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length) current.push(line)
      continue
    }
    if (sectionStartRe.test(trimmed) && current.length > 0) {
      const sectionText = current.join('\n').trim()
      if (sectionText) sections.push(sectionText)
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) {
    const sectionText = current.join('\n').trim()
    if (sectionText) sections.push(sectionText)
  }

  if (sections.length === 0) return chunkFullText(text, chunkSize)

  const chunks = []
  let pageNumber = 1
  for (const section of sections) {
    if (section.length <= chunkSize) {
      chunks.push({
        text: section,
        pageNumber,
        chunk_index: chunks.length,
      })
    } else {
      const subChunks = chunkFullText(section, chunkSize)
      for (const sc of subChunks) {
        chunks.push({
          text: sc.text,
          pageNumber: sc.pageNumber,
          chunk_index: chunks.length,
        })
      }
    }
  }
  return chunks
}

/**
 * pageTexts를 페이지별로 섹션 단위 청킹 (페이지 번호 유지)
 */
export function chunkByPageTextsWithSections(pageTexts, chunkSize = REFERENCE_DEFAULT_CHUNK_SIZE) {
  const pageNumbers = Object.keys(pageTexts)
    .map(Number)
    .sort((a, b) => a - b)
  const chunks = []
  for (const pageNum of pageNumbers) {
    const pageText = pageTexts[String(pageNum)] ?? ''
    if (!pageText.trim()) continue
    const sectionChunks = chunkBySections(pageText, chunkSize)
    for (const c of sectionChunks) {
      chunks.push({
        text: c.text,
        pageNumber: pageNum,
        chunk_index: chunks.length,
      })
    }
  }
  return chunks
}
