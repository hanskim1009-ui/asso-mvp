# ASSO MVP

형사변호사의 업무 시간 50% 단축을 목표로 하는 AI 어시스턴트

## 🎯 주요 기능

### 사건 관리
- 사건 생성 및 관리
- 사건별 문서 업로드
- 사건 정보 컨텍스트 입력

### AI 분석
- PDF 자동 OCR (Upstage)
- 다중 문서 통합 분석 (Gemini 2.5 Flash)
- 사건 요약, 쟁점 추출, 증거 분류
- 타임라인 자동 생성 및 시각화
- Gap 분석 (시간 공백 탐지)
- 모순점 발견

### 분석 관리
- 분석 히스토리 조회
- 직접 수정
- AI 재분석 요청
- Few-shot Learning (학습하는 AI)

## 🛠️ 기술 스택

### Frontend/Backend
- Next.js 14 (App Router)
- React
- Tailwind CSS
- Shadcn/ui

### Database & Storage
- Supabase
  - PostgreSQL
  - Storage (PDF 저장)
  - Auth

### AI/ML
- Gemini 2.5 Flash API (Google)
  - 입력: 무료
  - 출력: $0.30 / 1M tokens
  - 비용: 건당 ~₩2원
- Upstage Document Parse API
  - OCR (PDF → 텍스트)

### 배포
- Vercel

## 💰 비용 효율

- **Claude Sonnet 4.5 대비 99% 절감**
- 100페이지 분석: ~₩2원
- Few-shot Learning으로 품질 지속 향상

## 🚀 시작하기

### 환경 변수 설정

.env.local 파일 생성:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Upstage OCR
UPSTAGE_API_KEY=your_upstage_key

# Google Gemini
GEMINI_API_KEY=your_gemini_key
```

### 설치 및 실행
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

http://localhost:3000 접속

### Database 설정

Supabase SQL Editor에서 다음 파일 실행:
- `database/schema.sql` (테이블 생성)
- `database/functions.sql` (함수 생성)

## 📊 Database 구조

### 주요 테이블
- `cases` - 사건 정보
- `documents` - 업로드된 문서
- `analysis_results` - AI 분석 결과
- `timeline_events` - 타임라인 이벤트
- `entities` - 인물/장소/증거물
- `contradictions` - 모순점
- `good_analysis_examples` - Few-shot 예시

## 🎨 주요 컴포넌트

- `Timeline` - 타임라인 시각화 (Gap 분석)
- `LoadingSpinner` - 로딩 상태
- `Toast` - 알림 메시지
- `ConfirmDialog` - 확인 다이얼로그
- `EmptyState` - 빈 상태
- `EvidenceEditor` - 증거 편집
- `TimelineEditor` - 타임라인 편집

## 📈 로드맵

### Phase 1.5 ✅ 완료
- PDF 업로드 + OCR
- AI 분석
- 비용 최적화

### Phase 2 ✅ 완료
- Case 관리 시스템
- 분석 히스토리
- 수정 기능
- Few-shot Learning
- UI/UX 개선

### Phase 3 (예정)
- 베타 테스트
- 사용자 피드백 반영
- 추가 기능 개발

## 👥 베타 테스터

- 5명 확보됨
- 피드백 수집 예정

## 📝 라이선스

Private - All rights reserved

## 🙏 감사

- Anthropic (Claude)
- Google (Gemini)
- Upstage (OCR)
- Supabase
- Vercel
