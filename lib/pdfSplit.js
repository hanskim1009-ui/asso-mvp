/**
 * PDF를 100페이지 단위로 분할 (Upstage OCR 제한 대응).
 * pdf-lib 사용.
 */

const PAGE_LIMIT = 100

/**
 * PDF 버퍼에서 페이지 수 조회
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<number>}
 */
export async function getPdfPageCount(buffer) {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(buffer)
  return src.getPageCount()
}

/**
 * PDF를 PAGE_LIMIT(100) 페이지 단위로 분할하여 각 part의 PDF 버퍼 배열 반환
 * @param {Buffer|Uint8Array} buffer - 원본 PDF
 * @returns {Promise<{ buffers: Buffer[], pageRanges: { start: number, end: number }[] }>}
 */
export async function splitPdfByPageLimit(buffer) {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(buffer)
  const totalPages = src.getPageCount()
  if (totalPages <= PAGE_LIMIT) {
    return { buffers: [Buffer.from(buffer)], pageRanges: [{ start: 1, end: totalPages }] }
  }
  const buffers = []
  const pageRanges = []
  for (let start = 0; start < totalPages; start += PAGE_LIMIT) {
    const endIndex = Math.min(start + PAGE_LIMIT, totalPages) - 1
    const indices = []
    for (let i = start; i <= endIndex; i++) indices.push(i)
    const dest = await PDFDocument.create()
    const copied = await dest.copyPages(src, indices)
    copied.forEach((p) => dest.addPage(p))
    const bytes = await dest.save()
    buffers.push(Buffer.from(bytes))
    pageRanges.push({ start: start + 1, end: endIndex + 1 })
  }
  return { buffers, pageRanges }
}

export { PAGE_LIMIT }
