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
 * 여러 문서 통합 분석 결과 저장
 */
export async function saveIntegratedAnalysis(caseId, documentIds, analysisResult) {
  try {
    // 문서 이름 가져오기
    const { data: docs } = await supabase
      .from('documents')
      .select('original_file_name')
      .in('id', documentIds)

    // 제목 생성
    let title = ''
    if (docs && docs.length > 0) {
      if (docs.length === 1) {
        title = docs[0].original_file_name ?? ''
      } else {
        title = `${docs[0].original_file_name ?? ''} 외 ${docs.length - 1}개`
      }
    } else {
      title = '분석 결과'
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
 * 분석 예시 저장
 * 임시 비활성화
 */
export async function saveGoodExample(data) {
  console.log('saveGoodExample: 임시 비활성화됨')
  return null
}

/**
 * 사건 유형별 좋은 예시 가져오기
 * 임시 비활성화 (RLS 등)
 */
export async function getGoodExamples(caseType, limit = 3) {
  // 임시 비활성화
  return []
}

/**
 * 좋은 예시에서 제거
 * 임시 비활성화
 */
export async function removeGoodExample(analysisId) {
  console.log('removeGoodExample: 임시 비활성화됨')
  return null
}

/**
 * 이 분석이 좋은 예시로 저장되어 있는지 확인
 * 임시 비활성화
 */
export async function isGoodExample(analysisId) {
  console.log('isGoodExample: 임시 비활성화됨')
  return false
}
