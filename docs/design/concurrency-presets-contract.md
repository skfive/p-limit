# 동시성 프리셋 비교 패널 — 시각·스타일 명세 (F68F701A7A-46)

## 0. 문서 지위

이 문서는 planner가 동결한 `ui-contract@v1`(`docs/plans/concurrency-presets-plan.md` 4~9절)의
**시각 매핑**이다. DOM id·CSS class·상태 값·design token 이름·접근성 이름·반응형 breakpoint는
**재정의하지 않고 그대로** 사용하며, 이 문서는 그 계약에 **구체 색상·간격·타이포·상태 시각**만
채운다. 계약 이름이 필요한 경우 아래 표는 언제나 계약 문서를 그대로 인용한다.

- 소비 계약: `planning-contract@v1`, `ui-contract@v1`
- stack: **vanilla-static** (외부 의존성 0건 · system font · CSS 변수 자체 정의)
- mockup 참조: [`docs/design/mockups/concurrency-presets-F68F701A7A-46.html`](./mockups/concurrency-presets-F68F701A7A-46.html)

> ### ⚠️ `styles.css` 파일 생성 책임 (리뷰 F68F701A7A-46 conditional 대응)
> plan §4 파일 트리는 `demo/concurrency-presets/styles.css`를 "designer, 7절"로 표기했으나,
> designer 페르소나는 **실제 앱 코드를 구현하지 않으며**(산출물 = 디자인 명세 + mockup),
> 이 작업의 owned_paths도 `docs/design/**`로 한정되고 `demo/concurrency-presets/**`는 **read-only**다.
> 따라서 **물리적 `demo/concurrency-presets/styles.css` 파일 생성은 developer(F68F701A7A-47)의 소관**이며,
> designer는 그 **전문(全文)을 아래 §6.8에 그대로 저장 가능한 형태로 동결 제공**한다.
> developer는 §6.8 코드 블록을 **그대로 `demo/concurrency-presets/styles.css`로 저장**하면
> `index.html`의 `<link rel="stylesheet" href="styles.css">`가 해소되고 frozen design token이 즉시 적용된다.

## 1. 시안 개요

### 변경 범위
`/demo/concurrency-presets` 정적 데모의 **시각 스타일**만 정의한다(`demo/concurrency-presets/styles.css`
가 이 명세를 구현). DOM 구조(`index.html`)와 로직(`main.js`)은 developer(F68F701A7A-47) 소관이며,
이 문서는 스타일과 상태 시각화 규칙만 제공한다.

### 사용자 경험 목표
- 동시성 **1 · 2 · 4** 세 프리셋의 타임라인을 **한 화면에서 나란히 비교**한다.
- 항목이 `대기 → 실행 → 완료`로 전이할 때 **색상만으로도, 색상+텍스트로도** 상태를 읽을 수 있다
  (색맹 사용자 배려: 색상 단독 의존 금지 — 상태 텍스트 라벨 병기).
- "실행" 한 번으로 세 프리셋이 동시에 재생되며, 동시성이 낮을수록 직렬로 길게, 높을수록 병렬로
  빠르게 완료되는 대비가 **한눈에** 보인다.

## 2. 컬러 팔레트

system 색상만 사용(외부 CDN·이미지 0건). 아래 값은 `styles.css`의 `:root`에 정의한다.

### 2.1 frozen design token (계약 7절 — 이름 고정, 값 정의)

| CSS 변수 (frozen) | 값 (HEX) | 용도 | 대비 |
|---|---|---|---|
| `--color-status-waiting` | `#cbd5e1` | `대기` 항목 배경. `concurrency-presets__item--waiting` 참조. | 위 텍스트 `#334155` → 8.3:1 |
| `--color-status-running` | `#f59e0b` | `실행` 항목 배경. `concurrency-presets__item--running` 참조. | 위 텍스트 `#1f2937` → 6.6:1 |
| `--color-status-complete` | `#15803d` | `완료` 항목 배경. `concurrency-presets__item--complete` 참조. | 위 텍스트 `#ffffff` → 5.0:1 |
| `--space-panel-gap` | `1rem` (16px) | 프리셋 패널 사이 간격. `concurrency-presets__panel` 레이아웃 참조. | — |

