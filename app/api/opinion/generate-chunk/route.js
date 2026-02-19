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

function buildChunkPrompt(opinionType, dataBlock, outline, metaPrompt, partIndex, previousChunks, referenceRagBlock) {
  const config = OPINION_TYPES[opinionType]
  const typeLabel = config?.label || opinionType
  let prompt = `당신은 한국 형사변호 전문 변호사입니다. 아래 **작성 지시문**과 **목차**에 따라 의견서 본문의 **${partIndex + 1}번째 파트**만 작성하세요.\n\n`
  prompt += `【의견서 종류】 ${typeLabel}\n\n`
  prompt += `【목차】\n${outline}\n\n`
  prompt += `【작성 지시문 (1차 AI가 작성한 것)】\n${metaPrompt}\n\n`
  prompt += `【분석·참고 (참고용)】\n${dataBlock}\n\n`
  if (referenceRagBlock) prompt += referenceRagBlock
  if (Array.isArray(previousChunks) && previousChunks.length > 0) {
    prompt += `【이미 작성된 앞부분】\n${previousChunks.join('\n\n')}\n\n`
    prompt += `위 내용에 이어서 **${partIndex + 1}번째 파트**만 이어서 작성하세요. 중복하지 말고 이어지는 본문만 출력하세요.\n\n`
  } else {
    prompt += `의견서 **처음부터** ${partIndex + 1}번째 파트 분량만 작성하세요. (서론, 첫 번째 장 등)\n\n`
  }
  prompt += '마크다운 형식으로 제목(##), 소제목(###), 번호 목록을 활용하세요. 본문만 출력하세요.'
  return prompt
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      analysis,
      userContext,
      opinionType,
      outline,
      metaPrompt,
      model,
      partIndex,
      previousChunks,
      selectedReferenceChunks,
    } = body

    if (!analysis || typeof analysis !== 'object') {
      return NextResponse.json({ error: '분석 결과(analysis)가 필요합니다.' }, { status: 400 })
    }
    if (!opinionType || !OPINION_TYPES[opinionType]) {
      return NextResponse.json(
        { error: '유효한 의견서 종류(opinionType)를 선택하세요.' },
        { status: 400 }
      )
    }
    if (outline == null || metaPrompt == null) {
      return NextResponse.json({ error: '목차(outline)와 작성 지시문(metaPrompt)이 필요합니다. 1차를 먼저 실행하세요.' }, { status: 400 })
    }
    const part = typeof partIndex === 'number' ? partIndex : parseInt(String(partIndex), 10)
    if (Number.isNaN(part) || part < 0) {
      return NextResponse.json({ error: 'partIndex는 0 이상이어야 합니다.' }, { status: 400 })
    }
    const modelId = MODEL_IDS[model]
    if (!modelId) {
      return NextResponse.json({ error: '유효한 2~3차 AI 모델을 선택하세요.' }, { status: 400 })
    }

    const dataBlock = serializeAnalysis(analysis, userContext || null)
    let referenceRagBlock = ''
    if (Array.isArray(selectedReferenceChunks) && selectedReferenceChunks.length > 0) {
      referenceRagBlock = formatReferenceRag(selectedReferenceChunks)
    }
    const fullPrompt = buildChunkPrompt(
      opinionType,
      dataBlock,
      outline,
      metaPrompt,
      part,
      Array.isArray(previousChunks) ? previousChunks : [],
      referenceRagBlock
    )

    const isClaude = model.startsWith('claude-')
    let bodyText = ''
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
      bodyText = textBlock?.text?.trim() || ''
    } else {
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
      bodyText = result.response?.text?.()?.trim() || ''
    }

    if (!bodyText) {
      return NextResponse.json(
        { error: 'AI가 본문 파트를 생성하지 못했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      chunk: bodyText,
      partIndex: part,
      model,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Opinion generate-chunk error:', error)
    return NextResponse.json(
      { error: error.message || '본문 파트 생성 실패' },
      { status: 500 }
    )
  }
}
