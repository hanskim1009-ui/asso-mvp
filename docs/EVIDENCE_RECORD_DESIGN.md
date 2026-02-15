# 증거기록 분류·분석 기능 상세 설계

## 1. 개요

한국 형사사건의 증거기록(열람등사본)은 하나의 PDF에 다양한 증거가 포함되어 있다:
- 증거목록
- 고소인/피해자 진술조서
- 피의자 진술조서
- 참고인 진술조서
- 계좌내역 / 금융거래내역
- 사진 증거
- 감정서 / 진단서
- 수사보고서
- 기타 첨부자료

**목표**: 이 PDF를 업로드하면 각 증거를 자동 분류하고, 증거별로 분석하며, OCR 불가 페이지는 사용자가 설명할 수 있게 한다.

---

## 2. 전체 파이프라인

```
[PDF 업로드]
    ↓
[Upstage OCR] ← 기존 파이프라인 (1회 호출, 전체 텍스트 추출)
    ↓
[페이지별 텍스트 분리] ← footer 태그 기준 (chunk-pdf에 이미 로직 있음)
    ↓
[텍스트 기반 AI 분류] ← 페이지별 텍스트를 Gemini 텍스트 모델에 보내 유형 판별 (1~5회 호출)
    ↓
[OCR 불가 감지] ← 텍스트 < 30자인 페이지 → "사진/이미지 증거"로 분류
    ↓
[증거 그룹핑] ← 연속된 같은 유형 페이지를 하나의 증거 단위로 묶기
    ↓
[사용자 확인/수정] ← 분류 결과 UI 표시, 사용자가 수정·보완 가능
    ↓
[증거별 분석] ← 각 증거 그룹의 텍스트를 AI에 보내 분석
    ↓
[종합 분석] ← 전체 증거기록 기반 통합 분석
```

### Vision 방식과의 비교

| | Vision 방식 (이전 설계) | 텍스트 기반 방식 (현재 설계) |
|---|---|---|
| **OCR** | Gemini Vision이 직접 | Upstage OCR (기존 파이프라인) |
| **분류** | 이미지 보고 판단 | 텍스트 패턴으로 판단 |
| **API 호출 수 (1,000p)** | ~1,000회 | **1~5회** |
| **시간 (1,000p)** | 4~67분 | **10~30초** |
| **비용 (1,000p)** | ~$0.75 | **~$0.01~0.05** |
| **분류 정확도** | 높음 | 충분히 높음 (정형화된 문서) |
| **사진 감지** | 이미지 확인 가능 | 텍스트 없는 페이지 = 사진 |
| **추가 구현** | 이미지 변환 필요 | 거의 없음 (기존 코드 활용) |

### 텍스트만으로 분류가 가능한 이유

한국 증거기록은 문서 형식이 정형화되어 있어, 텍스트만 봐도 구분이 명확하다:
- **진술조서**: "진술조서", "진술인", "문: ...", "답: ..." 패턴
- **증거목록**: "순번", "증거", "증명할 사실" 패턴
- **수사보고서**: "수사보고", "보고자" 패턴
- **계좌내역**: 날짜 + 금액 패턴 반복
- **사진 증거**: 텍스트가 거의 없음 (< 30자)

> **참고**: 사진 증거의 "내용"을 AI가 설명해야 할 때만 선택적으로 Gemini Vision을 사용할 수 있다.

---

## 3. DB 스키마 변경

### 3-1. 새 테이블: `evidence_sections`

