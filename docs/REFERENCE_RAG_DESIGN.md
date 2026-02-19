# 참고자료 RAG 설계

## 1. 목적

의견서 작성 시, 개발자가 등록해 둔 **참고자료**(대법원 양형기준표, 판례 요약 등)를 프롬프트에 통째로 넣지 않고, **RAG(Retrieval Augmented Generation)**로 질의에 맞는 청크만 검색해 넣어 품질·토큰을 모두 잡는다.

- **입력**: 사건 분석 + 의견서 종류 → “양형기준 절도”, “무죄 판례” 등 쿼리 생성 → 벡터 검색
- **출력**: 상위 K개 청크를 `【참고자료】` 블록으로 포맷해 `buildFullPrompt(..., referenceRagBlock)`에 전달

## 2. 전체 흐름

```
[참고자료 등록]
  PDF 업로드 → 텍스트 추출(기존 OCR/방식) → 청킹 → AI 메타데이터 태깅 → 임베딩 → DB 저장

[의견서 생성 시]
  분석+의견서종류 → 쿼리 문자열 생성 → 쿼리 임베딩 → reference_chunks 벡터 유사도 검색
  → 상위 K개 청크 → referenceRagBlock 문자열 → buildFullPrompt(..., referenceRagBlock)
```

## 3. DB 설계

### 3.1 reference_documents

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| title | text | 표시용 제목 (예: "대법원 양형기준표") |
| source_description | text | 출처/설명 (선택) |
| file_url | text | PDF 또는 텍스트 파일 URL |
| file_name | text | 원본 파일명 |
| created_at | timestamptz | 등록일 |

### 3.2 reference_chunks

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| reference_document_id | uuid | FK → reference_documents |
| chunk_index | int | 문서 내 순서 |
| page_number | int | 페이지 (있을 경우) |
| content | text | 청크 본문 |
| embedding | vector(768) | pgvector, 검색용 (Gemini embedding-001 등 768차원 가정) |
| metadata | jsonb | AI 태깅 결과: topic, crime_type, summary, keywords 등 |
| created_at | timestamptz | |

- **pgvector**: `embedding vector(768)` + ivfflat 또는 hnsw 인덱스로 유사도 검색.

## 4. 청킹 후 AI 메타데이터 태깅

- **목적**: 검색 품질·필터링·가독성. “이 청크가 무슨 주제/범죄유형인지”를 태그해 두면:
  - 의견서 종류별·사건 유형별로 메타데이터 필터 후 벡터 검색 가능 (하이브리드).
  - 프롬프트에 넣을 때 `【양형기준 - 절도】`처럼 라벨을 붙여 출처 인식에 유리.
- **방식**: 청크 본문만 넣고, 짧은 프롬프트로 다음을 JSON으로 추출.
  - `topic`: 주제 (예: 양형기준, 판례, 증거법)
  - `crime_type`: 범죄 유형 (예: 절도, 사기, null)
  - `summary`: 한 줄 요약
  - `keywords`: 검색 키워드 배열 (선택)
- **시점**: 청킹 저장 직후 또는 “태깅” 전용 API로 일괄 실행. 실패 시 metadata는 `{}`로 두고 재실행 가능.

## 5. 임베딩

- **모델**: Gemini Embedding (`text-embedding-004` 또는 SDK에서 지원하는 embedding 모델). 이미 사용 중인 `GEMINI_API_KEY`로 통일.
- **차원**: 모델에 맞춰 768 등으로 고정 후 `reference_chunks.embedding` 컬럼과 인덱스 설정.

## 6. 검색 및 프롬프트 삽입

- **쿼리 생성**: `opinionType` + `analysis.summary`(또는 issues)를 이용해 짧은 검색 문장 생성.  
  예: 양형의견서 → "양형기준 양형 참작 사유 선고유예 집행유예", 무죄주장 → "무죄 판례 증명력 합리적 의심".
- **검색**: 쿼리 텍스트를 임베딩 → `reference_chunks`에서 코사인/ L2 유사도로 top-K (예: 5~10) 조회. (선택) metadata 필터.
- **포맷**:  
  `【참고자료】\n\n【{topic} - {crime_type}】\n{content}\n\n` 형태로 이어 붙여 `referenceRagBlock` 생성 후 `buildFullPrompt(..., referenceRagBlock)`에 전달.

## 7. API 구성

| 메서드 | 경로 | 설명 |
|--------|------|------|
| **POST** | **/api/reference-documents/ingest** | **PDF 업로드 → Upstage 읽기 → 청킹 → 임베딩 → 태깅 일괄 처리 (자동 파이프라인)** |
| POST | /api/reference-documents | 참고자료 메타만 등록 (수동 청킹/태깅/임베딩용) |
| GET | /api/reference-documents | 목록 조회 |
| GET | /api/reference-documents/[id] | 단건 + 청크 수 등 |
| POST | /api/reference-documents/[id]/chunk | 해당 문서 청킹 (텍스트 이미 있을 때) |
| POST | /api/reference-documents/[id]/tag | 해당 문서 청크 일괄 AI 태깅 |
| POST | /api/reference-documents/[id]/embed | 해당 문서 청크 일괄 임베딩 |
| DELETE | /api/reference-documents/[id] | 참고자료 삭제 (cascade 청크) |

- 의견서 생성: 기존 `POST /api/opinion/generate`에서 `referenceRagBlock`을 RAG 검색 결과로 채워 넣음.

---

## 7.1 Ingest 파이프라인 (PDF → 자동 청킹·태깅·임베딩)

참고자료를 **한 번에** 등록·처리하기 위한 API와 흐름.

### 7.1.1 `POST /api/reference-documents/ingest`

