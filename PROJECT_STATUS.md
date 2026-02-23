# ASSO MVP - 프로젝트 현황

## 📊 현재 상태 (2026-02-22)

### 개발 완료 ✅
- Phase 1: 기본 PDF 업로드 및 AI 분석 (Gemini 2.5 Flash)
- Phase 2: Case 관리 시스템, 분석 히스토리
- Phase 3: 문서/분석 관리 기능 (삭제, 제목 수정)
- Phase 4: 분석 활용 기능
  - 분석 결과 메모/코멘트 (타임라인·증거 항목별 메모)
  - 분석 결과 비교 (2개 선택 후 나란히 비교)
  - 차이 강조 (시간순 기준 삭제됨/추가됨/수정됨, 요약 단어 diff)
  - AI 수정 시 **새 분석으로 저장** → 수정 전/후 비교 가능
- **증거기록 분류·분석**
  - PDF 업로드 후 "증거기록 분류" → 페이지별 텍스트 기반 AI 분류 → 증거 섹션 그룹핑
  - OCR 불가 페이지는 사용자 설명 입력
  - 증거별 개별 분석 (유형별 프롬프트)
- **증거 분류 후 Vision 추가 분석** (2026-02-15)
  - 사진 증거·OCR 불가 섹션에 **「Vision으로 설명 생성」** 버튼
  - 클라이언트에서 PDF 해당 페이지를 이미지로 렌더 → Gemini Vision으로 설명 생성 → `vision_description` 저장
  - 개별 증거 분석 시 원문 + Vision 설명 + 메모를 함께 AI에 전달
  - API: `POST /api/evidence-sections/[id]/describe-with-vision` (Body: `imageBase64`)
- **원문 키워드 검색 페이지 번호 정확도**
  - Upstage OCR `elements` 기반 페이지별 텍스트 사용 → PDF 실제 페이지(1,2,3...)로 통일
  - fallback: footer 태그 순서
- **통합 분석(선택한 문서 분석)**
  - AI 응답 JSON 파싱 보강 (앞뒤 설명문 제거 후 `{ ... }`만 추출)
  - 저장 실패 시에도 분석 결과는 클라이언트에 반환
  - **(2026-02-20)** 선택한 문서에 해당하는 **증거기록 분류·분석 내용**을 참고하여 통합 분석 (evidenceContext)
  - **(2026-02-20)** 문서 분석 시에도 **페이지별 텍스트(_pages.json)** 사용 → `[문서 N - k페이지]` 표기로 페이지 참조 정확도 향상
- **증거기록 분류 삭제 (2026-02-20)**
  - 문서별 「분류 삭제」 버튼 → 해당 문서의 evidence_sections, page_classifications 전부 삭제 (API: `DELETE /api/documents/[id]/evidence-classification`)
- **문서 업로드 (2026-02-20)**
  - 「텍스트 (기본)」 선택 시 업로드·OCR·청킹이 되지 않던 현상 수정 (저장 조건을 `txtFileUrl` 기준으로 변경)
  - **OCR 좌표 포함 옵션**: 업로드 시 「좌표 포함 (coordinates)」 체크 시 Upstage에 coordinates: true 전달 (텍스트 레이어 구현 기반)
- **분석 상세 PDF 뷰어 (2026-02-20)**
  - 타임라인·증거의 페이지 참조(p.N) 클릭 시 **분석 상세 칸 밖** 오른쪽에 PDF 뷰어 고정
  - 넓은 패널(min(560px,55vw)), 페이지 표시·이전/다음·확대/축소, 진한 툴바 스타일
- **텍스트 레이어 오버레이**: 원문 키워드 검색 뷰어에 OCR 텍스트 겹치기 시도 후 전면 revert (내일 재시도 예정)
- **의견서 2단계 생성 (2026-02-20)**
  - **1차**: 비싼 모델(Claude Opus 4.5 등)로 **목차 + "다른 AI에게 쓸 지시문(metaPrompt)"** 생성.
  - **2~4차**: 가성비 모델(Gemini 2.5 Flash 등)로 본문을 파트별로 수동 실행 (2차 → 3차 → 4차).
  - 사건 상세에서 **1차 AI 모델 / 2~3차 AI 모델** 각각 선택 가능. 테스트용으로 1차 실행 후 사용자 확인 → 2~4차 수동 진행.
  - API: `POST /api/opinion/generate-outline` (목차·지시문), `POST /api/opinion/generate-chunk` (본문 파트).
  - `lib/opinionPrompts.js`에 Claude Opus 4.5 추가, `getOpinionLearningExamples`는 `lib/database.js`에서 export (학습 예시 테이블 없으면 빈 배열).
