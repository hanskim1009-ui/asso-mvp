"use client"

import { useState, useEffect, useRef } from 'react'
import {
  getCaseWithDocuments,
  saveDocument,
  updateCase,
  getCaseAnalysisHistory,
  updateAnalysisResult,
  saveIntegratedAnalysis,
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
import AnalysisCompareView from '@/app/components/AnalysisCompareView'
import ChunkViewer from '@/app/components/ChunkViewer'
import EvidenceClassifier from '@/app/components/EvidenceClassifier'
import { OPINION_TYPES, OPINION_MODELS } from '@/lib/opinionPrompts'
import { pdf } from '@react-pdf/renderer'
import AnalysisReportPdf from '@/app/components/AnalysisReportPdf'
import { getPromptTemplates, fillTemplate } from '@/lib/analysisPromptTemplates'
import { verifyAnalysisPages, verificationSummary } from '@/lib/analysisPageVerification'

export default function CaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const caseId = params.id

  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [pdfSourceType, setPdfSourceType] = useState('scanned') // 'scanned' | 'digital'
  const [ocrOutputFormat, setOcrOutputFormat] = useState('text')
  const [ocrIncludeCoordinates, setOcrIncludeCoordinates] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState(null)
  const [selectedDocs, setSelectedDocs] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAnalyzingMultistage, setIsAnalyzingMultistage] = useState(false)
  const [isAnalyzingChunked, setIsAnalyzingChunked] = useState(false)
  const [chunkedPhase, setChunkedPhase] = useState(0)
  const [chunkedPhaseData, setChunkedPhaseData] = useState(null)
  const [chunkedPayload, setChunkedPayload] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisHistory, setAnalysisHistory] = useState([])
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [isMarkedAsGood, setIsMarkedAsGood] = useState(false)
  const [editingAnalysis, setEditingAnalysis] = useState(false)
  const [editedAnalysis, setEditedAnalysis] = useState(null)
  const [refinementPrompt, setRefinementPrompt] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [isEntityAnalyzing, setIsEntityAnalyzing] = useState(false)
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
  const [previousAnalysis, setPreviousAnalysis] = useState(null)
  const [compareLeft, setCompareLeft] = useState(null)
  const [compareRight, setCompareRight] = useState(null)
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [compareSelectLeft, setCompareSelectLeft] = useState('')
  const [compareSelectRight, setCompareSelectRight] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [chunkViewerOpen, setChunkViewerOpen] = useState(false)
  const [chunkViewerChunkId, setChunkViewerChunkId] = useState(null)
  const [chunkViewerPage, setChunkViewerPage] = useState(null)
  const [chunkViewerHighlight, setChunkViewerHighlight] = useState('')
  const [inlineChunkData, setInlineChunkData] = useState(null)
  const [inlineChunkLoading, setInlineChunkLoading] = useState(false)
  const [evidenceSections, setEvidenceSections] = useState([])
  const [opinionModalOpen, setOpinionModalOpen] = useState(false)
  const [opinionType, setOpinionType] = useState('sentencing')
  const [opinionModelPhase1, setOpinionModelPhase1] = useState('claude-opus-4.5')
  const [opinionModelPhase2, setOpinionModelPhase2] = useState('gemini-2.5-flash')
  const [opinionUserPrompt, setOpinionUserPrompt] = useState('')
  const [referenceCandidates, setReferenceCandidates] = useState([])
  const [referenceCandidatesLoading, setReferenceCandidatesLoading] = useState(false)
  const [selectedReferenceIds, setSelectedReferenceIds] = useState([])
  const [opinionGenerating, setOpinionGenerating] = useState(false)
  const [opinionStep, setOpinionStep] = useState('config') // 'config' | 'outline' | 'chunk'
  const [opinionOutline, setOpinionOutline] = useState('')
  const [opinionMetaPrompt, setOpinionMetaPrompt] = useState('')
  const [opinionChunks, setOpinionChunks] = useState([])
  const [opinionResult, setOpinionResult] = useState(null)
  const [analysisPdfViewer, setAnalysisPdfViewer] = useState(null) // { pdfUrl, pageNumber, documentName }
  const [analysisPdfZoom, setAnalysisPdfZoom] = useState(120) // 기본 조금 크게 (가독성)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const [promptDownloadOpen, setPromptDownloadOpen] = useState(false)
  const [analysisVerification, setAnalysisVerification] = useState(null)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const fileInputRef = useRef(null)
  const promptDownloadRef = useRef(null)

  useEffect(() => {
    loadCase()
  }, [caseId])

  useEffect(() => {
    if (selectedAnalysis) {
      setEditedAnalysis(selectedAnalysis.result)
      setEditingAnalysis(false)
      setAnalysisPdfViewer(null)
      setAnalysisPdfZoom(120)
      setAnalysisVerification(null)
      isGoodExample(selectedAnalysis.id).then(setIsMarkedAsGood)
    }
  }, [selectedAnalysis])

  useEffect(() => {
    if (!chunkViewerChunkId) {
      setInlineChunkData(null)
      return
    }
    let cancelled = false
    setInlineChunkLoading(true)
    fetch(`/api/chunk/${chunkViewerChunkId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (chunkViewerPage != null) data.page_number = chunkViewerPage
          setInlineChunkData(data)
        }
      })
      .catch(() => {
        if (!cancelled) setInlineChunkData(null)
      })
      .finally(() => {
        if (!cancelled) setInlineChunkLoading(false)
      })
    return () => { cancelled = true }
  }, [chunkViewerChunkId, chunkViewerPage])

  useEffect(() => {
    if (!promptDownloadOpen) return
    function onMouseDown(e) {
      if (promptDownloadRef.current && !promptDownloadRef.current.contains(e.target)) {
        setPromptDownloadOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [promptDownloadOpen])

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
      // 증거 섹션 로드
      await loadEvidenceSections()
    } catch (err) {
      setToast({ message: '사건 로드 실패: ' + err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function loadEvidenceSections() {
    try {
      const res = await fetch(`/api/cases/${caseId}/evidence-sections`)
      const data = await res.json()
      setEvidenceSections(data.sections || [])
    } catch (err) {
      console.error('증거 섹션 로드 실패:', err)
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

        const formData = new FormData()
        formData.append('document', file)

        let ocrJson
        const isHanword = /^hwp(x)?$/i.test(fileExt)
        if (isHanword) {
          setUploadMessage(`${i + 1}/${selectedFiles.length} 한글 문서 텍스트 추출 중...`)
          const hwpRes = await fetch('/api/extract-hwp-text', {
            method: 'POST',
            body: formData,
          })
          ocrJson = await hwpRes.json()
          if (!hwpRes.ok) {
            throw new Error(`${file.name}: ${ocrJson?.error ?? '한글 문서 텍스트 추출 실패'}`)
          }
        } else if (pdfSourceType === 'digital') {
          setUploadMessage(`${i + 1}/${selectedFiles.length} 텍스트 추출 중...`)
          const extractRes = await fetch('/api/extract-pdf-text', {
            method: 'POST',
            body: formData,
          })
          ocrJson = await extractRes.json()
          if (!extractRes.ok) {
            throw new Error(`${file.name}: ${ocrJson?.error ?? '텍스트 추출 실패'}`)
          }
        } else {
          setUploadMessage(`${i + 1}/${selectedFiles.length} OCR 처리 중...`)
          formData.append('outputFormat', ocrOutputFormat)
          formData.append('includeCoordinates', ocrIncludeCoordinates ? 'true' : 'false')
          if (caseId) formData.append('caseId', caseId)
          const ocrRes = await fetch('/api/ocr', {
            method: 'POST',
            body: formData,
          })
          ocrJson = await ocrRes.json()
          if (!ocrRes.ok) {
            throw new Error(`${file.name}: ${ocrJson?.error ?? 'OCR 실패'}`)
          }
        }

        if (ocrJson.success && ocrJson.split && ocrJson.documents?.length > 0) {
          setUploadMessage(`${i + 1}/${selectedFiles.length} 청킹 중...`)
          for (const doc of ocrJson.documents) {
            try {
              const chunkRes = await fetch('/api/chunk-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  documentId: doc.id,
                  txtUrl: doc.txtUrl,
                  pageTextsUrl: doc.pageTextsUrl || null,
                }),
              })
              const chunkData = await chunkRes.json()
              if (chunkData.success) console.log(`청크 ${chunkData.chunksCount}개 생성됨: ${doc.id}`)
            } catch (chunkErr) {
              console.error('청킹 오류:', chunkErr)
            }
          }
          uploadedDocs.push(...(ocrJson.documents.map((d) => ({ id: d.id, fileName: file.name }))))
          setToast({
            message: `${file.name}: ${ocrJson.totalPages}페이지가 ${ocrJson.parts}개 구간으로 나뉘어 업로드·OCR되었습니다.`,
            type: 'success',
          })
        } else if (ocrJson.success && ocrJson.txtFileUrl) {
          const docId = await saveDocument({
            pdfUrl: pdfUrlData.publicUrl,
            txtUrl: ocrJson.txtFileUrl,
            pdfFileName: fileName,
            txtFileName: ocrJson.txtFileName,
            originalFileName: file.name,
            fileSize: file.size,
            caseId: caseId,
          })

          setUploadMessage(`${i + 1}/${selectedFiles.length} 청킹 중...`)

          try {
            const chunkRes = await fetch('/api/chunk-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentId: docId,
                txtUrl: ocrJson.txtFileUrl,
                pageTextsUrl: ocrJson.pageTextsUrl || null,
              }),
            })
            const chunkData = await chunkRes.json()
            if (chunkData.success) {
              console.log(`청크 ${chunkData.chunksCount}개 생성됨: ${file.name}`)
            } else {
              console.warn('청킹 실패:', chunkData.error)
              setToast({ message: `${file.name} 청킹 실패 (원문 검색 불가)`, type: 'error' })
            }
          } catch (chunkErr) {
            console.error('청킹 오류:', chunkErr)
            setToast({ message: `${file.name} 청킹 실패 (원문 검색 불가)`, type: 'error' })
          }

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

      // 증거기록 분류와 동일하게 페이지별 텍스트 사용 (pageTexts 있으면 페이지 명시, 없으면 원문 통째로)
      const texts = []
      for (let i = 0; i < selectedDocuments.length; i++) {
        const doc = selectedDocuments[i]
        if (!doc.txt_url) continue
        let pageTexts = null
        if (doc.txt_file_name) {
          const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
          const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
          try {
            const ptRes = await fetch(pageJsonUrl)
            if (ptRes.ok) {
              const pageJson = await ptRes.json()
              if (pageJson && typeof pageJson === 'object' && Object.keys(pageJson).length > 0) {
                pageTexts = pageJson
              }
            }
          } catch (_) {}
        }
        if (pageTexts) {
          const pageNumbers = Object.keys(pageTexts)
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
          const parts = pageNumbers.map(
            (p) => `[문서 ${i + 1} - ${p}페이지]\n${(pageTexts[String(p)] ?? '').trim()}`
          )
          texts.push(parts.join('\n\n'))
        } else {
          const res = await fetch(doc.txt_url)
          const text = await res.text()
          texts.push(text)
        }
      }

      // 선택한 문서에 해당하는 증거기록 분류·분석만 참고용으로 전달 (분석 안 한 섹션은 분류만 포함).
      // document_id를 함께 보내어 API에서도 선택 문서만 사용하도록 이중 필터링.
      const sectionsForSelected = (evidenceSections || []).filter((s) =>
        s.document_id && ids.includes(s.document_id)
      )
      const evidenceContext =
        sectionsForSelected.length > 0
          ? {
              sections: sectionsForSelected.map((s) => ({
                document_id: s.document_id,
                section_title: s.section_title,
                section_type: s.section_type,
                start_page: s.start_page,
                end_page: s.end_page,
                extracted_text: s.extracted_text,
                analysis_result: s.analysis_result ?? null,
              })),
            }
          : null

      const res = await fetch('/api/analyze-integrated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          documentIds: ids,
          caseId: caseId,
          userContext: caseContext,
          caseType: caseData.case_type,
          evidenceContext,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setAnalysisResult(data.analysis)
        const msg =
          data.examplesUsed > 0
            ? `분석 완료! (학습 예시 ${data.examplesUsed}개 반영됨)`
            : '분석이 완료되었습니다!'
        setToast({ message: msg, type: 'success' })
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

  /** 다단계 분석: 1차 요약·쟁점 → 2차 타임라인 → 3차 증거·유리한 정황·모순점 (선택 문서만) */
  async function analyzeSelectedMultistage() {
    const ids = selectedDocs.length > 0 ? selectedDocs : caseData.documents.map((d) => d.id)
    if (ids.length === 0) return

    setIsAnalyzingMultistage(true)
    setIsAnalyzing(true)
    try {
      const selectedDocuments = caseData.documents.filter((d) => ids.includes(d.id))
      const texts = []
      for (let i = 0; i < selectedDocuments.length; i++) {
        const doc = selectedDocuments[i]
        if (!doc.txt_url) continue
        let pageTexts = null
        if (doc.txt_file_name) {
          const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
          const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
          try {
            const ptRes = await fetch(pageJsonUrl)
            if (ptRes.ok) {
              const pageJson = await ptRes.json()
              if (pageJson && typeof pageJson === 'object' && Object.keys(pageJson).length > 0) {
                pageTexts = pageJson
              }
            }
          } catch (_) {}
        }
        if (pageTexts) {
          const pageNumbers = Object.keys(pageTexts)
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
          const parts = pageNumbers.map(
            (p) => `[문서 ${i + 1} - ${p}페이지]\n${(pageTexts[String(p)] ?? '').trim()}`
          )
          texts.push(parts.join('\n\n'))
        } else {
          const res = await fetch(doc.txt_url)
          const text = await res.text()
          texts.push(text)
        }
      }
      const sectionsForSelected = (evidenceSections || []).filter(
        (s) => s.document_id && ids.includes(s.document_id)
      )
      const evidenceContext =
        sectionsForSelected.length > 0
          ? {
              sections: sectionsForSelected.map((s) => ({
                document_id: s.document_id,
                section_title: s.section_title,
                section_type: s.section_type,
                start_page: s.start_page,
                end_page: s.end_page,
                extracted_text: s.extracted_text,
                analysis_result: s.analysis_result ?? null,
              })),
            }
          : null

      const res = await fetch('/api/analyze-integrated-multistage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          documentIds: ids,
          caseId: caseId,
          userContext: caseContext,
          caseType: caseData.case_type,
          evidenceContext,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setAnalysisResult(data.analysis)
        setToast({
          message: `다단계 분석 완료! (${data.steps}단계)`,
          type: 'success',
        })
        await loadCase()
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setToast({ message: '다단계 분석 실패: ' + err.message, type: 'error' })
    } finally {
      setIsAnalyzingMultistage(false)
      setIsAnalyzing(false)
    }
  }

  /** 구간 나누기 분석용 payload 생성 (1·2·3단계 공통) */
  async function buildChunkedPayload() {
    const ids = selectedDocs.length > 0 ? selectedDocs : caseData.documents.map((d) => d.id)
    if (ids.length === 0) return null
    const selectedDocuments = caseData.documents.filter((d) => ids.includes(d.id))
    const sendTextsInBody = ids.length === 1
    let texts = []
    if (sendTextsInBody) {
      for (let i = 0; i < selectedDocuments.length; i++) {
        const doc = selectedDocuments[i]
        if (!doc.txt_url) continue
        let pageTexts = null
        if (doc.txt_file_name) {
          const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
          const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
          try {
            const ptRes = await fetch(pageJsonUrl)
            if (ptRes.ok) {
              const pageJson = await ptRes.json()
              if (pageJson && typeof pageJson === 'object' && Object.keys(pageJson).length > 0) {
                pageTexts = pageJson
              }
            }
          } catch (_) {}
        }
        if (pageTexts) {
          const pageNumbers = Object.keys(pageTexts)
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
          const parts = pageNumbers.map(
            (p) => `[문서 ${i + 1} - ${p}페이지]\n${(pageTexts[String(p)] ?? '').trim()}`
          )
          texts.push(parts.join('\n\n'))
        } else {
          const res = await fetch(doc.txt_url)
          const text = await res.text()
          texts.push(text)
        }
      }
    }
    const sectionsForSelected = (evidenceSections || []).filter(
      (s) => s.document_id && ids.includes(s.document_id)
    )
    const evidenceContext =
      sectionsForSelected.length > 0
        ? {
            sections: sectionsForSelected.map((s) => ({
              document_id: s.document_id,
              section_title: s.section_title,
              section_type: s.section_type,
              start_page: s.start_page,
              end_page: s.end_page,
              extracted_text: s.extracted_text,
              analysis_result: s.analysis_result ?? null,
            })),
          }
        : null
    const payload = {
      documentIds: ids,
      caseId: caseId,
      userContext: caseContext,
      caseType: caseData.case_type,
      evidenceContext,
    }
    if (sendTextsInBody && texts.length > 0) payload.texts = texts
    return payload
  }

  /** 구간 나누기 1단계: 청크 분할만 (사용자 확인 후 2단계 진행) */
  async function runChunkedPhase1() {
    const ids = selectedDocs.length > 0 ? selectedDocs : caseData.documents.map((d) => d.id)
    if (ids.length === 0) return
    setIsAnalyzingChunked(true)
    setIsAnalyzing(true)
    setChunkedPhase(0)
    setChunkedPhaseData(null)
    setChunkedPayload(null)
    try {
      const payload = await buildChunkedPayload()
      if (!payload) throw new Error('분석할 문서가 없습니다.')
      setChunkedPayload(payload)
      const res = await fetch('/api/analyze-integrated-chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, phase: 1 }),
      })
      const data = await res.json().catch(() => ({ error: res.statusText || '서버 오류' }))
      if (data.error) throw new Error(data.error)
      if (data.phase !== 1 || data.chunksCount == null) throw new Error('1단계 응답 형식 오류')
      setChunkedPhaseData({ chunksCount: data.chunksCount, totalPages: data.totalPages })
      setChunkedPhase(1)
      setToast({ message: `1단계 완료: ${data.chunksCount}개 구간, 총 ${data.totalPages}페이지`, type: 'success' })
    } catch (err) {
      setToast({ message: '1단계 실패: ' + (err?.message || String(err)), type: 'error' })
    } finally {
      setIsAnalyzingChunked(false)
      setIsAnalyzing(false)
    }
  }

  /** 구간 나누기 2단계: 부분 분석 (사용자 확인 후 3단계 진행) */
  async function runChunkedPhase2() {
    if (!chunkedPayload || chunkedPhase !== 1) return
    setIsAnalyzingChunked(true)
    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-integrated-chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...chunkedPayload, phase: 2 }),
      })
      const data = await res.json().catch(() => ({ error: res.statusText || '서버 오류' }))
      if (data.error) throw new Error(data.error)
      if (data.phase !== 2 || !Array.isArray(data.partialResults)) throw new Error('2단계 응답 형식 오류')
      setChunkedPhaseData({
        chunksCount: data.chunksCount,
        totalPages: data.totalPages,
        partialResults: data.partialResults,
      })
      setChunkedPhase(2)
      setToast({
        message: `2단계 완료: 부분 분석 ${data.partialResults.length}개 구간 완료`,
        type: 'success',
      })
    } catch (err) {
      setToast({ message: '2단계 실패: ' + (err?.message || String(err)), type: 'error' })
    } finally {
      setIsAnalyzingChunked(false)
      setIsAnalyzing(false)
    }
  }

  /** 구간 나누기 3단계: 종합만 (partialResults 전달) */
  async function runChunkedPhase3() {
    if (!chunkedPayload || chunkedPhase !== 2 || !chunkedPhaseData?.partialResults) return
    setIsAnalyzingChunked(true)
    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-integrated-chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...chunkedPayload,
          phase: 3,
          partialResults: chunkedPhaseData.partialResults,
        }),
      })
      const data = await res.json().catch(() => ({ error: res.statusText || '서버 오류' }))
      if (data.error) throw new Error(data.error)
      if (!data.analysis) throw new Error('3단계 응답 형식 오류')
      setAnalysisResult(data.analysis)
      setChunkedPhase(0)
      setChunkedPhaseData(null)
      setChunkedPayload(null)
      setToast({
        message: `구간 나누기 분석 완료! (${data.chunksUsed}구간)`,
        type: 'success',
      })
      await loadCase()
    } catch (err) {
      setToast({ message: '3단계 실패: ' + (err?.message || String(err)), type: 'error' })
    } finally {
      setIsAnalyzingChunked(false)
      setIsAnalyzing(false)
    }
  }

  function resetChunkedPhase() {
    setChunkedPhase(0)
    setChunkedPhaseData(null)
    setChunkedPayload(null)
  }

  /** 구간 나누기 분석: 1단계 시작 (이후 단계별로 사용자가 '다음 단계'로 진행) */
  async function analyzeSelectedChunked() {
    await runChunkedPhase1()
  }

  async function handleKeywordSearch() {
    if (!searchQuery.trim() || !caseId) return
    setSearchLoading(true)
    setSearchResults([])
    try {
      const res = await fetch(`/api/cases/${caseId}/search?q=${encodeURIComponent(searchQuery.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '검색 실패')
      setSearchResults(data.results || [])
    } catch (err) {
      console.error('키워드 검색 오류:', err)
      setSearchResults([])
      setToast({ message: '검색 실패: ' + err.message, type: 'error' })
    } finally {
      setSearchLoading(false)
    }
  }

  function openChunkWithHighlight(chunkId, pageNumber, keyword) {
    setChunkViewerChunkId(chunkId)
    setChunkViewerPage(pageNumber)
    setChunkViewerHighlight(keyword || '')
    setInlineChunkData(null)
  }

  function closeInlineChunk() {
    setChunkViewerChunkId(null)
    setChunkViewerPage(null)
    setChunkViewerHighlight('')
    setInlineChunkData(null)
  }

  /** 분석 상세에서 페이지 참조 클릭 시 오른쪽에 PDF 페이지 표시 (문서명 있으면 해당 문서, 없으면 분석의 첫 문서) */
  function openAnalysisPdf(pageNumber, sourceDocumentName) {
    if (!selectedAnalysis || !caseData?.documents?.length || pageNumber == null) return
    const docIds =
      selectedAnalysis.result?.document_ids ??
      (selectedAnalysis.document_id ? [selectedAnalysis.document_id] : caseData.documents.map((d) => d.id))
    const doc = sourceDocumentName
      ? caseData.documents.find(
          (d) => d.original_file_name === sourceDocumentName || d.original_file_name?.includes(sourceDocumentName)
        )
      : null
    const targetDoc = doc || caseData.documents.find((d) => docIds.includes(d.id))
    if (!targetDoc?.pdf_url) return
    setAnalysisPdfViewer({
      pdfUrl: targetDoc.pdf_url,
      pageNumber: Number(pageNumber),
      documentName: targetDoc.original_file_name || '문서',
    })
  }

  function renderChunkContentWithHighlight(content, keyword) {
    if (!content) return ''
    let text = String(content)
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    if (keyword && keyword.trim()) {
      const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      try {
        text = text.replace(
          new RegExp(escaped, 'gi'),
          (match) => `<mark class="bg-yellow-300 rounded px-0.5">${match}</mark>`
        )
      } catch (_) {}
    }
    return text
  }

  async function handleRefineWithAI(promptOverride) {
    const refinementRequest = promptOverride ?? refinementPrompt
    if (!refinementRequest.trim()) {
      alert('수정 요청사항을 입력해주세요.')
      return
    }
    if (!selectedAnalysis) return

    // 현재 상태 백업
    setPreviousAnalysis(selectedAnalysis.result)

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

      // 2. 수정된 결과를 '새 분석'으로 추가 (기존 분석은 그대로 두어 비교 가능)
      const documentIds =
        selectedAnalysis.result?.document_ids ??
        (selectedAnalysis.document_id ? [selectedAnalysis.document_id] : caseData.documents?.map((d) => d.id) ?? [])
      const baseTitle = selectedAnalysis.title || '분석 결과'
      const newTitle = `[AI 수정] ${baseTitle}`
      const newId = await saveIntegratedAnalysis(
        caseId,
        documentIds,
        data.refinedAnalysis,
        newTitle
      )

      // 3. 화면 새로고침
      await loadCase()

      // 4. 새로 추가된 분석 선택 (수정된 내용 보여주기)
      const history = await getCaseAnalysisHistory(caseId)
      const newAnalysis = history.find((a) => a.id === newId)
      if (newAnalysis) {
        setSelectedAnalysis(newAnalysis)
        setEditedAnalysis(newAnalysis.result)
      }

      setRefinementPrompt('')
      setEditingAnalysis(false)
      setPreviousAnalysis(null)
      alert('AI 수정이 완료되었습니다. 수정 결과가 새 분석으로 추가되었으며, 분석 비교에서 이전 결과와 비교할 수 있습니다.')
    } catch (error) {
      console.error('AI 수정 오류:', error)
      alert(`수정 실패: ${error.message}`)
      // 실패 시 백업 제거
      setPreviousAnalysis(null)
    } finally {
      setIsRefining(false)
    }
  }

  async function handleUndo() {
    if (!previousAnalysis || !selectedAnalysis) return

    if (!confirm('⚠️ 이전 상태로 복원하시겠습니까?\n\n복원 후에는 현재 수정 내용이 영구 삭제되며, 다시 돌아갈 수 없습니다.')) {
      return
    }

    try {
      await updateAnalysisResult(selectedAnalysis.id, previousAnalysis)
      await loadCase()

      setSelectedAnalysis((prev) =>
        prev ? { ...prev, result: previousAnalysis } : null
      )
      setEditedAnalysis(previousAnalysis)
      setPreviousAnalysis(null)

      setToast({ message: '이전 상태로 복원했습니다.', type: 'success' })
    } catch (error) {
      console.error('복원 오류:', error)
      alert(`복원 실패: ${error.message}`)
    }
  }

  async function runEntityAnalysis() {
    if (!selectedAnalysis?.result || !caseData?.documents) return
    const docIds =
      selectedAnalysis.result?.document_ids ??
      caseData.documents.map((d) => d.id)
    const selectedDocuments = caseData.documents.filter((d) => docIds.includes(d.id))
    if (selectedDocuments.length === 0) return

    setIsEntityAnalyzing(true)
    try {
      const texts = []
      for (let i = 0; i < selectedDocuments.length; i++) {
        const doc = selectedDocuments[i]
        if (!doc.txt_url) continue
        let pageTexts = null
        if (doc.txt_file_name) {
          const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
          const pageJsonUrl = doc.txt_url.replace(
            doc.txt_file_name,
            `${timestamp}_pages.json`
          )
          try {
            const ptRes = await fetch(pageJsonUrl)
            if (ptRes.ok) {
              const pageJson = await ptRes.json()
              if (
                pageJson &&
                typeof pageJson === 'object' &&
                Object.keys(pageJson).length > 0
              ) {
                pageTexts = pageJson
              }
            }
          } catch (_) {}
        }
        if (pageTexts) {
          const pageNumbers = Object.keys(pageTexts)
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b)
          const parts = pageNumbers.map(
            (p) =>
              `[문서 ${i + 1} - ${p}페이지]\n${(pageTexts[String(p)] ?? '').trim()}`
          )
          texts.push(parts.join('\n\n'))
        } else {
          const res = await fetch(doc.txt_url)
          const text = await res.text()
          texts.push(text)
        }
      }
      if (texts.length === 0) {
        setToast({ message: '텍스트를 불러올 수 없습니다.', type: 'error' })
        return
      }

      const res = await fetch('/api/analyze-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: selectedAnalysis.id,
          texts,
          documentIds: docIds,
          analysis: selectedAnalysis.result,
          userContext: caseContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '엔티티 분석 실패')

      await loadCase()
      const history = await getCaseAnalysisHistory(caseId)
      const updated = history.find((a) => a.id === selectedAnalysis.id)
      if (updated) setSelectedAnalysis(updated)
      setToast({ message: '엔티티 분석이 완료되었습니다.', type: 'success' })
    } catch (err) {
      setToast({ message: '엔티티 분석 실패: ' + err.message, type: 'error' })
    } finally {
      setIsEntityAnalyzing(false)
    }
  }

  async function handleDownloadReportPdf() {
    if (!selectedAnalysis?.result) return
    setPdfDownloading(true)
    try {
      const doc = (
        <AnalysisReportPdf
          result={selectedAnalysis.result}
          caseName={caseData?.case_name}
          analysisTitle={selectedAnalysis.title}
        />
      )
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (caseData?.case_name || '사건').replace(/[/\\?%*:|"]/g, '_')
      a.download = `분석리포트_${safeName}_${Date.now()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ message: '리포트 PDF가 다운로드되었습니다.', type: 'success' })
    } catch (err) {
      setToast({ message: 'PDF 생성 실패: ' + (err?.message || err), type: 'error' })
    } finally {
      setPdfDownloading(false)
    }
  }

  function handleDownloadPrompt(item) {
    if (!selectedAnalysis?.result) return
    try {
      const text = fillTemplate(item.template, selectedAnalysis.result)
      const blob = new Blob([text], { type: 'text/plain; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.fileName
      a.click()
      URL.revokeObjectURL(url)
      setPromptDownloadOpen(false)
      setToast({ message: `"${item.title}" 프롬프트가 다운로드되었습니다.`, type: 'success' })
    } catch (err) {
      setToast({ message: '프롬프트 생성 실패: ' + (err?.message || err), type: 'error' })
    }
  }

  async function runPageVerification() {
    if (!selectedAnalysis?.result || !caseData?.documents?.length) return
    const docIds =
      selectedAnalysis.result?.document_ids ??
      (selectedAnalysis.document_id ? [selectedAnalysis.document_id] : caseData.documents.map((d) => d.id))
    const selectedDocuments = caseData.documents.filter((d) => docIds.includes(d.id))
    if (selectedDocuments.length === 0) return

    setVerificationLoading(true)
    setAnalysisVerification(null)
    try {
      const pageTextsByDoc = []
      for (const doc of selectedDocuments) {
        if (!doc.txt_url || !doc.txt_file_name) continue
        const timestamp = doc.txt_file_name.replace(/\.txt$/i, '')
        const pageJsonUrl = doc.txt_url.replace(doc.txt_file_name, `${timestamp}_pages.json`)
        try {
          const res = await fetch(pageJsonUrl)
          if (!res.ok) continue
          const pageJson = await res.json()
          if (pageJson && typeof pageJson === 'object' && Object.keys(pageJson).length > 0) {
            pageTextsByDoc.push({ documentId: doc.id, pageTexts: pageJson })
          }
        } catch (_) {}
      }
      if (pageTextsByDoc.length === 0) {
        setToast({ message: '페이지별 텍스트(_pages.json)를 불러올 수 없습니다. OCR 업로드 문서만 검증 가능합니다.', type: 'error' })
        return
      }
      const verification = verifyAnalysisPages(selectedAnalysis.result, pageTextsByDoc)
      setAnalysisVerification(verification)
      const summary = verificationSummary(verification)
      setToast({ message: summary ? `페이지 검증 완료: ${summary}` : '페이지 검증 완료', type: 'success' })
    } catch (err) {
      setToast({ message: '검증 실패: ' + (err?.message || err), type: 'error' })
    } finally {
      setVerificationLoading(false)
    }
  }

  async function fetchReferenceCandidates() {
    if (!selectedAnalysis?.result) return
    setReferenceCandidatesLoading(true)
    try {
      const res = await fetch('/api/opinion/reference-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: selectedAnalysis.result,
          opinionType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '참고자료 조회 실패')
      setReferenceCandidates(data.chunks || [])
      setSelectedReferenceIds([])
    } catch (err) {
      setToast({ message: err.message || '참고자료 후보를 불러오지 못했습니다.', type: 'error' })
    } finally {
      setReferenceCandidatesLoading(false)
    }
  }

  function toggleReferenceId(id) {
    setSelectedReferenceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function getSelectedReferenceChunks() {
    return referenceCandidates.filter((c) => selectedReferenceIds.includes(c.id))
  }

  async function generateOpinionOutline() {
    if (!selectedAnalysis?.result) return
    setOpinionGenerating(true)
    setOpinionStep('config')
    setOpinionOutline('')
    setOpinionMetaPrompt('')
    setOpinionChunks([])
    setOpinionResult(null)
    try {
      const selectedChunks = getSelectedReferenceChunks()
      const res = await fetch('/api/opinion/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: selectedAnalysis.result,
          userContext: caseContext,
          opinionType,
          userPrompt: opinionUserPrompt.trim() || undefined,
          model: opinionModelPhase1,
          selectedReferenceChunks: selectedChunks.length > 0 ? selectedChunks : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '1차 생성 실패')
      setOpinionOutline(data.outline ?? '')
      setOpinionMetaPrompt(data.metaPrompt ?? '')
      setOpinionStep('outline')
      setToast({ message: '목차·방향이 생성되었습니다. 확인 후 2차 작성을 진행하세요.', type: 'success' })
    } catch (err) {
      setToast({ message: err.message || '1차(목차·방향) 생성에 실패했습니다.', type: 'error' })
    } finally {
      setOpinionGenerating(false)
    }
  }

  async function generateOpinionChunk(partIndex) {
    if (!selectedAnalysis?.result || opinionOutline === '' || opinionMetaPrompt === '') return
    setOpinionGenerating(true)
    try {
      const selectedChunks = getSelectedReferenceChunks()
      const res = await fetch('/api/opinion/generate-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: selectedAnalysis.result,
          userContext: caseContext,
          opinionType,
          outline: opinionOutline,
          metaPrompt: opinionMetaPrompt,
          model: opinionModelPhase2,
          partIndex,
          previousChunks: opinionChunks,
          selectedReferenceChunks: selectedChunks.length > 0 ? selectedChunks : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${partIndex + 1}차 생성 실패`)
      const typeLabel = OPINION_TYPES[opinionType]?.label || opinionType
      setOpinionChunks((prev) => {
        const next = [...prev, data.chunk]
        setOpinionResult({
          title: `${typeLabel} - ${new Date().toISOString().slice(0, 10)}`,
          body: next.join('\n\n'),
          model: opinionModelPhase2,
          opinionType,
          generatedAt: new Date().toISOString(),
        })
        return next
      })
      setOpinionStep('chunk')
      setToast({ message: `${partIndex + 1}차 본문이 생성되었습니다.`, type: 'success' })
    } catch (err) {
      setToast({ message: err.message || '본문 파트 생성에 실패했습니다.', type: 'error' })
    } finally {
      setOpinionGenerating(false)
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
      <header className="flex h-14 items-center justify-between px-6 bg-[#1e3a5f]">
        <Link href="/cases" className="text-xl font-bold text-white">
          ASSO
        </Link>
        <Link href="/reference-documents" className="text-white/90 hover:text-white text-sm">
          참고자료 관리
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
              accept="application/pdf,.pdf,.hwp,application/x-hwp,.hwpx,application/hwpx"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              PDF / 한글(HWP·HWPX) 선택
            </button>

            {selectedFiles.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  PDF 유형
                </p>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pdfSourceType"
                      value="scanned"
                      checked={pdfSourceType === 'scanned'}
                      onChange={() => setPdfSourceType('scanned')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">스캔본(이미지) — OCR 사용</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pdfSourceType"
                      value="digital"
                      checked={pdfSourceType === 'digital'}
                      onChange={() => setPdfSourceType('digital')}
                      className="text-blue-600"
                    />
                    <span className="text-sm">디지털 원본 — OCR 없이 텍스트만 추출</span>
                  </label>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  Word·한글 등에서 만든 PDF는 디지털 원본을 선택하면 비용·시간을 줄일 수 있습니다. 스캔한 문서·이미지 PDF는 스캔본을 선택하세요.
                </p>

                {pdfSourceType === 'scanned' && (
                  <>
                    <p className="text-sm font-medium mb-2">
                      OCR 출력 형식
                    </p>
                    <div className="flex gap-4 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ocrOutputFormat"
                          value="text"
                          checked={ocrOutputFormat === 'text'}
                          onChange={() => setOcrOutputFormat('text')}
                          className="text-blue-600"
                        />
                        <span className="text-sm">텍스트 (기본)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ocrOutputFormat"
                          value="html"
                          checked={ocrOutputFormat === 'html'}
                          onChange={() => setOcrOutputFormat('html')}
                          className="text-blue-600"
                        />
                        <span className="text-sm">HTML (표 구조 유지)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer ml-2 border-l border-zinc-300 pl-4">
                        <input
                          type="checkbox"
                          checked={ocrIncludeCoordinates}
                          onChange={(e) => setOcrIncludeCoordinates(e.target.checked)}
                          className="text-blue-600 rounded"
                        />
                        <span className="text-sm">좌표 포함 (coordinates)</span>
                      </label>
                    </div>
                    <p className="text-xs text-zinc-500 mb-4">
                      표가 있는 문서는 HTML을 선택하면 행·열 구조가 보존됩니다. 화면에는 태그 제외 텍스트로 표시됩니다.
                      좌표 포함을 켜면 OCR 결과에 요소 위치 정보가 포함됩니다(이미지 PDF 위 텍스트 오버레이 등에 활용).
                    </p>
                  </>
                )}
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
                description="PDF 또는 한글(HWP·HWPX) 파일을 업로드하여 AI 분석을 시작하세요."
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

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => analyzeSelected()}
                    disabled={
                      selectedDocs.length === 0 || isAnalyzing
                    }
                    className="flex-1 min-w-[140px] px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing && !isAnalyzingMultistage
                      ? '분석 중...'
                      : `선택한 문서 분석 (${selectedDocs.length}개)`}
                  </button>
                  <button
                    onClick={analyzeAll}
                    disabled={
                      caseData.documents.length === 0 || isAnalyzing
                    }
                    className="flex-1 min-w-[140px] px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing && !isAnalyzingMultistage
                      ? '분석 중...'
                      : `전체 문서 분석 (${caseData.documents.length}개)`}
                  </button>
                  <button
                    onClick={analyzeSelectedMultistage}
                    disabled={
                      (selectedDocs.length === 0 && caseData.documents.length === 0) || isAnalyzing
                    }
                    className="flex-1 min-w-[140px] px-6 py-3 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="1단계 요약·쟁점 → 2단계 타임라인 → 3단계 증거·유리한 정황·모순점 (품질 강화)"
                  >
                    {isAnalyzingMultistage
                      ? '다단계 분석 중...'
                      : `다단계 분석 (${selectedDocs.length > 0 ? selectedDocs.length : caseData.documents.length}개)`}
                  </button>
                  <button
                    onClick={analyzeSelectedChunked}
                    disabled={
                      (selectedDocs.length === 0 && caseData.documents.length === 0) || isAnalyzing
                    }
                    className="flex-1 min-w-[140px] px-6 py-3 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="50페이지씩 구간 분석 후 종합 (50페이지 넘는 긴 문서 품질 향상)"
                  >
                    {isAnalyzingChunked
                      ? '구간 분석 중...'
                      : `구간 나누기 분석 (${selectedDocs.length > 0 ? selectedDocs.length : caseData.documents.length}개)`}
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="mt-6">
                    <LoadingSpinner
                      text={
                        isAnalyzingMultistage
                          ? '다단계 분석 중... (1단계 요약·쟁점 → 2단계 타임라인 → 3단계 증거·모순점, 약 1~2분)'
                          : isAnalyzingChunked
                            ? '구간 나누기 분석 중... (50페이지씩 부분 분석 후 종합, 약 2~3분)'
                            : 'AI가 문서를 분석하고 있습니다...'
                      }
                    />
                  </div>
                )}

                {chunkedPhase >= 1 && !isAnalyzing && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h3 className="font-medium text-amber-900 mb-2">
                      구간 나누기 분석 — {chunkedPhase === 1 ? '1단계 완료' : '2단계 완료'}
                    </h3>
                    {chunkedPhase === 1 && chunkedPhaseData && (
                      <>
                        <p className="text-sm text-amber-800 mb-3">
                          {chunkedPhaseData.chunksCount}개 구간, 총 {chunkedPhaseData.totalPages}페이지로 분할되었습니다.
                          결과를 확인한 뒤 다음 단계를 진행하세요.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={runChunkedPhase2}
                            disabled={isAnalyzing}
                            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                          >
                            2단계 진행 (부분 분석)
                          </button>
                          <button
                            type="button"
                            onClick={resetChunkedPhase}
                            className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-md hover:bg-zinc-300"
                          >
                            처음부터
                          </button>
                        </div>
                      </>
                    )}
                    {chunkedPhase === 2 && chunkedPhaseData?.partialResults && (
                      <>
                        <p className="text-sm text-amber-800 mb-3">
                          부분 분석 {chunkedPhaseData.partialResults.length}개 구간이 완료되었습니다.
                          다음 단계에서 종합하여 최종 분석을 생성합니다.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={runChunkedPhase3}
                            disabled={isAnalyzing}
                            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                          >
                            3단계 진행 (종합)
                          </button>
                          <button
                            type="button"
                            onClick={resetChunkedPhase}
                            className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-md hover:bg-zinc-300"
                          >
                            처음부터
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {caseData.documents.length > 0 && (
            <div className="mt-8 p-4 bg-zinc-50 rounded-lg border">
              <h2 className="text-lg font-semibold mb-3">📋 증거기록 분류</h2>
              <p className="text-sm text-zinc-600 mb-3">
                PDF 증거기록을 업로드하면 각 증거를 자동 분류하고, 증거별로 분석할 수 있습니다.
              </p>
              <EvidenceClassifier
                caseId={caseId}
                documents={caseData.documents}
                evidenceSections={evidenceSections}
                onSectionsChange={loadEvidenceSections}
                onToast={(t) => setToast(t)}
              />
            </div>
          )}

          {caseData.documents.length > 0 && (
            <div className="mt-8 p-4 bg-zinc-50 rounded-lg border">
              <h2 className="text-lg font-semibold mb-3">🔍 원문 키워드 검색</h2>
              <p className="text-sm text-zinc-600 mb-3">
                문서 원문(OCR 청크)에서 키워드를 검색합니다. 결과를 클릭하면 아래에 PDF와 원문이 바로 표시됩니다.
              </p>

              {inlineChunkLoading && (
                <div className="mb-4 flex items-center justify-center py-12 bg-white rounded-lg border">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
              )}
              {inlineChunkData && !inlineChunkLoading && (
                <div className="mb-6 bg-white rounded-xl border-2 border-blue-200 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-200">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-900">
                        {inlineChunkData.documents?.original_file_name}
                      </span>
                      <span className="text-sm text-blue-700">
                        p.{chunkViewerPage ?? inlineChunkData.page_number ?? '?'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={closeInlineChunk}
                      className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-200 rounded-lg"
                    >
                      닫기
                    </button>
                  </div>
                  <div className="flex" style={{ minHeight: '420px' }}>
                    <div className="w-1/2 flex flex-col border-r border-zinc-200">
                      <div className="flex-1 overflow-hidden bg-zinc-100">
                        <iframe
                          src={
                            inlineChunkData.documents?.pdf_url +
                            (chunkViewerPage != null || inlineChunkData.page_number
                              ? `#page=${chunkViewerPage ?? inlineChunkData.page_number ?? 1}`
                              : '')
                          }
                          className="w-full h-full min-h-[400px] border-0"
                          title="PDF 원문"
                        />
                      </div>
                    </div>
                    <div className="w-1/2 flex flex-col">
                      <div className="p-3 border-b bg-amber-50 text-sm text-amber-900">
                        관련 원문 (검색어 하이라이트)
                      </div>
                      <div
                        className="flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap leading-relaxed"
                        style={{
                          backgroundColor: '#fef3c7',
                          borderLeft: '4px solid #f59e0b',
                        }}
                        dangerouslySetInnerHTML={{
                          __html: renderChunkContentWithHighlight(
                            inlineChunkData.content,
                            chunkViewerHighlight
                          ),
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                  placeholder="검색할 단어나 구절 입력"
                  className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleKeywordSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searchLoading ? '검색 중...' : '검색'}
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-sm font-medium text-zinc-700">
                    {searchResults.length}건 발견
                  </p>
                  {searchResults.map((r) => {
                    const docName = r.documents?.original_file_name || '문서'
                    const snippet = (r.content || '')
                      .replace(/<[^>]*>/g, '')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .substring(0, 120)
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openChunkWithHighlight(r.id, r.page_number, searchQuery.trim())}
                        className="w-full text-left p-3 bg-white border border-zinc-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-zinc-800">{docName}</span>
                          {r.page_number != null && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              p.{r.page_number}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-600 mt-1 truncate">{snippet}…</p>
                      </button>
                    )
                  })}
                </div>
              )}
              {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
                <p className="text-sm text-zinc-500">검색 결과가 없습니다. 문서 업로드 후 청킹이 완료된 문서만 검색됩니다.</p>
              )}
            </div>
          )}

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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-700">
                    분석 이력 ({analysisHistory.length}개)
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareModalOpen(true)
                      setCompareSelectLeft(analysisHistory[0]?.id ?? '')
                      setCompareSelectRight(analysisHistory[1]?.id ?? analysisHistory[0]?.id ?? '')
                    }}
                    disabled={analysisHistory.length < 2}
                    title={analysisHistory.length < 2 ? '분석이 2개 이상일 때 비교할 수 있습니다' : '두 분석을 나란히 비교합니다'}
                    className="px-3 py-1.5 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📊 분석 비교
                  </button>
                </div>
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

              {compareModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md">
                    <h3 className="text-lg font-semibold mb-4">분석 비교</h3>
                    <p className="text-sm text-zinc-600 mb-4">
                      비교할 분석 2개를 선택하세요.
                    </p>
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          첫 번째 분석
                        </label>
                        <select
                          value={compareSelectLeft}
                          onChange={(e) => setCompareSelectLeft(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {analysisHistory.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.title || new Date(a.created_at).toLocaleString('ko-KR')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          두 번째 분석
                        </label>
                        <select
                          value={compareSelectRight}
                          onChange={(e) => setCompareSelectRight(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {analysisHistory.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.title || new Date(a.created_at).toLocaleString('ko-KR')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setCompareModalOpen(false)}
                        className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (compareSelectLeft && compareSelectRight && compareSelectLeft !== compareSelectRight) {
                            const left = analysisHistory.find((a) => a.id === compareSelectLeft)
                            const right = analysisHistory.find((a) => a.id === compareSelectRight)
                            if (left && right) {
                              setCompareLeft(left)
                              setCompareRight(right)
                              setCompareModalOpen(false)
                            }
                          } else {
                            alert('서로 다른 분석 2개를 선택해주세요.')
                          }
                        }}
                        disabled={!compareSelectLeft || !compareSelectRight || compareSelectLeft === compareSelectRight}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        비교 보기
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {compareLeft && compareRight && (
                <div className="mt-6">
                  <AnalysisCompareView
                    left={compareLeft}
                    right={compareRight}
                    onClose={() => {
                      setCompareLeft(null)
                      setCompareRight(null)
                    }}
                  />
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
                      {analysisVerification && (
                        <p className="text-xs text-green-700 mt-1">
                          페이지 검증: {verificationSummary(analysisVerification)}
                        </p>
                      )}
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
                      <button
                        type="button"
                        onClick={handleDownloadReportPdf}
                        disabled={pdfDownloading}
                        className="px-4 py-2 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
                      >
                        {pdfDownloading ? 'PDF 생성 중...' : '리포트 PDF 다운로드'}
                      </button>
                      <button
                        type="button"
                        onClick={runPageVerification}
                        disabled={verificationLoading}
                        className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                        title="분석 결과의 페이지 번호가 원문 범위·내용과 맞는지 검증"
                      >
                        {verificationLoading ? '검증 중...' : '페이지 검증'}
                      </button>
                      <div className="relative" ref={promptDownloadRef}>
                        <button
                          type="button"
                          onClick={() => setPromptDownloadOpen((v) => !v)}
                          className="px-4 py-2 text-sm bg-slate-500 text-white rounded-md hover:bg-slate-600"
                        >
                          프롬프트 다운로드 ▾
                        </button>
                        {promptDownloadOpen && (
                          <div className="absolute top-full left-0 mt-1 py-1 bg-white border border-zinc-200 rounded-md shadow-lg z-10 min-w-[200px]">
                            {getPromptTemplates().map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleDownloadPrompt(item)}
                                className="block w-full text-left px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
                              >
                                {item.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={runEntityAnalysis}
                        disabled={isEntityAnalyzing}
                        className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isEntityAnalyzing ? '엔티티 분석 중...' : '엔티티 분석'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpinionStep('config')
                          setOpinionOutline('')
                          setOpinionMetaPrompt('')
                          setOpinionChunks([])
                          setOpinionResult(null)
                          setReferenceCandidates([])
                          setSelectedReferenceIds([])
                          setOpinionModalOpen(true)
                        }}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        의견서 작성
                      </button>
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
                              className="flex items-start gap-2 p-2 rounded-lg border border-zinc-100"
                            >
                              <span className="inline-block px-2 py-1 text-xs font-medium bg-zinc-100 text-zinc-700 rounded shrink-0">
                                {ev.type}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="text-zinc-700">{ev.description}</span>
                                {ev.page != null && (
                                  <div className="text-xs mt-0.5 flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openAnalysisPdf(ev.page, null)}
                                      className="text-blue-600 hover:underline cursor-pointer"
                                    >
                                      📄 p.{ev.page}
                                    </button>
                                    {analysisVerification?.evidence?.[i] != null && (
                                      <span
                                        title={
                                          analysisVerification.evidence[i].inRange && analysisVerification.evidence[i].contentMatch
                                            ? '원문 범위·내용 확인됨'
                                            : analysisVerification.evidence[i].inRange
                                              ? '범위 내, 원문 내용 미확인'
                                              : '페이지 범위 밖이거나 원문 없음'
                                        }
                                      >
                                        {analysisVerification.evidence[i].inRange && analysisVerification.evidence[i].contentMatch ? (
                                          <span className="text-green-600">✅</span>
                                        ) : (
                                          <span className="text-amber-600">⚠️</span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {ev.note && (
                                  <div className="mt-2 text-sm text-zinc-600 bg-blue-50/80 border-l-2 border-blue-200 pl-2 py-1 rounded-r">
                                    <span className="font-medium text-zinc-500">📝 메모</span>
                                    <p className="mt-0.5">{ev.note}</p>
                                  </div>
                                )}
                              </div>
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
                            (editedAnalysis?.favorable_facts || [])
                              .map((f) => (typeof f === 'object' && f?.fact != null ? f.fact : String(f)))
                              .join('\n') || ''
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
                          {(selectedAnalysis.result?.favorable_facts || []).map(
                            (fact, i) => {
                              const text = typeof fact === 'object' && fact?.fact != null ? fact.fact : String(fact)
                              const page = typeof fact === 'object' ? fact?.page : null
                              return (
                                <li key={i} className="text-zinc-700 flex items-center gap-2 flex-wrap">
                                  <span>{text}</span>
                                  {page != null && (
                                    <button
                                      type="button"
                                      onClick={() => openAnalysisPdf(page, null)}
                                      className="text-sm text-blue-600 hover:underline"
                                    >
                                      p.{page}
                                    </button>
                                  )}
                                </li>
                              )
                            }
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
                            onPageClick={openAnalysisPdf}
                            pageVerification={analysisVerification?.timeline}
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

                    {/* 엔티티 분석: 인물·장소·관계·증거물 */}
                    {!editingAnalysis && (
                      <div>
                        <h4 className="font-semibold mb-3 text-zinc-900">
                          엔티티 분석 (인물·장소·관계)
                        </h4>
                        {selectedAnalysis.result?.entities ? (
                          <div className="space-y-6">
                            {selectedAnalysis.result.entities.persons?.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-zinc-600 mb-2">인물</h5>
                                <div className="space-y-3">
                                  {selectedAnalysis.result.entities.persons.map((p, i) => (
                                    <div
                                      key={i}
                                      className="p-3 bg-white border border-zinc-200 rounded-lg"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="font-medium text-zinc-900">{p.name}</span>
                                        <span
                                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                                            p.role === '피고인'
                                              ? 'bg-red-100 text-red-800'
                                              : p.role === '피해자'
                                                ? 'bg-orange-100 text-orange-800'
                                                : p.role === '증인'
                                                  ? 'bg-blue-100 text-blue-800'
                                                  : 'bg-zinc-100 text-zinc-700'
                                          }`}
                                        >
                                          {p.role}
                                        </span>
                                        {p.aliases?.length > 0 && (
                                          <span className="text-xs text-zinc-500">
                                            ({p.aliases.join(', ')})
                                          </span>
                                        )}
                                      </div>
                                      {p.description && (
                                        <p className="text-sm text-zinc-600 mb-2">{p.description}</p>
                                      )}
                                      {p.key_statements?.length > 0 && (
                                        <div className="text-sm space-y-1">
                                          {p.key_statements.map((st, j) => (
                                            <div key={j} className="flex gap-2">
                                              <span className="text-zinc-500 shrink-0">
                                                {st.source ?? ''} p.{st.page}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => openAnalysisPdf(st.page, st.source)}
                                                className="text-blue-600 hover:underline text-left"
                                              >
                                                {st.content?.slice(0, 80)}
                                                {(st.content?.length ?? 0) > 80 ? '…' : ''}
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {p.credibility_notes && (
                                        <p className="text-xs text-zinc-500 mt-2 border-t border-zinc-100 pt-2">
                                          신빙성: {p.credibility_notes}
                                        </p>
                                      )}
                                      {p.pages?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {p.pages.map((pg) => (
                                            <button
                                              key={pg}
                                              type="button"
                                              onClick={() => openAnalysisPdf(pg, null)}
                                              className="text-xs px-1.5 py-0.5 bg-zinc-100 rounded hover:bg-zinc-200"
                                            >
                                              p.{pg}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedAnalysis.result.entities.relationships?.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-zinc-600 mb-2">관계</h5>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border border-zinc-200 rounded-lg">
                                    <thead>
                                      <tr className="bg-zinc-50">
                                        <th className="text-left p-2 border-b">인물1</th>
                                        <th className="text-left p-2 border-b">인물2</th>
                                        <th className="text-left p-2 border-b">관계</th>
                                        <th className="text-left p-2 border-b">설명</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedAnalysis.result.entities.relationships.map((r, i) => (
                                        <tr key={i} className="border-b border-zinc-100">
                                          <td className="p-2">{r.person1}</td>
                                          <td className="p-2">{r.person2}</td>
                                          <td className="p-2">{r.type}</td>
                                          <td className="p-2 text-zinc-600">{r.description}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            {selectedAnalysis.result.entities.locations?.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-zinc-600 mb-2">장소</h5>
                                <ul className="space-y-2">
                                  {selectedAnalysis.result.entities.locations.map((loc, i) => (
                                    <li
                                      key={i}
                                      className="flex flex-wrap items-center gap-2 text-sm p-2 bg-zinc-50 rounded"
                                    >
                                      <span className="font-medium">{loc.name}</span>
                                      <span className="px-1.5 py-0.5 text-xs bg-zinc-200 rounded">
                                        {loc.type}
                                      </span>
                                      {loc.related_events?.length > 0 && (
                                        <span className="text-zinc-600">
                                          {loc.related_events[0]}
                                        </span>
                                      )}
                                      {loc.pages?.length > 0 && (
                                        <span className="text-zinc-500">
                                          p.{loc.pages.join(', ')}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {selectedAnalysis.result.entities.evidence_items?.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-zinc-600 mb-2">증거물 (엔티티)</h5>
                                <div className="space-y-2">
                                  {selectedAnalysis.result.entities.evidence_items.map((ev, i) => (
                                    <div
                                      key={i}
                                      className="flex flex-wrap gap-2 items-start p-2 border border-zinc-100 rounded text-sm"
                                    >
                                      <span className="font-medium">{ev.name}</span>
                                      <span className="px-1.5 py-0.5 text-xs bg-zinc-100 rounded">
                                        {ev.type}
                                      </span>
                                      {ev.description && (
                                        <span className="text-zinc-600">{ev.description}</span>
                                      )}
                                      {ev.relevance && (
                                        <span className="text-zinc-500 text-xs">({ev.relevance})</span>
                                      )}
                                      {ev.pages?.length > 0 && (
                                        <span className="text-zinc-500">p.{ev.pages.join(', ')}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                            <p className="text-sm text-zinc-600 mb-3">
                              인물·장소·관계·증거물을 추출해 한눈에 볼 수 있습니다. 아래 버튼으로 분석을 실행하세요.
                            </p>
                            <button
                              type="button"
                              onClick={runEntityAnalysis}
                              disabled={isEntityAnalyzing}
                              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {isEntityAnalyzing ? '분석 중...' : '엔티티 분석 실행'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {!editingAnalysis && (
                      <div className="mt-8 p-4 bg-zinc-50 rounded-lg border">
                        <h4 className="font-semibold mb-3">
                          AI에게 수정 요청
                        </h4>
                        
                        {previousAnalysis && (
                          <div className="mb-4">
                            <button
                              type="button"
                              onClick={handleUndo}
                              className="px-4 py-2 text-sm bg-amber-100 text-amber-700 border border-amber-300 rounded-md hover:bg-amber-200 flex items-center gap-2"
                            >
                              <span>↩️</span>
                              <span>실행 취소 (이전 상태로 복원)</span>
                            </button>
                          </div>
                        )}
                        
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

      {/* 분석 참조 PDF 뷰어: 분석 상세 칸 밖, 화면 오른쪽 고정. 넓은 패널 + 페이지/확대 UI */}
      {analysisPdfViewer && (
        <div className="fixed top-0 right-0 bottom-0 w-[min(560px,55vw)] z-40 flex flex-col bg-white border-l-2 border-zinc-200 shadow-xl">
          {/* 상단바: 첫 번째 스크린샷처럼 페이지 표시 + 이동 + 확대/축소 + 닫기 */}
          <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-zinc-700 text-white">
            <span className="text-sm truncate min-w-0 flex-1" title={analysisPdfViewer.documentName}>
              {analysisPdfViewer.documentName}
            </span>
            <div className="flex items-center gap-1 shrink-0 border-l border-zinc-500 pl-2">
              <span className="text-xs text-zinc-400 mr-0.5">페이지</span>
              <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded bg-zinc-600 text-sm font-medium tabular-nums">
                {analysisPdfViewer.pageNumber}
              </span>
              <span className="text-zinc-500 mx-0.5">/</span>
              <span className="text-zinc-500 text-xs">?</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 border-l border-zinc-500 pl-2">
              <button
                type="button"
                onClick={() =>
                  setAnalysisPdfViewer((prev) =>
                    prev.pageNumber <= 1 ? prev : { ...prev, pageNumber: prev.pageNumber - 1 }
                  )
                }
                className="p-1.5 rounded hover:bg-zinc-600 text-white"
                title="이전 페이지"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() =>
                  setAnalysisPdfViewer((prev) => ({ ...prev, pageNumber: prev.pageNumber + 1 }))
                }
                className="p-1.5 rounded hover:bg-zinc-600 text-white"
                title="다음 페이지"
              >
                →
              </button>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 border-l border-zinc-500 pl-2">
              <button
                type="button"
                onClick={() => setAnalysisPdfZoom((z) => Math.max(50, z - 25))}
                className="p-1.5 rounded hover:bg-zinc-600 text-white font-medium"
                title="축소"
              >
                −
              </button>
              <span className="text-xs tabular-nums min-w-[2.5rem] text-center">{analysisPdfZoom}%</span>
              <button
                type="button"
                onClick={() => setAnalysisPdfZoom((z) => Math.min(200, z + 25))}
                className="p-1.5 rounded hover:bg-zinc-600 text-white font-medium"
                title="확대"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAnalysisPdfViewer(null)}
              className="p-1.5 rounded hover:bg-zinc-600 text-white shrink-0"
              title="닫기"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-zinc-100 flex flex-col">
            <iframe
              key={`${analysisPdfViewer.pageNumber}-${analysisPdfZoom}`}
              src={`${analysisPdfViewer.pdfUrl}#page=${analysisPdfViewer.pageNumber}&zoom=${analysisPdfZoom}`}
              className="w-full h-full min-h-0 border-0"
              style={{ height: 'calc(100vh - 48px)' }}
              title="분석 참조 PDF"
            />
          </div>
        </div>
      )}

      {opinionModalOpen && selectedAnalysis && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">의견서 작성</h3>
              <button
                type="button"
                onClick={() => setOpinionModalOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-700 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm text-zinc-500">
                1차: 목차·방향 생성 → 확인/수정 후 2차 작성 → 필요 시 3차·4차로 이어서 작성합니다.
              </p>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">의견서 종류</label>
                <select
                  value={opinionType}
                  onChange={(e) => setOpinionType(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(OPINION_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">1차 AI 모델 (목차·방향)</label>
                  <select
                    value={opinionModelPhase1}
                    onChange={(e) => setOpinionModelPhase1(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {OPINION_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">2~3차 AI 모델 (본문 작성)</label>
                  <select
                    value={opinionModelPhase2}
                    onChange={(e) => setOpinionModelPhase2(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {OPINION_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">추가 지시 (선택)</label>
                <textarea
                  value={opinionUserPrompt}
                  onChange={(e) => setOpinionUserPrompt(e.target.value)}
                  placeholder="예: 피고인의 반성 정도를 강조해 주세요"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                />
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-700">프롬프트에 넣을 참고자료</label>
                  <button
                    type="button"
                    onClick={fetchReferenceCandidates}
                    disabled={referenceCandidatesLoading}
                    className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {referenceCandidatesLoading ? '불러오는 중…' : '참고자료 후보 불러오기'}
                  </button>
                </div>
                {referenceCandidates.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-zinc-50">
                    <div className="flex gap-2 text-xs text-zinc-500 mb-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReferenceIds(referenceCandidates.map((c) => c.id))}
                        className="underline hover:text-indigo-600"
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedReferenceIds([])}
                        className="underline hover:text-indigo-600"
                      >
                        전체 해제
                      </button>
                      <span className="ml-2">
                        {selectedReferenceIds.length}개 선택됨
                      </span>
                    </div>
                    {referenceCandidates.map((c) => {
                      const meta = c.metadata || {}
                      const label = [meta.topic, meta.crime_type].filter(Boolean).join(' · ') || '참고자료'
                      return (
                        <label
                          key={c.id}
                          className="flex gap-2 p-2 bg-white border rounded cursor-pointer hover:bg-indigo-50/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedReferenceIds.includes(c.id)}
                            onChange={() => toggleReferenceId(c.id)}
                            className="mt-1 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium text-indigo-700">{label}</span>
                            <p className="text-sm text-zinc-700 mt-0.5 line-clamp-2">
                              {(c.content || '').slice(0, 180)}
                              {(c.content || '').length > 180 ? '…' : ''}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
                {referenceCandidates.length === 0 && !referenceCandidatesLoading && (
                  <p className="text-sm text-zinc-500">
                    「참고자료 후보 불러오기」를 누르면 이 의견서/분석에 맞는 참고자료를 검색합니다. 넣을 항목만 선택한 뒤 의견서를 생성하세요.
                  </p>
                )}
              </div>

              {(opinionStep === 'outline' || opinionStep === 'chunk') && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-medium text-zinc-800">1차 결과 (수정 가능)</h4>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">목차</label>
                    <textarea
                      value={opinionOutline}
                      onChange={(e) => setOpinionOutline(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none"
                      rows={4}
                      placeholder="목차"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">작성 AI용 지시문</label>
                    <textarea
                      value={opinionMetaPrompt}
                      onChange={(e) => setOpinionMetaPrompt(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none"
                      rows={5}
                      placeholder="2~3차 AI에게 전달할 지시문"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {opinionChunks.length === 0 && (
                      <button
                        type="button"
                        onClick={() => generateOpinionChunk(0)}
                        disabled={opinionGenerating || !opinionOutline.trim() || !opinionMetaPrompt.trim()}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {opinionGenerating ? '생성 중…' : '2차 작성'}
                      </button>
                    )}
                    {opinionChunks.length === 1 && (
                      <button
                        type="button"
                        onClick={() => generateOpinionChunk(1)}
                        disabled={opinionGenerating}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {opinionGenerating ? '생성 중…' : '3차 작성'}
                      </button>
                    )}
                    {opinionChunks.length === 2 && (
                      <button
                        type="button"
                        onClick={() => generateOpinionChunk(2)}
                        disabled={opinionGenerating}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {opinionGenerating ? '생성 중…' : '4차 작성'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {opinionResult && (
                <div className="border-t pt-4 space-y-2">
                  <h4 className="font-medium text-zinc-800">{opinionResult.title}</h4>
                  <div className="p-3 bg-zinc-50 rounded-lg text-sm text-zinc-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {opinionResult.body}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(opinionResult.body)
                      setToast({ message: '본문이 클립보드에 복사되었습니다.', type: 'success' })
                    }}
                    className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg hover:bg-zinc-100"
                  >
                    본문 복사
                  </button>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpinionModalOpen(false)}
                className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
              >
                닫기
              </button>
              {opinionStep === 'config' && (
                <button
                  type="button"
                  onClick={generateOpinionOutline}
                  disabled={opinionGenerating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {opinionGenerating ? '1차 생성 중…' : '1차: 목차·방향 생성'}
                </button>
              )}
              {(opinionStep === 'outline' || opinionStep === 'chunk') && (
                <button
                  type="button"
                  onClick={() => {
                    setOpinionStep('config')
                    setOpinionOutline('')
                    setOpinionMetaPrompt('')
                    setOpinionChunks([])
                    setOpinionResult(null)
                  }}
                  className="px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
                >
                  처음부터
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ChunkViewer
        isOpen={chunkViewerOpen}
        chunkId={chunkViewerChunkId}
        onClose={() => {
          setChunkViewerOpen(false)
          setChunkViewerChunkId(null)
          setChunkViewerPage(null)
          setChunkViewerHighlight('')
        }}
        pageNumber={chunkViewerPage}
        highlightKeyword={chunkViewerHighlight}
      />
    </div>
  )
}
