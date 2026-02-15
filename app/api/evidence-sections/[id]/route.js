import { NextResponse } from 'next/server'
import { getEvidenceSection, updateEvidenceSection } from '@/lib/database'

/**
 * GET /api/evidence-sections/[id] — 증거 섹션 단건 조회
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const section = await getEvidenceSection(id)

    if (!section) {
      return NextResponse.json({ error: '섹션을 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json(section)
  } catch (error) {
    console.error('GET evidence-section error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/evidence-sections/[id] — 증거 섹션 수정
 * Body: { section_type?, section_title?, user_description?, user_tags? }
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()

    const updated = await updateEvidenceSection(id, body)

    return NextResponse.json({ success: true, section: updated })
  } catch (error) {
    console.error('PUT evidence-section error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