- **참고자료 RAG (2026-02-20)**
  - 참고자료(양형기준표, 판례 등) PDF 업로드 → 청킹·임베딩·메타데이터 태깅 → 벡터 검색으로 의견서 프롬프트에 삽입.
  - `reference_documents`, `reference_chunks` 설계·테이블 설정 문서: `docs/REFERENCE_RAG_DESIGN.md`, `docs/REFERENCE_RAG_TABLES_SETUP.md`.
  - 의견서 관련 테이블·학습 예시: `docs/OPINION_TABLES_SETUP.md`, `docs/OPINION_PERSISTENCE_AND_LEARNING.md`.
- **참고자료 RAG 고도화 (2026-02-21)**
  - Contextual Chunking: 청크 저장 전 AI 맥락 문장 붙여 검색 품질 향상. `lib/contextualChunk.js`, ingest 시 `skipContextualize` 옵션.
  - Hybrid Search: `content_tsv` + `match_reference_chunks_hybrid` RPC(벡터+전문 검색 RRF). reference-preview에서 사용.
  - 섹션 청킹 정규식 보강(제○조, ① ②, (가) 등). `docs/RAG_TECHNIQUES_AND_IMPLEMENTATION.md` 추가.
- **문서 업로드 — 디지털/스캔 구분 (2026-02-21)**
  - PDF 유형 선택: 스캔본(OCR) / 디지털 원본(OCR 없이 pdfjs 텍스트 추출). `POST /api/extract-pdf-text`, 사건 페이지 업로드 UI·플로우 반영.
- **HWP(한글) 입력 지원 (2026-02-22)**
  - 문서 업로드 시 .hwp 파일 허용. `hwp.js`로 파싱 후 텍스트 추출, `POST /api/extract-hwp-text`. 응답 형식은 OCR/PDF와 동일(txtFileUrl, txtFileName, pageTextsUrl). 청킹·분석·검색 플로우 동일 적용.
- **엔티티 분석 (2026-02-21)**
  - 분석 결과에서 **인물·장소·관계·증거물** 추출. 선택한 분석 기준으로 별도 실행 후 해당 분석 result에 entities 병합 저장.
  - API: `POST /api/analyze-entities` (analysisId, texts, documentIds, analysis, userContext) → Gemini 2.5 Flash로 persons/locations/relationships/evidence_items JSON 추출.
  - 사건 상세: 「엔티티 분석」 버튼, 인물 카드(역할 배지·별칭·핵심 진술·신빙성 메모·p.N 링크), 관계 테이블, 장소 목록, 증거물(엔티티) 목록.
- **분석 리포트 PDF 다운로드 (2026-02-22)**
  - 사건 상세 > 분석 상세에서 「리포트 PDF 다운로드」 버튼. 선택한 분석 결과(요약, 쟁점, 증거, 유리한 정황, 타임라인, 모순점, 엔티티)를 1페이지 PDF로 생성. `@react-pdf/renderer` + NotoSansKR 한글 폰트. 클라이언트 생성, 비용 0원.
- **AI 프롬프트 다운로드 (2026-02-22)**
  - 「프롬프트 다운로드 ▾」 드롭다운: 의견서 / 변론요지서 / 보석·구속적부심 청구서 / 탄핵자료 정리용. 선택 시 분석 데이터가 채워진 프롬프트 .txt 다운로드. `lib/analysisPromptTemplates.js` 템플릿 + `fillTemplate()` (AI 호출 없음).
- **페이지 번호 검증 (2026-02-22)**
  - 「페이지 검증」 버튼: 분석에 사용된 문서의 _pages.json을 불러와 각 페이지 참조에 대해 inRange(범위 내)·contentMatch(원문 키워드 포함) 검사. 타임라인·증거에 ✅/⚠️ 배지, 상단에 요약 표시. `lib/analysisPageVerification.js`, AI 호출 없음.
