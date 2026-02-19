import { NextResponse } from 'next/server'
import { getReferenceDocuments, insertReferenceDocument } from '@/lib/database'

export async function GET() {
  try {
    const list = await getReferenceDocuments()
    return NextResponse.json(list)
  } catch (err) {
    console.error('GET reference-documents:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { title, source_description, file_url, file_name } = body
    if (!title?.trim()) {
      return NextResponse.json({ error: 'title이 필요합니다.' }, { status: 400 })
    }
    const id = await insertReferenceDocument({
      title: title.trim(),
      source_description: source_description?.trim() || null,
      file_url: file_url?.trim() || null,
      file_name: file_name?.trim() || null,
    })
    return NextResponse.json({ success: true, id })
  } catch (err) {
    console.error('POST reference-documents:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
