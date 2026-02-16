import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getEvidenceSection, updateEvidenceSection } from '@/lib/database'

const SECTION_PROMPTS = {
  complainant_statement: `이 고소인/피해자 진술조서를 분석하여 다음을 JSON으로 추출하세요:
{
  "person": "진술인 이름 및 관계",
  "date": "진술 일시",
  "summary": "핵심 진술 내용 요약 (3-5문장)",
  "key_facts": ["핵심 사실관계 1", "핵심 사실관계 2"],
  "timeline": [{"date": "날짜", "event": "사건"}],
  "favorable": ["의뢰인에게 유리한 점"],
  "unfavorable": ["의뢰인에게 불리한 점"],
  "inconsistencies": ["진술 내 불일치/의문점"],
  "credibility_notes": "진술 신빙성 관련 소견"
}`,
  suspect_statement: `이 피의자 진술조서를 분석하여 다음을 JSON으로 추출하세요:
{
  "person": "피의자 이름",
  "date": "진술 일시",
  "summary": "핵심 진술 내용 요약 (3-5문장)",
  "key_claims": ["피의자의 주요 주장"],
  "admission": ["인정한 사실"],
  "denial": ["부인한 사실"],
  "timeline": [{"date": "날짜", "event": "사건"}],
  "favorable": ["피의자에게 유리한 점"],
  "unfavorable": ["피의자에게 불리한 점"],
  "inconsistencies": ["진술 내 불일치/의문점"]
}`,
  witness_statement: `이 참고인 진술조서를 분석하여 다음을 JSON으로 추출하세요:
{
  "person": "참고인 이름 및 관계",
  "date": "진술 일시",
  "summary": "핵심 진술 내용 요약",
  "key_facts": ["핵심 사실관계"],
  "favorable": ["의뢰인에게 유리한 점"],
  "unfavorable": ["의뢰인에게 불리한 점"],
  "credibility_notes": "진술 신빙성 관련 소견"
}`,
  financial_record: `이 금융거래/계좌내역을 분석하여 다음을 JSON으로 추출하세요:
{
  "account_holder": "예금주",
  "period": "거래 기간",
  "summary": "거래 내역 요약",
  "notable_transactions": [{"date": "날짜", "amount": "금액", "description": "내용", "significance": "사건 관련성"}],
  "patterns": ["거래 패턴"],
  "total_amount": "관련 총액",
  "favorable": ["유리한 점"],
  "unfavorable": ["불리한 점"]
}`,
  investigation_report: `이 수사보고서를 분석하여 다음을 JSON으로 추출하세요:
{
  "reporter": "보고자",
  "date": "보고 일시",
  "summary": "수사 내용 요약",
  "findings": ["핵심 수사 결과"],
  "favorable": ["의뢰인에게 유리한 점"],
  "unfavorable": ["의뢰인에게 불리한 점"],
  "procedural_issues": ["절차적 문제점 (있는 경우)"]
}`,
  medical_report: `이 진단서/감정서를 분석하여 다음을 JSON으로 추출하세요:
{
  "doctor": "진단의/감정인",
  "patient": "환자/피감정인",
  "date": "진단/감정 일시",
  "diagnosis": "진단명/감정 결과",
  "summary": "요약",
  "severity": "상해 정도",
  "favorable": ["유리한 점"],
  "unfavorable": ["불리한 점"]
}`,
  evidence_list: `이 증거목록을 분석하여 다음을 JSON으로 추출하세요:
{
  "total_evidence": "총 증거 수",
  "summary": "증거 구성 요약",
  "items": [{"number": "순번", "name": "증거명", "purpose": "증명할 사실"}]
}`,
  digital_evidence: `이 디지털 증거(메시지/이메일 등)를 분석하여 다음을 JSON으로 추출하세요:
{
  "platform": "플랫폼 (카카오톡/문자/이메일 등)",
  "participants": ["대화 참여자"],
  "period": "대화 기간",
  "summary": "핵심 내용 요약",
  "key_messages": [{"date": "날짜", "sender": "발신자", "content": "내용", "significance": "의미"}],
  "favorable": ["유리한 점"],
  "unfavorable": ["불리한 점"]
}`,
}

const DEFAULT_PROMPT = `이 증거를 분석하여 다음을 JSON으로 추출하세요:
{
  "summary": "내용 요약",
  "key_facts": ["핵심 사실관계"],
  "favorable": ["유리한 점"],
  "unfavorable": ["불리한 점"]
}`

export async function POST(request, { params }) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { id: sectionId } = await params
    const body = await request.json()
    const { userContext } = body

    const section = await getEvidenceSection(sectionId)
    if (!section) {
      return NextResponse.json({ error: '섹션을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 분석할 텍스트 결정 (원문 + Vision 설명 + 사용자 설명 + 메모 모두 AI에 전달)
    const parts = []
    if (section.extracted_text?.trim()) {
      parts.push(`[원문]\n${section.extracted_text.trim()}`)
    }
    if (section.vision_description?.trim()) {
      parts.push(`[Vision 설명]\n${section.vision_description.trim()}`)
    }
    if (section.ocr_quality === 'failed' && section.user_description?.trim()) {
      parts.push(`[사용자 설명 (OCR 불가)]\n${section.user_description.trim()}`)
    }
    if (section.section_memo?.trim()) {
      parts.push(`[사용자 메모]\n${section.section_memo.trim()}`)
    }

    const textToAnalyze = parts.join('\n\n')

    if (!textToAnalyze || textToAnalyze.trim().length < 10) {
      return NextResponse.json(
        { error: '분석할 텍스트가 부족합니다. 원문, Vision 설명, 사용자 설명(OCR 불가 시), 또는 메모를 입력해주세요.' },
        { status: 400 }
      )
    }

    const sectionPrompt = SECTION_PROMPTS[section.section_type] || DEFAULT_PROMPT

    let systemContext = '당신은 한국 형사변호 전문 AI 어시스턴트입니다.\n한국 형사소송법과 판례를 기준으로 분석하세요.\n'
    if (userContext?.representing === 'defendant') {
      systemContext += '이 사건에서 피고인/피의자를 대리합니다.\n'
    } else if (userContext?.representing === 'plaintiff') {
      systemContext += '이 사건에서 피해자/고소인을 대리합니다.\n'
    }
    if (userContext?.case_background) {
      systemContext += `사건 배경: ${userContext.case_background}\n`
    }

    const fullPrompt = `${systemContext}

${sectionPrompt}

[증거 유형: ${section.section_title || section.section_type}]
[페이지: ${section.start_page}-${section.end_page}]

위 증거의 원문·사용자 설명·메모를 반드시 참고하여 분석하세요.

${textToAnalyze.substring(0, 100000)}

JSON으로만 응답하세요.`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    })

    const responseText = result.response.text()
    const cleanText = responseText.replace(/```json|```/g, '').trim()
    const analysis = JSON.parse(cleanText)

    // 분석 결과 저장
    await updateEvidenceSection(sectionId, { analysis_result: analysis })

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('evidence-section analyze error:', error)
    return NextResponse.json(
      { error: error.message || '증거 분석 실패' },
      { status: 500 }
    )
  }
}
