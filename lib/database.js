import { supabase } from '@/lib/supabase'

/**
 * documents 테이블에 문서 메타데이터 저장
 * @param {Object} data
 * @param {string} data.pdfUrl - PDF 파일 URL
 * @param {string} data.txtUrl - TXT 파일 URL
 * @param {string} data.pdfFileName - PDF 저장 파일명
 * @param {string} data.txtFileName - TXT 저장 파일명
 * @param {string} data.originalFileName - 원본 파일명
 * @param {number} data.fileSize - 파일 크기 (bytes)
 * @param {string} [data.caseId] - 사건 id (선택)
 * @returns {Promise<string>} 생성된 document id
 */
export async function saveDocument(data) {
  try {
    const { data: result, error } = await supabase
      .from('documents')
      .insert({
        pdf_url: data.pdfUrl,
        txt_url: data.txtUrl,
        pdf_file_name: data.pdfFileName,
        txt_file_name: data.txtFileName,
        original_file_name: data.originalFileName,
        file_size: data.fileSize,
        case_id: data.caseId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('saveDocument error:', error)
      throw new Error(error.message || '문서 저장에 실패했습니다.')
    }

    return result?.id ?? null
  } catch (err) {
    console.error('saveDocument:', err)
    throw err
  }
}

/**
 * document id로 문서 조회
 * @param {string} documentId - document id
 * @returns {Promise<Object|null>} 문서 전체 데이터 또는 null
 */
export async function getDocument(documentId) {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('getDocument error:', error)
      throw new Error(error.message || '문서 조회에 실패했습니다.')
    }

    return data
  } catch (err) {
    console.error('getDocument:', err)
    throw err
  }
}

/**
 * 모든 문서 조회 (최근 50개, upload_date 내림차순)
 * @returns {Promise<Array>} 문서 목록 배열
 */
export async function getAllDocuments() {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('upload_date', { ascending: false })
      .limit(50)

    if (error) {
      console.error('getAllDocuments error:', error)
      throw new Error(error.message || '문서 목록 조회에 실패했습니다.')
    }

    return data ?? []
  } catch (err) {
    console.error('getAllDocuments:', err)
    throw err
  }
}

/**
 * 분석 결과를 analysis_results 테이블에 저장
 * @param {string} documentId - document id
 * @param {Object} analysisData - 분석 결과 JSON 객체
 * @returns {Promise<string>} 생성된 analysis_result id
 */
export async function saveAnalysisResult(documentId, analysisData) {
  try {
    const { data: result, error: insertError } = await supabase
      .from('analysis_results')
      .insert({
        document_id: documentId,
        analysis_type: 'full_analysis',
        result: analysisData,
        model_used: 'claude-sonnet-4-20250514',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('saveAnalysisResult error:', insertError)
      throw new Error(insertError.message || '분석 결과 저장에 실패했습니다.')
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update({ analyzed: true })
      .eq('id', documentId)

    if (updateError) {
      console.error('saveAnalysisResult - documents.analyzed 업데이트 실패:', updateError)
    }

    return result?.id ?? ''
  } catch (err) {
    console.error('saveAnalysisResult:', err)
    throw err
  }
}

/**
 * documents 테이블의 user_context 업데이트
 */
export async function updateUserContext(documentId, userContext) {
  try {
    const { error } = await supabase
      .from('documents')
      .update({ user_context: userContext })
      .eq('id', documentId)

    if (error) throw error
  } catch (err) {
    console.error('updateUserContext:', err)
    throw err
  }
}

/**
 * 새 사건 생성
 */
export async function createCase(data) {
  try {
    const { data: result, error } = await supabase
      .from('cases')
      .insert({
        case_name: data.caseName,
        case_number: data.caseNumber,
        client_name: data.clientName,
        case_type: data.caseType,
        description: data.description,
      })
      .select('id')
      .single()

    if (error) throw error
    return result?.id
  } catch (err) {
    console.error('createCase:', err)
    throw err
  }
}

/**
 * 모든 사건 조회
 */
export async function getAllCases() {
  try {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getAllCases:', err)
    throw err
  }
}

/**
 * 사건 상세 조회 (문서 포함)
 */
export async function getCaseWithDocuments(caseId) {
  try {
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()

    if (caseError) throw caseError

    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (docsError) throw docsError

    return {
      ...caseData,
      documents: docs ?? [],
    }
  } catch (err) {
    console.error('getCaseWithDocuments:', err)
    throw err
  }
}

/**
 * 사건 삭제
 */
export async function deleteCase(caseId) {
  try {
    const { error } = await supabase.from('cases').delete().eq('id', caseId)

    if (error) throw error
  } catch (err) {
    console.error('deleteCase:', err)
    throw err
  }
}

/**
 * 문서의 분석 결과 조회
 */
export async function getAnalysisResult(documentId) {
  try {
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // 분석 결과 없음
      }
      throw error
    }

    return data
  } catch (err) {
    console.error('getAnalysisResult:', err)
    return null
  }
}

/**
 * 사건의 모든 분석 결과 조회
 */
