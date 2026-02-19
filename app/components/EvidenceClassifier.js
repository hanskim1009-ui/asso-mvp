"use client"

import { useState } from 'react'

const TYPE_LABELS = {
  evidence_list: '📋 증거목록',
  complainant_statement: '📝 고소인/피해자 진술조서',
  suspect_statement: '📝 피의자 진술조서',
  witness_statement: '📝 참고인 진술조서',
  financial_record: '💰 계좌내역',
  photo_evidence: '📷 사진 증거',
  medical_report: '🏥 진단서/감정서',
  investigation_report: '📋 수사보고서',
  digital_evidence: '💬 디지털 증거',
  contract_document: '📎 계약서/각서',
  other: '📄 기타',
}

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label: label.replace(/^[^\s]+ /, ''), // 이모지 제거
}))

const OCR_STATUS = {
  good: { label: '분류완료', color: 'text-green-700 bg-green-100' },
  partial: { label: '부분인식', color: 'text-amber-700 bg-amber-100' },
  failed: { label: '설명필요', color: 'text-red-700 bg-red-100' },
}

export default function EvidenceClassifier({
  caseId,
  documents,
  evidenceSections,
  onSectionsChange,
  onToast,
}) {
  const [classifying, setClassifying] = useState(false)
  const [classifyingDocId, setClassifyingDocId] = useState(null)
  const [progress, setProgress] = useState('')
  const [expandedSection, setExpandedSection] = useState(null)
  const [editingSection, setEditingSection] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [analyzingSection, setAnalyzingSection] = useState(null)
  const [viewingAnalysis, setViewingAnalysis] = useState(null)
  const [describingWithVision, setDescribingWithVision] = useState(null)
  const [deletingDocId, setDeletingDocId] = useState(null)

  // 증거기록 분류 삭제 (해당 문서의 분류·분석 전부 삭제)
  const handleDeleteClassification = async (documentId) => {
    if (!confirm('이 문서의 증거기록 분류와 분석 결과를 모두 삭제할까요? 삭제 후에도 다시 분류할 수 있습니다.')) return
    setDeletingDocId(documentId)
    try {
      const res = await fetch(`/api/documents/${documentId}/evidence-classification`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      onToast?.({ type: 'success', message: '증거기록 분류가 삭제되었습니다.' })
      onSectionsChange?.()
    } catch (err) {
      onToast?.({ type: 'error', message: err.message })
    } finally {
      setDeletingDocId(null)
    }
  }

  // 증거기록 분류 시작
  const handleClassify = async (documentId) => {
    setClassifying(true)
    setClassifyingDocId(documentId)
    setProgress('증거기록 분류 중...')
    try {
      const res = await fetch('/api/classify-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, caseId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '분류 실패')

      setProgress(`완료: ${data.sections?.length || 0}개 증거 섹션 감지`)
      onToast?.({ type: 'success', message: `${data.totalPages}페이지에서 ${data.sections?.length || 0}개 증거 섹션을 분류했습니다.` })
      onSectionsChange?.()
    } catch (err) {
      setProgress('')
      onToast?.({ type: 'error', message: err.message })
    } finally {
      setClassifying(false)
      setClassifyingDocId(null)
    }
  }

  // 섹션 수정 시작
  const startEdit = (section) => {
    setEditingSection(section.id)
    setEditForm({
      section_type: section.section_type,
      section_title: section.section_title || '',
      user_description: section.user_description || '',
      user_tags: (section.user_tags || []).join(', '),
      section_memo: section.section_memo || '',
    })
  }

  // 섹션 수정 저장
  const saveEdit = async (sectionId) => {
    try {
      const res = await fetch(`/api/evidence-sections/${sectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: editForm.section_type,
          section_title: editForm.section_title,
          user_description: editForm.user_description,
          user_tags: editForm.user_tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          section_memo: editForm.section_memo || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '수정 실패')

      setEditingSection(null)
      onToast?.({ type: 'success', message: '섹션이 수정되었습니다.' })
      onSectionsChange?.()
    } catch (err) {
      onToast?.({ type: 'error', message: err.message })
    }
  }

  // 개별 증거 분석
  const handleAnalyzeSection = async (sectionId) => {
    setAnalyzingSection(sectionId)
    try {
      const res = await fetch(`/api/evidence-sections/${sectionId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '분석 실패')

      onToast?.({ type: 'success', message: '증거 분석이 완료되었습니다.' })
      onSectionsChange?.()
    } catch (err) {
      onToast?.({ type: 'error', message: err.message })
    } finally {
      setAnalyzingSection(null)
    }
  }

  /** PDF 한 페이지를 캔버스로 렌더한 뒤 PNG base64 반환 (클라이언트) */
  const renderSectionPageToImage = async (pdfUrl, pageNumber) => {
    const pdfjs = await import('pdfjs-dist/webpack.mjs')
    const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise
    const page = await pdf.getPage(Number(pageNumber))
    const scale = 1.5
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/png')
  }

  /** Vision으로 설명 생성: 클라이언트에서 해당 페이지 이미지 생성 후 API 호출 */
  const handleDescribeWithVision = async (section) => {
    const doc = documents.find((d) => d.id === section.document_id)
    if (!doc?.pdf_url) {
      onToast?.({ type: 'error', message: '문서 PDF URL을 찾을 수 없습니다.' })
      return
    }
    setDescribingWithVision(section.id)
    try {
      const imageBase64 = await renderSectionPageToImage(doc.pdf_url, section.start_page)
      const res = await fetch(`/api/evidence-sections/${section.id}/describe-with-vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Vision 설명 생성 실패')
      onToast?.({ type: 'success', message: 'Vision 설명이 생성되었습니다.' })
      onSectionsChange?.()
    } catch (err) {
      onToast?.({ type: 'error', message: err.message })
    } finally {
      setDescribingWithVision(null)
    }
  }

  // 전체 섹션 일괄 분석
  const handleAnalyzeAll = async () => {
    const analyzable = evidenceSections.filter(
      (s) => s.ocr_quality !== 'failed' && !s.is_analyzed
    )
    if (analyzable.length === 0) {
      onToast?.({ type: 'info', message: '분석할 섹션이 없습니다.' })
      return
    }

    for (const section of analyzable) {
      await handleAnalyzeSection(section.id)
    }
  }

  // 문서별로 섹션 그룹핑
  const sectionsByDoc = {}
  for (const s of evidenceSections) {
    if (!sectionsByDoc[s.document_id]) sectionsByDoc[s.document_id] = []
    sectionsByDoc[s.document_id].push(s)
  }

  return (
    <div className="space-y-4">
      {/* 문서별 분류 버튼 */}
      {documents.map((doc) => {
        const sections = sectionsByDoc[doc.id] || []
        const hasClassification = sections.length > 0
        const isClassifying = classifying && classifyingDocId === doc.id

        return (
          <div key={doc.id} className="bg-white rounded-lg border overflow-hidden">
            {/* 문서 헤더 */}
            <div className="flex items-center justify-between p-3 bg-zinc-50 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">📄</span>
                <span className="font-medium truncate">{doc.original_file_name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasClassification && (
                  <button
                    type="button"
                    onClick={() => handleDeleteClassification(doc.id)}
                    disabled={classifying || deletingDocId === doc.id}
                    className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingDocId === doc.id ? '삭제 중...' : '분류 삭제'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleClassify(doc.id)}
                  disabled={classifying}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClassifying ? '분류 중...' : hasClassification ? '재분류' : '증거기록 분류'}
                </button>
              </div>
            </div>

            {/* 분류 진행 상태 */}
            {isClassifying && (
              <div className="p-4 flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent" />
                <span className="text-sm text-purple-700">{progress}</span>
              </div>
            )}

            {/* 분류 결과 테이블 */}
            {hasClassification && !isClassifying && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-600">
                    {sections.length}개 증거 섹션
                  </span>
                  <button
                    type="button"
                    onClick={handleAnalyzeAll}
                    disabled={!!analyzingSection}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    전체 분석
                  </button>
                </div>

                <div className="divide-y border rounded-lg overflow-hidden">
                  {sections.map((section, idx) => {
                    const ocrStatus = OCR_STATUS[section.ocr_quality] || OCR_STATUS.good
                    const isExpanded = expandedSection === section.id
                    const isEditing = editingSection === section.id
                    const isAnalyzing = analyzingSection === section.id
                    const showAnalysis = viewingAnalysis === section.id

                    return (
                      <div key={section.id} className="bg-white">
                        {/* 섹션 행 */}
                        <div
                          className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 cursor-pointer"
                          onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        >
                          <span className="text-sm text-zinc-400 w-6 text-right shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm flex-1 min-w-0 truncate">
                            {TYPE_LABELS[section.section_type] || section.section_type}{' '}
                            {section.section_title &&
                              section.section_title !== (TYPE_LABELS[section.section_type]?.replace(/^[^\s]+ /, '') || '') && (
                                <span className="text-zinc-500">- {section.section_title}</span>
                              )}
                          </span>
                          <span className="text-xs text-zinc-500 shrink-0">
                            pp.{section.start_page}
                            {section.end_page !== section.start_page && `-${section.end_page}`}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${ocrStatus.color}`}>
                            {section.is_analyzed ? '✅ 분석완료' : ocrStatus.label}
                          </span>
                          <span className="text-zinc-400 text-xs shrink-0">
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>

                        {/* 확장 영역 */}
                        {isExpanded && (
                          <div className="px-4 pb-3 bg-zinc-50 border-t">
                            {/* 편집 모드 */}
                            {isEditing ? (
                              <div className="space-y-3 pt-3">
                                <div>
                                  <label className="text-xs font-medium text-zinc-600">증거 유형</label>
                                  <select
                                    value={editForm.section_type}
                                    onChange={(e) => setEditForm({ ...editForm, section_type: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
                                  >
                                    {TYPE_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-zinc-600">제목</label>
                                  <input
                                    type="text"
                                    value={editForm.section_title}
                                    onChange={(e) => setEditForm({ ...editForm, section_title: e.target.value })}
                                    className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
                                  />
                                </div>
                                {section.ocr_quality === 'failed' && (
                                  <div>
                                    <label className="text-xs font-medium text-zinc-600">
                                      설명 (OCR 불가 증거)
                                    </label>
                                    <textarea
                                      value={editForm.user_description}
                                      onChange={(e) => setEditForm({ ...editForm, user_description: e.target.value })}
                                      rows={3}
                                      placeholder="이 증거에 대해 설명해주세요 (예: 피해 현장 사진 6장, CCTV 캡처 포함)"
                                      className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
                                    />
                                  </div>
                                )}
                                <div>
                                  <label className="text-xs font-medium text-zinc-600">
                                    메모 (분석 시 AI가 참고합니다)
                                  </label>
                                  <textarea
                                    value={editForm.section_memo}
                                    onChange={(e) => setEditForm({ ...editForm, section_memo: e.target.value })}
                                    rows={3}
                                    placeholder="예: 이 사진은 변호사가 촬영한 현장 사진, 피해 부위가 명확히 보임"
                                    className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-zinc-600">태그 (쉼표 구분)</label>
                                  <input
                                    type="text"
                                    value={editForm.user_tags}
                                    onChange={(e) => setEditForm({ ...editForm, user_tags: e.target.value })}
                                    placeholder="예: 현장, CCTV, 증거물"
                                    className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(section.id)}
                                    className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                  >
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSection(null)}
                                    className="px-4 py-1.5 text-sm border rounded-lg hover:bg-zinc-100"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-3 space-y-2">
                                {/* Vision 설명 표시 */}
                                {section.vision_description?.trim() && (
                                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                                    <p className="text-xs font-medium text-violet-700 mb-1">👁 Vision 설명</p>
                                    <p className="text-sm text-violet-800 whitespace-pre-wrap">{section.vision_description}</p>
                                  </div>
                                )}
                                {/* 메모 표시 */}
                                {section.section_memo?.trim() && (
                                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                                    <p className="text-xs font-medium text-sky-700 mb-1">📌 메모</p>
                                    <p className="text-sm text-sky-800 whitespace-pre-wrap">{section.section_memo}</p>
                                  </div>
                                )}
                                {/* OCR 불가 경고 */}
                                {section.ocr_quality === 'failed' && (
                                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm text-amber-800 font-medium">
                                      ⚠️ OCR로 읽을 수 없는 페이지입니다
                                    </p>
                                    {section.user_description ? (
                                      <p className="text-sm text-amber-700 mt-1">
                                        설명: {section.user_description}
                                      </p>
                                    ) : (
                                      <p className="text-sm text-amber-600 mt-1">
                                        "수정" 버튼을 눌러 이 증거에 대한 설명을 입력해주세요.
                                      </p>
                                    )}
                                    {section.user_tags?.length > 0 && (
                                      <div className="flex gap-1 mt-2">
                                        {section.user_tags.map((tag, i) => (
                                          <span key={i} className="text-xs px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full">
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 텍스트 미리보기 */}
                                {section.ocr_quality !== 'failed' && section.extracted_text && (
                                  <div className="p-3 bg-white border rounded-lg max-h-40 overflow-y-auto">
                                    <p className="text-xs text-zinc-400 mb-1">원문 미리보기</p>
                                    <p className="text-sm text-zinc-700 whitespace-pre-wrap line-clamp-6">
                                      {section.extracted_text.replace(/<[^>]*>/g, '').substring(0, 500)}
                                    </p>
                                  </div>
                                )}

                                {/* 분석 결과 */}
                                {section.is_analyzed && section.analysis_result && (
                                  <div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setViewingAnalysis(showAnalysis ? null : section.id)
                                      }}
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      {showAnalysis ? '분석 결과 접기' : '📊 분석 결과 보기'}
                                    </button>
                                    {showAnalysis && (
                                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <AnalysisResultView
                                          type={section.section_type}
                                          result={section.analysis_result}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 액션 버튼 */}
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      startEdit(section)
                                    }}
                                    className="px-3 py-1 text-xs border rounded hover:bg-zinc-100"
                                  >
                                    수정
                                  </button>
                                  {(section.section_type === 'photo_evidence' || section.ocr_quality === 'failed') && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDescribeWithVision(section)
                                      }}
                                      disabled={!!describingWithVision}
                                      className="px-3 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
                                    >
                                      {describingWithVision === section.id ? '생성 중...' : section.vision_description ? 'Vision 재생성' : 'Vision으로 설명 생성'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleAnalyzeSection(section.id)
                                    }}
                                    disabled={isAnalyzing || (section.ocr_quality === 'failed' && !section.user_description && !section.section_memo && !section.vision_description)}
                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {isAnalyzing ? '분석 중...' : section.is_analyzed ? '재분석' : '분석'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 분석 결과를 유형에 맞게 표시
 */
function AnalysisResultView({ type, result }) {
  if (!result) return null

  const renderField = (label, value) => {
    if (!value) return null
    if (Array.isArray(value)) {
      if (value.length === 0) return null
      return (
        <div className="mb-2">
          <p className="text-xs font-medium text-zinc-600">{label}</p>
          <ul className="list-disc list-inside text-sm text-zinc-800 mt-0.5">
            {value.map((v, i) => (
              <li key={i}>{typeof v === 'string' ? v : JSON.stringify(v)}</li>
            ))}
          </ul>
        </div>
      )
    }
    return (
      <div className="mb-2">
        <p className="text-xs font-medium text-zinc-600">{label}</p>
        <p className="text-sm text-zinc-800">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {result.person && renderField('진술인/관련인', result.person)}
      {result.date && renderField('일시', result.date)}
      {result.summary && renderField('요약', result.summary)}
      {result.diagnosis && renderField('진단명', result.diagnosis)}
      {result.key_facts && renderField('핵심 사실관계', result.key_facts)}
      {result.key_claims && renderField('주요 주장', result.key_claims)}
      {result.admission && renderField('인정 사실', result.admission)}
      {result.denial && renderField('부인 사실', result.denial)}
      {result.findings && renderField('수사 결과', result.findings)}
      {result.favorable && renderField('✅ 유리한 점', result.favorable)}
      {result.unfavorable && renderField('❌ 불리한 점', result.unfavorable)}
      {result.inconsistencies && renderField('⚠️ 불일치/의문점', result.inconsistencies)}
      {result.procedural_issues && renderField('⚠️ 절차적 문제', result.procedural_issues)}
      {result.credibility_notes && renderField('신빙성 소견', result.credibility_notes)}
      {result.patterns && renderField('거래 패턴', result.patterns)}
      {result.notable_transactions && renderField('주요 거래', result.notable_transactions)}
    </div>
  )
}
