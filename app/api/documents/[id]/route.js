import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function DELETE(request, { params }) {
  try {
    // Next.js 15 방식으로 params 처리
    const resolvedParams = await params
    const documentId = resolvedParams.id

    console.log('삭제 요청 documentId:', documentId)

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // DB에서 삭제하지 않고 'deleted' 플래그만 설정
    const { error } = await supabase
      .from('documents')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', documentId)

    if (error) {
      console.error('Supabase 에러:', error)
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('문서 삭제 오류:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
