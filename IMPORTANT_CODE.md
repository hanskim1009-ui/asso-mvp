# ASSO MVP - 중요 코드 패턴

## 1. Supabase 쿼리 패턴

### Soft Delete 필터 (매우 중요!)
모든 문서/분석 조회 시 반드시 포함:
```javascript
.eq('is_deleted', false)
```

### Few-shot Learning 비활성화
```javascript
export async function getGoodExamples(caseType, limit = 3) {
  // 임시 비활성화 (RLS 문제)
  return []
}
```

## 2. Next.js 15 params 처리
```javascript
export async function DELETE(request, { params }) {
  const resolvedParams = await params  // 필수!
  const id = resolvedParams.id
}
```

## 3. AI 프롬프트 핵심

### 페이지 번호 추출
```
텍스트에서 <footer> 태그의 숫자를 페이지 번호로 사용하세요.
예: <footer id='52' style='font-size:22px'>19.</footer> → page: 19
```

## 4. 자주 발생한 에러 & 해결

### 1. "invalid input syntax for type uuid: undefined"
**원인**: Next.js 15에서 params를 await 안 함
**해결**: `const params = await params`

### 2. "good_analysis_examples" 406 에러
**원인**: Few-shot Learning RLS 문제
**해결**: 모든 관련 함수에서 `return []` 또는 `return false`

### 3. React "Objects are not valid as a React child"
**원인**: `favorable_facts`가 객체 배열인데 문자열로 렌더링
**해결**: `{item.fact || item}` 타입 체크

## 5. 파일 구조 핵심
```
app/
├── api/
│   ├── analyze-integrated/route.js  # 메인 AI 분석
│   ├── refine/route.js              # AI 수정
│   ├── ocr/route.js                 # Upstage OCR
│   ├── documents/[id]/route.js      # 문서 삭제
│   └── analysis/[id]/route.js       # 분석 수정/삭제
├── cases/
│   ├── page.js                      # 사건 목록
│   ├── new/page.js                  # 사건 생성
│   └── [id]/page.js                 # 사건 상세 (핵심!)
└── components/
    ├── Timeline.js
    ├── EvidenceEditor.js
    └── TimelineEditor.js

lib/
└── database.js                      # Supabase 함수들
```