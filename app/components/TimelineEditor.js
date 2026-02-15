'use client'

import { useState, useEffect } from 'react'

export default function TimelineEditor({ timeline = [], onChange }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    setItems(timeline || [])
  }, [timeline])

  const addItem = () => {
    const newItems = [...items, { date: '', event: '', source: '' }]
    setItems(newItems)
    onChange(newItems)
  }

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index)
    setItems(newItems)
    onChange(newItems)
  }

  const updateItem = (index, field, value) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
    onChange(newItems)
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="p-3 bg-zinc-50 rounded-lg border space-y-2">
          <div className="grid grid-cols-12 gap-3 items-start">
            <input
              type="text"
              value={item.date || ''}
              onChange={(e) => updateItem(idx, 'date', e.target.value)}
              placeholder="날짜 (예: 2022-11-01)"
              className="col-span-3 px-3 py-2 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <input
              type="text"
              value={item.event || ''}
              onChange={(e) => updateItem(idx, 'event', e.target.value)}
              placeholder="이벤트"
              className="col-span-5 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <input
              type="text"
              value={item.source || ''}
              onChange={(e) => updateItem(idx, 'source', e.target.value)}
              placeholder="출처"
              className="col-span-3 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={() => removeItem(idx)}
              className="col-span-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm"
            >
              ✕
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">메모 (선택)</label>
            <textarea
              value={item.note || ''}
              onChange={(e) => updateItem(idx, 'note', e.target.value)}
              placeholder="이 이벤트에 대한 메모 (예: 재판에서 강조할 부분)"
              className="w-full px-3 py-2 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              rows={2}
            />
          </div>
        </div>
      ))}

      <button
        onClick={addItem}
        className="w-full px-4 py-2 border-2 border-dashed border-zinc-300 rounded-md text-sm text-zinc-600 hover:border-blue-400 hover:text-blue-600"
      >
        + 이벤트 추가
      </button>
    </div>
  )
}
