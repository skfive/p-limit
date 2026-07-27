# 동시성 시각화 UI 디자인 계약 (F68F701A7A-40)

> **선행 계약**: `docs/plans/concurrency-visualizer-plan.md` (planning-contract@v1)
> **소비 계약**: ui-contract@v1 — 이 문서가 developer(F68F701A7A-41)와 공유하는 시각 표현·DOM 훅 명세다.
> **stack**: `vanilla-static` — 외부 자원 0건, `file://` 직접 열기 호환. 신규 npm/CDN/프레임워크 의존성 없음.

이 문서는 planner 실행 설계(파일 구조·상태 모델·6절 DOM 계약)를 **변경하지 않고** 그 위에 시각
표현만 얹는다. planner 6절이 이미 고정한 id/class/data-attribute 이름은 그대로 유지하며, 본 문서는
그 요소들의 색상·타이포·레이아웃·상태별 스타일을 확정한다. 컨트롤 영역에서 planner가 이름을 지정하지
않은 요소(작업 수 입력·시작·초기화 버튼)는 5절에서 **신규 훅으로 추가 확정**한다.

---

## 1. 시안 개요

### 변경 범위
`examples/concurrency-visualizer/` 정적 예제의 시각 스타일(`style.css`)과, developer가 구현할
DOM 훅(id/class/data-attribute) 명세. 실제 로직(`main.js`)·DOM 마크업(`index.html`)은 developer 담당.

### 사용자 경험 목표
1. **한눈에 상태 파악** — 각 작업(task)이 대기 → 실행 → 완료(또는 에러)로 바뀌는 것을
   색상·라벨로 즉시 구분할 수 있다.
2. **동시성 조절의 인과 관찰** — 슬라이더로 concurrency를 바꾸면 "실행 중" 칩 개수가
   그 값 이하로 유지되는 것을 눈으로 확인한다.
3. **집계 수치와 시각의 일치** — 상단 카운터(activeCount/pendingCount/concurrency)와
   task 그리드의 색상 분포가 서로 모순되지 않는다.
4. **의존성 없는 즉시 실행** — 브라우저에서 파일을 바로 열어(또는 정적 서버로) 확인. 폰트·색상
   모두 로컬 자원만 사용한다.

---

## 2. 컬러 팔레트

시스템은 HEX 값을 CSS 변수(`:root`)로 정의한다. hardcoded 색상 금지 — 아래 토큰명을 그대로 쓴다.

### 2.1 기본 팔레트

| 역할 | 토큰 | HEX | 용도 |
|---|---|---|---|
| primary | `--color-primary` | `#2563EB` | 강조 요소, 슬라이더 트랙 채움, 시작 버튼 |
| primary-fg | `--color-primary-fg` | `#FFFFFF` | primary 위 텍스트 |
| secondary | `--color-secondary` | `#6B7280` | 보조 버튼(초기화) 테두리/텍스트 |
| accent | `--color-accent` | `#F59E0B` | pending(대기) 카운터 강조 |
| background | `--color-bg` | `#F9FAFB` | 페이지 배경 |
| surface | `--color-surface` | `#FFFFFF` | 카드/패널 표면 |
| border | `--color-border` | `#E5E7EB` | 구분선·테두리 |
| text | `--color-text` | `#111827` | 본문 텍스트 |
| text-muted | `--color-text-muted` | `#6B7280` | 라벨·caption |

### 2.2 상태별 팔레트 (task 칩 — `data-state` 기준)

각 상태는 배경(bg)·전경(fg)·테두리(border) 3색 세트를 가진다. 색상만으로 구분하지 않도록
텍스트 라벨(한글)을 항상 함께 표기한다(접근성 — 색각 이상 대응).

