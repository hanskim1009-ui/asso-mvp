# 의견서 저장·수정이력·AI 학습 설계

## 1. 방향에 대한 평가

**제안하신 방향은 타당합니다.**

| 항목 | 평가 |
|------|------|
| **저장 후 다시 보기** | 필수 UX. 창을 닫아도 목록에서 다시 열어볼 수 있어야 함. |
| **직접 수정 + 프롬프트 수정** | 둘 다 있으면 좋음. 직접 수정은 빠른 교정, 프롬프트 수정은 구조적/대량 변경에 유리. |
| **수정이력 보관** | 감리·품질 검토·나중에 “어떤 지시로 어떻게 바뀌었는지” 분석에 유용. |
| **RAG + 수정이력 DB로 품질 향상** | 합리적. “비슷한 사건/의견서 유형”의 과거 수정 사례를 검색해 프롬프트에 넣으면, 생성·수정 품질을 점진적으로 끌어올릴 수 있음. |

**보완해서 고려할 점**

- **저장 단위**: “의견서 1건 = 1개 문서 + 여러 버전(수정이력)”으로 두면, 목록은 “의견서” 단위, 상세에서 “버전/리비전”을 선택해 보는 구조가 자연스러움.
- **학습용 데이터 형태**: RAG/학습에 쓸 때는 **(입력 요약, 사용자 지시/수정 내용, 결과 텍스트)** 3종 세트로 남기면, 나중에 “비슷한 요청 → 비슷한 수정 예시” 검색이 가능함.
- **개인정보**: 실제 사건 기반이면 학습용으로 쓸 때 익명화·동의 정책을 별도로 두는 것이 안전함.
- **단계 나누기**: 1단계) 저장 + 다시 보기 + 수정이력 저장, 2단계) RAG/학습 연동(검색·프롬프트 주입)으로 나누어 구현하면 부담이 적음.

---

## 2. 기능 요약

1. **저장**  
   - 생성된 의견서를 DB에 저장.  
   - 사건·분석 결과에 연결해, 창을 닫았다가 나중에 “저장된 의견서 목록”에서 다시 열어볼 수 있게 함.

2. **직접 수정**  
   - 현재 보고 있는 의견서 본문을 텍스트(또는 마크다운)로 수정.  
   - 저장 시 “새 리비전”으로 기록 (이전 본문은 수정이력에 유지).

3. **프롬프트로 수정**  
   - 사용자가 수정 지시문 입력 (예: “피고인 가족 상황을 앞부분에 한 단락 추가해줘”).  
   - AI가 현재 본문 + 지시문으로 수정본 생성 → 그 결과를 새 리비전으로 저장.

4. **수정이력**  
   - 각 의견서에 대해 “버전” 리스트 유지.  
   - 각 버전: 생성/수정 시점, 생성/직접수정/프롬프트수정 구분, (프롬프트 수정인 경우) 사용자 지시문, 본문 스냅샷.

5. **AI 학습 활용 (RAG + 수정이력 DB)**  
   - 수정이력(및 생성 시 사용한 분석 요약·프롬프트)을 DB에 구조화해 저장.  
   - 추후: 유사 사건/의견서 유형/질의로 검색해, “좋은 수정 예시”를 RAG 컨텍스트나 few-shot으로 생성·수정 API에 넣어 품질 향상.

---

## 3. DB 스키마 제안

### 3.1 의견서 (문서 단위)

```sql
-- opinion_drafts: 의견서 1건 (최신 본문은 여기 또는 항상 latest_revision에서 가져옴)
CREATE TABLE opinion_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  opinion_type TEXT NOT NULL,
  model TEXT NOT NULL,
  title TEXT NOT NULL,
  -- 최신 본문(캐시). 수정 시 마지막 리비전과 동기화
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opinion_drafts_case ON opinion_drafts(case_id);
CREATE INDEX idx_opinion_drafts_analysis ON opinion_drafts(analysis_result_id);
```

### 3.2 수정이력 (버전 단위)

```sql
-- opinion_revisions: 의견서별 수정이력 (생성 = rev 1, 수정할 때마다 추가)
CREATE TABLE opinion_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opinion_draft_id UUID NOT NULL REFERENCES opinion_drafts(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  body TEXT NOT NULL,
  -- 생성 | direct_edit | prompt_edit
  revision_type TEXT NOT NULL DEFAULT '생성',
  -- 프롬프트 수정인 경우: 사용자가 입력한 수정 지시
  user_instruction TEXT,
  -- 생성 시 사용한 추가 프롬프트; rev 1일 때만 의미 있음
  initial_user_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opinion_draft_id, revision_number)
);

CREATE INDEX idx_opinion_revisions_draft ON opinion_revisions(opinion_draft_id);
```

- **의견서 생성 시**: `opinion_drafts` 1행 삽입, `opinion_revisions`에 `revision_number=1`, `revision_type='생성'`, `body=생성본문`, `initial_user_prompt=사용자 추가 지시` 저장.
- **직접 수정 시**: `opinion_drafts.body`와 `updated_at` 갱신, `opinion_revisions`에 새 행 추가 (`revision_type='direct_edit'`, 새 `body`).
- **프롬프트 수정 시**: AI 결과를 새 리비전으로 `opinion_revisions`에 추가 (`revision_type='prompt_edit'`, `user_instruction=수정 지시`, `body=수정본`), `opinion_drafts.body`도 동일 내용으로 갱신.

