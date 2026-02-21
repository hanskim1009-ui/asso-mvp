# RAG 기법 정리 및 ASSO 구현 (2026-02-21)

## 1. 현재 구현 진단

### 1.1 청킹 (`lib/chunkText.js`)

| 방식 | 함수 | 설명 | 한계 |
|------|------|------|------|
| 고정 크기 문단 | `chunkFullText` | `\n\n` 문단 분리, chunkSize 초과 시 자름 | 의미 경계 무시 |
| 페이지별 | `chunkByPageTexts` | 페이지 단위 후 내부 문단 청킹 | 페이지가 의미 단위가 아닐 수 있음 |
| 섹션 | `chunkBySections` | `제N장`, `가.`, `1.` 등 정규식으로 구간 분리 | 패턴에 없는 문서는 결국 고정 크기 |

**결론**: 규칙 기반이라 **의미 단위 청킹이 아님**. 잘린 청크에 "어떤 문서·어디 부분인지" 맥락이 없고, 임베딩도 청크만으로 생성해 검색 품질이 떨어질 수 있음.

---

## 2. 2025~2026 주요 RAG 기법

### 2.1 Anthropic Contextual Retrieval (맥락 붙이기)

- **핵심**: 저장·임베딩 전에 AI가 "이 청크가 전체 문서에서 어떤 위치/맥락인지" 설명문을 붙임.
- **효과**: 검색 실패율 49% 감소, 리랭킹 시 67% 감소.
- **구현**: 청크 + 문서 제목(또는 전체 문서 일부)을 AI에 넘겨 짧은 맥락 문장 생성 → `[맥락] ... \n\n[본문] ...` 형태로 저장·임베딩.

### 2.2 Late Chunking (Jina AI)

- **핵심**: 문서 전체를 먼저 long-context 임베딩 모델에 넣은 뒤, 그 출력을 구간별로 나눔.
- **장점**: 추가 AI 호출 없이 맥락 보존.
- **단점**: 8K 토큰급 임베딩 모델 필요. 현재 Gemini embedding으로는 적용 어려움.

### 2.3 Semantic Chunking (의미 단위 청킹)

- **핵심**: 문장 단위 임베딩 후, 인접 문장 간 유사도가 급격히 떨어지는 지점에서 분할.
- **장점**: 진짜 의미 경계로 분할.
- **단점**: 문장마다 임베딩 비용·시간. 법률 문서는 구조(장/절/항)가 있어 섹션+맥락이 더 효율적일 수 있음.

### 2.4 SmartChunk / Agentic RAG / GraphRAG

- 쿼리 적응형 청크, 에이전트 기반 검색, 지식 그래프 등 — 효과는 크나 구현 복잡도가 높아 MVP에서는 보류.

### 2.5 Hybrid Search (BM25 + Vector)

- **핵심**: 벡터 유사도만으로는 "대법원 2023도1234" 같은 정확한 키워드를 놓침. BM25(또는 PostgreSQL `tsvector`/`tsquery`) + 벡터 검색 결합.
- **장점**: 법률 용어·판례 번호 등 정확 매칭에 유리.

---

## 3. ASSO 채택 전략

| 순위 | 기법 | 적용 내용 |
|------|------|-----------|
| 1 | **Contextual Chunking** | 참고자료 ingest 시 청크별로 AI 맥락 생성 → content에 `[맥락] ... \n\n` 접두 후 저장·임베딩. |
| 2 | **Hybrid Search** | `reference_chunks`에 `content_tsv`(tsvector) 추가, 벡터 검색 + 전문 검색 RRF 병합. |
| 3 | **섹션 청킹 보강** | `chunkBySections` 정규식 확장(다양한 장/절/항 패턴). |

**보류**: Late Chunking(모델 제약), SmartChunk/Agentic RAG(복잡도), 순수 Semantic Chunking(비용 대비 섹션+맥락이 더 적합).

---

## 4. 구현 상세

### 4.1 Contextual Chunking

- **위치**: `lib/contextualChunk.js` — `getChunkContext(documentTitle, fullTextExcerpt, chunkText)` (Gemini Flash).
- **저장 형식**: `content = "[맥락] " + context + "\n\n" + chunkText`. 기존 태깅·임베딩은 이 content 기준 유지.
- **호출 시점**: `POST /api/reference-documents/ingest` — 청킹 직후, `insertReferenceChunks` 전에 청크별 맥락 생성 후 content 치환. FormData에 `skipContextualize=true`면 맥락 생성 생략(기존처럼 원문만 저장).

### 4.2 Hybrid Search

- **DB**: `reference_chunks`에 `content_tsv tsvector` 추가, 트리거로 자동 갱신, GIN 인덱스. RPC `match_reference_chunks_hybrid(query_embedding, query_text, match_count)`에서 벡터 검색 + `content_tsv @@ plainto_tsquery(query_text)` 결과를 RRF로 병합.
- **앱**: `lib/referenceChunks.js`에 `searchReferenceChunksHybrid(queryText, matchCount)`. RPC 미존재 시 기존 벡터 검색으로 fallback.
- **사용처**: `POST /api/opinion/reference-preview`에서 `searchReferenceChunksHybrid` 사용. RPC/컬럼 미설치 시 자동으로 벡터 검색만 사용.

### 4.3 섹션 청킹 보강

- **위치**: `lib/chunkText.js` — `chunkBySections`의 `sectionStartRe`에 법률 문서에서 자주 쓰이는 패턴 추가(예: `(가)(나)(다)`, `제1조`, `① ②` 등).

---

## 5. 참고 문헌·출처

- Anthropic, [Contextual Retrieval in AI Systems](https://www.anthropic.com/news/contextual-retrieval) (2024).
- Jina AI, [Late Chunking in Long-Context Embedding Models](https://jina.ai/news/late-chunking-in-long-context-embedding-models) (2024).
- ChunkRAG, Recursive Semantic Chunking, SmartChunk 등 논문/블로그 (2024–2025).
