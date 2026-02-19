# 의견서 생성 기능 설계

## 1. 개요

- **입력**: 선택한 분석 결과(JSON) + 사건 컨텍스트 + 의견서 종류 + 이용자 추가 지시
- **처리**: 의견서 종류별 기본 프롬프트 + 이용자 프롬프트 → 단일 최종 프롬프트로 AI 호출
- **AI 선택**: Gemini 2.5 Flash / Gemini Pro / Claude Sonnet 4.5 중 선택 (개발 단계 비교용)
- **출력**: 의견서 본문(마크다운), 저장 시 제목·종류·모델·생성일 보관

---

## 2. API 스펙

### `POST /api/opinion/generate`

**Request Body**

```ts
{
  // 분석 결과 전체 (현재 화면에서 선택한 분석의 result)
  analysis: {
    summary?: string;
    issues?: string[];
    timeline?: Array<{ date?: string; event?: string; source?: string; page?: number }>;
    evidence?: Array<{ type?: string; description?: string; page?: number }>;
    favorable_facts?: string[];
    contradictions?: Array<{ statement_1?: string; statement_2?: string; analysis?: string }>;
    document_ids?: string[];
    case_id?: string;
  };
  // 사건/대리인 컨텍스트 (cases.user_context 또는 편집 중인 값)
  userContext?: {
    representing?: 'defendant' | 'plaintiff';
    case_background?: string;
    defendant_claim?: string;
    plaintiff_claim?: string;
    focus_areas?: string;
  };
  // 의견서 종류 (아래 OPINION_TYPES 키와 동일)
  opinionType: string;
  // 이용자 추가 지시 (선택)
  userPrompt?: string;
  // 사용할 AI 모델
  model: 'gemini-2.5-flash' | 'gemini-pro' | 'claude-sonnet-4.5';
}
```

**Response (성공)**

```ts
{
  success: true;
  opinion: {
    title: string;   // 예: "양형의견서 - 2026-02-15"
    body: string;   // 마크다운 본문
    model: string;
    opinionType: string;
    generatedAt: string; // ISO
  };
}
```

**Response (실패)**

```ts
{ success: false; error: string; }
```

**에러 코드**

- `400`: analysis 없음, opinionType/ model 잘못됨
- `500`: API 키 없음, 모델 호출 실패

---

## 3. 의견서 종류별 기본 프롬프트

개발 단계에서는 **코드 상 상수**로 관리. 추후 DB/설정 테이블로 이전 가능.

### 3.1 구조 (코드에서 사용할 형태)

```js
// lib/opinionPrompts.js (신규)

export const OPINION_TYPES = {
  sentencing: {
    id: 'sentencing',
    label: '양형의견서',
    defaultPrompt: `...`,  // 아래 3.2 참고
  },
  not_guilty: {
    id: 'not_guilty',
    label: '무죄주장 의견서',
    defaultPrompt: `...`,
  },
  // 추후 추가: search_warrant_objection, evidence_exclusion, etc.
}
```

### 3.2 양형의견서 (sentencing)

**필수 포함 요소**: 피고인 인적사항, 범죄사실 요약, 양형 요소(감경·가중), 참작 사유, 판례 인용, 구체적 양형 주장(선고 유예·집행 유예·벌금 등).

```text
당신은 한국 형사사건에서 피고인을 대리하는 변호사입니다.
아래 지시에 따라 **양형의견서**를 작성하세요.

【양형의견서에 반드시 포함할 내용】
1. 피고인 인적사항 (나이, 직업, 가족관계, 전과 등)
2. 범죄사실의 요지 (간단 요약)
3. 양형 참작 사유
   - 피고인에게 유리한 정황 (반성, 피해 회복, 협조, 생활상황 등)
   - 가중 사유가 있다면 그에 대한 소명
4. 관련 판례 또는 양형 기준 (가능한 범위에서)
5. 구체적 양형 주장 (선고 유예, 집행 유예, 벌금, 징역·금고 기간 등) 및 이유

【형식】
- 제목, 당사자 표시, 주문(양형 요청), 이유 순으로 작성
- 법리와 사실관계를 구분하여 명확히 서술
- 한국어 존댓말, 법률 용어 사용
```

### 3.3 무죄주장 의견서 (not_guilty)

**필수 포함 요소**: 공소사실 요약, 증거 요약, 증거능력·증명력 비판, 합리적 의심·무죄 사유, 결론(무죄 주장).

```text
당신은 한국 형사사건에서 피고인을 대리하는 변호사입니다.
아래 지시에 따라 **무죄주장 의견서**를 작성하세요.

【무죄주장 의견서에 반드시 포함할 내용】
1. 공소사실의 요지
2. 쟁점 정리 (사실관계·법률관계)
3. 증거에 대한 비판
   - 증거능력 (위법수집, 임의성 등)
   - 증명력 (모순, 간접증거만 있는 경우, 합리적 의심)
4. 피고인에게 유리한 정황 및 진술 요지
5. 검찰(피해자) 주장에 대한 반박
6. 결론: 범죄사실이 증명되지 않았음을 논리적으로 서술하고 무죄를 주장

【형식】
- 제목, 당사자 표시, 주문(무죄 선고 요청), 이유 순으로 작성
- 증거 번호·페이지를 인용할 때는 제공된 분석의 페이지 번호를 활용
- 한국어 존댓말, 법률 용어 사용
```

### 3.4 추가 종류 (확장용)

