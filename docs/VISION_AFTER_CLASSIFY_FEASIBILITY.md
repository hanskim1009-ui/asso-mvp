# 증거 분류 후 Vision 추가 분석 — 검토 (2026-02-16 기준)

## 1. 제안하신 파이프라인

```
PDF 업로드 → OCR(Upstage) → 증거 분류(텍스트 기반)
    → [추가] 텍스트가 적거나 없는 페이지만 Gemini Vision으로 분석
    → 사용자 메모
    → AI 분석 (원문 + Vision 설명 + 메모 참고)
```

**목적**: 전체 페이지를 처음부터 Vision으로 돌리지 않고, **텍스트로 파악이 안 되는 페이지만** Vision을 쓰면 시간·비용 절감.

---

## 2. 결론: **가능하고, 생각하신 방향이 맞습니다**

| 항목 | 내용 |
|------|------|
| **구현 가능 여부** | 가능 (오늘날짜 기준 기술적으로 문제 없음) |
| **파이프라인 적합성** | 텍스트 기반 분류 → Vision은 “보완”만 담당하는 구조가 합리적임 |
| **비용/시간** | 예: 30페이지 중 5페이지만 Vision → Vision 호출 5회 (전체 30회 대비 대폭 감소) |

---

## 3. 왜 이 방식이 맞는지

- **전체를 Vision으로만 하면**: 페이지당 1회 호출 → 100페이지면 100회, 비용·지연 큼.
- **현재처럼 텍스트만 쓰면**: 사진/도표 페이지는 내용을 모름 → 사용자가 직접 설명해야 함.
- **제안하신 방식**:  
  - 텍스트로 “이 페이지는 사진/내용 불명”이라고만 분류 (기존 로직 유지).  
  - 그런 페이지에만 **선택적으로** Vision 1회씩 호출해 “무엇이 보이는지” 설명 생성.  
  - 그 설명을 `vision_description` 등에 저장해 두고, 이후 “AI 분석” 단계에서 **원문 + Vision 설명 + 메모**를 같이 넣어 분석.

즉, “분류는 텍스트로, 내용 파악이 안 되는 페이지만 Vision”이라는 설계가 타당하고, 오늘날짜 기준으로도 그대로 구현 가능합니다.

---

## 4. 구현 시 필요한 것

### 4-1. Vision을 태울 대상

- `section_type === 'photo_evidence'` 이거나  
- `ocr_quality === 'failed'` 이거나  
- `(extracted_text 길이 또는 의미 있는 문장)이 거의 없는` 섹션  

→ 이런 섹션만 “Vision 추가 분석” 후보로 두면 됨.

### 4-2. 서버에서 PDF → 이미지

- **방식**: API 라우트(또는 서버리스 함수)에서  
  - 해당 문서의 `pdf_url`로 PDF 바이트를 받아오고  
  - **pdfjs-dist**로 해당 페이지만 로드한 뒤  
  - **캔버스에 그려서** 이미지 버퍼 → base64 (또는 multipart)로 만든 다음  
  - 그 이미지를 **Gemini Vision API**에 넘김.
- **환경**: Node(Next.js API)에서는 브라우저 Canvas가 없으므로  
  - **node-canvas** 또는 **@napi-rs/canvas** 같은 서버용 Canvas 구현이 필요함.  
  - pdfjs-dist 5.x는 Node에서의 렌더 예제/옵션이 있음 (오늘날짜 기준 사용 가능).

### 4-3. 저장·분석 시 반영

- Vision 결과를 **별도 필드**로 두는 것을 권장:  
  예: `evidence_sections.vision_description` (TEXT).
- “AI 분석” 시에는  
  - 기존처럼 `extracted_text`, `user_description`, `section_memo`를 쓰고  
  - **`vision_description`이 있으면** 그 내용을 프롬프트에 함께 포함  
  → “원문 + Vision 설명 + 메모를 참고해서 분석”하라고 지시하면 됨.

### 4-4. API 예시

- **예**: `POST /api/evidence-sections/[id]/describe-with-vision`  
  - 해당 섹션의 `document_id`, `start_page`(, `end_page`)로 PDF 페이지 범위 결정.  
  - 위 방식으로 해당 페이지만 이미지로 렌더 → Gemini Vision 호출.  
  - 응답 텍스트를 `vision_description`에 저장.  
- UI:  
  - “Vision으로 설명 생성” 버튼을 **photo_evidence / OCR 불가 등 해당 섹션에만** 노출하면 됨.

---

## 5. 정리

- **질문**: “증거 분류 후, 텍스트가 적거나 없어서 사진 등으로 분류된 것만 Gemini Vision으로 추가 분석하고, 그 다음에 사용자 메모 + AI 분석을 하게 할 수 있는지?”  
  → **가능합니다.** 오늘날짜(2026-02-16) 기준으로도 구현 가능한 구조입니다.
- **이렇게 하는 이유** (전체를 처음부터 Vision으로 돌리지 않는 것)도 비용·시간 측면에서 맞는 선택입니다.
- 구현 시 추가로 필요한 것:  
  - 서버용 Canvas(pdf→이미지),  
  - `vision_description` 필드,  
  - “Vision 설명 생성” API 한 개,  
  - 분석 시 `vision_description`을 프롬프트에 포함하는 로직.

원하시면 다음 단계로 “`vision_description` 스키마 + API 시그니처 + 분석 프롬프트에 넣을 문장”까지 구체 설계해 드리겠습니다.
