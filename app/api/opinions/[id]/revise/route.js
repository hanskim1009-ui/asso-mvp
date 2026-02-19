import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { getOpinionDraftWithRevisions, addOpinionRevision, getOpinionLearningExamples } from '@/lib/database'

const MODEL_IDS = {
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
}

/**
 * POST /api/opinions/[id]/revise — 프롬프트로 의견서 수정 (AI 호출 후 새 리비전)
 * Body: { instruction: "수정 지시" }
 */
export async function POST(request, { params }) {
  try {
    const { id: draftId } = await params
    const body = await request.json()
    const { instruction } = body

    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction(수정 지시)이 필요합니다.' }, { status: 400 })
    }

    const draft = await getOpinionDraftWithRevisions(draftId)
    if (!draft) {
      return NextResponse.json({ error: '의견서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const learningExamples = await getOpinionLearningExamples(draft.opinion_type, 2)
    let examplesBlock = ''
    if (learningExamples.length > 0) {
      examplesBlock =
        '\n【참고: 수정 예시】\n' +
        learningExamples
          .map((ex, i) => {
            const inst = ex.user_instruction ? `지시: ${ex.user_instruction}` : ''
            const after = (ex.body_after || '').slice(0, 500) + ((ex.body_after?.length || 0) > 500 ? '…' : '')
            return `예시 ${i + 1}: ${inst}\n수정 후(일부): ${after}`
          })
          .join('\n\n') +
        '\n\n'
    }

    const prompt = `당신은 한국 형사변호 전문 변호사입니다.
아래 의견서 본문을 사용자의 수정 지시에 따라 수정한 결과만 출력하세요. 마크다운 형식과 구조를 유지하세요.
${examplesBlock}
【현재 의견서 본문】
${draft.body}

【수정 지시】
${instruction.trim()}

수정된 의견서 본문 전체만 출력하세요.`

    const model = draft.model
    const modelId = MODEL_IDS[model] || MODEL_IDS['gemini-2.5-flash']
    const isClaude = model.startsWith('claude-')

    let revisedBody = ''

    if (isClaude) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: 'Claude 모델 사용을 위해 ANTHROPIC_API_KEY가 필요합니다.' },
          { status: 500 }
        )
      }
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await anthropic.messages.create({
        model: modelId,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      })
      const textBlock = msg.content?.find((b) => b.type === 'text')
      revisedBody = textBlock?.text?.trim() || ''
    } else {
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json(
          { error: 'Gemini 모델 사용을 위해 GEMINI_API_KEY가 필요합니다.' },
          { status: 500 }
        )
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const geminiModel = genAI.getGenerativeModel({ model: modelId })
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      })
      revisedBody = result.response?.text?.()?.trim() || ''
    }

    if (!revisedBody) {
      return NextResponse.json(
        { error: 'AI가 수정본을 생성하지 못했습니다.' },
        { status: 500 }
      )
    }

    await addOpinionRevision(draftId, {
      body: revisedBody,
      revisionType: 'prompt_edit',
      userInstruction: instruction.trim(),
    })

    return NextResponse.json({ success: true, body: revisedBody })
  } catch (error) {
    console.error('POST opinion revise error:', error)
    return NextResponse.json(
      { error: error.message || '수정 실패' },
      { status: 500 }
    )
  }
}
