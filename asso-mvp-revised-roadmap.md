# ASSO MVP 수정 로드맵 & 벤치마킹 분석

## 📊 벤치마킹 대상

### 1. Paxton AI (형사변호 특화)
**핵심 기능:**
- 수사기록(경찰 보고서, 증인 진술서) 업로드 → 구조화된 요약 생성
- **모순점 자동 탐지** (Contradiction Detection)
- 유리한 정황 자동 추출 (Mitigating Facts Surfacing)
- 타임라인 추적
- 모션 자동 작성 (압수수색영장 무효, 보석, 양형자료 등)

**성과 지표:**
- 드래프팅/리뷰 시간 50-70% 절감
- Stanford 할루시네이션 벤치마크 94% 정확도
- 1억 5천만 페이지 이상 처리 경험

---

### 2. NexLaw ChronoVault (타임라인 특화)
**핵심 기능:**
- 수천 페이지 PDF, 이메일, 녹취록 일괄 업로드
- **자동 타임라인 생성** (NLP 기반 날짜/이벤트 추출)
- **엔티티 추출** (인물, 장소, 법적 개체 자동 분류)
- **Gap 분석** (누락된 날짜, 시퀀스 끊김 탐지)
- **모순 탐지** (진술 간 불일치 플래깅)
- 증거-사실 연결 (100% Source Linking)
- 판례 자동 연결 (Precedent-Aware Tagging)
- 필터링/주석/법정용 출력

**성과 지표:**
- 100시간 이상의 수작업 → 한 오후로 단축 (98% 시간 절감)
- 날짜/이벤트 추출 정확도 99%
- 불일치 탐지 속도 10배 향상
- 1만 페이지+ 분 단위 처리

---

## 🎯 ASSO MVP 수정 우선순위

### Phase 1: 핵심 MVP (Month 2-4) ⭐ 최우선
> **목표: "수사기록 → 구조화된 분석" 파이프라인 완성**

#### 1.1 대량 기록 분석 (Core)
| 기능 | 설명 | 벤치마크 출처 |
|------|------|--------------|
| ✅ PDF OCR | Upstage 연동 완료 | - |
| 🆕 **사건 요약** | 3-5문장 핵심 요약 | Paxton |
| 🆕 **쟁점 자동 추출** | 법적 쟁점 리스트업 | Paxton |
| 🆕 **증거 목록 생성** | 증거 자동 분류 | Paxton |
| 🆕 **유리한 정황 추출** | 피고인에게 유리한 팩트 하이라이트 | Paxton |

#### 1.2 타임라인 자동 생성 (Core)
| 기능 | 설명 | 벤치마크 출처 |
|------|------|--------------|
| 🆕 **날짜/시간 추출** | NLP 기반 시간 정보 파싱 | ChronoVault |
| 🆕 **이벤트 추출** | 핵심 사건 자동 식별 | ChronoVault |
| 🆕 **타임라인 시각화** | 인터랙티브 타임라인 UI | ChronoVault |
| 🆕 **증거 연결** | 각 이벤트 → 원본 문서 링크 | ChronoVault |

---

### Phase 2: 차별화 기능 (Month 4-5)
> **목표: 경쟁사 대비 ASSO만의 가치 창출**

#### 2.1 모순점 탐지 (★ 핵심 차별화)
| 기능 | 설명 | 벤치마크 출처 |
|------|------|--------------|
| 🆕 **진술 불일치 탐지** | 동일 사안에 대한 다른 진술 플래깅 | Paxton, ChronoVault |
| 🆕 **타임라인 갭 분석** | 시간 순서 끊김, 누락 날짜 탐지 | ChronoVault |
| 🆕 **잠재적 탄핵 자료** | 증인 신빙성 공격 포인트 추출 | ChronoVault |

#### 2.2 엔티티 분석 (★ 형사 특화)
| 기능 | 설명 | 벤치마크 출처 |
|------|------|--------------|
| 🆕 **인물 관계도** | 피고인-피해자-증인 관계 시각화 | ChronoVault |
| 🆕 **장소 맵핑** | 사건 발생 장소 정리 | ChronoVault |
| 🆕 **증거물 분류** | 물증/인증/서증 자동 분류 | 한국 형사실무 |

#### 2.3 변호사 전략 지시 (★★ ASSO 고유)
| 기능 | 설명 | 차별화 |
|------|------|--------|
| 🆕 **맞춤 프롬프트** | "이 쟁점에서 피고인에게 유리한 증거를 찾아줘" | ASSO 고유 |
| 🆕 **방어 논리 중심 분석** | 검찰 논리 반박 포인트 자동 추출 | ASSO 고유 |
| 🆕 **가이드 입력 시스템** | 변호사가 방향 설정 → AI 분석 | ASSO 고유 |

---

### Phase 3: 분석 리포트 + 프롬프트 다운로드 (Month 6-7) ← 수정됨 (2026-02-22)
> **목표: 분석 결과 → 다운로드 가능한 리포트 + AI 프롬프트 세트**
>
> **전략 전환**: 인앱 서면 생성(고비용) → "분석 PDF + 프롬프트 다운로드"(비용 0원) 방식 채택.
> 사용자가 ChatGPT/Claude 등 자신의 AI에 프롬프트+PDF를 제공하여 서면 작성.