| 상태 (`data-state`) | 라벨 | bg 토큰 / HEX | fg 토큰 / HEX | border 토큰 / HEX |
|---|---|---|---|---|
| `queued` | 대기 | `--state-queued-bg` `#F3F4F6` | `--state-queued-fg` `#4B5563` | `--state-queued-border` `#D1D5DB` |
| `active` | 실행 | `--state-active-bg` `#DBEAFE` | `--state-active-fg` `#1D4ED8` | `--state-active-border` `#60A5FA` |
| `done` | 완료 | `--state-done-bg` `#DCFCE7` | `--state-done-fg` `#15803D` | `--state-done-border` `#4ADE80` |
| `error` | 에러 | `--state-error-bg` `#FEE2E2` | `--state-error-fg` `#B91C1C` | `--state-error-border` `#F87171` |

> `active` 상태는 "지금 실행 중"임을 강조하기 위해 테두리에 미묘한 pulse 애니메이션(2.4절)을 적용한다.
> 색상 대비: 각 fg/bg 조합은 WCAG AA(본문 4.5:1) 이상을 목표로 선정했다.

### 2.3 대비 확인 근거
- 대기 `#4B5563` on `#F3F4F6`, 실행 `#1D4ED8` on `#DBEAFE`, 완료 `#15803D` on `#DCFCE7`,
  에러 `#B91C1C` on `#FEE2E2` — 모두 어두운 fg + 밝은 bg 조합으로 본문 대비 기준을 만족한다.

### 2.4 모션 (선택적, 접근성 가드 필수)
- `active` 칩 테두리: `@keyframes` 로 opacity 0.6↔1.0 을 1.2s ease-in-out 무한 반복(은은한 pulse).
- **`@media (prefers-reduced-motion: reduce)`** 에서는 모든 애니메이션을 `none` 으로 끈다(필수).

---

## 3. 타이포그래피

외부 폰트를 로드하지 않고 OS 기본 폰트 스택을 사용한다(`vanilla-static` 제약, 오프라인 동작).

```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

| 역할 | font-family | size | weight | line-height | 용도 |
|---|---|---|---|---|---|
| heading (h1) | sans | 1.75rem (28px) | 700 | 1.25 | 페이지 제목 |
| section (h2) | sans | 1.125rem (18px) | 600 | 1.3 | 컨트롤/카운터 그룹 제목 |
| body | sans | 1rem (16px) | 400 | 1.5 | 설명 텍스트, 버튼 라벨 |
| counter-value | mono | 2rem (32px) | 700 | 1.1 | 카운터 숫자(activeCount 등) |
| caption/label | sans | 0.8125rem (13px) | 500 | 1.4 | 카운터 라벨, task id, 상태 라벨 |

- 카운터 숫자는 자릿수 변동 시 흔들리지 않도록 `font-variant-numeric: tabular-nums` 적용.

---

## 4. 레이아웃

### 4.1 섹션 구조 (위→아래)

```
┌─ .app (max-width 880px, 중앙 정렬, padding) ─────────────┐
│  <h1> 제목                                                │
│  <p> 짧은 설명                                             │
│                                                           │
│  ┌─ .controls (surface 카드) ──────────────────────────┐ │
│  │  concurrency 슬라이더 + 현재값 · 작업 수 입력 · 버튼   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─ .counters (3열 그리드) ────────────────────────────┐  │
│  │  [실행 중]   [대기 중]   [동시성]                     │  │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─ #task-grid (auto-fill 그리드) ─────────────────────┐  │
│  │  [.task] [.task] [.task] ...                          │  │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 4.2 spacing 규칙
- 전역 spacing 단위: `--space` = 8px 배수. 카드 내부 padding 16px, 섹션 간 간격 24px.
- `--radius` = 8px(카드), task 칩은 6px.
- task 그리드 gap: 10px.

### 4.3 task 그리드
- `#task-grid` 는 `display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 10px;`
- 각 `.task` 는 정사각에 가까운 칩(min-height 64px). 상단에 id, 하단에 상태 라벨.
- 기본 시나리오 task 수 30개 내외(planner 7절)에서 스크롤 없이 또는 자연스러운 세로 확장으로 표시.