- **기타 (2026-02-21)**
  - pdfjs CMap 경고 수정: cMapUrl을 5.4.624/files/cmaps 로 변경. 혼합 PDF 페이지 단위 처리 → FEATURES.md 보류 목록에 추가.

### 전략 방향 전환 (2026-02-22)

#### 경쟁력 분석 결과
- 해외(Paxton AI, NexLaw ChronoVault, Harvey AI)·국내(엘박스, 넥서스AI, BHSN, 아미쿠스렉스) 경쟁사 분석 완료.
- 상세 분석: `docs/COMPETITIVE_ANALYSIS_2026-02-22.md`
- **ASSO 핵심 강점**: "수사기록 → 구조화 분석" 올인원 파이프라인. 국내에 동일한 서비스 없음.
- **ASSO 약점**: 판례 DB 연동 없음, 양형 예측 없음, 법정용 출력(Word/PDF) 없음.

#### 의견서 생성 → "분석 PDF + 프롬프트 다운로드" 전환
- **이유**: 의견서 인앱 생성은 고비용 모델(Claude Opus 4.5 등) 사용 필요. 사용자가 반복 실행 시 월 구독료(1~3만 원) 대비 AI 비용 초과 위험.
- **경쟁사 가격대**: Paxton $99/월, Harvey $100+/월. 1~3만 원 가격대에서 인앱 서면 생성은 수익성 불가.
- **새 방식 (방식 C: 템플릿 + 데이터 삽입)**:
  1. AI 분석(Gemini Flash, 건당 ~2원)으로 구조화된 결과(JSON) 저장.
  2. 사용자가 "리포트 다운로드" 클릭 → 코드가 템플릿에 분석 데이터를 삽입하여 PDF + 프롬프트 생성. **AI 추가 호출 없음, 비용 0원.**
  3. 사용자는 다운받은 PDF·프롬프트를 자신의 AI(ChatGPT, Claude 등)에 제공하여 의견서·보석청구서 등 작성.
- **장점**: 비용 구조 안정, 차별화 집중(분석 파이프라인), 사용자 자유도(선호 AI·스타일 선택), 프롬프트 종류 무한 확장 가능.
- **다운로드 패키지 구성안**:
  - 분석 리포트 PDF (요약, 쟁점, 타임라인, 증거, 유리한 정황, 모순점, 엔티티)
  - AI 프롬프트 세트 (의견서, 변론요지서, 보석청구서, 탄핵자료 등 템플릿별)
- **향후**: 수익 구조 안정 후 프리미엄 티어에서 인앱 서면 생성 제공 가능.

#### 판례 연동 관련
- 판례 DB 자체 수집은 현실적으로 어려움(엘박스 405만건, 대법원 AI 플랫폼 등 선점).
- 당분간 판례 연동 없이 "수사기록 분석 파이프라인" 가치에 집중.
- 추후 엘박스 API 또는 외부 판례 검색 연동 검토.

### 비용
- 분석 1건당: ~₩2원 (Gemini Flash)
- 프롬프트·PDF 생성: 0원 (템플릿 + 데이터 삽입, AI 호출 없음)
- 월 예상: 테스터 5명 × 10건 = ~₩100/월
- **목표 가격**: 월 ₩10,000 ~ ₩30,000

### 주요 의사결정
1. **Soft Delete**: 사용자 데이터 = 자산, 실제 삭제 안 함
2. **Few-shot Learning**: Supabase RLS 설정 시 재활성화 가능 (`docs/SUPABASE_FEW_SHOT_SETUP.md` 참고)
3. **의견서 인앱 생성 보류**: 비용 문제로 "분석 PDF + 프롬프트 다운로드" 방식 채택 (2026-02-22)
4. **판례 DB 자체 구축 보류**: 엘박스 등 기존 서비스 대비 경쟁 불가. 분석 파이프라인에 집중 (2026-02-22)

### 베타 배포 준비도
- 기능: 95% 완성 (분석 리포트 PDF 다운로드 구현 필요)
- 안정성: 테스트 필요
- 다음: 사용자 테스트 → 피드백 수집