#### 3.1 분석 리포트 PDF 다운로드
| 기능 | 설명 | 비용 |
|------|------|------|
| 🆕 **리포트 PDF 생성** | 요약·쟁점·타임라인·증거·유리한 정황·모순점·엔티티 포함 | 0원 (코드 생성) |
| 🆕 **원문 페이지 참조 포함** | 각 항목에 p.N 표기 유지 | 0원 |

#### 3.2 AI 프롬프트 세트 다운로드
| 기능 | 설명 | 비용 |
|------|------|------|
| 🆕 **의견서 프롬프트** | 분석 데이터가 삽입된 의견서 작성용 프롬프트 | 0원 (템플릿 + 데이터 삽입) |
| 🆕 **변론요지서 프롬프트** | 변론요지서 작성용 프롬프트 | 0원 |
| 🆕 **보석청구서 프롬프트** | 보석/구속적부심 청구서 작성용 프롬프트 | 0원 |
| 🆕 **탄핵자료 프롬프트** | 증인 탄핵 자료 정리용 프롬프트 | 0원 |

#### 3.3 향후 (수익 안정 후)
| 기능 | 설명 |
|------|------|
| ⏳ **인앱 서면 생성 (프리미엄)** | 프리미엄 티어(월 5~10만 원)에서 인앱 의견서 생성 월 N회 제공 |

---

### Phase 4: 고도화 (Month 7-8)
| 기능 | 설명 |
|------|------|
| 🆕 **팀 협업** | 여러 변호사가 같은 사건 분석 공유 |
| 🆕 **버전 관리** | 분석 히스토리 추적 |
| ⏳ **판례 연동** | 외부 판례 API 연동 검토 (자체 구축 보류) |

---

## 🔧 기술 구현 상세

### 추가해야 할 AI 프롬프트 기능

```javascript
// 1. 사건 요약 프롬프트
const summaryPrompt = `
다음 수사기록을 분석하여 3-5문장으로 사건을 요약해주세요.
포함할 내용: 피의사실, 주요 당사자, 핵심 쟁점

${extractedText}
`;

// 2. 모순점 탐지 프롬프트
const contradictionPrompt = `
다음 수사기록에서 진술 간 모순이나 불일치를 찾아주세요.
각 모순에 대해:
- 모순 내용
- 관련 진술 위치 (페이지/문단)
- 방어에 활용 가능성

${extractedText}
`;

// 3. 타임라인 추출 프롬프트
const timelinePrompt = `
다음 수사기록에서 시간 순서대로 이벤트를 추출해주세요.
JSON 형식으로 반환:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM (있는 경우)",
    "event": "이벤트 설명",
    "source": "출처 문서/페이지",
    "parties": ["관련 인물들"],
    "evidence": "관련 증거 (있는 경우)"
  }
]

${extractedText}
`;

// 4. 유리한 정황 추출 프롬프트
const mitigatingPrompt = `
다음 수사기록에서 피고인에게 유리한 정황을 모두 찾아주세요:
1. 범행 동기 부재 또는 약화 요소
2. 알리바이 관련 정보
3. 증인 신빙성 공격 포인트
4. 위법수집증거 가능성
5. 정상참작 요소

${extractedText}
`;

// 5. 변호사 전략 지시 프롬프트 (ASSO 고유)
const strategyPrompt = `
변호사 지시: ${lawyerInstruction}

위 지시에 따라 다음 수사기록을 분석해주세요.
분석 방향: ${analysisDirection}

${extractedText}
`;
```

### 추가해야 할 UI 컴포넌트

```
app/
├── components/
│   ├── Timeline/
│   │   ├── TimelineView.js       # 타임라인 시각화
│   │   ├── TimelineEvent.js      # 개별 이벤트 카드
│   │   └── TimelineFilter.js     # 날짜/인물별 필터
│   ├── Analysis/
│   │   ├── SummaryCard.js        # 사건 요약
│   │   ├── IssuesList.js         # 쟁점 리스트
│   │   ├── EvidenceTable.js      # 증거 테이블
│   │   └── ContradictionAlert.js # 모순점 알림
│   ├── Entity/
│   │   ├── PersonCard.js         # 인물 카드
│   │   ├── RelationshipMap.js    # 관계도
│   │   └── LocationMap.js        # 장소 맵
│   └── Strategy/
│       ├── GuideInput.js         # 변호사 지시 입력
│       ├── AnalysisMode.js       # 분석 모드 선택
│       └── DefensePoints.js      # 방어 논리 정리
```

### 추가해야 할 DB 테이블