- `evidence_exclusion`: 증거배제 의견서 (위법수집증거 등)
- `bail`: 보석 청구 의견서
- `other`: 기타 의견서 (이용자 프롬프트에 전적으로 의존)

---

## 4. 최종 프롬프트 조합 방식

1. **시스템/역할**:  
   `당신은 한국 형사변호 전문 변호사입니다.`

2. **의견서 종류별 기본 프롬프트**:  
   `OPINION_TYPES[opinionType].defaultPrompt` 전체 삽입.

3. **입력 데이터 블록** (한 번만):  
   - 분석 결과를 읽기 쉬운 텍스트로 직렬화  
     - 예: `## 사건 요약\n{summary}\n\n## 쟁점\n{issues}\n\n## 타임라인\n...`
   - `userContext`가 있으면 `대리인: 피고인/피해자`, `사건 배경`, `주장`, `중점 사항` 등 요약 추가.

4. **이용자 추가 지시**:  
   `userPrompt`가 있으면  
   `【이용자 추가 지시】\n{userPrompt}`  
   형태로 맨 뒤에 붙임.

5. **출력 지시**:  
   `위 내용과 분석 데이터를 바탕으로 의견서 본문만 작성하세요. 마크다운 형식으로 제목(##), 소제목(###), 번호 목록을 활용하세요.`

---

## 5. 입력 데이터 직렬화 예시

API 내부에서 `analysis` + `userContext`를 아래와 같이 문자열로 만든 뒤 프롬프트에 넣는다.

```text
【분석 결과】
## 사건 요약
{analysis.summary}

## 쟁점
- {analysis.issues?.join('\n- ')}

## 타임라인
| 일자 | 사건 | 출처 | 페이지 |
| ... |

## 증거
| 유형 | 내용 | 페이지 |
| ... |

## 유리한 정황
- {analysis.favorable_facts?.join('\n- ')}

## 모순·의문점
{analysis.contradictions 배열 서술}

【사건 컨텍스트】
- 대리: 피고인 / 피해자
- 사건 배경: {userContext.case_background}
- 피고인 측 주장: {userContext.defendant_claim}
- 검찰/피해자 측 주장: {userContext.plaintiff_claim}
- 중점 사항: {userContext.focus_areas}
```

분석 결과가 매우 길면 `summary` + `issues` + `evidence` 요약 + `favorable_facts` 위주로 자르거나, 토큰 수를 계산해 상한을 둘 수 있음 (예: 12000 토큰).

---

## 6. AI 모델 라우팅

| model 값 | API 모델 ID | 사용 SDK | 환경 변수 |
|----------|-------------|----------|-----------|
| `gemini-2.5-flash` | `gemini-2.5-flash` | @google/generative-ai | GEMINI_API_KEY |
| `gemini-pro` | `gemini-2.5-pro` 또는 `gemini-1.5-pro` | @google/generative-ai | GEMINI_API_KEY |
| `claude-sonnet-4.5` | `claude-sonnet-4-5-20250929` (별칭: `claude-sonnet-4-5`) | @anthropic-ai/sdk | ANTHROPIC_API_KEY |

- 요청 시 선택한 `model` 값으로 분기.
- 해당 API 키가 없으면 500 + "해당 모델을 사용하려면 OOO_API_KEY가 필요합니다" 반환.

---

## 7. 출력 형식 및 저장

- **출력**: 의견서 본문은 **마크다운** 한 덩어리로 반환 (제목·주문·이유 포함).
- **저장 (선택)**:  
  - 테이블 예: `opinion_drafts`  
    - `id`, `case_id`, `analysis_result_id`, `opinion_type`, `model`, `title`, `body`(text), `user_prompt`(text), `created_at`  
  - 구현 시점에서 “저장” 버튼을 둘지, “생성만 하고 복사/다운로드”만 할지 결정 가능.

---

## 8. UI 플로우

1. **진입**: 사건 상세 → 분석 탭 → **분석 결과 하나 선택** (이미 구현된 `selectedAnalysis`).
2. **버튼**: 선택된 분석이 있을 때만 활성화되는 **「의견서 작성」** 버튼 노출.
3. **다이얼로그/패널**:
   - 의견서 종류: 드롭다운 (양형의견서, 무죄주장 의견서, …).
   - AI 모델: 라디오 또는 드롭다운 (Gemini 2.5 Flash / Gemini Pro / Claude Sonnet 4.5).
   - 이용자 추가 지시: 텍스트 영역 (선택).
   - **생성** 클릭 → `POST /api/opinion/generate` 호출.
4. **결과**: 로딩 후 생성된 본문을 마크다운 렌더링하여 표시. (복사, 다운로드(.md), 필요 시 저장 버튼.)

---

## 9. 구현 체크리스트

- [ ] `lib/opinionPrompts.js`: OPINION_TYPES 상수 (양형, 무죄주장, 기타).
- [ ] `app/api/opinion/generate/route.js`:  
  - body 검증, analysis 직렬화, 기본 프롬프트 + userPrompt 조합, model 분기, Gemini/Claude 호출, 응답 반환.
- [ ] 환경 변수: `.env.local`에 `ANTHROPIC_API_KEY` (Claude 사용 시).
- [ ] 사건 상세 분석 영역: 「의견서 작성」 버튼 + 모달(의견서 종류, 모델, 추가 지시, 생성 결과 표시).
- [ ] (선택) `opinion_drafts` 테이블 + 저장 API + 목록/상세 UI.

이 문서를 기준으로 API·프롬프트·UI를 구현하면 된다.