export async function getCaseAnalyses(caseId) {
  try {
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId)

    if (docsError) throw docsError

    const docIds = docs.map((d) => d.id)

    if (docIds.length === 0) return []

    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .in('document_id', docIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getCaseAnalyses:', err)
    return []
  }
}

/**
 * 청크 ID로 단건 조회 (문서 정보 포함)
 */
export async function getChunkById(chunkId) {
  try {
    const { data, error } = await supabase
      .from('document_chunks')
      .select(`
        *,
        documents!inner (original_file_name, pdf_url)
      `)
      .eq('id', chunkId)
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('getChunkById:', err)
    return null
  }
}

/**
 * 사건 소속 문서들의 청크에서 키워드 검색
 * @param {string} caseId
 * @param {string} keyword
 * @param {number} limit
 * @returns {Promise<Array>} { id, document_id, page_number, content, documents: { original_file_name } }[]
 */
export async function searchChunksInCase(caseId, keyword, limit = 30) {
  try {
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId)
      .eq('is_deleted', false)

    if (docsError) throw docsError
    const docIds = docs?.map((d) => d.id) || []
    if (docIds.length === 0 || !keyword?.trim()) return []

    const pattern = `%${String(keyword).trim()}%`

    const { data, error } = await supabase
      .from('document_chunks')
      .select('id, document_id, page_number, content, chunk_index, documents!inner (original_file_name)')
      .in('document_id', docIds)
      .ilike('content', pattern)
      .order('document_id', { ascending: true })
      .order('page_number', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('searchChunksInCase:', err)
    return []
  }
}

/**
 * 여러 문서 통합 분석 결과 저장
 * @param {string} caseId
 * @param {string[]} documentIds
 * @param {object} analysisResult
 * @param {string} [optionalTitle] - 지정 시 이 제목 사용 (예: AI 수정 결과)
 */
export async function saveIntegratedAnalysis(caseId, documentIds, analysisResult, optionalTitle) {
  try {
    let title = optionalTitle
    if (title == null || title === '') {
      // 문서 이름 가져오기
      const { data: docs } = await supabase
        .from('documents')
        .select('original_file_name')
        .in('id', documentIds)

      if (docs && docs.length > 0) {
        if (docs.length === 1) {
          title = docs[0].original_file_name ?? ''
        } else {
          title = `${docs[0].original_file_name ?? ''} 외 ${docs.length - 1}개`
        }
      } else {
        title = '분석 결과'
      }
    }

    const { data, error } = await supabase
      .from('analysis_results')
      .insert({
        document_id: documentIds[0],
        analysis_type: 'integrated',
        result: {
          ...analysisResult,
          document_ids: documentIds,
          case_id: caseId,
        },
        title: title,
      })
      .select('id')
      .single()

    if (error) throw error
    return data?.id
  } catch (err) {
    console.error('saveIntegratedAnalysis:', err)
    throw err
  }
}

/**
 * 사건 정보 업데이트 (컨텍스트 포함)
 */
export async function updateCase(caseId, data) {
  try {
    const { error } = await supabase
      .from('cases')
      .update({
        case_name: data.caseName,
        case_number: data.caseNumber,
        client_name: data.clientName,
        case_type: data.caseType,
        description: data.description,
        user_context: data.userContext,
      })
      .eq('id', caseId)

    if (error) throw error
  } catch (err) {
    console.error('updateCase:', err)
    throw err
  }
}

/**
 * 사건의 모든 분석 결과 조회 (최신순)
 */
export async function getCaseAnalysisHistory(caseId) {
  try {
    const { data: docs } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId)

    const docIds = docs?.map((d) => d.id) || []

    if (docIds.length === 0) return []

    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .in('document_id', docIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getCaseAnalysisHistory:', err)
    return []
  }
}

/**
 * 분석 결과 업데이트 (사용자 수정)
 */
export async function updateAnalysisResult(analysisId, result) {
  try {
    const { error } = await supabase
      .from('analysis_results')
      .update({ result })
      .eq('id', analysisId)

    if (error) throw error
  } catch (err) {
    console.error('updateAnalysisResult:', err)
    throw err
  }
}

/**
 * 분석 예시 저장 (Few-shot Learning)
 */
export async function saveGoodExample(data) {
  try {
    const { error } = await supabase.from('good_analysis_examples').insert({
      case_type: data.caseType,
      input_summary: data.inputSummary,
      output_analysis: data.outputAnalysis,
      user_rating: data.rating ?? 5,
      case_id: data.caseId ?? null,
      analysis_id: data.analysisId ?? null,
    })

    if (error) throw error
  } catch (err) {
    console.error('saveGoodExample:', err)
    throw err
  }
}

/**
 * 사건 유형별 좋은 예시 가져오기 (Few-shot Learning)
 */
export async function getGoodExamples(caseType, limit = 3) {
  try {
    const { data, error } = await supabase
      .from('good_analysis_examples')
      .select('*')
      .eq('case_type', caseType ?? '기타')
      .gte('user_rating', 4)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('getGoodExamples:', error)
      return []
    }
    return data ?? []
  } catch (err) {
    console.error('getGoodExamples:', err)
    return []
  }
}

