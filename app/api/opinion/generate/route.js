import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { OPINION_TYPES } from '@/lib/opinionPrompts'
import { REFERENCE_MAX_CHUNK_SIZE } from '@/lib/chunkText'

const MODEL_IDS = {
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
  'claude-opus-4.5': 'claude-opus-4-5-20251101',
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
}

function serializeAnalysis(analysis, userContext) {
  const parts = ['【분석 결과】']
  if (analysis.summary) parts.push(`## 사건 요약\n${analysis.summary}`)
  if (analysis.issues?.length) parts.push(`## 쟁점\n${analysis.issues.map((i) => `- ${i}`).join('\n')}`)
  if (analysis.timeline?.length) {
    parts.push('## 타임라인\n| 일자 | 사건 | 출처 | 페이지 |\n|------|------|------|--------|')
    analysis.timeline.forEach((t) => {
      parts.push(`| ${t.date ?? '-'} | ${t.event ?? '-'} | ${t.source ?? '-'} | ${t.page ?? '-'} |`)
    })
  }
  if (analysis.evidence?.length) {
    parts.push('## 증거\n| 유형 | 내용 | 페이지 |\n|------|------|--------|')
    analysis.evidence.forEach((e) => {
      parts.push(`| ${e.type ?? '-'} | ${e.description ?? '-'} | ${e.page ?? '-'} |`)
    })
  }
  if (analysis.favorable_facts?.length) {
    parts.push('## 유리한 정황\n' + analysis.favorable_facts.map((f) => `- ${f}`).join('\n'))
  }
  if (analysis.contradictions?.length) {
    parts.push(
      '## 모순·의문점\n' +
        analysis.contradictions
          .map(
            (c) =>
              `- 진술1: ${c.statement_1 ?? '-'}\n  진술2: ${c.statement_2 ?? '-'}\n  분석: ${c.analysis ?? '-'}`
          )
          .join('\n\n')
    )
  }

  parts.push('\n【사건 컨텍스트】')
  if (userContext?.representing === 'defendant') parts.push('- 대리: 피고인/피의자')
  else if (userContext?.representing === 'plaintiff') parts.push('- 대리: 피해자/고소인')
  if (userContext?.case_background) parts.push(`- 사건 배경: ${userContext.case_background}`)
  if (userContext?.defendant_claim) parts.push(`- 피고인 측 주장: ${userContext.defendant_claim}`)
  if (userContext?.plaintiff_claim) parts.push(`- 검찰/피해자 측 주장: ${userContext.plaintiff_claim}`)
  if (userContext?.focus_areas) parts.push(`- 중점 사항: ${userContext.focus_areas}`)

  return parts.join('\n\n')
}

function formatLearningExamples(examples, maxChars = 600) {
  if (!examples?.length) return ''
  return (
    '\n【참고: 같은 유형 의견서 수정 예시】\n' +
    examples
      .map((ex, i) => {
        const instruction = ex.user_instruction ? `수정 지시: ${ex.user_instruction}` : ''
        const after = ex.body_after ? ex.body_after.slice(0, maxChars) + (ex.body_after.length > maxChars ? '…' : '') : ''
        return `예시 ${i + 1}: ${instruction}\n수정 후 본문(일부):\n${after}`
      })
      .join('\n\n') +
    '\n\n'
  )
}

function formatReferenceRag(chunks, maxCharsPerChunk = REFERENCE_MAX_CHUNK_SIZE) {
  if (!chunks?.length) return ''
  const parts = chunks.map((c) => {
    const meta = c.metadata || {}
    const label = [meta.topic, meta.crime_type].filter(Boolean).join(' - ') || '참고자료'
    const content = (c.content || '').slice(0, maxCharsPerChunk)
    return `【${label}】\n${content}`
  })
  return '\n【참고자료】\n\n' + parts.join('\n\n') + '\n\n'
}