```sql
CREATE TABLE evidence_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  
  -- 분류 정보
  section_type TEXT NOT NULL,        -- 증거 유형 (아래 enum 참고)
  section_title TEXT,                -- 자동 추출 또는 사용자 입력 제목
  section_order INT NOT NULL,        -- 증거기록 내 순서
  
  -- 페이지 범위
  start_page INT NOT NULL,
  end_page INT NOT NULL,
  
  -- 텍스트
  extracted_text TEXT,               -- OCR로 추출된 전체 텍스트
  ocr_quality TEXT DEFAULT 'good',   -- 'good' | 'partial' | 'failed'
  
  -- 사용자 입력 (OCR 불가 시)
  user_description TEXT,             -- 사용자가 직접 입력한 설명
  user_tags TEXT[],                  -- 사용자 태그
  
  -- 분석
  analysis_result JSONB,             -- 증거별 AI 분석 결과
  is_analyzed BOOLEAN DEFAULT FALSE,
  
  -- 메타
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_evidence_sections_document ON evidence_sections(document_id);
CREATE INDEX idx_evidence_sections_case ON evidence_sections(case_id);
CREATE INDEX idx_evidence_sections_type ON evidence_sections(section_type);
```

### 3-2. section_type 값 (증거 유형)

| type | 한국어 | 설명 |
|------|--------|------|
| `evidence_list` | 증거목록 | 증거기록 첫 부분의 목차 |
| `complainant_statement` | 고소인/피해자 진술조서 | 고소인 또는 피해자의 진술 |
| `suspect_statement` | 피의자 진술조서 | 피의자의 진술 |
| `witness_statement` | 참고인 진술조서 | 참고인의 진술 |
| `financial_record` | 계좌내역/금융거래 | 은행 거래내역, 계좌 추적 |
| `photo_evidence` | 사진 증거 | 현장 사진, 증거물 사진 등 |
| `medical_report` | 진단서/감정서 | 의료 기록, 감정 결과 |
| `investigation_report` | 수사보고서 | 수사관 작성 보고서 |
| `digital_evidence` | 디지털 증거 | 카톡, 문자, 이메일 캡처 등 |
| `contract_document` | 계약서/각서 | 계약서, 합의서, 각서 |
| `other` | 기타 | 위 분류에 해당하지 않는 자료 |

### 3-3. 새 테이블: `page_classifications`

페이지별 분류 결과를 개별 저장 (그룹핑 전 단계)

```sql
CREATE TABLE page_classifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  
  -- 분류
  page_type TEXT NOT NULL,           -- section_type과 동일 enum
  confidence FLOAT,                  -- AI 분류 신뢰도 (0~1)
  
  -- OCR 결과
  extracted_text TEXT,
  text_length INT DEFAULT 0,
  has_meaningful_text BOOLEAN DEFAULT TRUE,  -- 텍스트 30자 이상 여부
  
  -- 메타 (AI가 추출한 정보)
  detected_title TEXT,               -- 페이지에서 감지된 제목/헤더
  detected_names TEXT[],             -- 감지된 인명
  detected_dates TEXT[],             -- 감지된 날짜
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(document_id, page_number)
);
```

---

## 4. API 설계

### 4-1. `POST /api/classify-evidence` — 증거기록 분류 시작

**요청**
```json
{
  "documentId": "uuid",
  "caseId": "uuid"
}
```

**처리 흐름**
1. documents 테이블에서 `txt_url` 가져오기
2. TXT 파일 fetch → footer 태그 기준으로 페이지별 텍스트 분리 (chunk-pdf 로직 재활용)
3. 페이지별 텍스트를 배치로 묶어 Gemini 텍스트 모델에 전송 (1~5회 호출)
   - 프롬프트: "각 페이지의 텍스트를 보고 증거 유형을 분류하세요"
   - 텍스트 < 30자인 페이지 → 자동으로 `photo_evidence` / `ocr_quality: 'failed'`
4. 응답 파싱 → `page_classifications` 테이블에 저장
5. 자동 그룹핑 실행 → `evidence_sections` 테이블에 저장