**역할**: PDF 파일 업로드 시 Upstage로 텍스트 추출 → 참고자료 문서 생성 → 청킹 → 임베딩 → AI 태깅까지 순서대로 실행.

**Request**

- **Content-Type**: `multipart/form-data`
- **Body**:
  - `document` (file, 필수): PDF 파일
  - `title` (string, 필수): 참고자료 제목 (예: "대법원 양형기준표 - 절도")
  - `source_description` (string, 선택): 출처/설명
  - `pdfType` (string, 선택): `scanned`(기본) | `digital`  
    - **스캔본(이미지)**: Upstage OCR로 텍스트 추출.  
    - **디지털 원본(Word 등)**: OCR 없이 pdfjs-dist로 텍스트만 추출. 빠르고 비용 없음.

**처리 순서**

1. **텍스트 추출 (pdfType에 따라 분기)**
   - `pdfType === 'digital'`: `lib/pdfNativeExtract.js`로 pdfjs-dist(legacy) 사용. 버퍼에서 페이지별 텍스트 추출.
   - 그 외(스캔본): **Upstage Document Parse**  
   - `document` 파일을 Upstage `v1/document-ai/document-parse`로 전송.  
   - Upstage 응답에서 `content.text` 또는 `content.elements`로 **전체 텍스트**와 **페이지별 텍스트** 추출.  
   - 페이지별 텍스트가 있으면 `pageTexts`(키: 페이지 번호 문자열), 없으면 `fullText`만 사용.

2. **참고자료 문서 생성**  
   - `reference_documents`에 1건 insert.  
   - `title`, `source_description`, `file_name`(원본 파일명) 저장.  
   - `file_url`은 선택(나중에 Storage URL 저장 가능).

3. **청킹**  
   - `pageTexts`가 있으면 `chunkByPageTexts(pageTexts)`, 없으면 `chunkFullText(fullText)`.  
   - 결과를 `reference_chunks`에 insert (이 단계에서는 `embedding`·`metadata` 없음).

4. **임베딩**  
   - 방금 넣은 청크들을 배치로 Gemini Embedding 호출 후 `reference_chunks.embedding` 업데이트.  
   - 청크 수가 많으면 배치 단위로 반복.

5. **태깅**  
   - 각 청크에 대해 Gemini로 메타데이터(topic, crime_type, summary, keywords) 생성 후 `reference_chunks.metadata` 업데이트.  
   - 일부 실패 시 해당 청크만 metadata `{}`로 두고 나머지는 계속 진행.

**Response (성공)**

```json
{
  "success": true,
  "id": "uuid",
  "title": "대법원 양형기준표 - 절도",
  "chunksCount": 12,
  "embedded": 12,
  "tagged": 12
}
```

**Response (실패)**

- `400`: 파일 없음, title 없음, Upstage 실패 등
- `500`: DB/임베딩/태깅 중 오류

**실패 시 복구**

- 문서는 생성되고 청크만 들어간 상태에서 실패할 수 있음.  
- 그 경우 기존처럼 `POST .../embed`, `POST .../tag`를 수동 호출해 이어서 처리하면 됨.

### 7.1.2 UI 흐름

- 참고자료 관리 페이지에서 **「참고자료 추가」** 시:
  - **PDF 업로드** + **제목**(필수) + **출처/설명**(선택) 입력.
  - 등록 버튼 클릭 → `POST /api/reference-documents/ingest` 호출 (FormData).
  - 진행 중: "Upstage 읽는 중 → 청킹 → 임베딩 → 태깅" 등 단계 표시.
  - 완료 후 목록 갱신, 성공/실패 토스트.
- 기존처럼 **텍스트 붙여넣기**로 등록하는 경로(메타만 등록 + 수동 청킹)도 유지 가능.

## 8. 의견서 생성 연동

- `app/api/opinion/generate/route.js`:
  1. `analysis`, `opinionType`으로 검색 쿼리 문자열 생성.
  2. 쿼리 임베딩 → `reference_chunks` 벡터 검색 → top-K 청크 목록.
  3. `formatReferenceRag(chunks)` → `referenceRagBlock`.
  4. `buildFullPrompt(opinionType, dataBlock, userPrompt, learningExamples, referenceRagBlock)` 호출.

## 9. 구현 순서 제안

1. Supabase: `reference_documents`, `reference_chunks`(embedding 포함) 테이블 및 pgvector 확장/인덱스
2. `lib/embedding.js`: Gemini로 텍스트 → 벡터
3. `lib/referenceChunks.js`: 청크 CRUD, 벡터 검색, (선택) 메타데이터 필터
4. 참고자료 업로드·청킹·태깅·임베딩 API
5. 의견서 generate에서 쿼리 생성 + RAG 검색 + referenceRagBlock 주입
6. (선택) 참고자료 관리 UI: 목록, 업로드, 태깅/임베딩 실행 버튼

---

## 10. 사용 방법 (구현 완료 후)

1. **Supabase**: `docs/REFERENCE_RAG_TABLES_SETUP.md`의 SQL을 순서대로 실행 (확장, 테이블, RPC).
2. **참고자료 등록**: `POST /api/reference-documents` body: `{ title, source_description?, file_url?, file_name? }` → 응답의 `id` 사용.
3. **청킹**: `POST /api/reference-documents/[id]/chunk` body: `{ fullText }` 또는 `{ pageTexts: { "1": "...", "2": "..." } }`.
4. **AI 메타데이터 태깅**: `POST /api/reference-documents/[id]/tag` (GEMINI_API_KEY 필요).
5. **임베딩**: `POST /api/reference-documents/[id]/embed` → embedding이 null인 청크만 배치로 임베딩.
6. **의견서 작성**: 사건 상세에서 의견서 작성 시 자동으로 RAG 쿼리 생성 → 참고자료 상위 5개 청크를 프롬프트에 삽입.