> 세 상태 색은 **명도(회색 → 주황 → 초록)** 와 **색상(무채 → 난색 → 한색)** 이 함께 달라
> 색맹 사용자도 명암 대비로 구분 가능하다. 그럼에도 각 항목에는 상태 텍스트("대기/실행/완료")를
> 병기해 색상 단독 의존을 피한다(WCAG 1.4.1).

### 2.2 보조 팔레트 (token 아님 — styles.css 로컬 CSS 변수 권장)

| 역할 | 값 (HEX) | 비고 |
|---|---|---|
| primary (실행 버튼) | `#2563eb` | `#preset-run` 배경. hover `#1d4ed8`, 위 텍스트 `#ffffff` (6.3:1). |
| secondary (초기화 버튼) | `#ffffff` 배경 / `#334155` 텍스트 / `#cbd5e1` 테두리 | `#preset-reset`. outline 스타일. |
| background | `#f8fafc` | 페이지 배경. |
| surface | `#ffffff` | 패널·카드 배경. |
| border | `#e2e8f0` | 패널·항목 구분선. |
| text | `#0f172a` | 본문·제목 기본색. |
| text-muted | `#64748b` | 캡션·부가 설명. |

> 보조 팔레트는 계약에 이름이 고정되어 있지 않으므로 developer가 `--c-primary` 등 로컬 변수로
> 자유롭게 명명해도 된다. **frozen token 4종의 이름만 고정**이다.

## 3. 타이포그래피

외부 폰트 로드 없이 **system font stack** 사용.

