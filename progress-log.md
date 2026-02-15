# ASSO 프로젝트 개발 진행 로그

## 📌 프로젝트 정보
- **시작일**: 2025년 2월
- **목표**: 형사변호사 업무 시간 50% 단축 AI 어시스턴트
- **개발자**: 코딩 초보, Cursor + Claude 활용

---

## 🗓️ 개발 일지

### Day 1 (2025-02-XX) ✅ 완료

#### 완료한 작업
- [x] 개발 환경 셋업 (Node.js, Git, Cursor)
- [x] Next.js 14 프로젝트 생성 (`asso-mvp`)
- [x] GitHub 연동
- [x] Tailwind CSS 설정
- [x] Supabase 연동
  - Storage 버킷 생성 (`documents`)
  - RLS 정책 설정
  - PDF 업로드 기능
- [x] Upstage OCR 연동
  - PDF → 텍스트 추출 (한글 완벽 지원)
  - HTML 태그 자동 제거
  - UTF-8 인코딩 다운로드
- [x] PDF 뷰어 구현
  - iframe 기반 미리보기
  - 텍스트 검색 + 하이라이트
  - 사이드바이사이드 레이아웃

#### 해결한 문제들
- Windows PowerShell 실행 정책 오류 → cmd 사용
- Supabase RLS 정책 오류 → Public uploads 정책 추가
- Upstage API 파라미터 오류 → FormData 사용
- 텍스트 한글 깨짐 → UTF-8 Blob 생성
- PDF.js CORS 에러 → iframe 방식 변경

#### 생성된 파일
```
app/
├── api/
│   ├── ocr/route.js
│   └── pdf-proxy/route.js
├── components/
│   └── PDFViewer.js
├── globals.css
├── layout.js
└── page.js
lib/
└── supabase.js
```

---

### Day 2 (2025-02-XX) 🔄 진행 중

#### 오늘 할 일
- [ ] Claude API 연동
  - [ ] Anthropic API 키 발급
  - [ ] `/api/analyze` 엔드포인트 생성
  - [ ] 기본 분석 프롬프트 구현
- [ ] 분석 결과 UI
  - [ ] 사건 요약 카드
  - [ ] 쟁점 리스트
  - [ ] 증거 목록

#### 완료한 작업
- [x] Paxton AI + ChronoVault 벤치마킹 분석
- [x] MVP 우선순위 조정
- [x] 수정된 로드맵 문서 작성

#### 메모
- 서면 작성은 Phase 3로 후순위 조정
- 타임라인 + 모순점 탐지가 핵심 차별화

---

## 📊 전체 진행률

### Phase 1: 핵심 MVP (목표: Month 2-4)

| 기능 | 상태 | 진행률 |
|------|------|--------|
| PDF 업로드 + OCR | ✅ 완료 | 100% |
| Claude API 연동 | 🔄 진행 중 | 0% |
| 사건 요약 | ⏳ 대기 | 0% |
| 쟁점 추출 | ⏳ 대기 | 0% |
| 증거 분류 | ⏳ 대기 | 0% |
| 타임라인 생성 | ⏳ 대기 | 0% |
| 타임라인 UI | ⏳ 대기 | 0% |

**Phase 1 전체**: ██░░░░░░░░ 20%

### Phase 2: 차별화 기능 (목표: Month 4-5)

| 기능 | 상태 | 진행률 |
|------|------|--------|
| 모순점 탐지 | ⏳ 대기 | 0% |
| 갭 분석 | ⏳ 대기 | 0% |
| 엔티티 분석 | ⏳ 대기 | 0% |
| 전략 지시 시스템 | ⏳ 대기 | 0% |

**Phase 2 전체**: ░░░░░░░░░░ 0%

### Phase 3: 서면 작성 (목표: Month 6-7)

| 기능 | 상태 | 진행률 |
|------|------|--------|
| 의견서 템플릿 | ⏳ 대기 | 0% |
| 서면 초안 생성 | ⏳ 대기 | 0% |
| Word/PDF 출력 | ⏳ 대기 | 0% |

**Phase 3 전체**: ░░░░░░░░░░ 0%

---

## 🔑 환경 변수 체크리스트

| 변수 | 상태 | 용도 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ 설정됨 | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ 설정됨 | Supabase |
| `UPSTAGE_API_KEY` | ✅ 설정됨 | OCR |
| `ANTHROPIC_API_KEY` | ❌ 미설정 | Claude API |

---

## 🐛 알려진 이슈

| 이슈 | 상태 | 해결 방법 |
|------|------|----------|
| PDF iframe 일부 브라우저 미지원 | 🟡 미해결 | 다운로드 버튼으로 대체 |

---

## 📝 다음 세션에서 할 일

1. **Anthropic API 키 발급** (https://console.anthropic.com)
2. **`/api/analyze` 엔드포인트 생성**
3. **사건 요약 프롬프트 테스트**
4. **분석 결과 UI 컴포넌트 생성**

---

## 💡 아이디어 / 메모

- 베타 테스터 5명 확보됨 - 피드백 루프 중요
- 엘박스/빅케이스 API 연동은 나중에 검토
- 한국 형사실무 특화가 핵심 차별화 포인트

---

## 📚 참고 자료

- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Anthropic API 문서](https://docs.anthropic.com)
- [Upstage Document Parse](https://console.upstage.ai/docs)

---

*이 파일은 개발 진행 상황을 추적하기 위해 매 세션마다 업데이트됩니다.*
