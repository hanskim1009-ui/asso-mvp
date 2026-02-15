import { NextResponse } from 'next/server'
import { searchChunksInCase } from '@/lib/database'

export async function GET(request, context) {
  try {
    const params = await context.params
    const caseId = params.id
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400 }
      )
    }

    if (!q.trim()) {
      return NextResponse.json({ results: [] })
    }

    const results = await searchChunksInCase(caseId, q.trim(), 50)
    return NextResponse.json({ results })
  } catch (error) {
    console.error('키워드 검색 오류:', error)
    return NextResponse.json(
      { error: error.message || '검색 실패' },
      { status: 500 }
    )
  }
}
