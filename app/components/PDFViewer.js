'use client'

import { useState, useEffect } from 'react'

// HTML 태그 제거 함수
function stripHtml(html) {
  if (!html) return ''
  
  // HTML 태그 제거
  let text = html.replace(/<[^>]*>/g, '\n')
  
  // HTML 엔티티 디코딩
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
  
  // 연속된 공백/줄바꿈 정리
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
  
  return text
}

export default function PDFViewer({ pdfUrl, extractedText }) {
  const [cleanText, setCleanText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [highlightedText, setHighlightedText] = useState('')

  // 컴포넌트 마운트 시 HTML 제거
  useEffect(() => {
    const cleaned = stripHtml(extractedText)
    setCleanText(cleaned)
    setHighlightedText(cleaned)
  }, [extractedText])

  const handleSearch = () => {
    if (!searchText) {
      setSearchResults([])
      setHighlightedText(cleanText)
      return
    }

    const results = []
    const lines = cleanText.split('\n')
    
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchText.toLowerCase())) {
        results.push({
          lineNumber: index + 1,
          text: line,
          preview: line.substring(0, 100)
        })
      }
    })
    
    setSearchResults(results)

    // 텍스트 하이라이트
    const regex = new RegExp(`(${searchText})`, 'gi')
    const highlighted = cleanText.replace(regex, '【$1】')
    setHighlightedText(highlighted)
  }

  if (!pdfUrl) {
    return (
      <div className="text-center p-8 text-red-600">
        PDF URL이 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 검색 바 */}
      <div className="flex gap-2 mb-4 p-4 bg-zinc-50 rounded-lg border border-zinc-200">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="텍스트 검색..."
          className="flex-1 px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          검색
        </button>
        {searchText && (
          <button
            onClick={() => {
              setSearchText('')
              setSearchResults([])
              setHighlightedText(cleanText)
            }}
            className="px-4 py-2 text-zinc-600 border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
          >
            초기화
          </button>
        )}
        {searchResults.length > 0 && (
          <span className="px-3 py-2 text-sm text-zinc-600">
            {searchResults.length}개 결과
          </span>
        )}
      </div>

      {/* PDF + 텍스트 */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* 왼쪽: PDF iframe */}
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-zinc-700 mb-2">원본 PDF</h3>
          <iframe
            src={pdfUrl}
            className="flex-1 border border-zinc-300 rounded-lg bg-white"
            title="PDF 미리보기"
          />
        </div>

        {/* 오른쪽: 추출된 텍스트 또는 검색 결과 */}
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-zinc-700 mb-2">
            {searchResults.length > 0 ? `검색 결과 (${searchResults.length}개)` : '추출된 텍스트'}
          </h3>
          
          {searchResults.length > 0 ? (
            // 검색 결과 표시
            <div className="flex-1 overflow-auto border border-zinc-300 rounded-lg bg-white">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="p-3 border-b border-zinc-200 hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <div className="text-xs text-blue-600 font-medium mb-1">
                    라인 {result.lineNumber}
                  </div>
                  <div className="text-sm text-zinc-800">
                    {result.preview}
                    {result.text.length > 100 && '...'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // 전체 텍스트 표시
            <textarea
              readOnly
              value={highlightedText}
              className="flex-1 resize-none rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
            />
          )}
        </div>
      </div>
    </div>
  )
}