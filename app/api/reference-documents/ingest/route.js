import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { parseDocumentWithUpstage } from '@/lib/upstageParse'
import { extractTextFromNativePdf } from '@/lib/pdfNativeExtract'
import { insertReferenceDocument } from '@/lib/database'
import {
  getReferenceChunksByDocumentId,
  insertReferenceChunks,
  updateChunkMetadata,
  embedChunksForDocument,
} from '@/lib/referenceChunks'
import {
  chunkFullText,
  chunkByPageTexts,
  chunkBySections,
  chunkByPageTextsWithSections,
  REFERENCE_DEFAULT_CHUNK_SIZE,
  REFERENCE_MAX_CHUNK_SIZE,
} from '@/lib/chunkText'

const TAG_PROMPT = `다음은 법률 참고자료(양형기준, 판례 등)의 한 조각입니다. 아래 JSON만 한 줄로 출력하세요. 다른 설명 없이 JSON만.
- topic: 주제 (예: 양형기준, 판례, 증거법, 절도, 사기 등, 한두 단어)
- crime_type: 범죄 유형 (해당 없으면 null)
- summary: 한 줄 요약 (20자 내외)
- keywords: 검색에 쓸 키워드 배열 (3~5개)

조각:
"""
{{CONTENT}}
"""`

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('document')
    const title = formData.get('title')?.toString()?.trim()
    const sourceDescription = formData.get('source_description')?.toString()?.trim() || null
    const pdfType = (formData.get('pdfType')?.toString() || 'scanned').toLowerCase()
    const chunkSizeRaw = formData.get('chunkSize')
    const chunkSize = chunkSizeRaw != null ? Math.max(500, Math.min(REFERENCE_MAX_CHUNK_SIZE, Number(chunkSizeRaw))) : REFERENCE_DEFAULT_CHUNK_SIZE
    const chunkBySectionsFlag = ['true', '1', 'yes'].includes(String(formData.get('chunkBySections') ?? '').toLowerCase())
    const singleChunkFlag = ['true', '1', 'yes'].includes(String(formData.get('singleChunk') ?? '').toLowerCase())

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'PDF 파일(document)이 필요합니다.' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ error: '제목(title)이 필요합니다.' }, { status: 400 })
    }

    const fileFileName = file.name || 'document.pdf'

    // 1. 텍스트 추출: 디지털 원본은 pdfjs로, 스캔본은 Upstage OCR
    let extractedText = ''
    let pageTexts = null
    if (pdfType === 'digital') {
      const buf = Buffer.from(await file.arrayBuffer())
      const result = await extractTextFromNativePdf(buf)
      extractedText = result.extractedText
      pageTexts = result.pageTexts && Object.keys(result.pageTexts).length > 0 ? result.pageTexts : null
    } else {
      const result = await parseDocumentWithUpstage(file)
      extractedText = result.extractedText
      pageTexts = result.pageTexts
    }
    if (!extractedText?.trim()) {
      return NextResponse.json(
        { error: 'PDF에서 텍스트를 추출하지 못했습니다. 스캔본이면 파일 유형을 "스캔본"으로 선택해 보세요.' },
        { status: 400 }
      )
    }

    // 2. 참고자료 문서 생성
    const id = await insertReferenceDocument({
      title,
      source_description: sourceDescription,
      file_name: fileFileName,
    })
    if (!id) {
      return NextResponse.json({ error: '참고자료 문서 생성 실패' }, { status: 500 })
    }

    // 3. 청킹 (단일 청크 모드: 전체를 1개 / 아니면 크기·섹션 옵션 적용)
    let chunks
    if (singleChunkFlag) {
      const full = pageTexts
        ? Object.keys(pageTexts)
            .map(Number)
            .sort((a, b) => a - b)
            .map((n) => pageTexts[String(n)] ?? '')
            .join('\n\n')
        : extractedText
      chunks = full.trim() ? [{ text: full.trim(), pageNumber: 1, chunk_index: 0 }] : []
    } else if (chunkBySectionsFlag) {
      chunks = pageTexts
        ? chunkByPageTextsWithSections(pageTexts, chunkSize)
        : chunkBySections(extractedText, chunkSize)
    } else {
      chunks = pageTexts
        ? chunkByPageTexts(pageTexts, chunkSize)
        : chunkFullText(extractedText, chunkSize)
    }
    if (chunks.length === 0) {
      return NextResponse.json({
        success: true,
        id,
        title,
        chunksCount: 0,
        embedded: 0,
        tagged: 0,
        message: '생성된 청크가 없습니다.',
      })
    }

    const rows = chunks.map((c) => ({
      chunk_index: c.chunk_index,
      page_number: c.pageNumber,
      content: c.text,
    }))
    await insertReferenceChunks(id, rows)
    const chunksCount = rows.length

    // 4. 임베딩 (배치 반복)
    let embedded = 0
    let result
    do {
      result = await embedChunksForDocument(id, 10)
      embedded += result.updated
    } while (result.updated > 0)

    // 5. 태깅
    const chunkList = await getReferenceChunksByDocumentId(id)
    const apiKey = process.env.GEMINI_API_KEY
    let tagged = 0
    if (apiKey && chunkList.length > 0) {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      const delayMs = (ms) => new Promise((r) => setTimeout(r, ms))
      for (const chunk of chunkList) {
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
            const is429 = /429|Resource exhausted|Too Many Requests/i.test(String(e?.message ?? e))
            if (is429 && attempt === 0) continue
            console.warn('Ingest tag fail:', chunk.id, e.message)
            break
          }
        }
        await delayMs(800)
      }
    }

    return NextResponse.json({
      success: true,
      id,
      title,
      chunksCount,
      embedded,
      tagged,
    })
  } catch (err) {
    console.error('reference-documents/ingest error:', err)
    return NextResponse.json(
      { error: err.message || '참고자료 등록 실패' },
      { status: 500 }
    )
  }
}
