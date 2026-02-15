# 증거기록 분류 기능: Supabase 테이블 설정

Supabase 대시보드 → SQL Editor에서 아래를 실행하세요.

## 1. 테이블 생성

```sql
-- page_classifications: 페이지별 분류 결과
CREATE TABLE IF NOT EXISTS page_classifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  page_type TEXT NOT NULL,
  confidence FLOAT,
  extracted_text TEXT,
  text_length INT DEFAULT 0,
  has_meaningful_text BOOLEAN DEFAULT TRUE,
  detected_title TEXT,
  detected_names TEXT[],
  detected_dates TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, page_number)
);

-- evidence_sections: 그룹핑된 증거 섹션
CREATE TABLE IF NOT EXISTS evidence_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  section_title TEXT,
  section_order INT NOT NULL,
  start_page INT NOT NULL,
  end_page INT NOT NULL,
  extracted_text TEXT,
  ocr_quality TEXT DEFAULT 'good',
  user_description TEXT,
  user_tags TEXT[],
  analysis_result JSONB,
  is_analyzed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_evidence_sections_document ON evidence_sections(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sections_case ON evidence_sections(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sections_type ON evidence_sections(section_type);
```

## 2. RLS 정책

```sql
-- page_classifications RLS
ALTER TABLE page_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_classifications_select" ON page_classifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "page_classifications_insert" ON page_classifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "page_classifications_delete" ON page_classifications FOR DELETE TO anon, authenticated USING (true);

-- evidence_sections RLS
ALTER TABLE evidence_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_sections_select" ON evidence_sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "evidence_sections_insert" ON evidence_sections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "evidence_sections_update" ON evidence_sections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "evidence_sections_delete" ON evidence_sections FOR DELETE TO anon, authenticated USING (true);
```
