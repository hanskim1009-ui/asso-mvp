import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  getDocument,
  savePageClassifications,
  saveEvidenceSections,
  clearEvidenceData,
} from '@/lib/database'

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { documentId, caseId } = await request.json()

    if (!documentId || !caseId) {
      return NextResponse.json(
        { error: 'documentId와 caseId가 필요합니다.' },
        { status: 400 }
      )
    }

    // 1. 문서 정보 가져오기
    const doc = await getDocument(documentId)
    if (!doc || !doc.txt_url) {
      return NextResponse.json(
        { error: '문서 또는 OCR 텍스트를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 2. 페이지별 텍스트 JSON 시도 (Upstage elements 기반, 정확한 PDF 페이지)
    let pageTexts = null
    if (doc.txt_file_name) {
      const timestamp = doc.txt_file_name.replace('.txt', '')
      const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
      try {
        const ptRes = await fetch(pageJsonUrl)
        if (ptRes.ok) {
          const pageJson = await ptRes.json()
          const pages = Object.entries(pageJson)
            .map(([page, text]) => ({ pageNumber: parseInt(page), text }))
            .sort((a, b) => a.pageNumber - b.pageNumber)
          if (pages.length > 0) {
            pageTexts = pages
            console.log(`[classify-evidence] 페이지별 JSON 사용: ${pages.length}페이지`)
          }
        }
      } catch (e) {
        console.log('[classify-evidence] 페이지별 JSON 없음, footer 방식 사용')
      }
    }

    // 3. fallback: footer 태그 기준으로 분리
    if (!pageTexts) {
      const txtRes = await fetch(doc.txt_url)
      if (!txtRes.ok) {
        return NextResponse.json(
          { error: 'TXT 파일을 불러올 수 없습니다.' },
          { status: 500 }
        )
      }
      const fullText = await txtRes.text()
      pageTexts = splitTextByPages(fullText)
    }

    const totalPages = pageTexts.length

    if (totalPages === 0) {
      return NextResponse.json(
        { error: '페이지를 구분할 수 없습니다. OCR 결과를 확인해주세요.' },
        { status: 400 }
      )
    }

    console.log(`[classify-evidence] 문서 ${documentId}: ${totalPages}페이지 감지`)

    // 4. 텍스트 < 30자인 페이지는 자동으로 photo_evidence
    const autoClassified = []
    const needsAI = []

    for (const pt of pageTexts) {
      const cleanText = pt.text.replace(/<[^>]*>/g, '').trim()
      if (cleanText.length < 30) {
        autoClassified.push({
          page: pt.pageNumber,
          type: 'photo_evidence',
          confidence: 1.0,
          text: cleanText,
          title: null,
          names: [],
          dates: [],
        })
      } else {
        needsAI.push(pt)
      }
    }

    console.log(`[classify-evidence] 자동 분류(사진): ${autoClassified.length}페이지, AI 분류 필요: ${needsAI.length}페이지`)

    // 5. AI 분류 (배치로)
    const aiClassified = []
    if (needsAI.length > 0) {
      const BATCH_SIZE = 50 // 페이지를 50개씩 묶어 보냄
      for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
        const batch = needsAI.slice(i, i + BATCH_SIZE)
        const batchResult = await classifyBatchWithAI(batch)
        aiClassified.push(...batchResult)
      }
    }

    // 6. 전체 분류 결과 합치기
    const allClassified = [...autoClassified, ...aiClassified]
      .sort((a, b) => a.page - b.page)

    // 7. 기존 데이터 삭제 (재분류 시)
    await clearEvidenceData(documentId)

    // 8. page_classifications 저장
    await savePageClassifications(documentId, allClassified)

    // 9. 그룹핑 → evidence_sections
    const sections = groupIntoSections(allClassified, pageTexts)

    const savedSections = await saveEvidenceSections(documentId, caseId, sections)

    console.log(`[classify-evidence] 완료: ${savedSections.length}개 증거 섹션 생성`)

    return NextResponse.json({
      success: true,
      totalPages,
      classifications: allClassified.length,
      sections: savedSections,
    })
  } catch (error) {
    console.error('classify-evidence error:', error)
    return NextResponse.json(
      { error: error.message || '증거기록 분류 실패' },
      { status: 500 }
    )
  }
}

/**
 * footer 태그 기준으로 페이지별 텍스트 분리
 */
function splitTextByPages(text) {
  const pageRegex = /<footer[^>]*style='font-size:(22|20|18|16)px'[^>]*>(\d+)[.\s]*[^<]*<\/footer>/g
  const matches = []
  let match
  let pdfPageIndex = 0
  while ((match = pageRegex.exec(text)) !== null) {
    pdfPageIndex++
    matches.push({
      pageNumber: pdfPageIndex,              // PDF 내 실제 페이지 (1, 2, 3...)
      originalPageNumber: parseInt(match[2]), // 원본 기록 페이지 (193 등)
      position: match.index,
    })
  }

  if (matches.length === 0) {
    // footer 없으면 전체를 1페이지로
    return [{ pageNumber: 1, text: text }]
  }

  const pages = []
  for (let i = 0; i < matches.length; i++) {
    const startPos = matches[i].position
    const endPos = i < matches.length - 1 ? matches[i + 1].position : text.length
    pages.push({
      pageNumber: matches[i].pageNumber,
      text: text.substring(startPos, endPos),
    })
  }

  return pages
}

/**
 * AI로 페이지 배치 분류
 */