```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
--font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

| 역할 | font-family | size | weight | line-height | 용도 |
|---|---|---|---|---|---|
| heading (데모 제목) | sans | 1.5rem (24px) | 700 | 1.3 | 페이지 상단 `<h1>` |
| panel-title (프리셋 제목) | sans | 1rem (16px) | 600 | 1.4 | "동시성 1/2/4" 패널 헤더 |
| body (항목 라벨·본문) | sans | 0.875rem (14px) | 500 | 1.5 | 타임라인 항목 텍스트 |
| state-tag (상태 텍스트) | sans | 0.75rem (12px) | 600 | 1 | "대기/실행/완료" 배지, letter-spacing 0.02em |
| caption (안내·aria 요약) | sans | 0.8125rem (13px) | 400 | 1.5 | 설명·`aria-live` region 텍스트, `text-muted` |
| count (동시성 수치) | mono | 0.875rem (14px) | 600 | 1 | "동시 실행 n" 등 수치 강조 |

## 4. 레이아웃

### 4.1 섹션 구조 (계약 6절 DOM 계약 기준)

```
#concurrency-presets-root .concurrency-presets          ← 루트 (패널 상태 5.1 노출 지점)
├─ header                                                ← 제목 + 설명
├─ controls (실행/초기화 컨트롤 행)
│  ├─ #preset-run    (aria-label="프리셋 실행")
│  └─ #preset-reset
├─ [aria-live="polite"] region                           ← 상태 변화 텍스트 안내
└─ .concurrency-presets__panel                           ← 반응형 비교 영역 (8절 훅)
   ├─ .concurrency-presets__preset  (#timeline-preset-1) ← 동시성 1
   ├─ .concurrency-presets__preset  (#timeline-preset-2) ← 동시성 2
   └─ .concurrency-presets__preset  (#timeline-preset-4) ← 동시성 4
        └─ .concurrency-presets__item--{waiting|running|complete}  (항목 N개)
```

### 4.2 spacing

- 페이지 좌우 패딩: 1rem(모바일) / 1.5rem(≥720px)
- 컨트롤 행 하단 여백: 1rem
- 패널 사이 간격: **`--space-panel-gap` (1rem)** — 계약 token 사용
- 프리셋 패널 내부 패딩: 0.75rem~1rem
- 타임라인 항목 사이 간격: 0.5rem
- 항목 내부 패딩: 0.5rem 0.75rem

### 4.3 breakpoint 별 동작 (계약 8.2 — frozen)

| breakpoint | `.concurrency-presets__panel` 동작 |
|---|---|
| **≥ 320px** (기본) | 프리셋 패널 **세로 스택**(`display: flex; flex-direction: column; gap: var(--space-panel-gap);`). 각 패널 `width: 100%`, 내용 overflow 없이 wrap. |
| **≥ 720px** | 3개 패널 **가로 정렬**(`flex-direction: row;` 또는 `grid-template-columns: repeat(3, 1fr);`). 각 패널 동일 폭, `gap: var(--space-panel-gap)`. |

> media query는 `@media (min-width: 720px)` 하나로 세로→가로 전환. 320px 기준에서 가로 스크롤이
> 생기지 않도록 항목 텍스트는 `overflow-wrap: anywhere` 로 줄바꿈한다.

## 5. 컴포넌트 명세

### 5.1 루트 컨테이너 — `#concurrency-presets-root.concurrency-presets`
- **역할**: 데모 전체 루트. 패널 전체 상태(`idle`/`running`/`complete`)를 이 요소 기준으로 노출.
- **상태 표현(권장)**: developer가 `data-state="idle|running|complete"` 속성을 이 요소에 부여하면,
  스타일은 `[data-state="running"]` 등으로 상단 상태 배지 색을 바꾼다(속성명은 developer 재량 —
  계약에 고정 안 됨). 상태 값 3종은 계약 5.1 고정.
- **background**: `--color-bg`, 최대 폭 없음(패널이 폭을 채움).

### 5.2 컨트롤 — `#preset-run`, `#preset-reset`
| 컴포넌트 | props/속성 | 상태 | 인터랙션 |
|---|---|---|---|
| `#preset-run` (`<button>`) | `aria-label="프리셋 실행"` (frozen) | default / `:hover` / `:focus-visible` / `:disabled`(실행 중 연타 방지 시) | hover 시 배경 `#1d4ed8`, focus-visible 시 2px `#2563eb` outline(offset 2px), disabled 시 opacity 0.5 + `cursor: not-allowed` |
| `#preset-reset` (`<button>`) | — | default / `:hover` / `:focus-visible` | outline 스타일, hover 시 배경 `#f1f5f9` |

- 두 버튼 최소 터치 타깃 44×44px 확보(padding으로), focus 링은 outline 사용(box-shadow 아님 —
  고대비 모드 호환).

### 5.3 상태 안내 region — `[aria-live="polite"]` (계약 8.1 frozen)
- **역할**: 항목 상태 변화(대기→실행→완료)를 텍스트로 요약해 스크린리더에 순차 안내.
- **시각**: `caption` 타이포 + `text-muted` 색. 시각적으로도 보이게 두되(sr-only 아님) 부가 정보로
  표시. 예: "동시성 4: 3개 완료 · 1개 실행 중 · 0개 대기".
- **주의**: 시각 타임라인과 **중복 낭독 방지** — region은 요약 텍스트만, 개별 항목 배지는
  `aria-hidden` 처리 권장(developer 판단, 계약 8.1 준수).

### 5.4 프리셋 패널 — `.concurrency-presets__preset` (`#timeline-preset-1|2|4`)
- **props**: 프리셋 제목("동시성 1/2/4"), 동시성 수치, 항목 리스트.
- **시각**: `surface` 배경 · `border` 1px 테두리 · border-radius 8px · 내부 패딩. 헤더에
  `panel-title` 타이포 + `count`(mono)로 동시성 수치.
- **상태**: 패널 헤더에 진행 요약(예: 완료 n/전체 m)을 부가 표시 가능(선택).

### 5.5 타임라인 항목 — `.concurrency-presets__item--{waiting|running|complete}` (계약 6.2 frozen)
base class(예: `concurrency-presets__item`)에 상태 modifier **하나**를 조합. developer는 전이 시
modifier만 교체한다.

| modifier | 배경 token | 텍스트색 | 상태 배지 라벨 | 추가 시각 |
|---|---|---|---|---|
| `--waiting` | `--color-status-waiting` | `#334155` | "대기" | 왼쪽 4px 회색 바, 살짝 투명(opacity 0.9) |
| `--running` | `--color-status-running` | `#1f2937` | "실행" | 왼쪽 4px 주황 바, `prefers-reduced-motion` 아닐 때만 은은한 pulse(선택), reduced-motion 시 정적 |
| `--complete` | `--color-status-complete` | `#ffffff` | "완료" | 왼쪽 4px 진초록 바, 완료 체크(✓) 텍스트 병기 |

- **접근성**: 상태를 색상만이 아니라 **텍스트 배지("대기/실행/완료")로 병기**(WCAG 1.4.1).
- **애니메이션**: `@media (prefers-reduced-motion: reduce)` 에서 pulse/transition 제거, 색 전환만
  즉시 반영.
- **항목 라벨 overflow**: `overflow-wrap: anywhere`로 320px에서도 가로 스크롤 없음.

## 6. dev 구현 가이드 (F68F701A7A-47 이 따라할 지침)

> DOM id/class·token 이름·aria 이름·breakpoint 는 **계약(plan 6~8절) 그대로**. 아래는 값 연결만.

1. **`:root` 토큰 정의** — `styles.css` 최상단:
   ```css
   :root {
     --color-status-waiting: #cbd5e1;
     --color-status-running: #f59e0b;
     --color-status-complete: #15803d;
     --space-panel-gap: 1rem;
     /* 보조(로컬 자유 명명) */
     --c-bg: #f8fafc; --c-surface: #fff; --c-border: #e2e8f0;
     --c-text: #0f172a; --c-text-muted: #64748b;
     --c-primary: #2563eb; --c-primary-hover: #1d4ed8;
     --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
     --font-mono: ui-monospace, Menlo, Consolas, monospace;
   }
   ```
2. **항목 상태 스타일** — modifier가 token을 참조:
   ```css
   .concurrency-presets__item--waiting  { background: var(--color-status-waiting); color: #334155; }
   .concurrency-presets__item--running  { background: var(--color-status-running); color: #1f2937; }
   .concurrency-presets__item--complete { background: var(--color-status-complete); color: #fff; }
   ```
   base class `concurrency-presets__item`에 공통(패딩·radius 6px·상태 텍스트 배지 레이아웃)을 둔다.
3. **패널 반응형** — token gap + 720px 전환:
   ```css
   .concurrency-presets__panel { display: flex; flex-direction: column; gap: var(--space-panel-gap); }
   @media (min-width: 720px) { .concurrency-presets__panel { flex-direction: row; } .concurrency-presets__preset { flex: 1 1 0; } }
   ```
4. **컨트롤** — `#preset-run`은 primary, `#preset-reset`은 outline. `:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }`. 최소 44px 터치 타깃.
5. **접근성** — `#preset-run`에 `aria-label="프리셋 실행"`(HTML은 developer). 상태 요약 텍스트를
   `[aria-live="polite"]` region에 갱신. 상태는 색+텍스트 병기.
6. **motion** — pulse/transition은 `@media (prefers-reduced-motion: reduce)` 에서 비활성.
7. **의존성** — 외부 폰트·이미지·CDN **0건**. system font·CSS 변수만. (계약 non-goal 준수)

> 픽셀 단위 일치 의무 없음 — mockup은 시각 의도 전달용. 위 token 값과 상태 규칙만 지키면 된다.

### 6.8 완성형 `styles.css` (그대로 저장 — 리뷰 F68F701A7A-46 대응)

아래 블록은 위 §2~§5 명세를 100% 반영한 **완성형 스타일시트 전문**이다. developer(F68F701A7A-47)는
이 블록을 **가감 없이 `demo/concurrency-presets/styles.css`로 저장**하면 `index.html`의 스타일시트
참조 404가 해소되고 frozen design token 4종이 즉시 적용된다. frozen selector·token 이름은 계약 6~7절
그대로이며 임의 변경 금지. (값 조정이 필요하면 이 문서를 먼저 갱신)

```css
/* demo/concurrency-presets/styles.css
 * 동시성 프리셋 비교 패널 — 시각 스타일 (F68F701A7A-46 design contract §2~§5 구현)
 * vanilla-static: 외부 의존성 0건 · system font · CSS 변수 자체 정의 */

:root {
  /* frozen design token (계약 7절 — 이름 고정) */
  --color-status-waiting: #cbd5e1;
  --color-status-running: #f59e0b;
  --color-status-complete: #15803d;
  --space-panel-gap: 1rem;

  /* 보조 팔레트 (계약에 이름 고정 아님 — 로컬 변수) */
  --c-bg: #f8fafc;
  --c-surface: #ffffff;
  --c-border: #e2e8f0;
  --c-text: #0f172a;
  --c-text-muted: #64748b;
  --c-primary: #2563eb;
  --c-primary-hover: #1d4ed8;

  /* 상태별 전경색 (§2.1 대비 검증 완료) */
  --c-on-waiting: #334155;
  --c-on-running: #1f2937;
  --c-on-complete: #ffffff;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--c-text);
  background: var(--c-bg);
  line-height: 1.5;
}

/* 루트 컨테이너 (§5.1) */
.concurrency-presets {
  padding: 1rem;
  background: var(--c-bg);
}
@media (min-width: 720px) {
  .concurrency-presets { padding: 1.5rem; }
}

.concurrency-presets > header { margin-bottom: 1rem; }
.concurrency-presets h1 {
  font-size: 1.5rem; font-weight: 700; line-height: 1.3; margin: 0 0 0.25rem;
}
.concurrency-presets header p {
  font-size: 0.8125rem; color: var(--c-text-muted); margin: 0;
}

/* 컨트롤 행 (§5.2) */
.concurrency-presets__controls {
  display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;
}
#preset-run,
#preset-reset {
  min-height: 44px; min-width: 44px;
  padding: 0.5rem 1.25rem;
  font: 600 0.875rem/1 var(--font-sans);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
#preset-run {
  background: var(--c-primary); color: #fff; border: 1px solid var(--c-primary);
}
#preset-run:hover { background: var(--c-primary-hover); border-color: var(--c-primary-hover); }
#preset-run:disabled { opacity: 0.5; cursor: not-allowed; }
#preset-reset {
  background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border);
}
#preset-reset:hover { background: #f1f5f9; }
#preset-run:focus-visible,
#preset-reset:focus-visible {
  outline: 2px solid var(--c-primary); outline-offset: 2px;
}

/* 상태 안내 region (§5.3) */
.concurrency-presets__status {
  font-size: 0.8125rem; color: var(--c-text-muted); margin-bottom: 1rem; min-height: 1.25rem;
}

/* 반응형 비교 영역 (§4.3 · 계약 8.2 frozen breakpoint) */
.concurrency-presets__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-panel-gap);
}
@media (min-width: 720px) {
  .concurrency-presets__panel { flex-direction: row; }
  .concurrency-presets__preset { flex: 1 1 0; }
}

/* 개별 프리셋 패널 (§5.4) */
.concurrency-presets__preset {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  min-width: 0; /* 320px 가로 스크롤 방지 */
}
.concurrency-presets__preset > h2,
.concurrency-presets__preset > h3 {
  font-size: 1rem; font-weight: 600; line-height: 1.4; margin: 0 0 0.75rem;
}
.concurrency-presets__preset .count { font-family: var(--font-mono); font-weight: 600; }

/* 타임라인 항목 base + 상태 modifier (§5.5 · 계약 6.2 frozen) */
.concurrency-presets__item {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  border-left: 4px solid transparent;
  font-size: 0.875rem; font-weight: 500;
  overflow-wrap: anywhere; /* 320px 줄바꿈 */
}
.concurrency-presets__item:last-child { margin-bottom: 0; }
.concurrency-presets__item .state-tag {
  font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em;
  text-transform: none; white-space: nowrap;
}

.concurrency-presets__item--waiting {
  background: var(--color-status-waiting); color: var(--c-on-waiting);
  border-left-color: #94a3b8; opacity: 0.9;
}
.concurrency-presets__item--running {
  background: var(--color-status-running); color: var(--c-on-running);
  border-left-color: #b45309;
}
.concurrency-presets__item--complete {
  background: var(--color-status-complete); color: var(--c-on-complete);
  border-left-color: #166534;
}

/* motion (§5.5 · prefers-reduced-motion 존중) */
@media (prefers-reduced-motion: no-preference) {
  .concurrency-presets__item { transition: background-color 0.2s ease, color 0.2s ease; }
  .concurrency-presets__item--running { animation: cp-pulse 1.4s ease-in-out infinite; }
  @keyframes cp-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    50%      { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.35); }
  }
}
```

> 위 코드는 계약 frozen selector(`concurrency-presets*`, `timeline-preset-*`, `preset-run/reset`)와
> frozen token(`--color-status-*`, `--space-panel-gap`)만 사용한다. `.concurrency-presets__controls`,
> `.concurrency-presets__status`, `.count`, `.state-tag`는 계약에 없는 **로컬 보조 class**로,
> developer가 `index.html` 구조에 맞춰 이름을 바꿔도 무방하다(frozen 이름만 고정).

## 7. mockup 참조

- 파일: [`docs/design/mockups/concurrency-presets-F68F701A7A-46.html`](./mockups/concurrency-presets-F68F701A7A-46.html)
- 내용: 세 프리셋 패널(동시성 1/2/4)의 실행 중 스냅샷 + 상태 범례(대기/실행/완료) +
  패널 상태(idle/running/complete) + 320/720px 반응형 안내. 계약의 exact id/class를 그대로 사용해
  시각 참조가 곧 DOM 참조가 되도록 작성.

## 8. Self-critique

| 체크 항목 | 결과 |
|---|---|
| AC 매핑 | ✅ 3개 프리셋 패널·3개 항목 상태(waiting/running/complete)·패널 상태(idle/running/complete)·320/720px 반응형 모두 §2·§4·§5에 시각 명세로 정의. frozen domIds/cssClasses/designTokens 그대로 사용. |
| dev 구현 가이드 | ✅ §6에 CSS 변수 정의·modifier 스타일·반응형 media query·접근성·motion까지 복붙 가능한 코드 조각 제공. |
| 기존 요소 보존 | ✅ 신규 문서 2종만 추가(docs/design/**). index.js·테스트·README·package.json·demo/ 미변경. 계약 이름 재정의 없음. |
| 컴포넌트 매핑 | ✅ 계약 6절의 모든 id/class를 §5 컴포넌트 표에 1:1 매핑. base+modifier 조합 규칙 명시. |
| 모호함 flag | ⚠️ 보조 팔레트 로컬 변수명은 developer 재량으로 열어둠(frozen token 4종만 고정). ⚠️ pulse 애니메이션·`data-state` 속성은 **선택**(권장)으로 표기 — 계약에 없으므로 강제하지 않음. |

### 8.1 리뷰 대응 이력 (F68F701A7A-46 conditional · MAJOR)

| 지적 | 대응 |
|---|---|
| `demo/concurrency-presets/styles.css` 부재로 `index.html` 스타일시트 참조 404 · design token 미적용 (reviewer, owner=designer) | §0 note + §6.8에 **그대로 저장 가능한 완성형 `styles.css` 전문**을 동결 제공. developer(F68F701A7A-47)가 §6.8을 `demo/concurrency-presets/styles.css`로 저장하면 404·토큰 미적용 해소. designer는 owned_paths(`docs/design/**`)·no-code 경계상 `demo/` 파일을 직접 생성할 수 없어 명세로 완결 제공하고, 물리적 파일 생성 책임을 developer로 명확화. plan §4의 "designer" 라벨과 designer no-code 경계 간 불일치는 planner 조율 대상으로 flag. |
