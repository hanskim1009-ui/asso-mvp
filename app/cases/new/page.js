"use client"

import { useState } from 'react'
import { createCase } from '@/lib/database'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCasePage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    caseName: '',
    caseNumber: '',
    clientName: '',
    caseType: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!formData.caseName) {
      alert('사건명을 입력하세요')
      return
    }

    setSaving(true)
    try {
      const caseId = await createCase(formData)
      router.push(`/cases/${caseId}`)
    } catch (err) {
      alert('사건 생성 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 헤더 */}
      <header className="flex h-14 items-center px-6 bg-[#1e3a5f]">
        <Link href="/cases" className="text-xl font-bold text-white">
          ASSO
        </Link>
      </header>

      {/* 메인 */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">새 사건 만들기</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                사건명 *
              </label>
              <input
                type="text"
                value={formData.caseName}
                onChange={(e) =>
                  setFormData({ ...formData, caseName: e.target.value })
                }
                placeholder="예: 김주원 폭행 사건"
                className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                사건번호
              </label>
              <input
                type="text"
                value={formData.caseNumber}
                onChange={(e) =>
                  setFormData({ ...formData, caseNumber: e.target.value })
                }
                placeholder="예: 2022고단1234"
                className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                의뢰인
              </label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) =>
                  setFormData({ ...formData, clientName: e.target.value })
                }
                placeholder="예: 김주원"
                className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                사건 유형
              </label>
              <select
                value={formData.caseType}
                onChange={(e) =>
                  setFormData({ ...formData, caseType: e.target.value })
                }
                className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택하세요</option>
                <option value="폭행">폭행</option>
                <option value="절도">절도</option>
                <option value="사기">사기</option>
                <option value="횡령">횡령</option>
                <option value="성범죄">성범죄</option>
                <option value="마약">마약</option>
                <option value="교통">교통</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                사건 설명
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="사건의 간단한 개요를 입력하세요"
                className="w-full p-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '생성 중...' : '사건 생성'}
              </button>
              <Link
                href="/cases"
                className="px-6 py-3 border border-zinc-300 rounded-md hover:bg-zinc-50 text-center"
              >
                취소
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
