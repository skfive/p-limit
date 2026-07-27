# 진단 데모 시각 명세 — 상태 스냅샷 패널 (F68F701A7A-119)

> **문서 성격**: designer 산출물(1차). planner가 동결한 `ui-contract@v1`(`sha256:17615ac8…`)·`planning-contract@v1`(`sha256:bc5aee88…`)의 selector·token·상태·접근성·반응형 값을 **그대로 시각화**한 명세다. selector/token을 재정의하지 않는다.
> **권위 순서**: frozen blueprint(`ROLE_WORK_PACKET_V2`의 `frozen_interfaces`)가 유일 권위. 본 문서는 이를 렌더링·설명만 하며 값을 바꾸지 않는다.
> **참조 계약**: `docs/plans/status-snapshot-plan-F68F701A7A-118.md` §3(UI 계약).
> **비목표**: 런타임 HTML/CSS/JS 생성(= developer 소유), 기존 공개 API 시그니처/동작/타이밍 변경, `subscribe`의 `LimiterSnapshot` payload 변경.

---

## 1. 시안 개요

### 변경 범위
`limitFunction`/`pLimit`의 읽기 전용 스냅샷(`activeCount`/`pendingCount`/`concurrency`/`isPaused`)을 관찰하는 **진단 데모** 화면의 시각 명세다. 화면은 두 영역으로 구성된다.

- **상태 패널(`#snapshot-panel`)** — 4개의 상태 카드로 스냅샷 4필드를 실시간 표시.
- **데모 컨트롤(`.demo-controls`)** — 작업 추가/일시정지/재개/비우기 4개 버튼으로 limiter를 조작.

### 사용자 경험 목표 (`docs/plans/…-118.md` §1 S2 기준)
- 관찰자가 버튼을 조작하면 active/pending/concurrency/일시정지 상태가 **색상 + 텍스트 라벨**로 즉시 반영됨을 눈으로 확인.
- 스크린리더 사용자도 상태 전이를 `aria-live="polite"`로 들을 수 있음.
- 색맹/저시력 사용자도 상태를 **색상만이 아닌 텍스트**로 구별.
- 320px 좁은 화면에서도 overflow 없이 세로 스택, 640px 이상에서 다열 grid로 편안하게 관찰.

### 상태 모델 (frozen 5-state)
`idle` → `running` → `paused` → `resumed`(=running 복귀) → `cleared`(→ 초기값 복귀). 색상 외 화면 텍스트 라벨과 접근성 이름 양쪽에 상태명을 노출한다.

---

## 2. 컬러 팔레트

프로젝트 규약: `vanilla-static` (외부 의존성 0건, `:root` CSS 변수 자체 정의). 아래 **status token 3종은 frozen 값이며 재정의 금지**.

| 역할 | 토큰(frozen) | HEX | 사용처 |
|---|---|---|---|
| running(실행 중) | `--color-status-running` | `#16a34a` | `.status-card--running` 강조선/값 색, 상태 배지 |
| paused(일시정지) | `--color-status-paused` | `#d97706` | `.status-card--paused` 강조선/값 색, 상태 배지 |
| idle(유휴) | `--color-status-idle` | `#64748b` | 기본 카드 라벨/보조 텍스트, idle 배지 |

### 보조 팔레트 (mockup 표현용 — 계약 밖, dev 재량 허용)
> 아래는 시안의 배경/테두리/텍스트 등 **frozen 토큰이 정하지 않은** 값이다. dev는 접근성 대비만 지키면 자유롭게 조정 가능(픽셀 일치 의무 없음).

| 역할 | 제안값 | 비고 |
|---|---|---|
| page background | `#f8fafc` | slate-50, 중립 배경 |
| card background | `#ffffff` | 카드 표면 |
| card border | `#e2e8f0` | slate-200, 1px 테두리 |
| heading text | `#0f172a` | slate-900 |
| body text | `#334155` | slate-700 |
| running 배지 배경 | `#dcfce7` | green-100 (텍스트는 `#166534`로 대비 확보) |
| paused 배지 배경 | `#fef3c7` | amber-100 (텍스트는 `#92400e`) |
| idle 배지 배경 | `#f1f5f9` | slate-100 (텍스트는 `#475569`) |

**대비 준수**: 모든 텍스트/배경 조합은 WCAG AA(본문 4.5:1, 큰 텍스트 3:1) 이상. running `#16a34a`는 흰 배경 위 큰 값 텍스트로만 사용하고, 작은 라벨은 배지 배경(green-100) 위 진한 초록(`#166534`)으로 대비 확보.

---

## 3. 타이포그래피

`vanilla-static` 규약 → **system font stack**, 외부 폰트 호출 없음.

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans KR", sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

