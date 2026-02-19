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

function formatLearningExamples(examples, maxChars = 400) {
  if (!examples?.length) return ''
  return (
    '\n【참고: 같은 유형 예시】\n' +
    examples
      .map((ex, i) => {
        const after = ex.body_after ? ex.body_after.slice(0, maxChars) + (ex.body_after.length > maxChars ? '…' : '') : ''
        return `예시 ${i + 1}:\n${after}`
      })
      .join('\n\n') +
    '\n\n'
  )
}

function buildOutlinePrompt(opinionType, dataBlock, userPrompt, learningExamples = [], referenceRagBlock = '') {
  const config = OPINION_TYPES[opinionType]
  if (!config) return null
  let prompt =
    `당신은 한국 형사변호 전문 변호사입니다. 아래 분석 자료를 바탕으로 **의견서의 목차**와 **다른 AI에게 의견서 본문 작성을 맡길 때 사용할 상세 지시문**을 작성해 주세요.\n\n`
  prompt += `${config.defaultPrompt}\n\n${dataBlock}\n\n`
  if (referenceRagBlock) prompt += referenceRagBlock
  if (learningExamples.length > 0) prompt += formatLearningExamples(learningExamples)
  if (userPrompt?.trim()) prompt += `【이용자 추가 지시】\n${userPrompt.trim()}\n\n`
  prompt += `
응답은 반드시 다음 두 섹션으로만 구분해 주세요. 다른 설명 없이 두 섹션만 출력하세요.

## 목차
(번호 목록으로 의견서 목차만 작성. 예: 1. 서론  2. 범죄사실 요지  3. 양형 참작 사유  …)

## 작성 AI용 지시문
(다른 AI가 위 목차대로 의견서 본문을 2~3번에 나누어 작성할 때 사용할 지시문. 톤, 강조할 점, 각 섹션별로 다룰 내용, 형식(마크다운 등)을 구체적으로 작성.)`
  return prompt
}

function parseOutlineResponse(text) {
  const raw = (text || '').trim()
  const metaMarker = '## 작성 AI용 지시문'
  const outlineMarker = '## 목차'
  let outline = ''
  let metaPrompt = ''
  const metaIdx = raw.indexOf(metaMarker)
  const outlineIdx = raw.indexOf(outlineMarker)
  if (metaIdx !== -1) {
    metaPrompt = raw.slice(metaIdx + metaMarker.length).trim()
    if (outlineIdx !== -1 && outlineIdx < metaIdx) {
      outline = raw.slice(outlineIdx + outlineMarker.length, metaIdx).trim()
    }
  }
  if (outlineIdx !== -1 && !outline && metaIdx !== -1) {
    outline = raw.slice(outlineIdx + outlineMarker.length, metaIdx).trim()
  }
  if (!outline && !metaPrompt) {
    const lines = raw.split('\n')
    const firstH2 = lines.findIndex((l) => /^##\s*목차/i.test(l))
    const secondH2 = lines.findIndex((l, i) => i > firstH2 && /^##\s*작성\s*AI/i.test(l))
    if (firstH2 !== -1) {
      outline = lines.slice(firstH2 + 1, secondH2 !== -1 ? secondH2 : undefined).join('\n').trim()
    }
    if (secondH2 !== -1) {
      metaPrompt = lines.slice(secondH2 + 1).join('\n').trim()
    }
  }
  return { outline: outline || raw, metaPrompt: metaPrompt || raw }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { analysis, userContext, opinionType, userPrompt, model, selectedReferenceChunks } = body

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
      return NextResponse.json({ error: '유효한 1차 AI 모델을 선택하세요.' }, { status: 400 })
    }

    const dataBlock = serializeAnalysis(analysis, userContext || null)
    let referenceRagBlock = ''
    if (Array.isArray(selectedReferenceChunks) && selectedReferenceChunks.length > 0) {
      referenceRagBlock = formatReferenceRag(selectedReferenceChunks)
    }
    const fullPrompt = buildOutlinePrompt(
      opinionType,
      dataBlock,
      userPrompt || '',
      [],
      referenceRagBlock
    )
    if (!fullPrompt) {
      return NextResponse.json({ error: '의견서 종류에 해당하는 프롬프트를 찾을 수 없습니다.' }, { status: 400 })
    }

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
        { error: 'AI가 목차·지시문을 생성하지 못했습니다.' },
        { status: 500 }
      )
    }

    const { outline, metaPrompt } = parseOutlineResponse(bodyText)
    return NextResponse.json({
      success: true,
      outline,
      metaPrompt,
      model,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Opinion generate-outline error:', error)
    return NextResponse.json(
      { error: error.message || '목차·지시문 생성 실패' },
      { status: 500 }
    )
  }
}
