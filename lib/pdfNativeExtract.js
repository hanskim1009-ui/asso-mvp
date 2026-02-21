import path from 'path'
import { pathToFileURL } from 'url'

/**
 * 디지털 원본 PDF(Word 등에서 변환)에서 텍스트만 추출 (OCR 없음).
 * pdfjs-dist legacy 빌드 사용. 스캔본은 Upstage OCR 사용.
 * @param {Buffer | Uint8Array} pdfBuffer - PDF 바이너리
 * @returns {Promise<{ extractedText: string, pageTexts: Record<string, string> }>}
 */
export async function extractTextFromNativePdf(pdfBuffer) {
  if (!pdfBuffer?.length) throw new Error('PDF 버퍼가 비어 있습니다.')

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Node에서 fake worker가 pdf.worker.mjs를 찾을 수 있도록 절대 경로(file URL) 지정
  if (typeof process !== 'undefined' && process.versions?.node) {
    const workerPath = path.join(
      process.cwd(),
      'node_modules',
      'pdfjs-dist',
      'legacy',
      'build',
      'pdf.worker.mjs'
    )
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  }

  const data = new Uint8Array(pdfBuffer)
  // CMap: 설치된 pdfjs-dist 버전과 동일한 CDN 경로 사용 (5.x는 /files/cmaps/)
  const doc = await pdfjsLib.getDocument({
    data,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.4.624/files/cmaps/',
    cMapPacked: true,
  }).promise
  const numPages = doc.numPages
  const pageTexts = {}
  const allParts = []

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = (content.items || [])
      .map((item) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pageTexts[String(i)] = text
    allParts.push(text)
  }

  const extractedText = allParts.join('\n\n')
  return { extractedText, pageTexts }
}
