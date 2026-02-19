import { NextResponse } from 'next/server'
import { createOpinionDraft } from '@/lib/database'

/**
 * POST /api/opinions
 * 생성된 의견서를 DB에 저장 (draft + 1차 리비전)
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const {
      caseId,
      analysisResultId,
      opinionType,
      model,
      title,
      body: opinionBody,
      initialUserPrompt,
    } = body

    if (!caseId || !opinionType || !model || !title || opinionBody == null) {
      return NextResponse.json(
        { error: 'caseId, opinionType, model, title, body가 필요합니다.' },
        { status: 400 }
      )
    }

    const draftId = await createOpinionDraft({
      caseId,
      analysisResultId: analysisResultId || null,
      opinionType,
      model,
      title,
      body: String(opinionBody),
      initialUserPrompt: initialUserPrompt || null,
    })

    return NextResponse.json({ success: true, draftId })
  } catch (error) {
    console.error('POST /api/opinions:', error)
    return NextResponse.json(
      { error: error.message || '의견서 저장 실패' },
      { status: 500 }
    )
  }
}
