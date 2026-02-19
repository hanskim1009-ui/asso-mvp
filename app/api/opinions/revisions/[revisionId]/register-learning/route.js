import { NextResponse } from 'next/server'
import {
  getOpinionRevision,
  getOpinionDraftWithRevisions,
  getPreviousRevisionBody,
  getOpinionLearningExampleByRevisionId,
  insertOpinionLearningExample,
} from '@/lib/database'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/opinions/revisions/[revisionId]/register-learning
 * 해당 리비전(prompt_edit 또는 direct_edit)을 학습 예시로 등록
 */
export async function POST(request, { params }) {
  try {
    const { revisionId } = await params

    const revision = await getOpinionRevision(revisionId)
    if (!revision) {
      return NextResponse.json({ error: '리비전을 찾을 수 없습니다.' }, { status: 404 })
    }
    const allowedTypes = ['prompt_edit', 'direct_edit']
    if (!allowedTypes.includes(revision.revision_type)) {
      return NextResponse.json(
        { error: 'AI 수정 또는 직접 수정 리비전만 학습 예시로 등록할 수 있습니다.' },
        { status: 400 }
      )
    }

    const existing = await getOpinionLearningExampleByRevisionId(revisionId)
    if (existing) {
      return NextResponse.json({ success: true, alreadyRegistered: true })
    }

    const draft = await getOpinionDraftWithRevisions(revision.opinion_draft_id)
    if (!draft) {
      return NextResponse.json({ error: '의견서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const bodyBefore = await getPreviousRevisionBody(revision.opinion_draft_id, revision.revision_number)

    await insertOpinionLearningExample({
      opinionType: draft.opinion_type,
      model: draft.model,
      inputSummary: draft.title || null,
      userInstruction: revision.user_instruction || null,
      bodyBefore: bodyBefore || null,
      bodyAfter: revision.body,
      revisionId: revision.id,
    })

    return NextResponse.json({ success: true, alreadyRegistered: false })
  } catch (error) {
    console.error('register-learning error:', error)
    return NextResponse.json(
      { error: error.message || '학습 예시 등록 실패' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/opinions/revisions/[revisionId]/register-learning
 * 이미 등록됐는지 확인
 */
export async function GET(request, { params }) {
  try {
    const { revisionId } = await params
    const existing = await getOpinionLearningExampleByRevisionId(revisionId)
    return NextResponse.json({ registered: !!existing })
  } catch (error) {
    console.error('check register-learning error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/opinions/revisions/[revisionId]/register-learning
 * 학습 예시 등록 취소
 */
export async function DELETE(request, { params }) {
  try {
    const { revisionId } = await params
    const { error } = await supabase
      .from('opinion_learning_examples')
      .delete()
      .eq('revision_id', revisionId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('unregister-learning error:', error)
    return NextResponse.json(
      { error: error.message || '등록 취소 실패' },
      { status: 500 }
    )
  }
}
