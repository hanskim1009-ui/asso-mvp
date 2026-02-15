'use client'

import { useState, useMemo } from 'react'
import * as Diff from 'diff'

/**
 * 두 분석 결과를 나란히 비교하는 뷰
 * left, right: { id, title, created_at, result }
 */
export default function AnalysisCompareView({ left, right, onClose }) {
  const [highlightDiff, setHighlightDiff] = useState(true)

  if (!left?.result || !right?.result) return null

  const rLeft = left.result
  const rRight = right.result

  // 만들어진 시간순: 이전 = older, 이후 = newer → 삭제됨/추가됨은 항상 이 기준
  const olderAnalysis = new Date(left.created_at) <= new Date(right.created_at) ? left : right
  const newerAnalysis = olderAnalysis.id === left.id ? right : left
  const olderResult = olderAnalysis.result
  const newerResult = newerAnalysis.result

  /** 텍스트 diff: 이전(삭제 강조), 이후(추가 강조). 항상 시간순으로 비교 */
  function renderTextDiff(oldText, newText) {
    if (!highlightDiff || oldText === newText) {
      return {
        oldRendered: oldText || '—',
        newRendered: newText || '—',
      }
    }
    const changes = Diff.diffWords((oldText || '').trim(), (newText || '').trim())
    const oldParts = []
    const newParts = []
    changes.forEach((part) => {
      const value = part.value
      if (part.added) {
        newParts.push(<span key={oldParts.length + newParts.length} className="bg-green-200 text-green-900 rounded px-0.5">{value}</span>)
      } else if (part.removed) {
        oldParts.push(<span key={oldParts.length + newParts.length} className="bg-red-100 text-red-800 line-through rounded px-0.5">{value}</span>)
      } else {
        oldParts.push(<span key={`o-${oldParts.length + newParts.length}`}>{value}</span>)
        newParts.push(<span key={`n-${oldParts.length + newParts.length}`}>{value}</span>)
      }
    })
    return {
      oldRendered: oldParts.length ? oldParts : '—',
      newRendered: newParts.length ? newParts : '—',
    }
  }

  /** 리스트 항목 차이: 시간순 기준. older 열 = 삭제됨(onlyInOlder), newer 열 = 추가됨(onlyInNewer) */
  function listDiffStatus(olderArr, newerArr, idx, columnRole) {
    const O = (olderArr || []).map((s) => (typeof s === 'string' ? s : JSON.stringify(s)).trim())
    const N = (newerArr || []).map((s) => (typeof s === 'string' ? s : JSON.stringify(s)).trim())
    if (columnRole === 'older') {
      const s = O[idx]
      if (s == null) return null
      return N.includes(s) ? 'same' : 'onlyInOlder'
    }
    const s = N[idx]
    if (s == null) return null
    return O.includes(s) ? 'same' : 'onlyInNewer'
  }

  const summaryDiff = useMemo(
    () => renderTextDiff(olderResult.summary, newerResult.summary),
    [olderResult.summary, newerResult.summary, highlightDiff]
  )

  const Section = ({ title, children }) => (
    <div className="mb-6">
      <h4 className="font-semibold text-zinc-800 mb-2 text-sm border-b border-zinc-200 pb-1">
        {title}
      </h4>
      {children}
    </div>
  )

  const Col = ({ analysis, result }) => (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="mb-2 px-2 py-1.5 rounded bg-zinc-100 text-zinc-700 text-sm font-medium truncate" title={analysis.title}>
        {analysis.title || '제목 없음'}
      </div>
      <div className="text-xs text-zinc-500 mb-3">
        {new Date(analysis.created_at).toLocaleString('ko-KR')}
      </div>
      <div className="flex-1 overflow-auto">{result}</div>
    </div>
  )

  return (
    <div className="border-2 border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-100 border-b border-blue-200 flex-wrap gap-2">
        <h3 className="font-semibold text-blue-900">📊 분석 비교</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-blue-900 cursor-pointer">
            <input
              type="checkbox"
              checked={highlightDiff}
              onChange={(e) => setHighlightDiff(e.target.checked)}
              className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
            />
            <span>차이 강조</span>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
          >
            비교 닫기
          </button>
        </div>
      </div>

      <div className="p-4 max-h-[70vh] overflow-auto">
        {/* 요약: 시간순(이전/이후) 기준으로 삭제·추가 강조 */}
        <Section title="사건 요약">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <p className="text-zinc-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {left.id === olderAnalysis.id ? summaryDiff.oldRendered : summaryDiff.newRendered}
                </p>
              }
            />
            <Col
              analysis={right}
              result={
                <p className="text-zinc-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {right.id === olderAnalysis.id ? summaryDiff.oldRendered : summaryDiff.newRendered}
                </p>
              }
            />
          </div>
        </Section>

        {/* 쟁점: 시간순 기준 삭제됨(이전에만) / 추가됨(이후에만) */}
        <Section title="주요 쟁점">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                  {(rLeft.issues || []).length
                    ? (rLeft.issues || []).map((s, i) => {
                        const isOlderCol = left.id === olderAnalysis.id
                        const st = highlightDiff ? listDiffStatus(olderResult.issues, newerResult.issues, i, isOlderCol ? 'older' : 'newer') : 'same'
                        return (
                          <li
                            key={i}
                            className={st === 'onlyInOlder' ? 'bg-red-50 text-red-800 rounded px-1 -mx-1' : st === 'onlyInNewer' ? 'bg-green-50 text-green-800 rounded px-1 -mx-1' : ''}
                          >
                            {s}
                            {st === 'onlyInOlder' && <span className="ml-1 text-xs text-red-600">(삭제됨)</span>}
                            {st === 'onlyInNewer' && <span className="ml-1 text-xs text-green-600">(추가됨)</span>}
                          </li>
                        )
                      })
                    : '—'}
                </ul>
              }
            />
            <Col
              analysis={right}
              result={
                <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                  {(rRight.issues || []).length
                    ? (rRight.issues || []).map((s, i) => {
                        const isOlderCol = right.id === olderAnalysis.id
                        const st = highlightDiff ? listDiffStatus(olderResult.issues, newerResult.issues, i, isOlderCol ? 'older' : 'newer') : 'same'
                        return (
                          <li
                            key={i}
                            className={st === 'onlyInOlder' ? 'bg-red-50 text-red-800 rounded px-1 -mx-1' : st === 'onlyInNewer' ? 'bg-green-50 text-green-800 rounded px-1 -mx-1' : ''}
                          >
                            {s}
                            {st === 'onlyInOlder' && <span className="ml-1 text-xs text-red-600">(삭제됨)</span>}
                            {st === 'onlyInNewer' && <span className="ml-1 text-xs text-green-600">(추가됨)</span>}
                          </li>
                        )
                      })
                    : '—'}
                </ul>
              }
            />
          </div>
        </Section>

        {/* 타임라인: 시간순 기준 삭제됨(이전에만) / 추가됨(이후에만) / 수정됨 */}
        <Section title="타임라인">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <div className="space-y-2 text-sm">
                  {(rLeft.timeline || []).length ? (
                    (rLeft.timeline || []).map((e, i) => {
                      const otherEv = (rRight.timeline || [])[i]
                      const isOlderCol = left.id === olderAnalysis.id
                      const noOther = highlightDiff && !otherEv
                      const contentDiff = highlightDiff && otherEv && (e.event || '') !== (otherEv.event || '')
                      const badge = noOther ? (isOlderCol ? '삭제됨' : '추가됨') : contentDiff ? '수정됨' : null
                      return (
                        <div
                          key={i}
                          className={`p-2 rounded border ${badge === '삭제됨' ? 'bg-red-50 border-red-200' : badge === '추가됨' ? 'bg-green-50 border-green-200' : badge === '수정됨' ? 'bg-amber-50 border-amber-200' : 'bg-white border-zinc-100'}`}
                        >
                          {badge && (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge === '삭제됨' ? 'bg-red-200 text-red-800' : badge === '추가됨' ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'}`}>
                              {badge}
                            </span>
                          )}
                          <div className="text-zinc-500 text-xs mt-1">
                            {e.date || '날짜 없음'}
                            {e.page && ` · p.${e.page}`}
                          </div>
                          <p className="text-zinc-800 mt-0.5">{e.event || '—'}</p>
                          {e.note && (
                            <p className="text-zinc-500 text-xs mt-1 border-l-2 border-blue-200 pl-2">
                              📝 {e.note}
                            </p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
            <Col
              analysis={right}
              result={
                <div className="space-y-2 text-sm">
                  {(rRight.timeline || []).length ? (
                    (rRight.timeline || []).map((e, i) => {
                      const otherEv = (rLeft.timeline || [])[i]
                      const isOlderCol = right.id === olderAnalysis.id
                      const noOther = highlightDiff && !otherEv
                      const contentDiff = highlightDiff && otherEv && (otherEv.event || '') !== (e.event || '')
                      const badge = noOther ? (isOlderCol ? '삭제됨' : '추가됨') : contentDiff ? '수정됨' : null
                      return (
                        <div
                          key={i}
                          className={`p-2 rounded border ${badge === '삭제됨' ? 'bg-red-50 border-red-200' : badge === '추가됨' ? 'bg-green-50 border-green-200' : badge === '수정됨' ? 'bg-amber-50 border-amber-200' : 'bg-white border-zinc-100'}`}
                        >
                          {badge && (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge === '삭제됨' ? 'bg-red-200 text-red-800' : badge === '추가됨' ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'}`}>
                              {badge}
                            </span>
                          )}
                          <div className="text-zinc-500 text-xs mt-1">
                            {e.date || '날짜 없음'}
                            {e.page && ` · p.${e.page}`}
                          </div>
                          <p className="text-zinc-800 mt-0.5">{e.event || '—'}</p>
                          {e.note && (
                            <p className="text-zinc-500 text-xs mt-1 border-l-2 border-blue-200 pl-2">
                              📝 {e.note}
                            </p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
          </div>
        </Section>

        {/* 증거: 시간순 기준 삭제됨/추가됨/수정됨 */}
        <Section title="증거 목록">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <div className="space-y-2 text-sm">
                  {(rLeft.evidence || []).length ? (
                    (rLeft.evidence || []).map((ev, i) => {
                      const otherEv = (rRight.evidence || [])[i]
                      const isOlderCol = left.id === olderAnalysis.id
                      const noOther = highlightDiff && !otherEv
                      const contentDiff = highlightDiff && otherEv && (ev.description || '') !== (otherEv.description || '')
                      const badge = noOther ? (isOlderCol ? '삭제됨' : '추가됨') : contentDiff ? '수정됨' : null
                      return (
                        <div
                          key={i}
                          className={`p-2 rounded border flex gap-2 flex-wrap ${badge === '삭제됨' ? 'bg-red-50 border-red-200' : badge === '추가됨' ? 'bg-green-50 border-green-200' : badge === '수정됨' ? 'bg-amber-50 border-amber-200' : 'bg-white border-zinc-100'}`}
                        >
                          {badge && (
                            <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${badge === '삭제됨' ? 'bg-red-200 text-red-800' : badge === '추가됨' ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'}`}>
                              {badge}
                            </span>
                          )}
                          <span className="shrink-0 px-1.5 py-0.5 text-xs bg-zinc-100 rounded">
                            {ev.type}
                          </span>
                          <span className="text-zinc-700 flex-1">{ev.description || '—'}</span>
                          {ev.page && <span className="text-blue-600 text-xs">p.{ev.page}</span>}
                          {ev.note && (
                            <p className="text-zinc-500 text-xs w-full mt-1 border-l-2 border-blue-200 pl-2">
                              📝 {ev.note}
                            </p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
            <Col
              analysis={right}
              result={
                <div className="space-y-2 text-sm">
                  {(rRight.evidence || []).length ? (
                    (rRight.evidence || []).map((ev, i) => {
                      const otherEv = (rLeft.evidence || [])[i]
                      const isOlderCol = right.id === olderAnalysis.id
                      const noOther = highlightDiff && !otherEv
                      const contentDiff = highlightDiff && otherEv && (otherEv.description || '') !== (ev.description || '')
                      const badge = noOther ? (isOlderCol ? '삭제됨' : '추가됨') : contentDiff ? '수정됨' : null
                      return (
                        <div
                          key={i}
                          className={`p-2 rounded border flex gap-2 flex-wrap ${badge === '삭제됨' ? 'bg-red-50 border-red-200' : badge === '추가됨' ? 'bg-green-50 border-green-200' : badge === '수정됨' ? 'bg-amber-50 border-amber-200' : 'bg-white border-zinc-100'}`}
                        >
                          {badge && (
                            <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${badge === '삭제됨' ? 'bg-red-200 text-red-800' : badge === '추가됨' ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'}`}>
                              {badge}
                            </span>
                          )}
                          <span className="shrink-0 px-1.5 py-0.5 text-xs bg-zinc-100 rounded">
                            {ev.type}
                          </span>
                          <span className="text-zinc-700 flex-1">{ev.description || '—'}</span>
                          {ev.page && <span className="text-blue-600 text-xs">p.{ev.page}</span>}
                          {ev.note && (
                            <p className="text-zinc-500 text-xs w-full mt-1 border-l-2 border-blue-200 pl-2">
                              📝 {ev.note}
                            </p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
          </div>
        </Section>

        {/* 유리한 정황: 시간순 기준 삭제됨/추가됨 */}
        <Section title="유리한 정황">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                  {(rLeft.favorable_facts || []).length
                    ? (rLeft.favorable_facts || []).map((s, i) => {
                        const isOlderCol = left.id === olderAnalysis.id
                        const st = highlightDiff ? listDiffStatus(olderResult.favorable_facts, newerResult.favorable_facts, i, isOlderCol ? 'older' : 'newer') : 'same'
                        return (
                          <li
                            key={i}
                            className={st === 'onlyInOlder' ? 'bg-red-50 text-red-800 rounded px-1 -mx-1' : st === 'onlyInNewer' ? 'bg-green-50 text-green-800 rounded px-1 -mx-1' : ''}
                          >
                            {s}
                            {st === 'onlyInOlder' && <span className="ml-1 text-xs text-red-600">(삭제됨)</span>}
                            {st === 'onlyInNewer' && <span className="ml-1 text-xs text-green-600">(추가됨)</span>}
                          </li>
                        )
                      })
                    : '—'}
                </ul>
              }
            />
            <Col
              analysis={right}
              result={
                <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                  {(rRight.favorable_facts || []).length
                    ? (rRight.favorable_facts || []).map((s, i) => {
                        const isOlderCol = right.id === olderAnalysis.id
                        const st = highlightDiff ? listDiffStatus(olderResult.favorable_facts, newerResult.favorable_facts, i, isOlderCol ? 'older' : 'newer') : 'same'
                        return (
                          <li
                            key={i}
                            className={st === 'onlyInOlder' ? 'bg-red-50 text-red-800 rounded px-1 -mx-1' : st === 'onlyInNewer' ? 'bg-green-50 text-green-800 rounded px-1 -mx-1' : ''}
                          >
                            {s}
                            {st === 'onlyInOlder' && <span className="ml-1 text-xs text-red-600">(삭제됨)</span>}
                            {st === 'onlyInNewer' && <span className="ml-1 text-xs text-green-600">(추가됨)</span>}
                          </li>
                        )
                      })
                    : '—'}
                </ul>
              }
            />
          </div>
        </Section>

        {/* 모순점 */}
        <Section title="발견된 모순점">
          <div className="grid grid-cols-2 gap-4">
            <Col
              analysis={left}
              result={
                <div className="space-y-2 text-sm">
                  {(rLeft.contradictions || []).length ? (
                    (rLeft.contradictions || []).map((c, i) => (
                      <div key={i} className="p-2 bg-amber-50 rounded border border-amber-100">
                        <p className="text-zinc-700"><strong>진술 1:</strong> {c.statement_1}</p>
                        <p className="text-zinc-700 mt-1"><strong>진술 2:</strong> {c.statement_2}</p>
                        <p className="text-amber-800 mt-1 text-xs"><strong>분석:</strong> {c.analysis}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
            <Col
              analysis={right}
              result={
                <div className="space-y-2 text-sm">
                  {(rRight.contradictions || []).length ? (
                    (rRight.contradictions || []).map((c, i) => (
                      <div key={i} className="p-2 bg-amber-50 rounded border border-amber-100">
                        <p className="text-zinc-700"><strong>진술 1:</strong> {c.statement_1}</p>
                        <p className="text-zinc-700 mt-1"><strong>진술 2:</strong> {c.statement_2}</p>
                        <p className="text-amber-800 mt-1 text-xs"><strong>분석:</strong> {c.analysis}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-500">—</p>
                  )}
                </div>
              }
            />
          </div>
        </Section>
      </div>
    </div>
  )
}