### 4.4 breakpoint 별 동작

| breakpoint | .controls | .counters | #task-grid |
|---|---|---|---|
| ≥ 640px (desktop) | 가로 1행(슬라이더 + 입력 + 버튼) | 3열 | auto-fill(minmax 72px) |
| < 640px (mobile) | 세로 스택(각 컨트롤 100% 폭) | 3열 유지(칩이 작아 유지 가능) | auto-fill(minmax 64px) |

- 컨테이너 `.app` 은 `max-width: 880px`, 좌우 padding 16px 로 모바일 여백 확보.

---

## 5. 컴포넌트 명세 (DOM 훅 · props · 상태 · 인터랙션)

> **범례**: 🔒 planner 6절이 고정한 훅(이름 변경 금지) · ➕ 본 디자인이 추가 확정한 신규 훅(developer 신규 구현 필요).

### 5.1 컨트롤 패널 `.controls`

| 요소 | 훅 | 종류 | 상태 / 인터랙션 |
|---|---|---|---|
| 동시성 슬라이더 | 🔒 `#concurrency-slider` | `<input type="range" min="1" max="10" step="1">` | `input`/`change` 시 developer가 `limit.concurrency` 갱신. focus 시 primary outline. |
| 동시성 현재값 | 🔒 `#concurrency-value` | `<output>`/`<span>` | 슬라이더 값 텍스트(mono). |
| 작업 수 입력 | ➕ `#task-count-input` | `<input type="number" min="1" max="30" value="12">` | 시작할 task 개수. 범위 밖 값은 developer가 clamp(디자인은 min/max 힌트만 제공). |
| 시작 버튼 | ➕ `#start-btn` | `<button>` | primary 스타일. click 시 developer가 N개 task 생성·실행. 실행 중 비활성(`disabled`) 표현 정의(5.4). |
| 초기화 버튼 | ➕ `#reset-btn` | `<button>` | secondary(외곽선) 스타일. click 시 task 목록 비우고 카운터 0. |

- `min="1" max="10"` 슬라이더 범위는 데모 권장값이며 developer가 조정 가능(디자인은 트랙 채움 시각만 계약).
- ➕ 신규 훅(`#task-count-input`/`#start-btn`/`#reset-btn`)은 planner 6절 표에 없던 컨트롤이다.
  planner 5절이 언급한 "작업 N개 시작 / 초기화·재실행" 동작에 대응하며, developer가 이 id로 구현한다.
  구조 변경이 필요하면 Jira 코멘트로 조율(planner 6절 원칙 준수).

### 5.2 카운터 `.counters` / `.counter`

| 요소 | 훅 | 표시 값 |
|---|---|---|
| 실행 중 카운터 값 | 🔒 `#active-count` | `limit.activeCount` (단일 진실 소스, planner 4.1) |
| 대기 중 카운터 값 | 🔒 `#pending-count` | `limit.pendingCount` |
| 동시성 카운터 값 | (재사용) `#concurrency-value` | `limit.concurrency` — 슬라이더 값과 동일 요소를 카운터 영역에 표시 가능. 별도 요소를 쓸 경우에도 값 출처는 동일. |

- 각 카운터는 `.counter` 래퍼 안에 `.counter__value`(mono 숫자) + `.counter__label`(caption) 구성.
- 실행 중 값은 primary, 대기 중 값은 accent 색으로 라벨 강조(값 자체는 text 색 유지).
- ⚠️ `done`/`error` 개수 카운터는 planner의 집계 계약(activeCount/pendingCount/concurrency)에
  없으므로 **본 계약에서 필수 요소로 두지 않는다**. 필요 시 per-task 상태에서 파생하는 추가 카운터로
  developer와 Jira 조율 후 확장(현재 scope 외).

### 5.3 task 칩 `.task`