| 요소 | font-family | size | weight | line-height | 용도 |
|---|---|---|---|---|---|
| heading (페이지 제목) | sans | 20px | 700 | 1.3 | "스냅샷 진단 데모" |
| section (영역 제목) | sans | 15px | 600 | 1.4 | "상태 스냅샷" / "컨트롤" |
| card label (`.status-card__label`) | sans | 13px | 500 | 1.3 | "실행 중 작업" 등 필드명 |
| card value (`.status-card__value`) | mono | 28px | 700 | 1.1 | 숫자 값(활성/대기/동시성) |
| state badge / pause-state | sans | 13px | 600 | 1.2 | "실행 중" / "일시정지" 텍스트 라벨 |
| button (`.demo-controls__button`) | sans | 14px | 600 | 1 | 버튼 라벨 |
| caption (보조 설명) | sans | 12px | 400 | 1.5 | 상태 안내/aria 설명 |

- 숫자 값은 **monospace**로 자릿수 흔들림 방지(관찰 중 값 변화 안정적).
- `concurrency`가 `Infinity`일 때는 값 텍스트로 `"∞"` 표시(§5 참조).

---

## 4. 레이아웃

### 섹션 구조
```
┌ 페이지 컨테이너 (max-width 720px, 중앙 정렬) ────────────┐
│  h1  스냅샷 진단 데모                                     │
│  p   caption 안내                                        │
│                                                          │
│  #snapshot-panel .status-panel  (aria-live="polite")     │
│   ┌ .status-card ─┐ ┌ .status-card ─┐                    │
│   │ 실행 중 작업   │ │ 대기 작업      │  … 카드 4개         │
│   │ #…active-count │ │ #…pending-count│                   │
│   └───────────────┘ └───────────────┘                    │
│                                                          │
│  .demo-controls  (버튼 4개)                              │
│   [작업 추가][일시정지][재개][대기열 비우기]              │
└──────────────────────────────────────────────────────────┘
```

### 상태 카드 4종 (frozen DOM ID 매핑)
| 카드 | 라벨(화면 텍스트) | 값 DOM ID | 값 의미 |
|---|---|---|---|
| 활성 | "실행 중 작업" | `#snapshot-active-count` | `activeCount` |
| 대기 | "대기 작업" | `#snapshot-pending-count` | `pendingCount` |
| 동시성 | "동시 실행 한도" | `#snapshot-concurrency` | `concurrency`(`∞` 가능) |
| 일시정지 | "일시정지 상태" | `#snapshot-pause-state` | `isPaused` → "일시정지"/"실행 가능" 텍스트 |

### spacing (frozen token 활용)
- 카드 간 간격: `--space-card-gap` = **`12px`** (frozen). grid `gap` / 스택 `gap` 모두 이 값 사용.
- 카드 모서리 반경: `--radius-card` = **`8px`** (frozen).
- 카드 내부 padding: `16px`(계약 밖, 제안값).
- 패널 ↔ 컨트롤 수직 간격: `20px`(제안값).

### breakpoint 별 동작 (frozen 반응형 §3.7)
| 뷰포트 | `.status-panel` 레이아웃 | 비고 |
|---|---|---|
| **≥320px** | **1열 세로 스택** (`grid-template-columns: 1fr` 또는 `flex-direction: column`) | content overflow 금지. 값·라벨 줄바꿈 허용, 가로 스크롤 없음. |
| **≥640px** | **다열 grid** (`grid-template-columns: repeat(2, 1fr)` 이상, 예: `repeat(auto-fit, minmax(150px, 1fr))`) | 카드가 나란히 확장. gap은 `--space-card-gap` 유지. |

- 컨트롤 버튼은 좁은 화면에서 wrap(`flex-wrap: wrap`) 허용.
- 최소 폭 320px 미만 경계에서도 세로 스택·overflow 없음 유지(§계약 상한은 ≥320px).

---

## 5. 컴포넌트 명세

### 5.1 상태 패널 `#snapshot-panel .status-panel`
- **역할**: 스냅샷 4필드를 카드로 묶는 컨테이너 겸 aria-live region.
- **접근성**: `aria-live="polite"`, `aria-atomic` 없음(부분 갱신 읽기) 또는 각 값에 세분화 — dev 재량. 상태 전이 시 새 라벨을 스크린리더가 읽음.
- **상태별 표현**:
  | 상태 | 패널 전체 신호 | 값/배지 표현 |
  |---|---|---|
  | `idle` | 중립(idle 색) | active=0, pending=0, pause-state="실행 가능"; idle 배지 |
  | `running` | 활성 카드에 `.status-card--running` | active≥1, running 색 강조; "실행 중" 배지 |
  | `paused` | 일시정지 카드에 `.status-card--paused` | pause-state="일시정지", paused 색; "일시정지" 배지 |
  | `resumed` | `.status-card--running` 복귀 | "실행 중" 배지로 되돌아옴 |
  | `cleared` | 초기값 복귀 | pending=0으로, "대기열 비움" 순간 표기 후 idle로 |

