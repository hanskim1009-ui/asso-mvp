"use client"

import { useState, useEffect, useRef } from 'react'
import {
  getCaseWithDocuments,
  saveDocument,
  updateCase,
  getCaseAnalysisHistory,
  updateAnalysisResult,
  saveGoodExample,
  removeGoodExample,
  isGoodExample,
} from '@/lib/database'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import Timeline from '@/app/components/Timeline'
import LoadingSpinner from '@/app/components/LoadingSpinner'
import Toast from '@/app/components/Toast'
import ConfirmDialog from '@/app/components/ConfirmDialog'
import EmptyState from '@/app/components/EmptyState'
import EvidenceEditor from '@/app/components/EvidenceEditor'
import TimelineEditor from '@/app/components/TimelineEditor'

export default function CaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const caseId = params.id

  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState(null)
  const [selectedDocs, setSelectedDocs] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisHistory, setAnalysisHistory] = useState([])
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [isMarkedAsGood, setIsMarkedAsGood] = useState(false)
  const [editingAnalysis, setEditingAnalysis] = useState(false)
  const [editedAnalysis, setEditedAnalysis] = useState(null)
  const [refinementPrompt, setRefinementPrompt] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [editingCaseInfo, setEditingCaseInfo] = useState(false)
  const [caseContext, setCaseContext] = useState({
    representing: '',
    case_background: '',
    defendant_claim: '',
    plaintiff_claim: '',
    focus_areas: '',
  })
  const [toast, setToast] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [editingAnalysisId, setEditingAnalysisId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadCase()
  }, [caseId])

  useEffect(() => {
    if (selectedAnalysis) {
      setEditedAnalysis(selectedAnalysis.result)
      setEditingAnalysis(false)
      isGoodExample(selectedAnalysis.id).then(setIsMarkedAsGood)
    }
  }, [selectedAnalysis])

  async function loadCase() {
    try {
      const data = await getCaseWithDocuments(caseId)
      setCaseData(data)
      if (data.user_context) {
        setCaseContext(data.user_context)
      }
      const history = await getCaseAnalysisHistory(caseId)
      setAnalysisHistory(history)
      if (history.length > 0) {
        setSelectedAnalysis(history[0])
      } else {
        setSelectedAnalysis(null)
      }
    } catch (err) {
      setToast({ message: '사건 로드 실패: ' + err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteDocument(documentId) {
    if (!confirm('이 문서를 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE'
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Delete failed')
      }

      await loadCase()
      setToast({ message: '문서가 삭제되었습니다.', type: 'success' })
    } catch (error) {
      console.error('문서 삭제 오류:', error)
      alert(`문서 삭제 실패: ${error.message}`)
    }
  }

  async function handleDeleteAnalysis(analysisId) {
    if (!confirm('이 분석 결과를 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/analysis/${analysisId}`, {
        method: 'DELETE'
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '삭제 실패')

      await loadCase()

      if (selectedAnalysis?.id === analysisId) {
        setSelectedAnalysis(null)
      }

      setToast({ message: '분석 결과가 삭제되었습니다.', type: 'success' })
    } catch (error) {
      console.error('분석 삭제 오류:', error)
      alert(`삭제 실패: ${error.message}`)
    }
  }

  async function handleSaveTitle() {
    if (!editingTitle.trim()) {
      alert('제목을 입력해주세요.')
      return
    }

    try {
      const res = await fetch(`/api/analysis/${editingAnalysisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitle.trim() })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '수정 실패')

      await loadCase()
      setEditingAnalysisId(null)
      setEditingTitle('')
      setToast({ message: '제목이 수정되었습니다.', type: 'success' })
    } catch (error) {
      console.error('제목 수정 오류:', error)
      alert(`수정 실패: ${error.message}`)
    }
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setSelectedFiles(files)
      setUploadMessage(null)
    }
    e.target.value = ''
  }

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)
    setUploadMessage(null)

    const uploadedDocs = []

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setUploadMessage(`${i + 1}/${selectedFiles.length} 파일 업로드 중...`)

        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${i}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const { data: pdfUrlData } = supabase.storage
          .from('documents')
          .getPublicUrl(fileName)

        setUploadMessage(`${i + 1}/${selectedFiles.length} OCR 처리 중...`)

        const formData = new FormData()
        formData.append('document', file)

        const ocrRes = await fetch('/api/ocr', {
          method: 'POST',
          body: formData,
        })

        const ocrJson = await ocrRes.json()

        if (!ocrRes.ok) {
          throw new Error(`${file.name}: ${ocrJson.error ?? 'OCR 실패'}`)
        }

        if (ocrJson.success && ocrJson.text) {
          const docId = await saveDocument({
            pdfUrl: pdfUrlData.publicUrl,
            txtUrl: ocrJson.txtFileUrl,
            pdfFileName: fileName,
            txtFileName: ocrJson.txtFileName,
            originalFileName: file.name,
            fileSize: file.size,
            caseId: caseId,
          })

          uploadedDocs.push({
            id: docId,
            fileName: file.name,
          })
        }
      }

      setUploadMessage(`${uploadedDocs.length}개 파일 업로드 완료!`)
      setSelectedFiles([])

      await loadCase()
    } catch (err) {
      setUploadMessage(null)
      setToast({ message: '업로드 실패: ' + err.message, type: 'error' })
    } finally {
      setIsUploading(false)
    }
  }

  async function analyzeSelected(docIdsOverride) {
    const ids = docIdsOverride ?? selectedDocs
    if (ids.length === 0) return

    setIsAnalyzing(true)
    try {
      const selectedDocuments = caseData.documents.filter((d) =>
        ids.includes(d.id)
      )

      const texts = []
      for (const doc of selectedDocuments) {
        if (doc.txt_url) {
          const res = await fetch(doc.txt_url)
          const text = await res.text()
          texts.push(text)
        }
      }

      const res = await fetch('/api/analyze-integrated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          documentIds: ids,
          caseId: caseId,
          userContext: caseContext,
          caseType: caseData.case_type,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setAnalysisResult(data.analysis)
        setToast({ message: '분석이 완료되었습니다!', type: 'success' })
        await loadCase()
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setToast({ message: '분석 실패: ' + err.message, type: 'error' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function analyzeAll() {
    const allIds = caseData.documents.map((d) => d.id)
    setSelectedDocs(allIds)
    await analyzeSelected(allIds)
  }

  async function handleRefineWithAI(promptOverride) {
    const refinementRequest = promptOverride ?? refinementPrompt
    if (!refinementRequest.trim()) {
      alert('수정 요청사항을 입력해주세요.')
      return
    }
    if (!selectedAnalysis) return

    setIsRefining(true)
    try {
      // 1. AI에게 수정 요청
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentAnalysis: selectedAnalysis.result,
          refinementRequest,
          originalText: ''
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '수정 실패')
      }

      // 2. DB에 수정된 결과 저장
      await updateAnalysisResult(selectedAnalysis.id, data.refinedAnalysis)

      // 3. 화면 새로고침
      await loadCase()

      // 4. 같은 분석 다시 선택 (업데이트된 내용 보여주기)
      setSelectedAnalysis((prev) =>
        prev ? { ...prev, result: data.refinedAnalysis } : null
      )
      setEditedAnalysis(data.refinedAnalysis)

      setRefinementPrompt('')
      setEditingAnalysis(false)
      alert('AI 수정이 완료되었습니다.')
    } catch (error) {
      console.error('AI 수정 오류:', error)
      alert(`수정 실패: ${error.message}`)
    } finally {
      setIsRefining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="flex h-14 items-center px-6 bg-[#1e3a5f]">
          <Link href="/cases" className="text-xl font-bold text-white">
            ASSO
          </Link>
        </header>
        <main className="flex-1">
          <LoadingSpinner text="사건 정보를 불러오는 중..." />
        </main>
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="p-8">사건을 찾을 수 없습니다.</div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog isOpen {...confirmDialog} />
      )}
      <header className="flex h-14 items-center px-6 bg-[#1e3a5f]">
        <Link href="/cases" className="text-xl font-bold text-white">
          ASSO
        </Link>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4">{caseData.case_name}</h1>

            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              {caseData.case_number && (
                <div>
                  <span className="text-zinc-600">사건번호:</span>{' '}
                  <span className="font-medium">{caseData.case_number}</span>
                </div>
              )}
              {caseData.client_name && (
                <div>
                  <span className="text-zinc-600">의뢰인:</span>{' '}
                  <span className="font-medium">{caseData.client_name}</span>
                </div>
              )}
              {caseData.case_type && (
                <div>
                  <span className="text-zinc-600">유형:</span>{' '}
                  <span className="font-medium">{caseData.case_type}</span>
                </div>
              )}
            </div>
            {caseData.description && (
              <p className="mb-6 text-zinc-700">{caseData.description}</p>
            )}

            <div className="p-6 bg-zinc-50 rounded-lg border">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">📋 분석용 사건 정보</h2>
                <button
                  onClick={() => {
                    if (editingCaseInfo) {
                      updateCase(caseId, {
                        caseName: caseData.case_name,
                        caseNumber: caseData.case_number,
                        clientName: caseData.client_name,
                        caseType: caseData.case_type,
                        description: caseData.description,
                        userContext: caseContext,
                      })
                        .then(() => {
                          setEditingCaseInfo(false)
                          setToast({ message: '저장되었습니다', type: 'success' })
                        })
                        .catch((err) => {
                          setToast({ message: '저장 실패: ' + err.message, type: 'error' })
                        })
                    } else {
                      setEditingCaseInfo(true)
                    }
                  }}
                  className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
                >
                  {editingCaseInfo ? '저장' : '편집'}
                </button>
              </div>

              {editingCaseInfo ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      대리하는 측
                    </label>
                    <select
                      value={caseContext.representing}
                      onChange={(e) =>
                        setCaseContext({
                          ...caseContext,
                          representing: e.target.value,
                        })
                      }
                      className="w-full p-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">선택 안 함 (중립적 분석)</option>
                      <option value="defendant">피고인/피의자</option>
                      <option value="plaintiff">피해자/고소인</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      사건 개요
                    </label>
                    <textarea
                      value={caseContext.case_background}
                      onChange={(e) =>
                        setCaseContext({
                          ...caseContext,
                          case_background: e.target.value,
                        })
                      }
                      placeholder="예: 피고인 김주원, 2022년 11월 1일 더뮤즈 모텔에서 피해자 폭행 및 3000만원 강취 혐의"
                      className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      피고인/피의자 주장
                    </label>
                    <textarea
                      value={caseContext.defendant_claim}
                      onChange={(e) =>
                        setCaseContext({
                          ...caseContext,
                          defendant_claim: e.target.value,
                        })
                      }
                      placeholder="예: 정당방위 주장, 폭행 사실 전면 부인, 강취 행위 관여하지 않음"
                      className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      검찰/피해자 주장
                    </label>
                    <textarea
                      value={caseContext.plaintiff_claim}
                      onChange={(e) =>
                        setCaseContext({
                          ...caseContext,
                          plaintiff_claim: e.target.value,
                        })
                      }
                      placeholder="예: 고의적 폭행 및 협박, 3000만원 강취 직접 관여, 조직적 범행"
                      className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      중점 검토 사항
                    </label>
                    <textarea
                      value={caseContext.focus_areas}
                      onChange={(e) =>
                        setCaseContext({
                          ...caseContext,
                          focus_areas: e.target.value,
                        })
                      }
                      placeholder="예: CCTV 영상 신빙성, 휴대전화 발신지 분석 증거능력, 이보구 진술 신빙성"
                      className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={2}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {caseContext.representing && (
                    <p>
                      <strong>대리하는 측:</strong>{' '}
                      {caseContext.representing === 'defendant'
                        ? '피고인/피의자'
                        : '피해자/고소인'}
                    </p>
                  )}
                  {caseContext.case_background && (
                    <p>
                      <strong>사건 개요:</strong> {caseContext.case_background}
                    </p>
                  )}
                  {caseContext.defendant_claim && (
                    <p>
                      <strong>피고인/피의자 주장:</strong>{' '}
                      {caseContext.defendant_claim}
                    </p>
                  )}
                  {caseContext.plaintiff_claim && (
                    <p>
                      <strong>검찰/피해자 주장:</strong>{' '}
                      {caseContext.plaintiff_claim}
                    </p>
                  )}
                  {caseContext.focus_areas && (
                    <p>
                      <strong>중점 검토 사항:</strong>{' '}
                      {caseContext.focus_areas}
                    </p>
                  )}
                  {!caseContext.representing &&
                    !caseContext.case_background &&
                    !caseContext.defendant_claim &&
                    !caseContext.plaintiff_claim &&
                    !caseContext.focus_areas && (
                      <p className="text-zinc-500 italic">
                        사건 정보를 입력하면 AI 분석 품질이 향상됩니다.
                      </p>
                    )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-8 p-6 bg-zinc-50 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">문서 업로드</h2>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              PDF 선택
            </button>

            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  선택된 파일 ({selectedFiles.length}개)
                </p>
                <ul className="space-y-2 mb-4">
                  {selectedFiles.map((file, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-zinc-700 flex items-center justify-between p-2 bg-white rounded border"
                    >
                      <span>{file.name}</span>
                      <button
                        onClick={() => {
                          setSelectedFiles(
                            selectedFiles.filter((_, i) => i !== idx)
                          )
                        }}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={uploadFiles}
                  disabled={isUploading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {isUploading ? '업로드 중...' : '업로드 시작'}
                </button>
              </div>
            )}

            {isUploading && (
              <div className="mt-4">
                <LoadingSpinner
                  text={uploadMessage || '파일 업로드 중...'}
                  size="sm"
                />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">
              업로드된 문서 ({caseData.documents.length})
            </h2>

            {caseData.documents.length === 0 ? (
              <EmptyState
                icon="📄"
                title="문서가 없습니다"
                description="PDF 파일을 업로드하여 AI 분석을 시작하세요."
              />
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {caseData.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-white border rounded hover:bg-zinc-50"
                    >
                      <label className="flex items-center gap-3 flex-1 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDocs.includes(doc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocs([...selectedDocs, doc.id])
                            } else {
                              setSelectedDocs(
                                selectedDocs.filter((id) => id !== doc.id)
                              )
                            }
                          }}
                          className="w-5 h-5 shrink-0"
                        />
                        <span className="text-2xl shrink-0">📄</span>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {doc.original_file_name}
                          </div>
                          <div className="text-sm text-zinc-500">
                            업로드:{' '}
                            {new Date(doc.upload_date || doc.created_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={doc.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          PDF 보기
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 items-center mb-6">
                  <button
                    onClick={() => {
                      if (
                        selectedDocs.length === caseData.documents.length
                      ) {
                        setSelectedDocs([])
                      } else {
                        setSelectedDocs(
                          caseData.documents.map((d) => d.id)
                        )
                      }
                    }}
                    className="px-4 py-2 text-sm border border-zinc-300 rounded-md hover:bg-zinc-50"
                  >
                    {selectedDocs.length === caseData.documents.length
                      ? '전체 해제'
                      : '전체 선택'}
                  </button>
                  <span className="text-sm text-zinc-600">
                    {selectedDocs.length}개 선택됨
                  </span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => analyzeSelected()}
                    disabled={
                      selectedDocs.length === 0 || isAnalyzing
                    }
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing
                      ? '분석 중...'
                      : `선택한 문서 분석 (${selectedDocs.length}개)`}
                  </button>
                  <button
                    onClick={analyzeAll}
                    disabled={
                      caseData.documents.length === 0 || isAnalyzing
                    }
                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing
                      ? '분석 중...'
                      : `전체 문서 분석 (${caseData.documents.length}개)`}
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="mt-6">
                    <LoadingSpinner text="AI가 문서를 분석하고 있습니다..." />
                  </div>
                )}
              </>
            )}
          </div>

          {analysisHistory.length === 0 && !isAnalyzing && (
            <EmptyState
              icon="🤖"
              title="아직 분석 결과가 없습니다"
              description="문서를 선택하고 분석 버튼을 눌러주세요."
            />
          )}

          {analysisHistory.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">📊 분석 결과</h2>

              <div className="mb-6 p-4 bg-zinc-50 rounded-lg border">
                <h3 className="text-sm font-semibold mb-3 text-zinc-700">
                  분석 이력 ({analysisHistory.length}개)
                </h3>
                <div className="space-y-2">
                  {analysisHistory.map((analysis, idx) => (
                    <div key={analysis.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAnalysis(analysis)}
                        className={`flex-1 text-left px-4 py-3 rounded-lg border transition-colors ${
                          selectedAnalysis?.id === analysis.id
                            ? 'bg-blue-50 border-blue-500'
                            : 'bg-white border border-zinc-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="font-medium">
                          {analysis.title || (idx === 0 ? '🆕 최신 분석' : `분석 ${analysisHistory.length - idx}`)}
                        </div>
                        <div className="text-sm text-zinc-500">
                          {new Date(
                            analysis.created_at
                          ).toLocaleString('ko-KR')}
                        </div>
                        {selectedAnalysis?.id === analysis.id && (
                          <span className="text-sm text-blue-600 font-medium mt-1 block">
                            ✓
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAnalysisId(analysis.id)
                          setEditingTitle(analysis.title || '')
                        }}
                        className="px-3 py-3 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="제목 수정"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnalysis(analysis.id)}
                        className="px-3 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="분석 결과 삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {editingAnalysisId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-4">분석 제목 수정</h3>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg mb-4"
                      placeholder="분석 제목을 입력하세요"
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAnalysisId(null)
                          setEditingTitle('')
                        }}
                        className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveTitle}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedAnalysis && (
                <div className="p-6 bg-white border rounded-lg shadow-sm">
                  <div className="mb-6 flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">분석 상세</h3>
                      <p className="text-sm text-zinc-500">
                        {new Date(
                          selectedAnalysis.created_at
                        ).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isMarkedAsGood ? (
                        <button
                          onClick={() => {
                            setConfirmDialog({
                              title: '학습 예시 제거',
                              message:
                                '이 분석을 학습 예시에서 제거하시겠습니까?',
                              type: 'default',
                              onConfirm: async () => {
                                try {
                                  await removeGoodExample(selectedAnalysis.id)
                                  setIsMarkedAsGood(false)
                                  setToast({
                                    message: '학습 예시에서 제거되었습니다.',
                                    type: 'success',
                                  })
                                } catch (err) {
                                  setToast({
                                    message: '제거 실패: ' + err.message,
                                    type: 'error',
                                  })
                                }
                                setConfirmDialog(null)
                              },
                              onCancel: () => setConfirmDialog(null),
                            })
                          }}
                          className="px-4 py-2 text-sm bg-green-600 text-white border border-green-700 rounded-md hover:bg-green-700 flex items-center gap-2"
                        >
                          <span>✓</span>
                          <span>학습 예시 등록됨</span>
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await saveGoodExample({
                                caseType: caseData.case_type || '기타',
                                inputSummary: `${caseData.case_name} - ${caseData.documents.length}개 문서 분석`,
                                outputAnalysis: selectedAnalysis.result,
                                rating: 5,
                                caseId: caseId,
                                analysisId: selectedAnalysis.id,
                              })
                              setIsMarkedAsGood(true)
                              setToast({
                                message:
                                  '이 분석이 학습 예시로 저장되었습니다! 다음 분석부터 품질이 향상됩니다.',
                                type: 'success',
                              })
                            } catch (err) {
                              setToast({ message: '저장 실패: ' + err.message, type: 'error' })
                            }
                          }}
                          className="px-4 py-2 text-sm bg-green-100 text-green-700 border border-green-300 rounded-md hover:bg-green-200 flex items-center gap-2"
                        >
                          <span>👍</span>
                          <span>좋은 분석!</span>
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (editingAnalysis) {
                            try {
                              await updateAnalysisResult(
                                selectedAnalysis.id,
                                editedAnalysis
                              )
                              setToast({ message: '저장되었습니다', type: 'success' })
                              setEditingAnalysis(false)
                              await loadCase()
                            } catch (err) {
                              setToast({ message: '저장 실패: ' + err.message, type: 'error' })
                            }
                          } else {
                            setEditingAnalysis(true)
                          }
                        }}
                        className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
                      >
                        {editingAnalysis ? '저장' : '직접 수정'}
                      </button>
                      {editingAnalysis && (
                        <button
                          onClick={() => {
                            setEditedAnalysis(selectedAnalysis.result)
                            setEditingAnalysis(false)
                          }}
                          className="px-4 py-2 text-sm border border-zinc-300 text-zinc-700 rounded-md hover:bg-zinc-50"
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold mb-2 text-zinc-900">
                        사건 요약
                      </h4>
                      {editingAnalysis ? (
                        <textarea
                          value={editedAnalysis?.summary ?? ''}
                          onChange={(e) =>
                            setEditedAnalysis({
                              ...editedAnalysis,
                              summary: e.target.value,
                            })
                          }
                          className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={4}
                        />
                      ) : (
                        <p className="text-zinc-700 leading-relaxed">
                          {selectedAnalysis.result?.summary}
                        </p>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2 text-zinc-900">
                        주요 쟁점
                      </h4>
                      {editingAnalysis ? (
                        <textarea
                          value={editedAnalysis?.issues?.join('\n') || ''}
                          onChange={(e) =>
                            setEditedAnalysis({
                              ...editedAnalysis,
                              issues: e.target.value
                                .split('\n')
                                .filter((x) => x.trim()),
                            })
                          }
                          placeholder="한 줄에 하나씩 입력"
                          className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          rows={5}
                        />
                      ) : (
                        <ul className="list-disc list-inside space-y-1">
                          {selectedAnalysis.result?.issues?.map((issue, i) => (
                            <li key={i} className="text-zinc-700">
                              {issue}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2 text-zinc-900">
                        증거 목록
                      </h4>
                      {editingAnalysis ? (
                        <EvidenceEditor
                          evidence={editedAnalysis?.evidence || []}
                          onChange={(newEvidence) =>
                            setEditedAnalysis({
                              ...editedAnalysis,
                              evidence: newEvidence,
                            })
                          }
                        />
                      ) : (
                        <div className="space-y-2">
                          {selectedAnalysis.result?.evidence?.map((ev, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2"
                            >
                              <span className="inline-block px-2 py-1 text-xs font-medium bg-zinc-100 text-zinc-700 rounded">
                                {ev.type}
                              </span>
                              <span className="text-zinc-700 flex-1">
                                {ev.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2 text-zinc-900">
                        유리한 정황
                      </h4>
                      {editingAnalysis ? (
                        <textarea
                          value={
                            editedAnalysis?.favorable_facts?.join('\n') || ''
                          }
                          onChange={(e) =>
                            setEditedAnalysis({
                              ...editedAnalysis,
                              favorable_facts: e.target.value
                                .split('\n')
                                .filter((x) => x.trim()),
                            })
                          }
                          placeholder="한 줄에 하나씩 입력"
                          className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          rows={5}
                        />
                      ) : (
                        <ul className="list-disc list-inside space-y-1">
                          {selectedAnalysis.result?.favorable_facts?.map(
                            (fact, i) => (
                              <li key={i} className="text-zinc-700">
                                {fact}
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>

                    {((selectedAnalysis.result?.timeline &&
                      selectedAnalysis.result.timeline.length > 0) ||
                      editingAnalysis) && (
                      <div>
                        <h4 className="font-semibold mb-4 text-zinc-900">
                          타임라인
                        </h4>
                        {editingAnalysis ? (
                          <TimelineEditor
                            timeline={editedAnalysis?.timeline || []}
                            onChange={(newTimeline) =>
                              setEditedAnalysis({
                                ...editedAnalysis,
                                timeline: newTimeline,
                              })
                            }
                          />
                        ) : (
                          <Timeline
                            events={selectedAnalysis.result?.timeline}
                          />
                        )}
                      </div>
                    )}

                    {selectedAnalysis.result?.contradictions &&
                      selectedAnalysis.result.contradictions.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3 text-zinc-900">
                            발견된 모순점
                          </h4>
                          <div className="space-y-3">
                            {selectedAnalysis.result.contradictions.map(
                              (c, i) => (
                                <div
                                  key={i}
                                  className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
                                >
                                  <p className="text-sm mb-2">
                                    <strong className="text-amber-900">
                                      진술 1:
                                    </strong>
                                    <span className="text-zinc-700 ml-2">
                                      {c.statement_1}
                                    </span>
                                  </p>
                                  <p className="text-sm mb-2">
                                    <strong className="text-amber-900">
                                      진술 2:
                                    </strong>
                                    <span className="text-zinc-700 ml-2">
                                      {c.statement_2}
                                    </span>
                                  </p>
                                  <p className="text-sm">
                                    <strong className="text-amber-900">
                                      분석:
                                    </strong>
                                    <span className="text-amber-800 ml-2">
                                      {c.analysis}
                                    </span>
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {!editingAnalysis && (
                      <div className="mt-8 p-4 bg-zinc-50 rounded-lg border">
                        <h4 className="font-semibold mb-3">
                          AI에게 수정 요청
                        </h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                          <button
                            onClick={() =>
                              handleRefineWithAI(
                                '타임라인을 더 자세하게 작성해줘'
                              )
                            }
                            disabled={isRefining}
                            className="px-3 py-1 text-sm bg-white border border-zinc-300 rounded-md hover:bg-zinc-100 disabled:opacity-50"
                          >
                            타임라인 상세화
                          </button>
                          <button
                            onClick={() =>
                              handleRefineWithAI(
                                '피고인에게 유리한 정황을 더 찾아줘'
                              )
                            }
                            disabled={isRefining}
                            className="px-3 py-1 text-sm bg-white border border-zinc-300 rounded-md hover:bg-zinc-100 disabled:opacity-50"
                          >
                            유리한 정황 추가
                          </button>
                          <button
                            onClick={() =>
                              handleRefineWithAI(
                                '진술 간 모순점을 더 찾아줘'
                              )
                            }
                            disabled={isRefining}
                            className="px-3 py-1 text-sm bg-white border border-zinc-300 rounded-md hover:bg-zinc-100 disabled:opacity-50"
                          >
                            모순점 추가
                          </button>
                          <button
                            onClick={() =>
                              handleRefineWithAI(
                                '증거능력 문제를 더 분석해줘'
                              )
                            }
                            disabled={isRefining}
                            className="px-3 py-1 text-sm bg-white border border-zinc-300 rounded-md hover:bg-zinc-100 disabled:opacity-50"
                          >
                            증거능력 검토
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={refinementPrompt}
                            onChange={(e) =>
                              setRefinementPrompt(e.target.value)
                            }
                            onKeyPress={(e) =>
                              e.key === 'Enter' &&
                              !isRefining &&
                              refinementPrompt &&
                              handleRefineWithAI(refinementPrompt)
                            }
                            placeholder="예: 양형 참작 사유를 더 자세히 분석해줘"
                            className="flex-1 p-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isRefining}
                          />
                          <button
                            onClick={() =>
                              handleRefineWithAI(refinementPrompt)
                            }
                            disabled={isRefining || !refinementPrompt}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRefining ? '처리 중...' : '수정 요청'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
