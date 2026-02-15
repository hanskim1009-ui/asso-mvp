'use client'

import { useState, useEffect } from 'react'

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function ChunkViewer({ isOpen, chunkId, onClose, pageNumber, highlightKeyword }) {
  const [chunkData, setChunkData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('ChunkViewer 열림!')
    console.log('받은 chunkId:', chunkId)
    console.log('isOpen:', isOpen)

    if (isOpen && chunkId) {
      loadChunk()
    }
  }, [isOpen, chunkId])

  async function loadChunk() {
    console.log('🚀 loadChunk 시작!')
    console.log('받은 pageNumber prop:', pageNumber)
    console.log('chunkId:', chunkId)

    setLoading(true)
    try {
      const res = await fetch(`/api/chunk/${chunkId}`)
      const data = await res.json()

      console.log('=== 청크 데이터 ===')
      console.log('data.page_number:', data.page_number)

      // pageNumber prop이 있으면 무조건 우선 사용
      if (pageNumber) {
        data.page_number = pageNumber
        console.log('✅ pageNumber prop 사용:', pageNumber)
      }

      setChunkData(data)
    } catch (err) {
      console.error('청크 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] m-4 flex">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : chunkData ? (
          <>
            <div className="w-1/2 flex flex-col border-r">
              <div className="p-4 border-b" style={{ backgroundColor: '#3b82f6' }}>
                <h3 className="font-semibold text-white">
                  {chunkData.documents?.original_file_name}
                </h3>
                <div className="mt-3 p-3 bg-white rounded-lg border-4 border-yellow-400">
                  <p className="text-4xl font-bold text-blue-600 text-center">
                    📍 페이지 {pageNumber || chunkData?.page_number || '?'}
                  </p>
                  <p className="text-sm text-center text-zinc-600 mt-2">
                    ↑ PDF에서 이 페이지를 찾으세요
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <iframe
                  src={
                    chunkData.documents?.pdf_url +
                    (pageNumber || chunkData?.page_number
                      ? `#page=${pageNumber ?? chunkData?.page_number ?? 1}`
                      : '')
                  }
                  className="w-full h-full border-0"
                  title="PDF"
                />
              </div>
            </div>

            <div className="w-1/2 flex flex-col">
              <div className="p-4 border-b bg-blue-50">
                <h3 className="font-semibold text-blue-900">관련 내용</h3>
                <p className="text-sm text-blue-700">
                  청크 #{chunkData.chunk_index + 1} · {chunkData.content_length}
                  자
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="prose prose-sm max-w-none">
                  <div
                    className="whitespace-pre-wrap p-4 rounded-lg leading-relaxed"
                    style={{
                      backgroundColor: '#fef3c7',
                      borderLeft: '4px solid #f59e0b',
                      boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: (() => {
                        let text = (chunkData.content || '')
                          .replace(/<[^>]*>/g, '')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&amp;/g, '&')
                        if (highlightKeyword && highlightKeyword.trim()) {
                          const escaped = escapeRegex(highlightKeyword.trim())
                          try {
                            text = text.replace(
                              new RegExp(escaped, 'gi'),
                              (match) => `<mark class="bg-yellow-300 rounded px-0.5">${match}</mark>`
                            )
                          } catch (_) {}
                        }
                        return text
                      })()
                    }}
                  />
                </div>
              </div>
              <div className="p-4 border-t flex gap-2 justify-end">
                <a
                  href={chunkData.documents?.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
                >
                  새 탭에서 열기
                </a>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm bg-zinc-100 rounded-md hover:bg-zinc-200"
                >
                  닫기 (ESC)
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600">청크를 찾을 수 없습니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