### 3.3 학습용 테이블 (RAG/품질 향상용, 2단계)

나중에 “비슷한 수정 사례” 검색·주입을 할 때 사용할 수 있도록, 수정이력에서 추출한 데이터를 넣을 수 있는 테이블 예시는 아래와 같음.

```sql
-- opinion_learning_examples: RAG/ few-shot용 (선택, 2단계)
CREATE TABLE opinion_learning_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opinion_type TEXT NOT NULL,
  model TEXT,
  -- 요약(분석 요약 + 의견서 종류 등). 임베딩/키워드 검색용
  input_summary TEXT,
  user_instruction TEXT,
  body_before TEXT,
  body_after TEXT NOT NULL,
  revision_id UUID REFERENCES opinion_revisions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opinion_learning_type ON opinion_learning_examples(opinion_type);
-- 추후: embedding column + vector index (pgvector 등) for RAG
```

- `revision_id`로 원본 수정이력과 연결해, “이 예시는 어떤 리비전에서 왔는지” 추적 가능.
- 2단계에서 “학습 예시로 등록” 버튼을 두거나, 특정 조건(예: 사용자 평가 “좋음”)일 때만 이 테이블에 넣는 방식으로 제어 가능.

---

## 4. API 제안

| 용도 | 메서드 | 경로 | 비고 |
|------|--------|------|------|
| 의견서 생성 | POST | `/api/opinion/generate` | 기존. 성공 시 DB 저장 옵션 추가 (body에 `save: true` 등). |
| 저장된 의견서 목록 | GET | `/api/cases/[caseId]/opinions` | 해당 사건의 `opinion_drafts` 목록 (최신 본문 또는 마지막 리비전 요약). |
| 의견서 1건 + 리비전 목록 | GET | `/api/opinions/[id]` | draft + 해당 draft의 `opinion_revisions` 목록. |
| 본문 직접 수정 | PATCH | `/api/opinions/[id]` | body `{ body: "새 본문" }` → 새 리비전 추가, draft.body 갱신. |
| 프롬프트로 수정 | POST | `/api/opinions/[id]/revise` | body `{ instruction: "수정 지시" }` → AI 호출 → 새 리비전 추가. |
| 특정 리비전 조회 | GET | `/api/opinions/[id]/revisions/[revId]` 또는 `?revision=2` | 해당 버전 본문 반환. |

---

## 5. UI 플로우 제안

1. **의견서 생성 후**  
   - 기존처럼 결과 표시 + **저장** 버튼 추가.  
   - 저장 시 `POST /api/opinion/generate`에 `save: true`를 넘기거나, 생성 응답 후 `POST /api/opinions`로 저장.

2. **저장된 의견서 다시 보기**  
   - 사건 상세(분석 탭 또는 별도 “의견서” 탭)에 **저장된 의견서** 목록.  
   - 한 건 클릭 시 해당 의견서 상세(최신 본문 + 수정이력 목록).

3. **상세 화면**  
   - 최신 본문 표시.  
   - **직접 수정**: 편집 모드로 전환 → 텍스트 수정 → “저장”(새 리비전).  
   - **AI로 수정**: “수정 지시” 입력란 + “AI 수정” 버튼 → `/api/opinions/[id]/revise` 호출 → 결과를 새 리비전으로 저장하고 화면 갱신.

4. **수정이력**  
   - 같은 화면에서 “이전 버전” 목록(날짜, 생성/직접수정/프롬프트수정, 지시문 요약).  
   - 버전 클릭 시 해당 리비전 본문만 읽기로 표시.

5. **학습 예시 등록 (2단계)**  
   - 특정 리비전에 “학습 예시로 사용” 버튼 → `opinion_learning_examples`에 넣거나, “좋은 수정” 플래그만 두고 배치로 추출하는 방식.

---

## 6. RAG + 수정이력 DB로 품질 향상 (2단계 요약)

- **저장되는 것**: 의견서 생성 시 사용한 분석 요약·의견서 종류·모델·사용자 추가 지시, 그리고 각 수정에서의 “지시문 + 수정 전/후 본문”.
- **활용 방식**  
  - **Few-shot**: 의견서 유형·사건 유형별로 “좋은 수정 예시”를 골라, 생성/수정 프롬프트에 “다음과 같은 수정 예시를 참고하세요: ...” 형태로 붙임.  
  - **RAG**: `input_summary` 또는 `user_instruction`을 임베딩해, 현재 요청과 유사한 과거 수정 사례를 검색한 뒤, 그 “지시문 + 결과”를 컨텍스트로 넣음.
- **구현 순서 제안**: 먼저 저장·수정이력·목록/상세/직접수정/프롬프트수정까지 구현하고, 그 다음 “학습 예시 테이블 + 검색/주입”을 붙이는 식으로 진행.

---

이 설계대로면 “창을 닫아도 다시 보기” + “직접/프롬프트 수정” + “수정이력”을 1단계로, “RAG + 수정이력 DB로 학습”을 2단계로 나누어 구현할 수 있습니다.
