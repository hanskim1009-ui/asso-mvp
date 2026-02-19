/**
 * Upstage Document Parse API로 PDF에서 텍스트 추출
 * @param {Blob | File} file - PDF 파일
 * @returns {Promise<{ extractedText: string, pageTexts: Record<string, string> | null }>}
 */
export async function parseDocumentWithUpstage(file) {
  if (!file) throw new Error('파일이 필요합니다.')
  if (!process.env.UPSTAGE_API_KEY) throw new Error('UPSTAGE_API_KEY가 필요합니다.')

  const formData = new FormData()
  formData.append('document', file)

  const response = await fetch('https://api.upstage.ai/v1/document-ai/document-parse', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`,
    },
    body: formData,
  })

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`Upstage API 에러 (${response.status}): ${responseText.slice(0, 200)}`)
  }

  const data = JSON.parse(responseText)
  const extractedText =
    data.content?.text ||
    data.text ||
    data.content?.html ||
    data.html ||
    (typeof data === 'string' ? data : JSON.stringify(data))

  let pageTexts = null
  const elements = data.elements || data.content?.elements || []
  if (elements.length > 0) {
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
        pageTexts[String(page)] = texts.join('\n')
      }
    }
  }

  return { extractedText, pageTexts }
}
