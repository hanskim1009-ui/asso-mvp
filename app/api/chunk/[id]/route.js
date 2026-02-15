import { NextResponse } from 'next/server'
import { getChunkById } from '@/lib/database'

export async function GET(request, context) {
  try {
    // Next.js 15 방식
    const params = await context.params
    const chunkId = params.id

    console.log('청크 API 호출:', chunkId)

    if (!chunkId) {
      return NextResponse.json(
        { error: '청크 ID가 필요합니다' },
        { status: 400 }
      )
    }

    const chunk = await getChunkById(chunkId)

    console.log('청크 조회 결과:', chunk ? '성공' : '없음')

    if (!chunk) {
      return NextResponse.json(
        { error: '청크를 찾을 수 없습니다' },
        { status: 404 }
      )
    }

    return NextResponse.json(chunk)
  } catch (error) {
    console.error('청크 조회 오류:', error)
    return NextResponse.json(
      { error: error.message || '청크 조회 실패' },
      { status: 500 }
    )
  }
}
