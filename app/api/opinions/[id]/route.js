import { NextResponse } from 'next/server'
import { getOpinionDraftWithRevisions, addOpinionRevision } from '@/lib/database'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/opinions/[id] — 의견서 1건 + 리비전 목록 + 학습 예시 등록된 리비전 ID 목록
 */
export async function GET(request, { params }) {
  try {
    const { id: draftId } = await params
    const draft = await getOpinionDraftWithRevisions(draftId)
    if (!draft) {
      return NextResponse.json({ error: '의견서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const revisionIds = (draft.revisions || []).map((r) => r.id)
    let registeredRevisionIds = []
    if (revisionIds.length > 0) {
      const { data: registered } = await supabase
        .from('opinion_learning_examples')
        .select('revision_id')
        .in('revision_id', revisionIds)
      registeredRevisionIds = (registered || []).map((r) => r.revision_id).filter(Boolean)
    }

    return NextResponse.json({ ...draft, registeredRevisionIds })
  } catch (error) {
    console.error('GET opinion error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/opinions/[id] — 직접 수정 (새 리비전 추가)
 * Body: { body: "수정된 본문" }
 */
export async function PATCH(request, { params }) {
  try {
    const { id: draftId } = await params
    const body = await request.json()
    const { body: newBody } = body

    if (newBody == null || typeof newBody !== 'string') {
      return NextResponse.json({ error: 'body(본문)가 필요합니다.' }, { status: 400 })
    }

    await addOpinionRevision(draftId, {
      body: newBody.trim(),
      revisionType: 'direct_edit',
      userInstruction: null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH opinion error:', error)
    return NextResponse.json({ error: error.message || '수정 실패' }, { status: 500 })
  }
}
