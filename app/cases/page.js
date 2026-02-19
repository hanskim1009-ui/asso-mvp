"use client"

import { useState, useEffect } from 'react'
import { getAllCases, deleteCase } from '@/lib/database'
import Link from 'next/link'
import EmptyState from '@/app/components/EmptyState'
import { useRouter } from 'next/navigation'

export default function CasesPage() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadCases()
  }, [])

  async function loadCases() {
    try {
      const data = await getAllCases()
      setCases(data)
    } catch (err) {
      alert('사건 목록 로드 실패: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(caseId) {
    if (!confirm('이 사건을 삭제하시겠습니까?')) return

    try {
      await deleteCase(caseId)
      setCases(cases.filter((c) => c.id !== caseId))
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 헤더 */}
      <header className="flex h-14 items-center justify-between px-6 bg-[#1e3a5f]">
        <Link href="/" className="text-xl font-bold text-white">
          ASSO
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/reference-documents"
            className="text-white/90 hover:text-white text-sm"
          >
            참고자료 관리
          </Link>
          <Link
            href="/cases/new"
            className="px-4 py-2 bg-white text-[#1e3a5f] rounded-md text-sm font-medium"
          >
            새 사건 만들기
          </Link>
        </div>
      </header>

      {/* 메인 */}
      <main className="flex-1 px-6 py-8">
        <h1 className="text-3xl font-bold mb-8">사건 목록</h1>

        {loading ? (
          <p>로딩 중...</p>
        ) : cases.length === 0 ? (
          <EmptyState
            icon="📁"
            title="사건이 없습니다"
            description="첫 번째 사건을 만들어 문서 분석을 시작하세요."
            action={
              <Link
                href="/cases/new"
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                새 사건 만들기
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4">
            {cases.map((c) => (
              <div
                key={c.id}
                className="p-6 border rounded-lg hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2">{c.case_name}</h2>
                    {c.case_number && (
                      <p className="text-sm text-zinc-600 mb-1">
                        사건번호: {c.case_number}
                      </p>
                    )}
                    {c.client_name && (
                      <p className="text-sm text-zinc-600 mb-1">
                        의뢰인: {c.client_name}
                      </p>
                    )}
                    {c.case_type && (
                      <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                        {c.case_type}
                      </span>
                    )}
                    <p className="text-xs text-zinc-500 mt-2">
                      생성: {new Date(c.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/cases/${c.id}`}
                      className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
                    >
                      보기
                    </Link>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="px-4 py-2 text-sm border border-red-600 text-red-600 rounded-md hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
