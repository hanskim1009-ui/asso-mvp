import { NextResponse } from 'next/server'
import { getOpinionDraftsByCase } from '@/lib/database'

/**
 * GET /api/cases/[id]/opinions — 사건의 저장된 의견서 목록
 */
export async function GET(request, { params }) {
  try {
    const { id: caseId } = await params
    const drafts = await getOpinionDraftsByCase(caseId)
    return NextResponse.json({ opinions: drafts })
  } catch (error) {
    console.error('GET opinions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
