import { NextResponse } from 'next/server'
import { getReferenceDocument } from '@/lib/database'
import { embedChunksForDocument } from '@/lib/referenceChunks'

export async function POST(request, context) {
  try {
    const params = await context.params
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    const doc = await getReferenceDocument(id)
    if (!doc) return NextResponse.json({ error: '참고자료를 찾을 수 없습니다.' }, { status: 404 })

    const { updated } = await embedChunksForDocument(id, 10)
    return NextResponse.json({ success: true, updated })
  } catch (err) {
    console.error('POST reference-documents/[id]/embed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
