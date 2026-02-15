# ASSO MVP - 시스템 아키텍처

## 데이터 플로우
1. PDF 업로드↓
2. Supabase Storage 저장↓
3. Upstage OCR (PDF → 텍스트)↓
4. Gemini 2.5 Flash 분석
- 타임라인 추출
- 증거 목록
- 유리한 정황
- 모순점↓
5. Supabase DB 저장↓
6. 사용자 편집 (직접 or AI 수정)

## Database 스키마

### cases
```sql
- id (uuid, PK)
- case_name (text)
- case_number (text)
- case_type (text)
- representing (text)
- case_background (text)
- defendant_claim (text)
- plaintiff_claim (text)
- focus_areas (text)
- created_at (timestamp)
```

### documents
```sql
- id (uuid, PK)
- case_id (uuid, FK)
- original_file_name (text)
- pdf_url (text)
- txt_url (text)
- is_deleted (boolean)
- deleted_at (timestamp)
- created_at (timestamp)
```

### analysis_results
```sql
- id (uuid, PK)
- case_id (uuid, FK)
- document_ids (uuid[])
- title (text)
- result (jsonb)
  {
    summary: string
    issues: string[]
    timeline: { date, event, source, page, note? }[]
    evidence: { type, description, page, note? }[]
    favorable_facts: string[]
    contradictions: { statement_1, statement_2, analysis }[]
  }
- is_deleted (boolean)
- deleted_at (timestamp)
- created_at (timestamp)
```

## API 엔드포인트

### 문서
- POST /api/ocr - OCR 처리
- DELETE /api/documents/[id] - 문서 삭제 (soft)
- GET /api/chunk/[id] - 청크 단건 조회 (원문/PDF 링크 등)

### 분석
- POST /api/analyze-integrated - 통합 분석
- POST /api/refine - AI 수정 (결과는 새 분석으로 저장 시 saveIntegratedAnalysis 사용)
- PATCH /api/analysis/[id] - 제목 수정
- DELETE /api/analysis/[id] - 분석 삭제 (soft)

### Case
- lib/database.js 함수들 사용 (saveIntegratedAnalysis optionalTitle 지원)

## 주요 UI 흐름
- **분석 비교**: 분석 이력에서 "분석 비교" → 2개 선택 → AnalysisCompareView (차이 강조는 created_at 기준 이전/이후)
- **AI 수정**: 수정 요청 시 기존 분석은 유지, 수정 결과는 새 analysis_results 행으로 저장 → 비교로 수정 전/후 확인 가능