**응답**
```json
{
  "success": true,
  "totalPages": 45,
  "sections": [
    {
      "id": "uuid",
      "section_type": "evidence_list",
      "section_title": "증거목록",
      "start_page": 1,
      "end_page": 2,
      "ocr_quality": "good"
    },
    {
      "id": "uuid",
      "section_type": "complainant_statement",
      "section_title": "고소인 진술조서 (김OO)",
      "start_page": 3,
      "end_page": 15,
      "ocr_quality": "good"
    },
    {
      "id": "uuid",
      "section_type": "photo_evidence",
      "section_title": "사진 증거",
      "start_page": 30,
      "end_page": 35,
      "ocr_quality": "failed"
    }
  ]
}
```

### 4-2. `PUT /api/evidence-sections/[id]` — 증거 섹션 수정

사용자가 분류를 수정하거나, OCR 불가 증거에 설명을 추가할 때

**요청**
```json
{
  "section_type": "suspect_statement",
  "section_title": "피의자 진술조서 (박OO)",
  "user_description": "피의자가 범행을 부인하는 내용의 진술조서",
  "user_tags": ["부인", "알리바이"]
}
```

### 4-3. `POST /api/evidence-sections/[id]/analyze` — 개별 증거 분석

**요청**
```json
{
  "sectionId": "uuid",
  "caseContext": { ... }
}
```

**처리 흐름**
1. `evidence_sections`에서 해당 섹션의 `extracted_text` 가져오기
2. OCR 불가 시 `user_description` 사용
3. 증거 유형에 맞는 분석 프롬프트 선택 (아래 5절 참고)
4. Gemini API 호출
5. 결과를 `evidence_sections.analysis_result`에 저장

### 4-4. `POST /api/evidence-record/analyze-all` — 전체 증거 일괄 분석

모든 섹션을 순차적으로 분석 후, 종합 분석 수행

### 4-5. `GET /api/cases/[id]/evidence-sections` — 사건의 증거 섹션 목록

### 4-6. `POST /api/evidence-sections/[id]/describe-photo` — 사진 증거 AI 설명 (선택적 Vision)

OCR 불가 페이지에 대해 선택적으로 Gemini Vision을 호출하여 사진 내용을 AI가 설명
- 사용자가 "AI로 설명 생성" 버튼을 클릭할 때만 호출
- 해당 페이지를 이미지로 변환 → Gemini Vision에 전송
- 결과를 `user_description` 대신 또는 보조로 저장

---

## 5. AI 프롬프트 설계

### 5-1. 텍스트 기반 페이지 분류 프롬프트

```
당신은 한국 형사사건 증거기록 분석 전문가입니다.
아래는 증거기록 PDF에서 페이지별로 추출된 OCR 텍스트입니다.
각 페이지의 텍스트를 보고 증거 유형을 분류해주세요.

[분류 유형]
- evidence_list: 증거목록 (순번, 증거명, 증명할 사실 등이 나열)
- complainant_statement: 고소인/피해자 진술조서 ("진술조서", "고소인", "피해자" 포함)
- suspect_statement: 피의자 진술조서 ("피의자신문조서", "피의자" 포함)
- witness_statement: 참고인 진술조서 ("참고인", "진술조서" 포함)
- financial_record: 계좌내역/금융거래 (날짜+금액 패턴 반복)
- photo_evidence: 사진 증거 (텍스트가 거의 없음)
- medical_report: 진단서/감정서 ("진단", "소견", "감정" 포함)
- investigation_report: 수사보고서 ("수사보고", "보고자" 포함)
- digital_evidence: 디지털 증거 (카톡, 문자, 이메일 캡처 텍스트)
- contract_document: 계약서/각서 ("계약", "각서", "합의" 포함)
- other: 기타

[페이지 텍스트]
--- 페이지 1 ---
{page1_text}

--- 페이지 2 ---
{page2_text}

...

각 페이지에 대해 JSON 배열로 응답하세요:
[
  {
    "page": 1,
    "type": "evidence_list",
    "confidence": 0.95,
    "title": "증거목록",
    "names": [],
    "dates": []
  },
  ...
]
```

### 5-2. 증거 유형별 분석 프롬프트