/**
 * 좋은 예시에서 제거
 */
export async function removeGoodExample(analysisId) {
  try {
    const { error } = await supabase
      .from('good_analysis_examples')
      .delete()
      .eq('analysis_id', analysisId)

    if (error) throw error
  } catch (err) {
    console.error('removeGoodExample:', err)
    throw err
  }
}

/**
 * 이 분석이 좋은 예시로 저장되어 있는지 확인
 */
export async function isGoodExample(analysisId) {
  try {
    const { data, error } = await supabase
      .from('good_analysis_examples')
      .select('id')
      .eq('analysis_id', analysisId)
      .maybeSingle()

    if (error) throw error
    return !!data
  } catch (err) {
    console.error('isGoodExample:', err)
    return false
  }
}

// ============================================================
// 증거기록 분류 (Evidence Record Classification)
// ============================================================

/**
 * 페이지별 분류 결과 일괄 저장
 */
export async function savePageClassifications(documentId, pages) {
  try {
    // 중복 페이지 번호 제거 (마지막 것 우선)
    const seen = new Map()
    for (const p of pages) {
      if (p.page > 0) seen.set(p.page, p)
    }
    const deduped = Array.from(seen.values())

    const records = deduped.map((p) => ({
      document_id: documentId,
      page_number: p.page,
      page_type: p.type,
      confidence: p.confidence ?? null,
      extracted_text: p.text ?? null,
      text_length: (p.text ?? '').length,
      has_meaningful_text: (p.text ?? '').length >= 30,
      detected_title: p.title ?? null,
      detected_names: p.names ?? [],
      detected_dates: p.dates ?? [],
    }))

    if (records.length === 0) return

    const { error } = await supabase
      .from('page_classifications')
      .upsert(records, { onConflict: 'document_id,page_number' })

    if (error) throw error
  } catch (err) {
    console.error('savePageClassifications:', err)
    throw err
  }
}

/**
 * 문서의 페이지 분류 결과 조회
 */
export async function getPageClassifications(documentId) {
  try {
    const { data, error } = await supabase
      .from('page_classifications')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getPageClassifications:', err)
    return []
  }
}

/**
 * 증거 섹션 일괄 저장
 */
export async function saveEvidenceSections(documentId, caseId, sections) {
  try {
    const records = sections.map((s, idx) => ({
      document_id: documentId,
      case_id: caseId,
      section_type: s.section_type,
      section_title: s.section_title ?? null,
      section_order: s.section_order ?? idx,
      start_page: s.start_page,
      end_page: s.end_page,
      extracted_text: s.extracted_text ?? null,
      ocr_quality: s.ocr_quality ?? 'good',
    }))

    const { data, error } = await supabase
      .from('evidence_sections')
      .insert(records)
      .select('*')

    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('saveEvidenceSections:', err)
    throw err
  }
}

/**
 * 사건의 증거 섹션 목록 조회
 */
export async function getEvidenceSections(caseId, documentId) {
  try {
    let query = supabase
      .from('evidence_sections')
      .select('*')
      .eq('is_deleted', false)
      .order('section_order', { ascending: true })

    if (documentId) {
      query = query.eq('document_id', documentId)
    } else if (caseId) {
      query = query.eq('case_id', caseId)
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('getEvidenceSections:', err)
    return []
  }
}

/**
 * 증거 섹션 단건 조회
 */
export async function getEvidenceSection(sectionId) {
  try {
    const { data, error } = await supabase
      .from('evidence_sections')
      .select('*')
      .eq('id', sectionId)
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('getEvidenceSection:', err)
    return null
  }
}

/**
 * 증거 섹션 수정 (유형 변경, 설명 추가 등)
 */
export async function updateEvidenceSection(sectionId, updates) {
  try {
    const allowed = {}
    if (updates.section_type !== undefined) allowed.section_type = updates.section_type
    if (updates.section_title !== undefined) allowed.section_title = updates.section_title
    if (updates.user_description !== undefined) allowed.user_description = updates.user_description
    if (updates.user_tags !== undefined) allowed.user_tags = updates.user_tags
    if (updates.ocr_quality !== undefined) allowed.ocr_quality = updates.ocr_quality
    if (updates.analysis_result !== undefined) {
      allowed.analysis_result = updates.analysis_result
      allowed.is_analyzed = true
    }
    allowed.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('evidence_sections')
      .update(allowed)
      .eq('id', sectionId)
      .select('*')
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('updateEvidenceSection:', err)
    throw err
  }
}

/**
 * 문서의 기존 증거 섹션/분류 삭제 (재분류 시)
 */
export async function clearEvidenceData(documentId) {
  try {
    await supabase
      .from('evidence_sections')
      .delete()
      .eq('document_id', documentId)

    await supabase
      .from('page_classifications')
      .delete()
      .eq('document_id', documentId)
  } catch (err) {
    console.error('clearEvidenceData:', err)
    throw err
  }
}
