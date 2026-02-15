'use client'

import { useState } from 'react'

export default function EvidenceEditor({ evidence = [], onChange }) {
  const [items, setItems] = useState(evidence)

  const addItem = () => {
    const newItems = [...items, { type: '서증', description: '' }]
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
        <div
          key={idx}
          className="flex gap-3 items-start p-3 bg-zinc-50 rounded-lg border"
        >
          <select
            value={item.type}
            onChange={(e) => updateItem(idx, 'type', e.target.value)}
            className="px-3 py-2 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="물증">물증</option>
            <option value="인증">인증</option>
            <option value="서증">서증</option>
          </select>

          <div className="flex-1 flex flex-col">
            <input
              type="text"
              value={item.description}
              onChange={(e) => updateItem(idx, 'description', e.target.value)}
              placeholder="증거 설명"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {item.page && (
              <div className="text-xs text-blue-600 mt-1">
                📄 p.{item.page}
              </div>
            )}
          </div>

          <button
            onClick={() => removeItem(idx)}
            className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
          >
            삭제
          </button>
        </div>
      ))}

      <button
        onClick={addItem}
        className="w-full px-4 py-2 border-2 border-dashed border-zinc-300 rounded-md text-zinc-600 hover:border-blue-400 hover:text-blue-600"
      >
        + 증거 추가
      </button>
    </div>
  )
}