**진술조서 분석**
```
이 진술조서를 분석하여 다음을 추출하세요:
- 진술인 정보 (이름, 관계)
- 핵심 진술 내용 요약
- 시간순 사건 경과
- 다른 증거와 비교할 수 있는 핵심 사실관계
- 진술의 일관성 여부
- 의뢰인에게 유리한 점 / 불리한 점
```

**계좌내역 분석**
```
이 금융거래 내역을 분석하여 다음을 추출하세요:
- 거래 기간
- 주요 거래 (큰 금액, 의심 거래)
- 거래 패턴
- 사건과 관련된 거래 식별
```

**수사보고서 분석**
```
이 수사보고서를 분석하여 다음을 추출하세요:
- 보고 일시 및 보고자
- 수사 내용 요약
- 핵심 수사 결과
- 의뢰인에게 유리/불리한 사항
```

---

## 6. 그룹핑 알고리즘

```
입력: 페이지별 분류 결과 [{page: 1, type: "evidence_list"}, ...]
출력: 증거 섹션 [{type, startPage, endPage, title}, ...]

알고리즘:
1. 페이지 순서대로 정렬
2. 같은 type이 연속되면 하나의 그룹으로 묶기
3. 특수 규칙:
   - evidence_list는 항상 독립 섹션
   - photo_evidence가 1-2장이면 앞 섹션의 첨부로 병합 가능
   - 진술조서 중간에 끼인 photo_evidence 1장은 해당 진술의 첨부 사진으로 처리
4. 제목 결정:
   - detected_title이 있으면 사용
   - 없으면 type + detected_names로 생성
     예: "고소인 진술조서 (김OO)"
```

---

## 7. UI 설계

### 7-1. 증거기록 업로드 후 분류 화면

