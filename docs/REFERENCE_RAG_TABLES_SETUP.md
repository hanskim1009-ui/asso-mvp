# 참고자료 RAG: Supabase 테이블 설정

Supabase 대시보드 → SQL Editor에서 아래를 순서대로 실행하세요.

## 1. pgvector 확장 (한 번만)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 2. reference_documents

```sql
CREATE TABLE IF NOT EXISTS reference_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source_description TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**이미 테이블을 만든 뒤 `file_name` 등이 없다면** (예: Could not find the 'file_name' column):

```sql
ALTER TABLE reference_documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE reference_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE reference_documents ADD COLUMN IF NOT EXISTS source_description TEXT;
```

## 3. reference_chunks (embedding + metadata)

- `embedding`: 768차원 (Gemini text-embedding-004 / embedding-001 호환)
- `metadata`: AI 태깅 결과 (topic, crime_type, summary, keywords 등)

**`reference_chunks`가 이미 다른 스키마로 있다면** (예: column "reference_document_id" does not exist)  
→ 아래에서 **먼저** `DROP TABLE ...` 한 줄만 실행한 뒤, 그 다음 블록을 실행하세요.

```sql
-- (기존 reference_chunks가 잘못된 스키마일 때만 실행)
DROP TABLE IF EXISTS reference_chunks CASCADE;
```

```sql
CREATE TABLE IF NOT EXISTS reference_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_document_id UUID NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_number INT,
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_chunks_doc ON reference_chunks(reference_document_id);
CREATE INDEX IF NOT EXISTS idx_reference_chunks_metadata ON reference_chunks USING gin(metadata);
```

## 4. 벡터 유사도 검색용 인덱스 (선택, 데이터 많을 때)

```sql
-- ivfflat: 리스트 개수는 대략 sqrt(행 수) 권장. 초기에는 100 정도로.
CREATE INDEX IF NOT EXISTS idx_reference_chunks_embedding
ON reference_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

- 청크 수가 수천 개 이상이면 `lists` 값을 늘리거나, HNSW로 바꿀 수 있음:
  `USING hnsw (embedding vector_cosine_ops)`.

## 5. 벡터 유사도 검색용 RPC (필수)

PostgREST는 pgvector 연산자를 직접 지원하지 않으므로, 아래 함수를 만든 뒤 클라이언트에서 `supabase.rpc('match_reference_chunks', { ... })`로 호출합니다.

```sql
CREATE OR REPLACE FUNCTION match_reference_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  reference_document_id uuid,
  chunk_index int,
  page_number int,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.reference_document_id,
    rc.chunk_index,
    rc.page_number,
    rc.content,
    rc.metadata,
    1 - (rc.embedding <=> query_embedding) AS similarity
  FROM reference_chunks rc
  WHERE rc.embedding IS NOT NULL
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- `<=>`: 코사인 거리. `1 - (<=>)`가 코사인 유사도에 해당합니다.

## 6. Hybrid Search (벡터 + 전문 검색, 선택)

법률 용어·판례 번호 등 정확 매칭을 위해 벡터 검색에 전문 검색을 더할 수 있습니다. 아래 적용 후 `match_reference_chunks_hybrid` RPC를 사용하세요.

### 6.1 content_tsv 컬럼 및 트리거

```sql
-- 전문 검색용 tsvector (한글 등은 'simple'로 토큰화)
ALTER TABLE reference_chunks ADD COLUMN IF NOT EXISTS content_tsv tsvector;

UPDATE reference_chunks SET content_tsv = to_tsvector('simple', coalesce(content, ''))
WHERE content_tsv IS NULL;

CREATE INDEX IF NOT EXISTS idx_reference_chunks_content_tsv
ON reference_chunks USING gin(content_tsv);

CREATE OR REPLACE FUNCTION reference_chunks_content_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reference_chunks_tsv_trigger ON reference_chunks;
CREATE TRIGGER reference_chunks_tsv_trigger
  BEFORE INSERT OR UPDATE OF content ON reference_chunks
  FOR EACH ROW EXECUTE PROCEDURE reference_chunks_content_tsv_trigger();
```

### 6.2 Hybrid RPC (RRF 병합)

```sql
CREATE OR REPLACE FUNCTION match_reference_chunks_hybrid(
  query_embedding vector(768),
  query_text text,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  reference_document_id uuid,
  chunk_index int,
  page_number int,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  k constant float := 60.0;  -- RRF 상수
BEGIN
  RETURN QUERY
  WITH
  vector_match AS (
    SELECT rc.id, rc.reference_document_id, rc.chunk_index, rc.page_number, rc.content, rc.metadata,
           1 - (rc.embedding <=> query_embedding) AS sim,
           ROW_NUMBER() OVER (ORDER BY rc.embedding <=> query_embedding) AS rn
    FROM reference_chunks rc
    WHERE rc.embedding IS NOT NULL
    LIMIT match_count * 2
  ),
  text_match AS (
    SELECT rc.id, rc.reference_document_id, rc.chunk_index, rc.page_number, rc.content, rc.metadata,
           ts_rank_cd(rc.content_tsv, plainto_tsquery('simple', regexp_replace(query_text, '\s+', ' & '))) AS sim,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(rc.content_tsv, plainto_tsquery('simple', regexp_replace(query_text, '\s+', ' & '))) DESC) AS rn
    FROM reference_chunks rc
    WHERE rc.content_tsv IS NOT NULL
      AND rc.content_tsv @@ plainto_tsquery('simple', query_text)
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT v.id, v.reference_document_id, v.chunk_index, v.page_number, v.content, v.metadata,
           (1.0 / (k + v.rn::float)) AS rrf
    FROM vector_match v
    UNION ALL
    SELECT t.id, t.reference_document_id, t.chunk_index, t.page_number, t.content, t.metadata,
           (1.0 / (k + t.rn::float)) AS rrf
    FROM text_match t
  ),
  aggregated AS (
    SELECT combined.id, combined.reference_document_id, combined.chunk_index, combined.page_number,
           combined.content, combined.metadata, SUM(combined.rrf) AS total_rrf
    FROM combined
    GROUP BY combined.id, combined.reference_document_id, combined.chunk_index, combined.page_number,
             combined.content, combined.metadata
  )
  SELECT a.id, a.reference_document_id, a.chunk_index, a.page_number, a.content, a.metadata,
         a.total_rrf::float AS similarity
  FROM aggregated a
  ORDER BY a.total_rrf DESC
  LIMIT match_count;
END;
$$;
```

- `query_text`가 비어 있거나 `content_tsv` 컬럼/트리거가 없으면 벡터 검색만 사용하는 `match_reference_chunks`를 대신 호출하는 것이 안전합니다. 앱 코드에서 hybrid RPC 실패 시 fallback 처리합니다.

## 7. RLS (선택)

참고자료는 현재 개발자 전용이므로, 필요 시 동일 프로젝트의 다른 테이블처럼 RLS 정책을 추가하면 됩니다.