```sql
-- 분석 결과 저장
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  analysis_type VARCHAR(50), -- 'summary', 'timeline', 'contradiction', 'mitigating'
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 타임라인 이벤트
CREATE TABLE timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  event_date DATE,
  event_time TIME,
  event_description TEXT,
  source_page INTEGER,
  source_text TEXT,
  parties TEXT[], -- 관련 인물
  evidence_ids UUID[], -- 연결된 증거
  created_at TIMESTAMP DEFAULT NOW()
);

-- 엔티티 (인물, 장소, 증거물)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  entity_type VARCHAR(20), -- 'person', 'location', 'evidence'
  name VARCHAR(255),
  role VARCHAR(100), -- 피고인, 피해자, 증인 등
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 모순점
CREATE TABLE contradictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  statement_1 TEXT,
  statement_1_source VARCHAR(255),
  statement_2 TEXT,
  statement_2_source VARCHAR(255),
  contradiction_type VARCHAR(50),
  defense_utility VARCHAR(20), -- 'high', 'medium', 'low'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 변호사 전략 지시
CREATE TABLE strategy_guides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  instruction TEXT,
  analysis_direction VARCHAR(100),
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📅 수정된 개발 일정

### Month 2-3: Phase 1 (핵심 MVP)
**Week 1-2: Claude API 연동**
- [ ] Anthropic API 키 발급
- [ ] `/api/analyze` 엔드포인트
- [ ] 기본 분석 프롬프트 (요약, 쟁점, 증거)

**Week 3-4: 타임라인 기초**
- [ ] 타임라인 추출 프롬프트
- [ ] 타임라인 DB 테이블
- [ ] 기본 타임라인 UI

**Week 5-6: 증거 연결**
- [ ] 이벤트 ↔ 원본 텍스트 링크
- [ ] 클릭하면 해당 위치로 스크롤

**Week 7-8: UI 통합**
- [ ] 분석 결과 대시보드
- [ ] 타임라인 시각화 (세로 스크롤)

### Month 4-5: Phase 2 (차별화)
**Week 1-2: 모순점 탐지**
- [ ] 모순 탐지 프롬프트
- [ ] 모순점 하이라이트 UI
- [ ] 갭 분석 기능

**Week 3-4: 엔티티 분석**
- [ ] 인물/장소/증거물 추출
- [ ] 간단한 관계도

**Week 5-6: 전략 지시 시스템**
- [ ] 가이드 입력 UI
- [ ] 맞춤 분석 프롬프트
- [ ] 방어 논리 출력

**Week 7-8: 베타 준비**
- [ ] UI/UX 정리
- [ ] 버그 수정
- [ ] 베타 테스터 1차 피드백

### Month 6-7: Phase 3 (리포트 + 프롬프트 다운로드)
- [ ] 분석 리포트 PDF 생성 (요약·쟁점·타임라인·증거·유리한 정황·모순점·엔티티)
- [ ] AI 프롬프트 세트 생성 (템플릿 + 데이터 삽입, AI 호출 없음)
- [ ] 의견서·변론요지서·보석청구서·탄핵자료 프롬프트 템플릿 작성

### Month 8: 베타 테스트 & 런칭
- [ ] 5명 베타 테스터 피드백
- [ ] 최종 수정
- [ ] Vercel 배포

---

## 💡 핵심 인사이트

### ASSO가 반드시 가져야 할 기능 (벤치마킹 필수)

| 순위 | 기능 | 이유 |
|------|------|------|
| 1 | **타임라인 자동 생성** | ChronoVault의 핵심 가치, 국내 전무 |
| 2 | **모순점 탐지** | Paxton + ChronoVault 모두 강조, 방어에 핵심 |
| 3 | **증거-사실 연결** | 법정 제출 시 신뢰도 확보 |
| 4 | **유리한 정황 추출** | Paxton의 형사 특화 기능 |
| 5 | **갭 분석** | ChronoVault의 차별화 기능 |

### ASSO 고유 차별화 (경쟁사에 없는 것)

| 기능 | 설명 |
|------|------|
| **변호사 전략 지시** | "이 논점에서 유리한 증거 찾아줘" |
| **방어 논리 중심** | 검찰 논리 반박 포인트 자동화 |
| **한국 형사실무 특화** | 검찰 수사기록 양식 이해, 한국 형사법 |

### MVP에서 빼도 되는 것

| 기능 | 이유 |
|------|------|
| 판례 DB 자체 구축 | 엘박스 405만건 등 선점. 외부 API 연동으로 검토 (2026-02-22) |
| 인앱 의견서 생성 | 비용 문제. 프롬프트+PDF 다운로드로 대체 (2026-02-22) |
| 팀 협업 기능 | Phase 4로 이동 |
| 모바일 반응형 | 데스크탑 우선 |

---

## 🚀 Day 2 시작점

바로 시작할 수 있는 첫 번째 작업:

```bash
# 1. Claude API 연동
# app/api/analyze/route.js 생성

# 2. 기본 분석 테스트
# 업로드된 텍스트 → Claude → 요약 반환

# 3. 분석 결과 UI
# 요약 카드 컴포넌트 생성
```

---

**이 문서를 기반으로 개발을 진행하면 Paxton AI + ChronoVault 수준의 MVP를 만들 수 있습니다!**
