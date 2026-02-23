'use client'

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

Font.register({
  family: 'NotoSansKR',
  src: '/fonts/NotoSansKR[wght].ttf',
})

const fontFamily = 'NotoSansKR'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: fontFamily,
    fontSize: 10,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 9,
    color: '#666',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingBottom: 4,
  },
  body: {
    lineHeight: 1.5,
    marginBottom: 4,
    textAlign: 'justify',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    width: 12,
    textAlign: 'right',
    marginRight: 4,
  },
  listContent: {
    flex: 1,
  },
  evidenceRow: {
    flexDirection: 'row',
    marginBottom: 6,
    padding: 6,
    backgroundColor: '#f9f9f9',
  },
  evidenceType: {
    width: 48,
    fontSize: 8,
    color: '#666',
  },
  evidenceDesc: {
    flex: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingVertical: 2,
  },
  timelineDate: {
    width: 72,
    fontSize: 9,
    color: '#555',
  },
  timelineEvent: {
    flex: 1,
  },
  timelineSource: {
    fontSize: 8,
    color: '#888',
    marginTop: 2,
  },
  contradictionBox: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#fef9e7',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  entityTable: {
    marginBottom: 6,
  },
  entityRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingVertical: 4,
  },
  entityCell: {
    flex: 1,
    fontSize: 9,
  },
})

function Section({ title, children }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function BulletList({ items }) {
  if (!items || items.length === 0) return null
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={styles.listItem}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.listContent}>{String(item)}</Text>
        </View>
      ))}
    </View>
  )
}

export default function AnalysisReportPdf({ result, caseName, analysisTitle }) {
  if (!result) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>분석 리포트</Text>
          <Text style={styles.body}>분석 결과가 없습니다.</Text>
        </Page>
      </Document>
    )
  }

  const summary = result.summary || ''
  const issues = result.issues || []
  const evidence = result.evidence || []
  const favorableFactsRaw = result.favorable_facts || []
  const favorableFacts = favorableFactsRaw.map((f) =>
    typeof f === 'object' && f?.fact != null
      ? (f.page != null ? `${f.fact} (p.${f.page})` : f.fact)
      : String(f)
  )
  const timeline = result.timeline || []
  const contradictions = result.contradictions || []
  const entities = result.entities || {}

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          분석 리포트 {caseName ? `- ${caseName}` : ''}
        </Text>
        {analysisTitle && (
          <Text style={styles.subtitle}>{analysisTitle}</Text>
        )}
        <Text style={styles.subtitle}>
          생성일시: {new Date().toLocaleString('ko-KR')}
        </Text>

        <Section title="1. 사건 요약">
          <Text style={styles.body}>{summary}</Text>
        </Section>

        <Section title="2. 주요 쟁점">
          <BulletList items={issues} />
        </Section>

        <Section title="3. 증거 목록">
          {evidence.length === 0 ? (
            <Text style={styles.body}>없음</Text>
          ) : (
            evidence.map((ev, i) => (
              <View key={i} style={styles.evidenceRow}>
                <Text style={styles.evidenceType}>{ev.type || '-'}</Text>
                <View style={styles.evidenceDesc}>
                  <Text style={styles.body}>{ev.description || ''}</Text>
                  {ev.page != null && (
                    <Text style={styles.timelineSource}>p.{ev.page}</Text>
                  )}
                  {ev.note && (
                    <Text style={[styles.body, { marginTop: 4, fontSize: 9, color: '#555' }]}>
                      메모: {ev.note}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </Section>

        <Section title="4. 유리한 정황">
          <BulletList items={favorableFacts} />
        </Section>

        <Section title="5. 타임라인">
          {timeline.length === 0 ? (
            <Text style={styles.body}>없음</Text>
          ) : (
            timeline.map((ev, i) => (
              <View key={i} style={styles.timelineRow}>
                <Text style={styles.timelineDate}>{ev.date || '-'}</Text>
                <View style={styles.timelineEvent}>
                  <Text style={styles.body}>{ev.event || ''}</Text>
                  {(ev.source || ev.page != null) && (
                    <Text style={styles.timelineSource}>
                      {ev.source || ''} {ev.page != null ? `p.${ev.page}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </Section>

        {contradictions.length > 0 && (
          <Section title="6. 발견된 모순점">
            {contradictions.map((c, i) => (
              <View key={i} style={styles.contradictionBox}>
                <Text style={[styles.body, { marginBottom: 4 }]}>
                  <Text style={{ fontWeight: 'bold' }}>진술 1: </Text>
                  {c.statement_1 || ''}
                </Text>
                <Text style={[styles.body, { marginBottom: 4 }]}>
                  <Text style={{ fontWeight: 'bold' }}>진술 2: </Text>
                  {c.statement_2 || ''}
                </Text>
                <Text style={styles.body}>
                  <Text style={{ fontWeight: 'bold' }}>분석: </Text>
                  {c.analysis || ''}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {(entities.persons?.length > 0 ||
          entities.relationships?.length > 0 ||
          entities.locations?.length > 0 ||
          entities.evidence_items?.length > 0) && (
          <Section title="7. 엔티티 분석 (인물·장소·관계)">
            {entities.persons?.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 10, marginTop: 8 }]}>인물</Text>
                {entities.persons.map((p, i) => (
                  <View key={i} style={styles.entityRow}>
                    <Text style={styles.entityCell}>
                      {p.name} [{p.role || ''}]
                      {p.aliases?.length ? ` (${p.aliases.join(', ')})` : ''}
                      {p.description ? ` - ${p.description}` : ''}
                      {p.pages?.length ? ` p.${p.pages.join(', ')}` : ''}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {entities.relationships?.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 10, marginTop: 8 }]}>관계</Text>
                {entities.relationships.map((r, i) => (
                  <View key={i} style={styles.entityRow}>
                    <Text style={styles.entityCell}>
                      {r.person1} - {r.person2}: {r.type || ''} {r.description || ''}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {entities.locations?.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 10, marginTop: 8 }]}>장소</Text>
                {entities.locations.map((loc, i) => (
                  <View key={i} style={styles.entityRow}>
                    <Text style={styles.entityCell}>
                      {loc.name} [{loc.type || ''}]
                      {loc.related_events?.length ? ` - ${loc.related_events[0]}` : ''}
                      {loc.pages?.length ? ` p.${loc.pages.join(', ')}` : ''}
                    </Text>
                  </View>
                ))}
              </>
            )}
            {entities.evidence_items?.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 10, marginTop: 8 }]}>증거물</Text>
                {entities.evidence_items.map((ev, i) => (
                  <View key={i} style={styles.entityRow}>
                    <Text style={styles.entityCell}>
                      {ev.name} [{ev.type || ''}] {ev.description || ''}
                      {ev.relevance ? ` (${ev.relevance})` : ''}
                      {ev.pages?.length ? ` p.${ev.pages.join(', ')}` : ''}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Section>
        )}
      </Page>
    </Document>
  )
}