async function classifyBatchWithAI(pages) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  // 페이지별 텍스트를 묶어서 프롬프트 구성 (텍스트는 각 페이지 최대 500자로 제한)
  const pagesText = pages.map((p) => {
    const clean = p.text.replace(/<[^>]*>/g, '').trim()
    const truncated = clean.length > 500 ? clean.substring(0, 500) + '...' : clean
    return `--- 페이지 ${p.pageNumber} ---\n${truncated}`
  }).join('\n\n')

  const prompt = `당신은 한국 형사사건 증거기록 분석 전문가입니다.
아래는 증거기록 PDF에서 페이지별로 추출된 OCR 텍스트입니다.
각 페이지의 텍스트를 보고 증거 유형을 분류해주세요.

[분류 유형]
- evidence_list: 증거목록 (순번, 증거명, 증명할 사실 등이 나열된 목록)
- complainant_statement: 고소인/피해자 진술조서 ("진술조서", "고소인", "피해자", "문:", "답:" 포함)
- suspect_statement: 피의자 진술조서 ("피의자신문조서", "피의자" 포함)
- witness_statement: 참고인 진술조서 ("참고인", "진술조서" 포함)
- financial_record: 계좌내역/금융거래 (날짜+금액 패턴 반복, 거래내역)
- photo_evidence: 사진 증거 (텍스트가 거의 없거나 사진 설명만 있음)
- medical_report: 진단서/감정서 ("진단", "소견", "감정", "상해" 포함)
- investigation_report: 수사보고서 ("수사보고", "보고자", "보고서" 포함)
- digital_evidence: 디지털 증거 (카카오톡, 문자메시지, 이메일 캡처 텍스트)
- contract_document: 계약서/각서 ("계약", "각서", "합의서" 포함)
- other: 기타 (위 분류에 해당하지 않는 자료)

[페이지 텍스트]
${pagesText}

각 페이지에 대해 아래 JSON 배열로만 응답하세요 (설명 없이 JSON만):
[
  {
    "page": 페이지번호,
    "type": "분류유형",
    "confidence": 0.0~1.0,
    "title": "감지된 제목 또는 null",
    "names": ["감지된 인명"],
    "dates": ["감지된 날짜"]
  }
]`

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    })

    const responseText = result.response.text()
    const cleanText = responseText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleanText)

    // 각 페이지에 원본 텍스트 추가
    const pageMap = new Map(pages.map((p) => [p.pageNumber, p.text.replace(/<[^>]*>/g, '').trim()]))

    return parsed.map((item) => {
      const pageNum = parseInt(String(item.page).replace(/\D/g, '')) || 0
      return {
        page: pageNum,
        type: item.type || 'other',
        confidence: item.confidence ?? 0.5,
        text: pageMap.get(pageNum) ?? '',
        title: item.title || null,
        names: item.names || [],
        dates: item.dates || [],
      }
    })
  } catch (err) {
    console.error('AI classification error:', err)
    // 실패 시 모든 페이지를 other로
    return pages.map((p) => ({
      page: p.pageNumber,
      type: 'other',
      confidence: 0,
      text: p.text.replace(/<[^>]*>/g, '').trim(),
      title: null,
      names: [],
      dates: [],
    }))
  }
}

/**
 * 페이지 분류 결과를 연속된 같은 유형끼리 그룹핑
 */
function groupIntoSections(classified, pageTexts) {
  if (classified.length === 0) return []

  const pageTextMap = new Map(pageTexts.map((p) => [p.pageNumber, p.text.replace(/<[^>]*>/g, '').trim()]))

  const groups = []
  let current = {
    type: classified[0].type,
    startPage: classified[0].page,
    endPage: classified[0].page,
    title: classified[0].title,
    names: [...(classified[0].names || [])],
    texts: [pageTextMap.get(classified[0].page) || ''],
  }

  for (let i = 1; i < classified.length; i++) {
    const item = classified[i]
    const sameType = item.type === current.type
    const consecutive = item.page === current.endPage + 1

    // 특수 규칙: photo_evidence 1-2장이 진술 사이에 끼면 앞 섹션에 병합
    const isSmallPhoto = item.type === 'photo_evidence' &&
      i + 1 < classified.length &&
      classified[i + 1].type === current.type

    if ((sameType && consecutive) || (isSmallPhoto && consecutive)) {
      current.endPage = item.page
      current.texts.push(pageTextMap.get(item.page) || '')
      if (item.names) current.names.push(...item.names)
      if (!current.title && item.title) current.title = item.title
    } else {
      groups.push({ ...current })
      current = {
        type: item.type,
        startPage: item.page,
        endPage: item.page,
        title: item.title,
        names: [...(item.names || [])],
        texts: [pageTextMap.get(item.page) || ''],
      }
    }
  }
  groups.push({ ...current })

  // 섹션 생성
  const TYPE_LABELS = {
    evidence_list: '증거목록',
    complainant_statement: '고소인/피해자 진술조서',
    suspect_statement: '피의자 진술조서',
    witness_statement: '참고인 진술조서',
    financial_record: '계좌내역',
    photo_evidence: '사진 증거',
    medical_report: '진단서/감정서',
    investigation_report: '수사보고서',
    digital_evidence: '디지털 증거',
    contract_document: '계약서/각서',
    other: '기타',
  }

  return groups.map((g, idx) => {
    const label = TYPE_LABELS[g.type] || '기타'
    const nameStr = [...new Set(g.names)].filter(Boolean).join(', ')
    const title = g.title || (nameStr ? `${label} (${nameStr})` : label)
    const fullText = g.texts.join('\n\n')
    const textLen = fullText.replace(/\s/g, '').length

    let ocrQuality = 'good'
    if (textLen < 30) ocrQuality = 'failed'
    else if (textLen < 100) ocrQuality = 'partial'

    return {
      section_type: g.type,
      section_title: title,
      section_order: idx,
      start_page: g.startPage,
      end_page: g.endPage,
      extracted_text: fullText,
      ocr_quality: ocrQuality,
    }
  })
}