### 5.2 상태 카드 `.status-card`
- **하위 요소**: `.status-card__label`(필드명), `.status-card__value`(값).
- **modifier**:
  - `.status-card--running` → 강조 색 `--color-status-running`(#16a34a). 좌측 강조선/값 색.
  - `.status-card--paused` → 강조 색 `--color-status-paused`(#d97706).
  - modifier 없음(기본) → `--color-status-idle`(#64748b) 계열.
- **텍스트 라벨 필수(frozen)**: 색상만으로 상태를 구분하지 않는다. 각 카드/배지는 상태명 텍스트("실행 중"/"일시정지"/"유휴")를 화면과 접근성 이름 양쪽에 노출.
- **상호작용**: 카드 자체는 정적(포커스 불가). 값은 텍스트 노드 갱신만.

### 5.3 일시정지 상태 표시 `#snapshot-pause-state`
- `isPaused === true` → 텍스트 `"일시정지"`, paused 색/배지.
- `isPaused === false` → 텍스트 `"실행 가능"`(또는 running 중이면 "실행 중" 맥락 텍스트).
- **색상 외 텍스트 라벨 필수** — 배지 배경색과 무관하게 텍스트로 상태를 읽을 수 있어야 함.

### 5.4 데모 컨트롤 `.demo-controls` / `.demo-controls__button`
| DOM ID | 라벨 | `aria-label`(명시적, frozen 요구) | 동작(참고 — dev 구현) |
|---|---|---|---|
| `#demo-add-task` | "작업 추가" | `"작업 추가"` | 새 작업 enqueue → running/대기 증가 |
| `#demo-pause` | "일시정지" | `"일시정지"` | `pause()` → `paused` 상태 |
| `#demo-resume` | "재개" | `"재개"` | `resume()` → `resumed`(running) |
| `#demo-clear` | "대기열 비우기" | `"대기열 비우기"` | `clearQueue()` → `cleared` → 초기값 복귀 |

- **키보드**: 모든 버튼 `<button>` 시맨틱, **Tab 이동 / Enter·Space 실행** 가능(네이티브 button 기본 동작 유지). 커스텀 div-button 금지.
- **상태(hover/focus/disabled)**:
  - hover: 배경 약간 어둡게(제안값).
  - focus-visible: 2px outline(대비 확보) — 키보드 포커스 시각 표시 필수.
  - `#demo-resume`는 일시정지 아닐 때 시각적 비활성 표현 가능(선택). 단 **후조건**: clear/취소/실패 후 `#demo-add-task`는 반드시 다시 조작 가능.
- **후조건 복귀(frozen)**: `clearQueue()`/취소/실패 뒤 상태·진행 표시를 초기값으로 되돌리고 주 실행 control(`#demo-add-task`) 재사용 가능.

---

## 6. dev 구현 가이드 (F68F701A7A-120 developer 대상)

> designer는 코드를 짜지 않는다. 아래는 dev가 `demo/index.html`·`demo/status-demo.css`·`demo/status-demo.js`를 구현할 때 따를 **참조 가이드**다. selector·token은 frozen이므로 **그대로** 사용.

### 6.1 CSS 변수(`:root`, `demo/status-demo.css`)
```css
:root {
  /* frozen — 재정의 금지 */
  --color-status-running: #16a34a;
  --color-status-paused:  #d97706;
  --color-status-idle:    #64748b;
  --space-card-gap: 12px;
  --radius-card: 8px;

  /* 보조(계약 밖 — dev 재량, 대비만 준수) */
  --color-bg: #f8fafc;
  --color-card-bg: #ffffff;
  --color-card-border: #e2e8f0;
  --color-heading: #0f172a;
  --color-body: #334155;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

### 6.2 마크업 골격(`demo/index.html`) — frozen ID/class 그대로
```html
<section id="snapshot-panel" class="status-panel" aria-live="polite" aria-label="상태 스냅샷">
  <div class="status-card">
    <span class="status-card__label">실행 중 작업</span>
    <span class="status-card__value" id="snapshot-active-count">0</span>
  </div>
  <div class="status-card">
    <span class="status-card__label">대기 작업</span>
    <span class="status-card__value" id="snapshot-pending-count">0</span>
  </div>
  <div class="status-card">
    <span class="status-card__label">동시 실행 한도</span>
    <span class="status-card__value" id="snapshot-concurrency">2</span>
  </div>
  <div class="status-card">
    <span class="status-card__label">일시정지 상태</span>
    <span class="status-card__value" id="snapshot-pause-state">실행 가능</span>
  </div>
</section>

<div class="demo-controls">
  <button type="button" class="demo-controls__button" id="demo-add-task" aria-label="작업 추가">작업 추가</button>
  <button type="button" class="demo-controls__button" id="demo-pause" aria-label="일시정지">일시정지</button>
  <button type="button" class="demo-controls__button" id="demo-resume" aria-label="재개">재개</button>
  <button type="button" class="demo-controls__button" id="demo-clear" aria-label="대기열 비우기">대기열 비우기</button>
</div>
```

### 6.3 반응형(`demo/status-demo.css`)
```css
.status-panel {
  display: grid;
  gap: var(--space-card-gap);
  grid-template-columns: 1fr;      /* ≥320px: 세로 스택 */
}
@media (min-width: 640px) {
  .status-panel {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); /* 다열 grid */
  }
}
.status-card { border-radius: var(--radius-card); }
```
- `#snapshot-active-count` 등 값 텍스트는 `overflow-wrap: anywhere` 등으로 좁은 폭 overflow 방지.

### 6.4 상태 로직(`demo/status-demo.js`) — 참고
- 값 갱신은 `limit.snapshot()`(F68F701A7A-120 API)을 읽어 4필드를 DOM 텍스트로 반영.
- `isPaused` → `#snapshot-pause-state` 텍스트 `"일시정지"`/`"실행 가능"` + 카드에 `.status-card--paused` 토글.
- `activeCount >= 1 && !isPaused` → 활성 카드에 `.status-card--running` 토글, "실행 중" 라벨.
- `concurrency === Infinity` → `#snapshot-concurrency` 텍스트 `"∞"`.
- `clearQueue()` 후: pending=0, 상태 초기값 복귀, `#demo-add-task` 재사용 가능(후조건).
- **색상 클래스 토글과 함께 반드시 텍스트 라벨도 갱신**(색상만으로 상태 구분 금지).

### 6.5 접근성 체크(frozen)
- [ ] `#snapshot-panel`에 `aria-live="polite"`.
- [ ] 4개 버튼 각각 명시적 `aria-label`.
- [ ] 모든 control이 `<button>` 시맨틱 → Tab/Enter/Space 조작.
- [ ] 상태를 색상 + 텍스트 라벨(화면·접근성 이름) 양쪽에 노출.
- [ ] focus-visible 시각 표시.

---

## 7. mockup 참조

- **mockup HTML**: `docs/design/status-snapshot-mockup-F68F701A7A-118.html`
  - 위치는 frozen blueprint(`ui-contract@v1`)·planner 계약 §3.1이 designer 소유로 명시한 **정확한 경로**다. 본 명세의 컬러/타이포/레이아웃/상태 표현을 그대로 시각화한 단일 self-contained HTML(외부 의존성 0건, system font, 인라인 `<style>`).
  - `idle`·`running`·`paused`·`resumed`·`cleared` 다섯 상태를 각각 **색상 + 텍스트 라벨**로 나란히 시각화하고, 320px/640px 반응형 동작을 별도 섹션으로 표현.
  - **이건 dev 실제 산출물이 아니다** — 시안 시각화 전용. dev는 참조 가이드로만 사용(픽셀 일치 의무 없음).

---

## Self-critique

PR commit 직전 자기 점검 5항목.

1. **AC 매핑**: planner §4 AC5(selector·상태·접근성 고정)·AC6(색상 외 텍스트 라벨)·AC7(후조건 복귀)·AC8(반응형)을 명세 §4·§5·§6에 모두 반영. AC1~AC4(스냅샷 API shape)는 developer 소유 코드 계약이라 designer 명세에서는 §5.1/§6.4에 "데이터 소스"로만 참조(재정의 없음). ✅
2. **dev 구현 가이드**: §6에 CSS 변수·마크업 골격·반응형·상태 로직·접근성 체크리스트를 frozen ID/class 그대로 단계별 제시. ✅
3. **기존 요소 보존**: `subscribe`의 `LimiterSnapshot`(`status` 포함) 계약·기존 공개 API는 명세에서 변경하지 않음을 상단 비목표·§5.1에 명시. 파일은 additive(신규 2개만 생성). ✅
4. **컴포넌트 매핑**: frozen DOM ID 8종·CSS class 8종·token 5종·state 5종을 각각 §4/§5/§6 표로 1:1 매핑(누락·추가·개명 없음). ✅
5. **모호함 flag**: frozen 토큰이 정하지 않은 배경/테두리/padding/hover 값은 "계약 밖·dev 재량·픽셀 일치 의무 없음"으로 명시 구분. `#snapshot-pause-state`의 running 시 문구("실행 가능" vs "실행 중")는 dev가 상태 맥락에 맞게 선택하도록 §5.3에 flag. `concurrency === Infinity` 표기는 `"∞"`로 제안. ⚠️→명시 처리 완료.
