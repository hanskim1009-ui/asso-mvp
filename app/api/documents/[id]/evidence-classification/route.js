import { NextResponse } from 'next/server'
import { clearEvidenceData } from '@/lib/database'

/**
 * DELETE /api/documents/[id]/evidence-classification
 * 해당 문서의 증거기록 분류·분석 데이터 전부 삭제 (evidence_sections, page_classifications)
 */
export async function DELETE(request, { params }) {
  try {
    const { id: documentId } = await params
    if (!documentId) {
      return NextResponse.json({ error: 'document id가 필요합니다.' }, { status: 400 })
    }

    await clearEvidenceData(documentId)

    return NextResponse.json({ success: true, message: '증거기록 분류가 삭제되었습니다.' })
  } catch (error) {
    console.error('DELETE evidence-classification error:', error)
    return NextResponse.json(
      { error: error.message || '증거기록 분류 삭제 실패' },
      { status: 500 }
    )
  }
}
