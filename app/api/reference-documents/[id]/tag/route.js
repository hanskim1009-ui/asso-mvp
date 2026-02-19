import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getReferenceDocument } from '@/lib/database'
import { getReferenceChunksByDocumentId, updateChunkMetadata } from '@/lib/referenceChunks'

const TAG_PROMPT = `다음은 법률 참고자료(양형기준, 판례 등)의 한 조각입니다. 아래 JSON만 한 줄로 출력하세요. 다른 설명 없이 JSON만.
- topic: 주제 (예: 양형기준, 판례, 증거법, 절도, 사기 등, 한두 단어)
- crime_type: 범죄 유형 (해당 없으면 null)
- summary: 한 줄 요약 (20자 내외)
- keywords: 검색에 쓸 키워드 배열 (3~5개)

조각:
"""
{{CONTENT}}
"""`

export async function POST(request, context) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    const doc = await getReferenceDocument(id)
    if (!doc) return NextResponse.json({ error: '참고자료를 찾을 수 없습니다.' }, { status: 404 })

    const chunks = await getReferenceChunksByDocumentId(id)
    if (chunks.length === 0) {
      return NextResponse.json({ success: true, tagged: 0, message: '청크가 없습니다.' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY 필요' }, { status: 500 })

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    let tagged = 0
    const delayMs = (ms) => new Promise((r) => setTimeout(r, ms))

    for (const chunk of chunks) {
      const content = (chunk.content || '').slice(0, 5000)
      const prompt = TAG_PROMPT.replace('{{CONTENT}}', content)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await delayMs(2000)
          const res = await model.generateContent(prompt)
          const text = res?.response?.text?.()?.trim() || ''
          let metadata = {}
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              metadata = JSON.parse(jsonMatch[0])
            } catch (_) {}
          }
          await updateChunkMetadata(chunk.id, metadata)
          tagged++
          break
        } catch (e) {
          lastErr = e
          const is429 = /429|Resource exhausted|Too Many Requests/i.test(String(e?.message ?? e))
          if (is429 && attempt === 0) continue
          console.warn('Chunk tag fail:', chunk.id, e.message)
          break
        }
      }
      await delayMs(800)
    }

    return NextResponse.json({ success: true, tagged, total: chunks.length })
  } catch (err) {
    console.error('POST reference-documents/[id]/tag:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
