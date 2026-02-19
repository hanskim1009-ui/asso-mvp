# 의견서 저장·수정이력 테이블 설정

Supabase 대시보드 → SQL Editor에서 아래를 실행하세요.

## 1. 테이블 생성

```sql
-- opinion_drafts: 의견서 1건 (최신 본문 캐시)
CREATE TABLE IF NOT EXISTS opinion_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  opinion_type TEXT NOT NULL,
  model TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opinion_drafts_case ON opinion_drafts(case_id);
CREATE INDEX IF NOT EXISTS idx_opinion_drafts_analysis ON opinion_drafts(analysis_result_id);

-- opinion_revisions: 의견서별 수정이력
CREATE TABLE IF NOT EXISTS opinion_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opinion_draft_id UUID NOT NULL REFERENCES opinion_drafts(id) ON DELETE CASCADE,
  revision_number INT NOT NULL,
  body TEXT NOT NULL,
  revision_type TEXT NOT NULL DEFAULT '생성',
  user_instruction TEXT,
  initial_user_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opinion_draft_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_opinion_revisions_draft ON opinion_revisions(opinion_draft_id);

-- opinion_learning_examples: 수정이력 기반 학습 예시 (Few-shot / RAG용, 2단계)
CREATE TABLE IF NOT EXISTS opinion_learning_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opinion_type TEXT NOT NULL,
  model TEXT,
  input_summary TEXT,
  user_instruction TEXT,
  body_before TEXT,
  body_after TEXT NOT NULL,
  revision_id UUID REFERENCES opinion_revisions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(revision_id)
);

CREATE INDEX IF NOT EXISTS idx_opinion_learning_type ON opinion_learning_examples(opinion_type);
```

## 2. RLS 정책

```sql
ALTER TABLE opinion_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opinion_drafts_select" ON opinion_drafts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "opinion_drafts_insert" ON opinion_drafts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "opinion_drafts_update" ON opinion_drafts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "opinion_drafts_delete" ON opinion_drafts FOR DELETE TO anon, authenticated USING (true);

ALTER TABLE opinion_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opinion_revisions_select" ON opinion_revisions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "opinion_revisions_insert" ON opinion_revisions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "opinion_revisions_update" ON opinion_revisions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "opinion_revisions_delete" ON opinion_revisions FOR DELETE TO anon, authenticated USING (true);

ALTER TABLE opinion_learning_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opinion_learning_select" ON opinion_learning_examples FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "opinion_learning_insert" ON opinion_learning_examples FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "opinion_learning_delete" ON opinion_learning_examples FOR DELETE TO anon, authenticated USING (true);
```
