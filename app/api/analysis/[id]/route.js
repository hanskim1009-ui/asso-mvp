import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function DELETE(request, { params }) {
  try {
    const resolvedParams = await params
    const analysisId = resolvedParams.id

    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      )
    }

    // Soft delete
    const { error } = await supabase
      .from('analysis_results')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', analysisId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('분석 결과 삭제 오류:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params
    const analysisId = resolvedParams.id
    const { title } = await request.json()

    if (!analysisId) {
      return NextResponse.json(
        { error: 'Analysis ID is required' },
        { status: 400 }
      )
    }

    if (!title || title.trim() === '') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('analysis_results')
      .update({ title: title.trim() })
      .eq('id', analysisId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('제목 수정 오류:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
