import { NextResponse } from 'next/server'
import { searchReferenceChunksByText } from '@/lib/referenceChunks'

/**
 * 의견서 종류 + 분석으로 RAG 검색 쿼리를 만들고, 참고자료 청크 후보를 반환.
 * 프론트에서 사용자에게 보여주고, 포함할 항목을 선택한 뒤 generate 시 selectedReferenceChunks로 넘긴다.
 */
function buildRagQuery(opinionType, analysis) {
  const summary = analysis?.summary?.slice(0, 200) || ''
  const issues = analysis?.issues?.slice(0, 3).join(' ') || ''
  const base = `${summary} ${issues}`.trim()
  if (opinionType === 'sentencing') {
    return `양형기준 양형 참작 사유 선고유예 집행유예 감경 ${base}`.trim()
  }
  if (opinionType === 'not_guilty') {
    return `무죄 판례 증명력 합리적 의심 증거능력 ${base}`.trim()
  }
  return `형사 의견서 참고 판례 법리 ${base}`.trim()
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { analysis, opinionType } = body
    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json({ error: 'analysis가 필요합니다.' }, { status: 400 })
    }
    if (!opinionType) {
      return NextResponse.json({ error: 'opinionType이 필요합니다.' }, { status: 400 })
    }

    const query = buildRagQuery(opinionType, analysis)
    const matchCount = Math.min(Number(request.nextUrl?.searchParams?.get('limit')) || 10, 20)
    const chunks = await searchReferenceChunksByText(query, matchCount)

    return NextResponse.json({
      success: true,
      query,
      chunks: chunks.map((c) => ({
        id: c.id,
        content: c.content,
        metadata: c.metadata ?? {},
        page_number: c.page_number,
        chunk_index: c.chunk_index,
      })),
    })
  } catch (err) {
    console.error('reference-preview error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