function buildFullPrompt(opinionType, dataBlock, userPrompt, learningExamples = [], referenceRagBlock = '') {
  const config = OPINION_TYPES[opinionType]
  if (!config) return null
  let prompt = `당신은 한국 형사변호 전문 변호사입니다.\n\n${config.defaultPrompt}\n\n${dataBlock}\n\n`
  if (referenceRagBlock) prompt += referenceRagBlock
  if (learningExamples.length > 0) prompt += formatLearningExamples(learningExamples)
  if (userPrompt?.trim()) prompt += `【이용자 추가 지시】\n${userPrompt.trim()}\n\n`
  prompt +=
    '위 내용과 분석 데이터를 바탕으로 의견서 본문만 작성하세요. 마크다운 형식으로 제목(##), 소제목(###), 번호 목록을 활용하세요.'
  return prompt
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { analysis, userContext, opinionType, userPrompt, model } = body

    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json({ error: '분석 결과(analysis)가 필요합니다.' }, { status: 400 })
    }
    if (!opinionType || !OPINION_TYPES[opinionType]) {
      return NextResponse.json(
        { error: '유효한 의견서 종류(opinionType)를 선택하세요.' },
        { status: 400 }
      )
    }
    const modelId = MODEL_IDS[model]
    if (!modelId) {
      return NextResponse.json({ error: '유효한 AI 모델을 선택하세요.' }, { status: 400 })
    }

    const dataBlock = serializeAnalysis(analysis, userContext || null)

    // 사용자가 선택한 참고자료만 사용. 없으면 자동 RAG 검색하지 않음.
    const selectedReferenceChunks = body.selectedReferenceChunks
    let referenceRagBlock = ''
    if (Array.isArray(selectedReferenceChunks) && selectedReferenceChunks.length > 0) {
      referenceRagBlock = formatReferenceRag(selectedReferenceChunks)
    }

    const fullPrompt = buildFullPrompt(opinionType, dataBlock, userPrompt, [], referenceRagBlock)
    if (!fullPrompt) {
      return NextResponse.json({ error: '의견서 종류에 해당하는 프롬프트를 찾을 수 없습니다.' }, { status: 400 })
    }

    const isClaude = model.startsWith('claude-')
    if (isClaude) {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: 'Claude 모델을 사용하려면 ANTHROPIC_API_KEY가 필요합니다.' },
          { status: 500 }
        )
      }
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await anthropic.messages.create({
        model: modelId,
        max_tokens: 8192,
        messages: [{ role: 'user', content: fullPrompt }],
      })
      const textBlock = msg.content?.find((b) => b.type === 'text')
      const bodyText = textBlock?.text?.trim() || ''
      if (!bodyText) {
        return NextResponse.json(
          { error: 'AI가 의견서 내용을 생성하지 못했습니다.' },
          { status: 500 }
        )
      }
      const typeLabel = OPINION_TYPES[opinionType]?.label || opinionType
      const title = `${typeLabel} - ${new Date().toISOString().slice(0, 10)}`
      return NextResponse.json({
        success: true,
        opinion: {
          title,
          body: bodyText,
          model,
          opinionType,
          generatedAt: new Date().toISOString(),
        },
      })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini 모델을 사용하려면 GEMINI_API_KEY가 필요합니다.' },
        { status: 500 }
      )
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const geminiModel = genAI.getGenerativeModel({ model: modelId })
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })
    const bodyText = result.response?.text?.()?.trim() || ''
    if (!bodyText) {
      return NextResponse.json(
        { error: 'AI가 의견서 내용을 생성하지 못했습니다.' },
        { status: 500 }
      )
    }
    const typeLabel = OPINION_TYPES[opinionType]?.label || opinionType
    const title = `${typeLabel} - ${new Date().toISOString().slice(0, 10)}`
    return NextResponse.json({
      success: true,
      opinion: {
        title,
        body: bodyText,
        model,
        opinionType,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Opinion generate error:', error)
    return NextResponse.json(
      { error: error.message || '의견서 생성 실패' },
      { status: 500 }
    )
  }
}
