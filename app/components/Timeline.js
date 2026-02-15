"use client"

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        타임라인 이벤트가 없습니다.
      </div>
    )
  }

  // 날짜순 정렬
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.date || a.event_date)
    const dateB = new Date(b.date || b.event_date)
    return dateA - dateB
  })

  // Gap 계산
  const gaps = []
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const current = new Date(sortedEvents[i].date || sortedEvents[i].event_date)
    const next = new Date(sortedEvents[i + 1].date || sortedEvents[i + 1].event_date)
    const diffDays = Math.floor((next - current) / (1000 * 60 * 60 * 24))

    if (diffDays > 7) {
      gaps.push({
        afterIndex: i,
        days: diffDays,
      })
    }
  }

  return (
    <div className="relative">
      {/* 세로 라인 */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-zinc-200"></div>

      {/* 이벤트들 */}
      <div className="space-y-6">
        {sortedEvents.map((event, idx) => {
          const gap = gaps.find((g) => g.afterIndex === idx)

          return (
            <div key={idx}>
              {/* 이벤트 */}
              <div className="relative pl-14">
                {/* 동그라미 */}
                <div className="absolute left-4 top-1 w-5 h-5 bg-blue-600 rounded-full border-4 border-white shadow"></div>

                {/* 내용 */}
                <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-zinc-900">
                        {formatDate(event.date || event.event_date)}
                      </div>
                      {event.time && (
                        <div className="text-sm text-zinc-500">
                          {event.time}
                        </div>
                      )}
                    </div>
                    {event.source && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-1 rounded">
                          📄 {event.source}
                        </span>
                        {event.page && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            p.{event.page}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-zinc-700">
                    {event.event || event.event_description}
                  </p>
                </div>
              </div>

              {/* Gap 표시 */}
              {gap && (
                <div className="relative pl-14 py-4">
                  <div className="flex items-center gap-3 text-amber-600">
                    <div className="w-0.5 h-8 bg-amber-200 ml-[1.4rem]"></div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>⚠️</span>
                      <span>Gap: {gap.days}일 공백</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return '날짜 미상'

  try {
    // "2022년 11월 01일" 형식 처리
    if (dateStr.includes('년')) {
      return dateStr
    }

    // ISO 형식 (YYYY-MM-DD) 처리
    const date = new Date(dateStr)

    // Invalid Date 체크
    if (isNaN(date.getTime())) {
      return dateStr // 원본 반환
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}년 ${month}월 ${day}일`
  } catch {
    return dateStr
  }
}
