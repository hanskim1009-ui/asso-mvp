"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const CONTENT_PREVIEW_LEN = 120

export default function ReferenceDocumentDetailPage() {
  const params = useParams()
  const id = params.id
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedChunkId, setExpandedChunkId] = useState(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/reference-documents/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error)
          else setDoc(data)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="flex h-14 items-center px-6 bg-[#1e3a5f]">
          <Link href="/reference-documents" className="text-xl font-bold text-white">
            ASSO
          </Link>
        </header>
        <main className="flex-1 px-6 py-8 flex items-center justify-center">
          <p className="text-zinc-500">불러오는 중...</p>
        </main>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="flex h-14 items-center px-6 bg-[#1e3a5f]">
          <Link href="/reference-documents" className="text-xl font-bold text-white">
            ASSO
          </Link>
        </header>
        <main className="flex-1 px-6 py-8">
          <p className="text-red-600">{error || '참고자료를 찾을 수 없습니다.'}</p>
          <Link href="/reference-documents" className="mt-4 inline-block text-indigo-600 hover:underline">
            ← 목록으로
          </Link>
        </main>
      </div>
    )
  }

  const chunks = doc.chunks || []
  const withEmbedding = chunks.filter((c) => c.has_embedding).length
  const withMetadata = chunks.filter((c) => c.metadata && Object.keys(c.metadata).length > 0).length

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="flex h-14 items-center justify-between px-6 bg-[#1e3a5f]">
        <Link href="/reference-documents" className="text-xl font-bold text-white">
          ASSO
        </Link>
        <Link href="/reference-documents" className="text-white/90 hover:text-white text-sm">
          ← 참고자료 목록
        </Link>
      </header>

      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">{doc.title}</h1>
          {doc.source_description && (
            <p className="text-zinc-500 text-sm mt-1">{doc.source_description}</p>
          )}
          <p className="text-zinc-400 text-xs mt-2">
            등록일: {doc.created_at ? new Date(doc.created_at).toLocaleDateString('ko-KR') : '-'}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <span className="px-3 py-1.5 bg-zinc-100 text-zinc-700 rounded-lg">
            청크 {chunks.length}개
          </span>
          <span
            className={`px-3 py-1.5 rounded-lg ${
              withEmbedding === chunks.length && chunks.length > 0
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            임베딩 있음 {withEmbedding}/{chunks.length}
          </span>
          <span
            className={`px-3 py-1.5 rounded-lg ${
              withMetadata === chunks.length && chunks.length > 0
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            태깅 있음 {withMetadata}/{chunks.length}
          </span>
        </div>

        <p className="text-sm text-zinc-600 mb-4">
          아래에서 청킹된 내용, AI 태깅(주제·범죄유형·요약), 임베딩 여부를 확인할 수 있습니다.
        </p>

        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-100 border-b border-zinc-200">
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700 w-12">#</th>
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700 w-16">페이지</th>
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700">청킹 내용</th>
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700 w-40">태깅 (topic · crime_type)</th>
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700 w-48">태깅 (summary · keywords)</th>
                  <th className="text-left py-3 px-3 font-semibold text-zinc-700 w-24">임베딩</th>
                </tr>
              </thead>
              <tbody>
                {chunks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      청크가 없습니다. 참고자료 추가 후 청킹·태깅·임베딩을 실행하세요.
                    </td>
                  </tr>
                ) : (
                  chunks.map((c) => {
                    const meta = c.metadata || {}
                    const isExpanded = expandedChunkId === c.id
                    const contentPreview =
                      (c.content || '').length <= CONTENT_PREVIEW_LEN
                        ? c.content
                        : (c.content || '').slice(0, CONTENT_PREVIEW_LEN) + '…'
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-zinc-100 hover:bg-zinc-50/50"
                      >
                        <td className="py-2 px-3 text-zinc-600">{c.chunk_index + 1}</td>
                        <td className="py-2 px-3 text-zinc-600">{c.page_number ?? '—'}</td>
                        <td className="py-2 px-3">
                          <div className="max-w-md">
                            <span className="text-zinc-800 whitespace-pre-wrap break-words">
                              {isExpanded ? c.content : contentPreview}
                            </span>
                            {(c.content || '').length > CONTENT_PREVIEW_LEN && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedChunkId(isExpanded ? null : c.id)
                                }
                                className="ml-1 text-indigo-600 text-xs hover:underline"
                              >
                                {isExpanded ? '접기' : '더 보기'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-zinc-700">
                          {meta.topic || meta.crime_type ? (
                            <span>
                              {[meta.topic, meta.crime_type].filter(Boolean).join(' · ') || '—'}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-zinc-700">
                          {meta.summary && (
                            <div className="text-zinc-800">{meta.summary}</div>
                          )}
                          {meta.keywords && Array.isArray(meta.keywords) && meta.keywords.length > 0 && (
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {meta.keywords.join(', ')}
                            </div>
                          )}
                          {!meta.summary && (!meta.keywords || !meta.keywords.length) && (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {c.has_embedding ? (
                            <span className="text-green-600 font-medium">있음</span>
                          ) : (
                            <span className="text-amber-600">없음</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
