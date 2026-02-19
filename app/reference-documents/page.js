"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { REFERENCE_MAX_CHUNK_SIZE } from '@/lib/chunkText'

export default function ReferenceDocumentsPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceDescription, setSourceDescription] = useState('')
  const [fullText, setFullText] = useState('')
  const [usePdf, setUsePdf] = useState(true)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfType, setPdfType] = useState('scanned')
  const [chunkSize, setChunkSize] = useState(3500)
  const [chunkBySections, setChunkBySections] = useState(true)
  const [singleChunk, setSingleChunk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('')
  const [actioningId, setActioningId] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadList()
  }, [])

  async function loadList() {
    setLoading(true)
    try {
      const res = await fetch('/api/reference-documents')
      const data = await res.json()
      if (res.ok) setList(Array.isArray(data) ? data : [])
      else setList([])
    } catch (_) {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!title.trim()) {
      setToast({ message: '제목을 입력하세요.', type: 'error' })
      return
    }
    if (usePdf) {
      if (!pdfFile) {
        setToast({ message: 'PDF 파일을 선택하세요.', type: 'error' })
        return
      }
      setSubmitting(true)
      setSubmitStatus('Upstage로 PDF 읽는 중…')
      try {
        const formData = new FormData()
        formData.append('document', pdfFile)
        formData.append('title', title.trim())
        formData.append('pdfType', pdfType)
        if (sourceDescription?.trim()) formData.append('source_description', sourceDescription.trim())
        formData.append('chunkSize', String(chunkSize))
        if (chunkBySections) formData.append('chunkBySections', 'true')
        if (singleChunk) formData.append('singleChunk', 'true')
        setSubmitStatus('청킹·임베딩·태깅 처리 중…')
        const res = await fetch('/api/reference-documents/ingest', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '등록 실패')
        setToast({
          message: `등록 완료. 청크 ${data.chunksCount ?? 0}개, 임베딩 ${data.embedded ?? 0}개, 태깅 ${data.tagged ?? 0}개.`,
          type: 'success',
        })
        setModalOpen(false)
        setTitle('')
        setSourceDescription('')
        setPdfFile(null)
        loadList()
      } catch (err) {
        setToast({ message: err.message || '등록 실패', type: 'error' })
      } finally {
        setSubmitting(false)
        setSubmitStatus('')
      }
      return
    }
    if (!fullText.trim()) {
      setToast({ message: '본문 텍스트를 입력하세요. (PDF에서 복사한 내용을 붙여넣을 수 있습니다.)', type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      const createRes = await fetch('/api/reference-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          source_description: sourceDescription.trim() || undefined,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || '등록 실패')
      const id = createData.id
      const chunkRes = await fetch(`/api/reference-documents/${id}/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullText: fullText.trim(),
          chunkSize,
          chunkBySections,
          singleChunk,
        }),
      })
      const chunkData = await chunkRes.json()
      if (!chunkRes.ok) throw new Error(chunkData.error || '청킹 실패')
      setToast({
        message: `등록되었습니다. 청크 ${chunkData.chunksCount ?? 0}개 생성. 이제 「태깅」과 「임베딩」을 순서대로 실행하세요.`,
        type: 'success',
      })
      setModalOpen(false)
      setTitle('')
      setSourceDescription('')
      setFullText('')
      loadList()
    } catch (err) {
      setToast({ message: err.message || '등록 실패', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function runTag(id) {
    setActioningId(id)
    try {
      const res = await fetch(`/api/reference-documents/${id}/tag`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '태깅 실패')
      setToast({ message: `태깅 완료: ${data.tagged ?? 0}개`, type: 'success' })
      loadList()
    } catch (err) {
      setToast({ message: err.message || '태깅 실패', type: 'error' })
    } finally {
      setActioningId(null)
    }
  }

  async function runEmbed(id) {
    setActioningId(id)
    try {
      const res = await fetch(`/api/reference-documents/${id}/embed`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '임베딩 실패')
      setToast({ message: `임베딩 완료: ${data.updated ?? 0}개`, type: 'success' })
      loadList()
    } catch (err) {
      setToast({ message: err.message || '임베딩 실패', type: 'error' })
    } finally {
      setActioningId(null)
    }
  }

  async function handleDelete(id, docTitle) {
    if (!confirm(`「${docTitle}」을(를) 삭제하시겠습니까?`)) return
    try {
      const res = await fetch(`/api/reference-documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      setToast({ message: '삭제되었습니다.', type: 'success' })
      loadList()
    } catch (err) {
      setToast({ message: err.message || '삭제 실패', type: 'error' })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="flex h-14 items-center justify-between px-6 bg-[#1e3a5f]">
        <Link href="/cases" className="text-xl font-bold text-white">
          ASSO
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/cases" className="text-white/90 hover:text-white text-sm">
            사건 목록
          </Link>
          <button
            type="button"
            onClick={() => {
              setModalOpen(true)
              setTitle('')
              setSourceDescription('')
              setFullText('')
              setPdfFile(null)
              setPdfType('scanned')
              setUsePdf(true)
            }}
            className="px-4 py-2 bg-white text-[#1e3a5f] rounded-md text-sm font-medium"
          >
            참고자료 추가
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-2">참고자료 관리</h1>
        <p className="text-zinc-600 text-sm mb-6">
          여기서 등록한 참고자료(양형기준표, 판례 등)는 의견서 작성 시 「참고자료 후보 불러오기」로 검색되어, 포함할 항목을 선택한 뒤 프롬프트에 넣을 수 있습니다.
        </p>

        {toast && (
          <div
            className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              toast.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}
          >
            {toast.message}
          </div>
        )}

        {loading ? (
          <p className="text-zinc-500">목록 불러오는 중...</p>
        ) : list.length === 0 ? (
          <div className="p-8 border border-dashed border-zinc-300 rounded-lg text-center text-zinc-500">
            <p className="mb-2">등록된 참고자료가 없습니다.</p>
            <p className="text-sm mb-4">「참고자료 추가」에서 PDF를 올리면 Upstage로 읽고 청킹·임베딩·태깅까지 자동 처리됩니다. 텍스트 붙여넣기로 등록한 경우에는 목록에서 태깅 → 임베딩을 실행하세요.</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              참고자료 추가
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((doc) => (
              <li
                key={doc.id}
                className="p-4 border border-zinc-200 rounded-lg flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-900 truncate">{doc.title}</div>
                  {doc.source_description && (
                    <div className="text-sm text-zinc-500 truncate mt-0.5">{doc.source_description}</div>
                  )}
                  <div className="text-xs text-zinc-400 mt-1">
                    등록일: {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/reference-documents/${doc.id}`}
                    className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                  >
                    청크/태깅 검증
                  </Link>
                  <button
                    type="button"
                    onClick={() => runTag(doc.id)}
                    disabled={actioningId !== null}
                    className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {actioningId === doc.id ? '처리 중…' : '태깅'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runEmbed(doc.id)}
                    disabled={actioningId !== null}
                    className="px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {actioningId === doc.id ? '처리 중…' : '임베딩'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.title)}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">참고자료 추가</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-700 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div className="flex gap-4 border-b border-zinc-200 pb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={usePdf}
                    onChange={() => setUsePdf(true)}
                    className="text-indigo-600"
                  />
                  <span className="text-sm font-medium">PDF 업로드 (자동 처리)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={!usePdf}
                    onChange={() => setUsePdf(false)}
                    className="text-indigo-600"
                  />
                  <span className="text-sm font-medium">텍스트 붙여넣기</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">제목 *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 대법원 양형기준표 - 절도"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">출처/설명 (선택)</label>
                <input
                  type="text"
                  value={sourceDescription}
                  onChange={(e) => setSourceDescription(e.target.value)}
                  placeholder="예: 대법원 2020년 양형기준"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {usePdf ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">PDF 유형</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="pdfType"
                          checked={pdfType === 'scanned'}
                          onChange={() => setPdfType('scanned')}
                          className="text-indigo-600"
                        />
                        <span className="text-sm">스캔본(이미지)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="pdfType"
                          checked={pdfType === 'digital'}
                          onChange={() => setPdfType('digital')}
                          className="text-indigo-600"
                        />
                        <span className="text-sm">디지털 원본(Word 등)</span>
                      </label>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      스캔본은 Upstage OCR로, 디지털 원본은 OCR 없이 텍스트만 추출합니다. 빠르고 비용 절감.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">PDF 파일 *</label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      {pdfType === 'digital'
                        ? 'PDF.js로 텍스트 추출 후 청킹·임베딩·태깅까지 자동 처리됩니다.'
                        : 'Upstage OCR 후 청킹·임베딩·태깅까지 자동 처리됩니다. 30초~2분 정도 걸릴 수 있습니다.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={singleChunk}
                        onChange={(e) => setSingleChunk(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-sm font-medium text-zinc-700">청킹 없음 (자료 전체를 하나의 청크로)</span>
                    </label>
                    <p className="text-xs text-zinc-500">선별·구분해서 올리는 판례·양형기준 등에 사용. 전체가 하나의 검색 단위로 들어갑니다.</p>
                  </div>
                  {!singleChunk && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">청크 크기 (글자 수)</label>
                        <input
                          type="number"
                          min={500}
                          max={REFERENCE_MAX_CHUNK_SIZE}
                          step={500}
                          value={chunkSize}
                          onChange={(e) => setChunkSize(Number(e.target.value) || 3500)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-zinc-500 mt-1">양형기준표는 3500~5000 권장. 작을수록 청크 많음.</p>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={chunkBySections}
                            onChange={(e) => setChunkBySections(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span className="text-sm">섹션 단위로 자르기 (제○장, ○. ○○죄, 가. 나. 다. 등)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">본문 텍스트 *</label>
                  <textarea
                    value={fullText}
                    onChange={(e) => setFullText(e.target.value)}
                    placeholder="PDF에서 복사한 텍스트나 참고할 내용을 붙여넣으세요."
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm"
                    rows={10}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    등록 후 청킹만 됩니다. 목록에서 「태깅」→「임베딩」을 순서대로 실행하면 의견서 작성 시 검색됩니다.
                  </p>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={singleChunk}
                        onChange={(e) => setSingleChunk(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-sm font-medium text-zinc-700">청킹 없음 (자료 전체를 하나의 청크로)</span>
                    </label>
                  </div>
                  {!singleChunk && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mt-2">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">청크 크기 (글자 수)</label>
                        <input
                          type="number"
                          min={500}
                          max={REFERENCE_MAX_CHUNK_SIZE}
                          step={500}
                          value={chunkSize}
                          onChange={(e) => setChunkSize(Number(e.target.value) || 3500)}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={chunkBySections}
                            onChange={(e) => setChunkBySections(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span className="text-sm">섹션 단위로 자르기</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? (submitStatus || '등록 중…') : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