planner 6절 계약을 그대로 사용한다.

| 훅 | 계약 |
|---|---|
| 🔒 `.task` | task 1개당 요소 1개. `#task-grid` 의 자식. |
| 🔒 `.task[data-state="queued\|active\|done\|error"]` | 상태별 색상 세트(2.2절)를 `data-state` 선택자로 적용. |
| 🔒 `.task[data-id]` | task 고유 id. 칩 상단에 `.task__id` 로 표시(디버깅/테스트 대조). |

- 내부 권장 구조: `.task__id`(예: `#3`) + `.task__state`(상태 라벨 "대기/실행/완료/에러").
- 상태 라벨은 색상과 **독립적으로** 텍스트로 상태를 전달(접근성). `aria-label` 로 "작업 3, 실행 중"
  형태 병기 권장(developer 구현 가이드 참조).

### 5.4 인터랙션 / 상태 스타일 요약

| 컴포넌트 | 상태 | 시각 |
|---|---|---|
| 시작 버튼 | default | primary bg, white fg |
| 시작 버튼 | hover | primary 10% 어둡게 |
| 시작 버튼 | disabled(실행 중) | opacity 0.5, `cursor: not-allowed` |
| 초기화 버튼 | default | 투명 bg, secondary 테두리·텍스트 |
| 초기화 버튼 | hover | secondary 5% 배경 틴트 |
| 슬라이더 | focus | primary 2px outline(`:focus-visible`) |
| task 칩 | active | 테두리 pulse(2.4절, reduced-motion 시 정지) |

---

## 6. dev 구현 가이드 (F68F701A7A-41)

developer가 `style.css` 없이 `index.html`/`main.js` 를 만들 때 참고. designer가 `style.css` 를
직접 작성하지 않으므로(코드 구현은 designer scope 외), 아래 토큰·클래스명 권장안을 그대로 쓰면
본 계약과 일치한다.

### 6.1 CSS 변수 (`:root` 에 정의)

```css
:root {
  /* 기본 팔레트 */
  --color-primary: #2563EB;
  --color-primary-fg: #FFFFFF;
  --color-secondary: #6B7280;
  --color-accent: #F59E0B;
  --color-bg: #F9FAFB;
  --color-surface: #FFFFFF;
  --color-border: #E5E7EB;
  --color-text: #111827;
  --color-text-muted: #6B7280;

  /* 상태별 (queued/active/done/error) */
  --state-queued-bg: #F3F4F6;  --state-queued-fg: #4B5563;  --state-queued-border: #D1D5DB;
  --state-active-bg: #DBEAFE;  --state-active-fg: #1D4ED8;  --state-active-border: #60A5FA;
  --state-done-bg:   #DCFCE7;  --state-done-fg:   #15803D;  --state-done-border:   #4ADE80;
  --state-error-bg:  #FEE2E2;  --state-error-fg:  #B91C1C;  --state-error-border:  #F87171;

  /* 타이포 · 형태 */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --radius: 8px;
  --space: 8px;
}
```

### 6.2 상태별 스타일 훅 (권장 패턴)

```css
.task { border: 1px solid var(--color-border); border-radius: 6px; }
.task[data-state="queued"] { background: var(--state-queued-bg); color: var(--state-queued-fg); border-color: var(--state-queued-border); }
.task[data-state="active"] { background: var(--state-active-bg); color: var(--state-active-fg); border-color: var(--state-active-border); }
.task[data-state="done"]   { background: var(--state-done-bg);   color: var(--state-done-fg);   border-color: var(--state-done-border); }
.task[data-state="error"]  { background: var(--state-error-bg);  color: var(--state-error-fg);  border-color: var(--state-error-border); }

@keyframes task-pulse { 0%,100% { border-color: var(--state-active-border); } 50% { border-color: var(--color-primary); } }
.task[data-state="active"] { animation: task-pulse 1.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .task[data-state="active"] { animation: none; } }
```

