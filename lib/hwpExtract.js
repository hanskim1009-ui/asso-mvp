/**
 * HWP(구 한글) / HWPX(최신 한글) 파일에서 텍스트 추출.
 * - HWP: hwp.js 사용 (CFB 바이너리)
 * - HWPX: ZIP + XML (JSZip로 압축 해제 후 XML에서 텍스트 추출)
 * 서버 전용 (API route).
 */

const CharType = { Char: 0, Inline: 1, Extened: 2 }

const ZIP_MAGIC = [0x50, 0x4b] // PK

/** XML 문자열에서 태그 제거 후 텍스트만 추출 (엔티티 디코딩) */
function textFromXml(xmlStr) {
  if (!xmlStr || typeof xmlStr !== 'string') return ''
  let s = xmlStr
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * HWPX (ZIP + XML) 파일에서 텍스트 추출
 * @param {Buffer|Uint8Array} buffer - HWPX 파일 바이너리 (ZIP)
 * @returns {Promise<{ extractedText: string, pageTexts: { [page: string]: string } | null }>}
 */
export async function extractTextFromHwpx(buffer) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const pageTexts = {}
  const sections = []

  // Contents/section0.xml, section1.xml, ... 또는 Contents/*.xml
  const names = Object.keys(zip.files).filter(
    (n) => n.startsWith('Contents/') && n.endsWith('.xml') && !n.includes('__')
  )
  const sectionNames = names.filter((n) => /Contents\/section\d+\.xml$/i.test(n)).sort()
  const toRead = sectionNames.length > 0 ? sectionNames : names

  for (let i = 0; i < toRead.length; i++) {
    const name = toRead[i]
    const entry = zip.files[name]
    if (!entry || entry.dir) continue
    const xmlStr = await entry.async('string')
    const text = textFromXml(xmlStr)
    if (text) {
      const pageNum = String(i + 1)
      pageTexts[pageNum] = text
      sections.push(text)
    }
  }

  const extractedText = sections.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  return {
    extractedText: extractedText || (pageTexts['1'] ?? ''),
    pageTexts: Object.keys(pageTexts).length > 0 ? pageTexts : (extractedText ? { '1': extractedText } : null),
  }
}

/**
 * @param {Buffer|Uint8Array} buffer - HWP 파일 바이너리
 * @returns {Promise<{ extractedText: string, pageTexts: { [page: string]: string } | null }>}
 */
export async function extractTextFromHwp(buffer) {
  let parse
  try {
    const hwp = await import('hwp.js')
    parse = hwp.default?.parse ?? hwp.parse
  } catch (e) {
    throw new Error('hwp.js를 불러올 수 없습니다: ' + (e?.message || e))
  }

  const input = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer
  const doc = parse(input)

  if (!doc || !doc.sections) {
    return { extractedText: '', pageTexts: null }
  }

  const lines = []
  let currentPage = 1
  const pageTexts = { '1': '' }

  for (const section of doc.sections) {
    const content = section.content || []
    for (const para of content) {
      const chars = para.content || []
      let line = ''
      for (const ch of chars) {
        if (ch.type === CharType.Extened) continue
        if (typeof ch.value === 'string') {
          line += ch.value
          continue
        }
        if (ch.value === 13 || ch.value === 10) {
          if (line.trim()) lines.push(line)
          line = ''
          continue
        }
        if (ch.value === 0) continue
        try {
          line += String.fromCharCode(ch.value)
        } catch (_) {
          // skip invalid char
        }
      }
      if (line.trim()) lines.push(line)
    }
  }

  const extractedText = lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()

  // HWP에는 페이지 구분이 없을 수 있음. 전체를 1페이지로 제공 (청킹·검색 호환)
  if (extractedText) pageTexts['1'] = extractedText

  return {
    extractedText,
    pageTexts: Object.keys(pageTexts).length > 0 ? pageTexts : null,
  }
}

/**
 * HWP 또는 HWPX 자동 감지 후 텍스트 추출
 * @param {Buffer|Uint8Array} buffer - 한글 문서 바이너리
 * @returns {Promise<{ extractedText: string, pageTexts: { [page: string]: string } | null }>}
 */
export async function extractTextFromHanword(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const isZip = buf.length >= 2 && buf[0] === ZIP_MAGIC[0] && buf[1] === ZIP_MAGIC[1]
  if (isZip) {
    return extractTextFromHwpx(buf)
  }
  return extractTextFromHwp(buf)
}
