/**
 * 분석 결과를 채워 넣을 AI 프롬프트 템플릿.
 * AI 호출 없이 문자열 치환만 사용 (비용 0원).
 */

function formatSummary(result) {
  return result?.summary ?? '(없음)'
}

function formatIssues(result) {
  const list = result?.issues || []
  return list.length ? list.map((i) => `- ${i}`).join('\n') : '(없음)'
}

function formatEvidence(result) {
  const list = result?.evidence || []
  if (!list.length) return '(없음)'
  return list
    .map((e) => {
      const p = e.page != null ? ` (p.${e.page})` : ''
      return `- [${e.type || '-'}] ${e.description || ''}${p}`
    })
    .join('\n')
}

function formatFavorableFacts(result) {
  const list = result?.favorable_facts || []
  if (!list.length) return '(없음)'
  return list
    .map((f) => {
      const text = typeof f === 'object' && f?.fact != null ? f.fact : String(f)
      const p = typeof f === 'object' && f?.page != null ? ` (p.${f.page})` : ''
      return `- ${text}${p}`
    })
    .join('\n')
}

function formatTimeline(result) {
  const list = result?.timeline || []
  if (!list.length) return '(없음)'
  return list
    .map((t) => {
      const p = t.page != null ? ` p.${t.page}` : ''
      return `- ${t.date || ''} | ${t.event || ''} | ${t.source || ''}${p}`
    })
    .join('\n')
}

function formatContradictions(result) {
  const list = result?.contradictions || []
  if (!list.length) return '(없음)'
  return list
    .map(
      (c) =>
        `[진술1] ${c.statement_1 || ''}\n[진술2] ${c.statement_2 || ''}\n[분석] ${c.analysis || ''}`
    )
    .join('\n\n')
}

function formatEntities(result) {
  const e = result?.entities
  if (!e) return '(없음)'
  const parts = []
  if (e.persons?.length) {
    parts.push(
      '【인물】\n' +
        e.persons
          .map(
            (p) =>
              `- ${p.name} (${p.role || ''}) ${p.description || ''} ${(p.pages?.length && `p.${p.pages.join(', ')}`) || ''}`
          )
          .join('\n')
    )
  }
  if (e.relationships?.length) {
    parts.push(
      '【관계】\n' +
        e.relationships
          .map((r) => `- ${r.person1} - ${r.person2}: ${r.type || ''} ${r.description || ''}`)
          .join('\n')
    )
  }
  if (e.locations?.length) {
    parts.push(
      '【장소】\n' +
        e.locations
          .map((l) => `- ${l.name} (${l.type || ''}) ${l.related_events?.[0] || ''}`)
          .join('\n')
    )
  }
  if (e.evidence_items?.length) {
    parts.push(
      '【증거물】\n' +
        e.evidence_items
          .map((ev) => `- ${ev.name} [${ev.type || ''}] ${ev.description || ''} ${ev.relevance || ''}`)
          .join('\n')
    )
  }
  return parts.length ? parts.join('\n\n') : '(없음)'
}

/**
 * 템플릿 문자열에서 {{placeholder}} 를 result 기준으로 치환
 */
export function fillTemplate(template, result) {
  if (!result) return template
  return template
    .replace(/\{\{summary\}\}/g, formatSummary(result))
    .replace(/\{\{issues\}\}/g, formatIssues(result))
    .replace(/\{\{evidence\}\}/g, formatEvidence(result))
    .replace(/\{\{favorable_facts\}\}/g, formatFavorableFacts(result))
    .replace(/\{\{timeline\}\}/g, formatTimeline(result))
    .replace(/\{\{contradictions\}\}/g, formatContradictions(result))
    .replace(/\{\{entities\}\}/g, formatEntities(result))
}

/**
 * 프롬프트 종류별 템플릿 정의
 */
export const PROMPT_TEMPLATES = [
  {
    id: 'opinion',
    title: '의견서 작성용',
    fileName: '프롬프트_의견서.txt',
    template: `당신은 한국 형사 사건에서 피고인(피의자) 측 변호인을 지원하는 전문가입니다. 아래는 수사기록 분석 결과입니다. 이 내용을 바탕으로 법원에 제출할 변호인 의견서(양형 의견서·구속적부심 의견서 등) 초안을 작성해 주세요.

## 사건 요약
{{summary}}

## 주요 쟁점
{{issues}}

## 증거 목록
{{evidence}}

## 피고인에게 유리한 정황
{{favorable_facts}}

## 타임라인
{{timeline}}

## 발견된 모순점(진술 불일치)
{{contradictions}}

## 엔티티 정리(인물·관계·장소·증거물)
{{entities}}

---
작성 지침:
- 위 분석을 근거로 논리적으로 변론을 구성하세요.
- 각 주장에는 반드시 근거가 되는 문서·페이지(p.N)를 명시하세요.
- 법률 용어와 판례 인용이 필요하면 해당 부분을 [판례 검색 후 보완] 등으로 표시하세요.
`,
  },
  {
    id: 'brief',
    title: '변론요지서 작성용',
    fileName: '프롬프트_변론요지서.txt',
    template: `당신은 형사 변론요지서 작성 전문가입니다. 아래 수사기록 분석을 바탕으로 변론요지서 초안을 작성해 주세요.

## 사건 요약
{{summary}}

## 쟁점
{{issues}}

## 증거
{{evidence}}

## 유리한 정황
{{favorable_facts}}

## 타임라인
{{timeline}}

## 모순점(탄핵 소재)
{{contradictions}}

## 인물·관계·장소
{{entities}}

---
지침: 쟁점별로 요지와 근거를 간결하게 정리하고, 증거 번호·페이지를 괄호로 표기하세요.
`,
  },
  {
    id: 'bail',
    title: '보석·구속적부심 청구서용',
    fileName: '프롬프트_보석_구속적부심.txt',
    template: `당신은 구속적부심·보석 청구 서면 작성 전문가입니다. 아래 분석을 참고하여 보석 청구서 또는 구속적부심 청구서 초안을 작성해 주세요.

## 사건 요약
{{summary}}

## 쟁점
{{issues}}

## 유리한 정황(구속 불필요·보석 가능 사유로 활용)
{{favorable_facts}}

## 증거
{{evidence}}

## 타임라인
{{timeline}}

## 모순점
{{contradictions}}

---
지침: 구속의 부당성·보석 가능성에 초점을 맞추고, 위 유리한 정황과 증거를 활용해 작성하세요.
`,
  },
  {
    id: 'impeachment',
    title: '탄핵자료(증인 신빙성) 정리용',
    fileName: '프롬프트_탄핵자료.txt',
    template: `당신은 형사 재판에서 증인 탄핵 자료를 정리하는 전문가입니다. 아래 분석에서 진술 간 모순과 신빙성 공격 포인트를 추려 탄핵 자료 요약을 작성해 주세요.

## 사건 요약
{{summary}}

## 발견된 모순점(진술 불일치)
{{contradictions}}

## 쟁점
{{issues}}

## 인물·관계(증인 역할 참고)
{{entities}}

## 증거·타임라인(참고)
{{evidence}}

{{timeline}}

---
지침: 각 모순에 대해 어떤 증인/진술을 어떻게 탄핵할지, 요지와 근거 페이지를 정리하세요.
`,
  },
]

export function getPromptTemplates() {
  return PROMPT_TEMPLATES
}
