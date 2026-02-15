# Few-shot Learning: good_analysis_examples 테이블 및 RLS 설정

Few-shot Learning을 사용하려면 Supabase에 `good_analysis_examples` 테이블이 있고, RLS 정책이 허용되어 있어야 합니다.

## 1. 테이블이 없는 경우

Supabase 대시보드 → SQL Editor에서 아래를 실행하세요.

```sql
-- good_analysis_examples 테이블 생성
CREATE TABLE IF NOT EXISTS good_analysis_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type TEXT NOT NULL DEFAULT '기타',
  input_summary TEXT,
  output_analysis JSONB NOT NULL,
  user_rating INTEGER DEFAULT 5,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  analysis_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스 (사건 유형별 조회용)
CREATE INDEX IF NOT EXISTS idx_good_examples_case_type ON good_analysis_examples(case_type);
CREATE INDEX IF NOT EXISTS idx_good_examples_analysis_id ON good_analysis_examples(analysis_id);
```

## 2. RLS 정책 (에러 시에만 적용)

`good_analysis_examples` 조회/저장/삭제 시 **"permission denied"** 또는 **빈 결과**가 나오면 RLS가 막고 있는 것입니다.  
Supabase 대시보드 → SQL Editor에서 아래를 실행하세요.

```sql
-- RLS 활성화
ALTER TABLE good_analysis_examples ENABLE ROW LEVEL SECURITY;

-- anon 키로 읽기 허용 (통합 분석 시 예시 조회)
CREATE POLICY "good_examples_select"
ON good_analysis_examples FOR SELECT
TO anon, authenticated
USING (true);

-- anon 키로 삽입 허용 (학습 예시로 저장 버튼)
CREATE POLICY "good_examples_insert"
ON good_analysis_examples FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- anon 키로 삭제 허용 (학습 예시에서 제거)
CREATE POLICY "good_examples_delete"
ON good_analysis_examples FOR DELETE
TO anon, authenticated
USING (true);
```

이미 정책이 있다면 `CREATE POLICY` 대신 기존 정책을 수정하거나, 테이블별 정책 목록을 확인한 뒤 필요한 것만 추가하세요.

## 3. 동작 확인

- **분석 화면**에서 "학습 예시로 저장" 클릭 → 저장 성공 시 Few-shot 활성화됨.
- **통합 분석** 실행 시 같은 사건 유형의 저장된 예시가 프롬프트에 포함됩니다.

## 4. 학습 예시가 실제로 쓰였는지 확인하는 방법

1. **Toast 메시지**: 통합 분석이 끝나면 성공 메시지에 `(학습 예시 N개 반영됨)` 이 붙습니다. N이 1 이상이면 이번 분석에 학습 예시가 적용된 것입니다.
2. **서버 로그**: 터미널(개발 서버 실행 중인 창)에서 분석 요청 시 다음 로그가 찍힙니다.
   - `[Few-shot] 사건 유형: 폭행 | 학습 예시 개수: 3` → 3개 적용됨
   - `[Few-shot] 사건 유형: 폭행 | 학습 예시 개수: 0` → 해당 유형에 저장된 예시 없음