### 6.3 단계별 지침

1. `index.html` 에 planner 6절 + 본 5절 훅으로 마크업 구성:
   `.app > h1 + p + .controls + .counters + #task-grid`.
2. `.controls` 안에 `#concurrency-slider`, `#concurrency-value`, `#task-count-input`,
   `#start-btn`, `#reset-btn` 배치(5.1).
3. `.counters` 안에 `.counter` 3개 — 각 `.counter__value`(`#active-count` / `#pending-count` /
   동시성 값) + `.counter__label`.
4. task 렌더 시 `.task[data-id][data-state]` 를 `#task-grid` 자식으로 생성, 내부에
   `.task__id` + `.task__state`(한글 라벨) + `aria-label`.
5. 위 6.1 토큰을 `:root` 에 붙여넣고 6.2 상태 훅을 적용하면 본 계약 색상과 일치.
6. **hardcoded 색상 금지** — 모든 색은 `var(--…)` 로 참조.
7. 외부 폰트/CDN/이미지 로드 금지 — system font stack만 사용(`file://` 동작 보장).

### 6.4 접근성 체크
- 상태를 색상 단독으로 전달하지 않는다(항상 텍스트 라벨 + `aria-label`).
- 슬라이더/버튼은 키보드 focus 가능하고 `:focus-visible` outline 을 가진다.
- `prefers-reduced-motion` 존중.

---

## 7. mockup 참조

같은 컬러·타이포·레이아웃을 시각화한 self-contained mockup:

- **`docs/design/mockups/concurrency-visualizer-F68F701A7A-40.html`**

mockup 은 시안 시각 시뮬레이션용이며 developer의 실제 산출물이 아니다. developer는 픽셀 단위 일치
의무 없이 본 문서의 토큰·훅·상태 표현을 구현 기준으로 삼는다. 4개 상태(대기/실행/완료/에러) 칩,
카운터 3종, 컨트롤(슬라이더·입력·버튼), hover/focus/disabled 상태 예시를 정적으로 포함한다.

---

## 8. Self-critique

- **AC 매핑**: packet AC 2건 —
  ① "상태별 시각 표현 + 카운터·컨트롤 레이아웃 문서 확정" → 2절(상태 팔레트)·4절(레이아웃)·5.1/5.2 로 확정.
  ② "developer가 구현할 DOM 훅(id/class) 명세" → 5절 표(🔒 고정 훅 + ➕ 신규 훅) + 6절 구현 가이드로 명세.
- **dev 구현 가이드**: 6절에 CSS 변수 전체·상태 훅 CSS·단계별 지침 포함 → developer가 그대로 복사 가능.
- **기존 요소 보존**: planner 6절 DOM 계약(id/class/data-attribute)을 이름 변경 없이 그대로 사용.
  기존 다른 epic의 design 문서/코드는 건드리지 않음(owned_paths `docs/design/**` 내 신규 2파일만).
- **컴포넌트 매핑**: 슬라이더·카운터·task 칩·버튼 각각 훅↔시각 1:1 매핑(5절 표). 🔒/➕ 로 신규 여부 명시.
- **모호함 flag**:
  - ➕ `#task-count-input`/`#start-btn`/`#reset-btn` 는 planner 6절 표에 없던 신규 컨트롤 훅이다.
    planner 5절 서술(작업 N개 시작·초기화)에 근거해 이름을 확정했으나, developer가 다른 id를
    선호하면 Jira 코멘트로 조율(구조 임의 변경 금지 원칙 유지).
  - `done`/`error` 개수 카운터는 planner 집계 계약 밖이라 필수 요소에서 제외(5.2 ⚠️). 필요 시 확장은
    별도 조율.
  - 슬라이더 `min/max`(1~10)와 task 수(기본 12, 최대 30)는 데모 권장값 — developer 재량 조정 가능
    영역으로 명시.
