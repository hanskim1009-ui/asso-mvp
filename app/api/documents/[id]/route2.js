import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(request, context) {
  try {
    const params = await context.params
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json(
        { error: '문서 ID가 필요합니다' },
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

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('문서 삭제 오류:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
