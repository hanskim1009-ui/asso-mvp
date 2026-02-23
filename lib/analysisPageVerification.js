/**
 * 분석 결과의 페이지 번호 검증 (후처리).
 * - inRange: 해당 문서의 실제 페이지 범위(1~maxPage) 내인지
 * - contentMatch: 해당 페이지 원문에 항목 내용의 키워드가 포함되는지 휴리스틱
 * AI 호출 없음, 비용 0원.
 */

/**
 * @typedef {Object} PageTextsByDoc
 * @property {string} documentId
 * @property {{ [page: string]: string }} pageTexts - { "1": "텍스트", "2": "..." }
 */

/**
 * 페이지 텍스트에서 키워드가 충분히 등장하는지 확인 (휴리스틱)
 * @param {string} pageText - 해당 페이지 원문
 * @param {string} itemText - 분석 항목 텍스트 (이벤트 설명, 증거 설명 등)
 * @returns {boolean}
 */
function contentMatches(pageText, itemText) {
  if (!pageText || typeof pageText !== 'string') return false
  const text = pageText.trim()
  if (text.length < 10) return false
  if (!itemText || typeof itemText !== 'string') return true

  const normalized = itemText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return true

  const pageLower = text.toLowerCase()
  let matchCount = 0
  const need = Math.min(2, Math.ceil(words.length * 0.3))
  for (const w of words) {
    if (w.length < 2) continue
    if (pageLower.includes(w.toLowerCase())) matchCount++
    if (matchCount >= need) return true
  }
  return matchCount >= need
}

/**
 * 문서별 페이지 텍스트에서 해당 페이지 범위·텍스트 조회
 * @param {PageTextsByDoc[]} pageTextsByDoc
 * @param {number} page
 * @returns {{ maxPage: number, pageText: string }} - 첫 번째 문서 기준
 */
function getPageInfo(pageTextsByDoc, page) {
  if (!pageTextsByDoc?.length) return { maxPage: 0, pageText: '' }
  const first = pageTextsByDoc[0]
  const keys = Object.keys(first.pageTexts || {})
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n))
  const maxPage = keys.length ? Math.max(...keys) : 0
  const pageText = (first.pageTexts && first.pageTexts[String(page)]) || ''
  return { maxPage, pageText }
}

/**
 * 단일 페이지 검증
 */
function verifyPage(page, itemText, pageTextsByDoc) {
  if (page == null || typeof page !== 'number') return { inRange: false, contentMatch: false }
  const { maxPage, pageText } = getPageInfo(pageTextsByDoc, page)
  const inRange = maxPage > 0 && page >= 1 && page <= maxPage
  const contentMatch = inRange && contentMatches(pageText, itemText)
  return { inRange, contentMatch }
}

/**
 * 분석 결과 전체에 대한 페이지 검증
 * @param {object} result - analysis result (summary, timeline, evidence, contradictions, entities)
 * @param {PageTextsByDoc[]} pageTextsByDoc - 문서별 페이지 텍스트 (분석에 사용된 문서 순서)
 * @returns {object} - verification result by section
 */
export function verifyAnalysisPages(result, pageTextsByDoc) {
  const out = {
    timeline: [],
    evidence: [],
    entities: {
      persons: [],
      relationships: [],
      locations: [],
      evidence_items: [],
    },
  }

  if (!result) return out

  const timeline = result.timeline || []
  timeline.forEach((t, i) => {
    const text = [t.event, t.event_description, t.source].filter(Boolean).join(' ')
    const { inRange, contentMatch } = verifyPage(t.page, text, pageTextsByDoc)
    out.timeline.push({ index: i, page: t.page, inRange, contentMatch })
  })

  const evidence = result.evidence || []
  evidence.forEach((e, i) => {
    const text = [e.type, e.description].filter(Boolean).join(' ')
    const { inRange, contentMatch } = verifyPage(e.page, text, pageTextsByDoc)
    out.evidence.push({ index: i, page: e.page, inRange, contentMatch })
  })

  const entities = result.entities || {}
  const persons = entities.persons || []
  persons.forEach((p, i) => {
    const pages = p.pages || []
    const keyStatements = p.key_statements || []
    const allPages = [...new Set([...pages, ...keyStatements.map((s) => s.page).filter(Boolean)])]
    const items = allPages.map((page) => {
      const text = p.name + ' ' + (p.description || '') + ' ' + keyStatements.map((s) => s.content).join(' ')
      const { inRange, contentMatch } = verifyPage(page, text, pageTextsByDoc)
      return { page, inRange, contentMatch }
    })
    out.entities.persons.push({ index: i, pages: items })
  })

  const relationships = entities.relationships || []
  relationships.forEach((r, i) => {
    const pages = r.evidence_pages || []
    const items = pages.map((page) => {
      const text = [r.person1, r.person2, r.description].filter(Boolean).join(' ')
      const { inRange, contentMatch } = verifyPage(page, text, pageTextsByDoc)
      return { page, inRange, contentMatch }
    })
    out.entities.relationships.push({ index: i, pages: items })
  })

  const locations = entities.locations || []
  locations.forEach((l, i) => {
    const pages = l.pages || []
    const items = pages.map((page) => {
      const text = [l.name, l.type, l.related_events?.[0]].filter(Boolean).join(' ')
      const { inRange, contentMatch } = verifyPage(page, text, pageTextsByDoc)
      return { page, inRange, contentMatch }
    })
    out.entities.locations.push({ index: i, pages: items })
  })

  const evidenceItems = entities.evidence_items || []
  evidenceItems.forEach((e, i) => {
    const pages = e.pages || []
    const items = pages.map((page) => {
      const text = [e.name, e.description, e.relevance].filter(Boolean).join(' ')
      const { inRange, contentMatch } = verifyPage(page, text, pageTextsByDoc)
      return { page, inRange, contentMatch }
    })
    out.entities.evidence_items.push({ index: i, pages: items })
  })

  return out
}

/**
 * 검증 결과에서 한 줄 요약 (예: "타임라인 5/5 확인, 증거 3/4 확인")
 */
export function verificationSummary(verification) {
  if (!verification) return null
  const parts = []
  const t = verification.timeline || []
  if (t.length) {
    const ok = t.filter((x) => x.inRange && x.contentMatch).length
    parts.push(`타임라인 ${ok}/${t.length}`)
  }
  const e = verification.evidence || []
  if (e.length) {
    const ok = e.filter((x) => x.inRange && x.contentMatch).length
    parts.push(`증거 ${ok}/${e.length}`)
  }
  return parts.length ? parts.join(', ') : null
}