```
┌─────────────────────────────────────────────────┐
│  📋 증거기록 분류 결과                    [전체 분석]  │
│                                                 │
│  총 45페이지 · 8개 증거 섹션 감지                     │
│                                                 │
│  ┌───┬────────────────────┬───────┬──────────┐  │
│  │ # │ 증거 유형/제목        │ 페이지  │ 상태       │  │
│  ├───┼────────────────────┼───────┼──────────┤  │
│  │ 1 │ 📋 증거목록          │ 1-2   │ ✅ 분류완료 │  │
│  │ 2 │ 📝 고소인 진술 (김OO) │ 3-15  │ ✅ 분류완료 │  │
│  │ 3 │ 📝 피의자 진술 (박OO) │ 16-25 │ ✅ 분류완료 │  │
│  │ 4 │ 💰 계좌내역          │ 26-29 │ ✅ 분류완료 │  │
│  │ 5 │ 📷 사진 증거         │ 30-35 │ ⚠️ 설명필요 │  │
│  │ 6 │ 🏥 진단서            │ 36-37 │ ✅ 분류완료 │  │
│  │ 7 │ 📋 수사보고서         │ 38-42 │ ✅ 분류완료 │  │
│  │ 8 │ 📎 기타              │ 43-45 │ ✅ 분류완료 │  │
│  └───┴────────────────────┴───────┴──────────┘  │
│                                                 │
│  ⚠️ 사진 증거 (pp.30-35) - OCR로 읽을 수 없습니다    │
│  ┌─────────────────────────────────────────────┐│
│  │  [PDF 미리보기: p.30]   이 증거에 대해 설명해     ││
│  │  [사진 이미지]          주세요:                  ││
│  │                        ┌──────────────────┐  ││
│  │  < ○○○○○○ >           │ 피해 현장 사진 6장, ││
│  │  (페이지 네비게이션)      │ CCTV 캡처 포함    ││
│  │                        └──────────────────┘  ││
│  │                [AI로 설명 생성]                 ││
│  │                        태그: [현장] [CCTV]    ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 7-2. 개별 증거 분석 결과 화면

```
┌─────────────────────────────────────────────────┐
│  📝 고소인 진술조서 (김OO)  pp.3-15  [재분석] [수정]  │
│                                                 │
│  ┌──────────────────┬──────────────────────────┐│
│  │ PDF 원문 (p.3)   │  📊 분석 결과              ││
│  │                  │                          ││
│  │ [PDF 뷰어]       │  ▶ 진술인: 김OO (고소인)    ││
│  │                  │  ▶ 진술 일시: 2026.01.15   ││
│  │                  │                          ││
│  │                  │  📋 핵심 진술:              ││
│  │                  │  - 2025.12.01 피의자가...  ││
│  │                  │  - 금전 피해액 500만원...   ││
│  │                  │                          ││
│  │                  │  ✅ 유리한 점:              ││
│  │                  │  - 구체적 일시 특정        ││
│  │                  │                          ││
│  │                  │  ❌ 불리한 점:              ││
│  │                  │  - 2차 진술과 날짜 불일치   ││
│  └──────────────────┴──────────────────────────┘│
└─────────────────────────────────────────────────┘
```

---

## 8. 구현 단계 (권장 순서)

### Phase 1: DB + 텍스트 기반 페이지 분류 (핵심)
1. Supabase에 `page_classifications`, `evidence_sections` 테이블 생성
2. `POST /api/classify-evidence` API 구현
   - TXT 파일 fetch → footer 태그 기준 페이지별 분리 (chunk-pdf 로직 재활용)
   - 텍스트 < 30자 페이지 → 자동 photo_evidence 분류
   - 나머지 페이지 텍스트를 배치로 Gemini 텍스트 모델에 전송 (1~5회 호출)
   - 그룹핑 → evidence_sections 저장
3. lib/database.js에 CRUD 함수 추가

### Phase 2: 분류 결과 UI
4. 사건 상세 페이지에 "증거기록 분류" 섹션 추가
5. 분류 결과 테이블 UI
6. OCR 불가 증거 설명 입력 UI (+ 선택적 Vision 설명 생성 버튼)
7. 분류 수정 (유형 변경, 섹션 분할/병합)

### Phase 3: 증거별 분석
8. 증거 유형별 분석 프롬프트 작성
9. `POST /api/evidence-sections/[id]/analyze` API
10. 개별 분석 결과 표시 UI

### Phase 4: 종합
11. 전체 증거 일괄 분석
12. 증거 간 교차 검증 (진술 비교, 모순점 등)
13. 기존 통합 분석과 연동

---

## 9. 기술적 고려사항

### 성능 (텍스트 기반 방식)
- 1,000페이지 PDF 기준:
  - OCR: Upstage 1회 호출 (기존 파이프라인)
  - 분류: Gemini 텍스트 모델 1~5회 호출 (페이지를 배치로 묶어 전송)
  - **총 소요 시간: 10~30초** (OCR 제외)
  - **비용: ~$0.01~0.05**

### 비용 비교 (1,000페이지)
| 방식 | API 호출 수 | 시간 | 비용 |
|------|------------|------|------|
| Gemini Vision (이전) | ~1,000회 | 4~67분 | ~$0.75 |
| **텍스트 기반 (현재)** | **1~5회** | **10~30초** | **~$0.01~0.05** |

### 정확도 향상 전략
- 증거목록 페이지를 먼저 분석해 "기대 증거 목록"을 확보하면 이후 분류 정확도 향상
- 2-pass 방식: 1차 자동 분류 → 사용자 확인 → 2차 보정
- 한국 법률 문서의 정형화된 패턴 ("진술조서", "수사보고", "문:", "답:" 등) 활용

### 한계
- 스캔 품질이 나쁜 PDF는 OCR 정확도 저하
- 손글씨가 포함된 진술조서는 인식 어려울 수 있음
- 복합 유형 페이지 (진술 + 첨부 사진)는 분류가 애매할 수 있음
- 사진 증거의 내용 파악은 텍스트만으로 불가 → 선택적 Vision 활용 또는 사용자 입력
