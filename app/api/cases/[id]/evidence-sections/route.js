import { NextResponse } from 'next/server'
import { getEvidenceSections } from '@/lib/database'

/**
 * GET /api/cases/[id]/evidence-sections — 사건의 증거 섹션 목록
 * Query: ?documentId=xxx (선택: 특정 문서만)
 */
export async function GET(request, { params }) {
  try {
    const { id: caseId } = await params
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    const sections = await getEvidenceSections(caseId, documentId || null)

    return NextResponse.json({ sections })
  } catch (error) {
    console.error('GET evidence-sections error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
