# pause/resume 대시보드 UI 시각 명세 (F68F701A7A-64)

> 이 문서는 planner가 동결한 UI 계약(`docs/plans/pause-resume-dashboard-plan.md` · frozen
> blueprint `ui-contract@v1`)을 **시각 언어로 구현**한 designer 산출물이다. domId ·
> cssClass · 상태 텍스트 · designToken 이름은 **재정의하지 않고 그대로 소비**하며, token의
> **실제 값(색상 hex·간격·글자 크기)** 과 레이아웃·접근성·반응형 시각 규칙만 정의한다.
> 계약과 충돌하면 blueprint가 우선한다.

- 소유 파일: `docs/design/pause-resume-dashboard.md`(본 문서), `docs/design/pause-resume-mockup.html`
- 소비 계약: `demo/index.html` · `demo/app.js` · `demo/styles.css`(developer 소유 — 참조만)
- 런타임 HTML/CSS/JS는 생성하지 않는다. 시각 명세와 정적 mockup만 산출한다.

---

## 1. 시안 개요

### 변경 범위
`p-limit`의 실행 흐름을 "일시정지 → 재개" 관점으로 관찰하는 정적 데모 대시보드 1개의
**시각 시안**. 작업 추가 / 일시정지 / 재개 control, active·pending 카운터, 4개 상태
(`idle` / `running` / `draining` / `paused`) 배지, 개별 작업 목록으로 구성된다.

### 사용자 경험 목표
- **상태를 색이 아니라 글자로 먼저 읽게 한다.** 색맹·저시력·흑백 출력에서도 배지 텍스트만으로
  현재 상태를 구분할 수 있다(색상은 보조 신호).
- **한 눈에 실행 압력을 본다.** active/pending 카운터를 크고 명확하게 배치해 concurrency
  한도 안에서의 흐름을 즉시 파악한다.
- **pause의 의미를 정확히 전달한다.** pause는 "즉시 멈춤"이 아니라 "신규 투입 차단 + 실행 중
  작업 마무리(draining)"임을 배지 텍스트('정리 중 (실행 작업 마무리)')로 분명히 한다.
- **320px 좁은 화면에서도 가로 스크롤 없이** control이 자연스럽게 wrap 된다.

---

## 2. 컬러 팔레트

### 2.1 동결 design token (이름 고정 — developer가 `demo/styles.css` `:root`에 그대로 선언)

배지는 **채움색(fill) + 흰색 텍스트** 로 표현하며, 아래 값은 모두 흰색(`#FFFFFF`) 텍스트와
**WCAG AA 본문 대비 4.5:1 이상**을 만족한다(색상 단독 의존 금지 원칙을 대비로도 보강).

| token | 값(HEX) | 상태 | 흰색 텍스트 대비 |
|---|---|---|---|
| `--color-status-idle` | `#475569` | idle(대기) — 중립 슬레이트 | ≈ 7.4:1 ✓ |
| `--color-status-running` | `#15803D` | running(실행) — 진행 그린 | ≈ 4.54:1 ✓ |
| `--color-status-paused` | `#B45309` | paused(일시정지) — 주의 앰버 | ≈ 4.6:1 ✓ |

> **`draining` 상태의 색:** blueprint에 `draining` 전용 class·token이 **없다.** 새 class·token을
> 추가하지 않고, draining 구간은 **`--color-status-paused`(앰버) 를 재사용**한다. "일시정지로
> 전이 중"이라는 의미가 앰버(주의)와 일치하며, 실제 구분은 **배지 텍스트**
> ('정리 중 (실행 작업 마무리)')가 담당한다. → 5.3 참조.

### 2.2 그 외 동결 token (색상 아님 — 값만 정의)

| token | 값 | 용도 |
|---|---|---|
| `--space-control-gap` | `12px` | add/pause/resume control 사이 간격(및 wrap 시 행 간격) |
| `--font-size-counter` | `28px` | active/pending 카운터 숫자 글자 크기 |

### 2.3 보조 색 (비동결 — 시안 표현용, token 아님)

developer는 아래를 token으로 강제받지 않는다. surface·경계·버튼 등 시각 톤 참고용이다.

| 이름 | 값 | 용도 |
|---|---|---|
| 페이지 배경 | `#F8FAFC` | 대시보드 바깥 배경 |
| 카드 배경 | `#FFFFFF` | `.dashboard` 표면 |
| 본문 텍스트 | `#0F172A` | 기본 글자색 |
| 보조 텍스트 | `#475569` | 라벨·설명 |
| 경계선 | `#E2E8F0` | 카드·목록 항목 테두리 |
| 주요 버튼 | `#2563EB` / hover `#1D4ED8` | 작업 추가(주 실행 control) |
| 비활성 | `#94A3B8` | disabled control 표면·글자 |

---

## 3. 타이포그래피

system font stack만 사용(외부 폰트 의존 0건).

```
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Noto Sans KR", "Malgun Gothic", sans-serif;
```

| 역할 | size | weight | line-height | 비고 |
|---|---|---|---|---|
| 페이지 제목 | 22px | 700 | 1.3 | 대시보드 상단 타이틀 |
| 섹션 라벨 | 12px | 700 | 1.4 | 대문자, letter-spacing .04em, 보조 텍스트색 |
| 카운터 숫자 | `--font-size-counter`(28px) | 700 | 1.1 | active/pending 값 |
| 카운터 라벨 | 12px | 600 | 1.4 | "실행 중"·"대기" 캡션 |
| 배지 텍스트 | 13px | 700 | 1.2 | 흰색, 상태명 |
| 버튼 라벨 | 14px | 600 | 1.2 | control 텍스트 |
| task 항목 | 13px | 500 | 1.4 | 개별 작업 라벨 |
| 본문/설명 | 13px | 400 | 1.5 | 안내 문구 |

---

## 4. 레이아웃

### 4.1 섹션 구조 (`#dashboard-root` `.dashboard` 내부, 세로 스택)

```
#dashboard-root .dashboard
├─ 헤더 행 (flex, space-between, wrap)
│   ├─ 페이지 제목
│   └─ #status-badge .status-badge .status-badge--{idle|running|paused}  (aria-live="polite")
├─ 카운터 영역 .dashboard__counter  (active / pending 2열, wrap)
│   ├─ #active-count   (숫자, --font-size-counter) + "실행 중" 라벨
│   └─ #pending-count  (숫자, --font-size-counter) + "대기" 라벨
├─ control 묶음 .dashboard__controls  (flex, gap: --space-control-gap, flex-wrap: wrap)
│   ├─ #task-add     작업 추가 (주요 버튼)
│   ├─ #task-pause   일시정지 (aria-label)
│   └─ #task-resume  재개     (aria-label)
└─ #task-list  개별 작업 목록 (세로 스택)
     └─ .task-item × N
```

### 4.2 Spacing
- 카드 `.dashboard` padding: 24px, `border-radius: 12px`, `max-width: 560px`, 가운데 정렬.
- 헤더 ↔ 카운터 ↔ controls ↔ task-list 세로 간격: 20px.
- control 간 간격: **`--space-control-gap`(12px)** — 가로 gap이자 wrap 시 행 gap.
- task-item 사이 간격: 8px.

### 4.3 Breakpoint 별 동작 (반응형 계약 — 5.6)
- 기준: **min-width 320px에서 content overflow·가로 스크롤 0.** 고정 px 폭·`white-space: nowrap`
  로 인한 넘침을 두지 않는다.
- `.dashboard`는 `width: 100%` + `max-width: 560px`, `box-sizing: border-box`.
- `.dashboard__controls`는 `display: flex; flex-wrap: wrap;` — 폭이 좁아지면 버튼이 다음 줄로
  **wrap**. 좁은 화면에서 각 버튼은 `flex: 1 1 auto`로 늘어나되 최소폭을 강제하지 않는다.
- 카운터 영역도 `flex-wrap: wrap`으로 2열 → 1열 접힘 허용.
- 헤더의 제목·배지도 `flex-wrap: wrap`으로 좁아지면 배지가 다음 줄로 내려간다.

---

## 5. 컴포넌트 명세

### 5.1 상태 배지 — `#status-badge` `.status-badge` (+ 변형 class)

| 항목 | 명세 |
|---|---|
| 마크업 | `<span id="status-badge" class="status-badge status-badge--{variant}" aria-live="polite">텍스트</span>` |
| 시각 | 채움 배지(둥근 pill, `border-radius: 999px`, padding 4px 12px), 흰색 굵은 텍스트 |
| aria | **`aria-live="polite"`** — 상태 변경을 스크린리더가 낭독(동결) |
| 색상 단독 금지 | 배지 **텍스트가 상태명 그 자체** 이므로 접근성 이름·화면 모두에서 상태 구분 가능 |

상태별 variant class · 텍스트 · 색:

| 상태 | 적용 class | 배지 텍스트(화면=접근성 이름) | fill token |
|---|---|---|---|
| idle | `status-badge--idle` | `대기 중` | `--color-status-idle` |
| running | `status-badge--running` | `실행 중` | `--color-status-running` |
| draining | `status-badge--paused`(재사용) | `정리 중 (실행 작업 마무리)` | `--color-status-paused` |
| paused | `status-badge--paused` | `일시정지됨` | `--color-status-paused` |

> draining은 **전용 class 없이** `status-badge--paused` 색을 재사용하되 텍스트로 구분한다
> (2.1 주석·계약 5.2 준수). 새 class·token을 추가하지 않는다.

### 5.2 카운터 — `#active-count` / `#pending-count` `.dashboard__counter`

| 항목 | 명세 |
|---|---|
| 값 소스 | `#active-count`=`limit.activeCount`, `#pending-count`=`limit.pendingCount` (demo 별도 계산 금지 — 계약 6.3) |
| 시각 | 큰 숫자(`--font-size-counter`, 700) + 아래 작은 라벨("실행 중" / "대기") |
| 초기값 | 둘 다 `0` (idle 진입 시 복귀 — 계약 6.4) |

### 5.3 control 버튼 — `#task-add` / `#task-pause` / `#task-resume` `.dashboard__controls`

| 버튼 | domId | 시각 | 활성 규칙(상태별) | 접근성 |
|---|---|---|---|---|
| 작업 추가 | `task-add` | 주요 버튼(파랑 채움) | idle·running·draining·paused 모두 **활성**(주 실행 control은 항상 복귀 가능 — 계약 6.4) | 버튼 텍스트로 이름 노출 |
| 일시정지 | `task-pause` | 보조 버튼(외곽선) | idle **비활성** / running·draining **활성** / paused **비활성** | **`aria-label`**(예: "실행 일시정지") 동결 |
| 재개 | `task-resume` | 보조 버튼(외곽선) | idle·running **비활성** / draining·paused **활성** | **`aria-label`**(예: "실행 재개") 동결 |

- **키보드:** 세 버튼 모두 Tab 포커스 가능, **Enter/Space로 실행**(네이티브 `<button>` 사용 권장 — 계약 5.5).
- **포커스 링:** `:focus-visible` 시 2px outline(파랑 `#2563EB`, offset 2px) — 색 대비로 명확히 보이게.
- **비활성:** `disabled` 속성 + 비활성 색(`#94A3B8`), `cursor: not-allowed`. 색뿐 아니라 `disabled`
  속성으로 접근성 트리에서도 비활성이 노출되게 한다.

상태 × 버튼 활성 매트릭스(요약):

| 상태 | task-add | task-pause | task-resume |
|---|---|---|---|
| idle | 활성 | 비활성 | 비활성 |
| running | 활성 | 활성 | 비활성 |
| draining | 활성 | 활성 | 활성 |
| paused | 활성 | 비활성 | 활성 |

> draining/paused에서 `task-add`가 활성이어도, 게이트가 닫혀 있으면 **즉시 투입하지 않고 보류**
> 후 resume 시 concurrency 한도 내 투입한다(계약 4·7절 — 로직은 developer 소유).

### 5.4 개별 작업 — `#task-list` `.task-item`

| 항목 | 명세 |
|---|---|
| 마크업 | `#task-list` 아래 `.task-item` × N |
| 시각 | 카드형 행(좌: 작업 라벨, 우: 진행/상태 텍스트), 경계선 `#E2E8F0` |
| 상태 표현 | 실행/대기/완료/실패를 **텍스트로도** 표기(색 단독 금지). 세부 값·표기는 developer 재량 |
| 빈 목록 | task 0개면 목록 영역에 "추가된 작업 없음" 안내 텍스트(placeholder) |

---

## 6. 접근성 시각 규칙 (동결 계약 5.5 반영)

- `#status-badge`는 **`aria-live="polite"`** — 상태 전이 시 배지 텍스트가 바뀌며 낭독된다.
- `#task-pause` / `#task-resume`는 **명시적 `aria-label`** 을 갖는다(아이콘만이 아니라 접근성
  이름을 별도로 보장). 버튼에 텍스트가 있어도 aria-label로 목적을 분명히 한다.
- 모든 control은 네이티브 `<button>`로 **Tab 포커스 + Enter/Space 실행**이 되며, `:focus-visible`
  포커스 링이 보인다.
- **색상 단독 의존 금지:** 4개 상태 모두 배지 텍스트(=상태명)로 구분되고, 카운터·task 상태도
  텍스트를 병기한다. 흑백/색맹 환경에서 정보 손실 0.
- 비활성 control은 `disabled` 속성으로 표시(색 + 접근성 상태 동시 노출).

---

## 7. 초기화 · 취소 · 실패 후 복귀 시각 표현 (동결 계약 6.4)

- 초기화·작업 취소·작업 실패(reject) 후 **잔여 작업이 모두 정리되면**:
  - `#status-badge` → `status-badge--idle` + 텍스트 `대기 중`
  - `#active-count` / `#pending-count` → `0`
  - `#task-pause`·`#task-resume` → 비활성, `#task-add` → **활성**(주 실행 control 복귀)
- 실패한 개별 작업은 `.task-item`에 실패 상태를 **텍스트로** 표기하되, 전체 대시보드는 중단하지
  않고 idle로 되돌아간다.

---

## 8. dev 구현 가이드 (developer가 `demo/**`에서 따라할 지침)

> selector·상태 텍스트·token 이름은 **계약 고정값**이다. 아래는 값·구현 순서 권장이며,
> 픽셀 단위 일치 의무는 없다(시안은 UX 의도 전달용).

### 8.1 `:root` token 선언 (`demo/styles.css`)
```css
:root {
  --color-status-idle:    #475569;
  --color-status-running: #15803D;
  --color-status-paused:  #B45309;
  --space-control-gap:    12px;
  --font-size-counter:    28px;
}
```
- `.status-badge--idle { background: var(--color-status-idle); }` 처럼 배지 변형 class가 fill
  token을 참조하게 한다. **하드코딩 색상 대신 token 사용.**
- draining 구간은 별도 class 없이 `status-badge--paused`를 적용(텍스트만 교체).

### 8.2 마크업 골격 (`demo/index.html` — 참조용 구조, 계약 5.1/5.2 selector 사용)
```html
<div id="dashboard-root" class="dashboard">
  <div class="dashboard__header">
    <h1>pause/resume 대시보드</h1>
    <span id="status-badge" class="status-badge status-badge--idle" aria-live="polite">대기 중</span>
  </div>
  <div class="dashboard__counter">
    <div><span id="active-count">0</span><span>실행 중</span></div>
    <div><span id="pending-count">0</span><span>대기</span></div>
  </div>
  <div class="dashboard__controls">
    <button id="task-add" type="button">작업 추가</button>
    <button id="task-pause" type="button" aria-label="실행 일시정지" disabled>일시정지</button>
    <button id="task-resume" type="button" aria-label="실행 재개" disabled>재개</button>
  </div>
  <ul id="task-list" class="task-list"><!-- .task-item × N --></ul>
</div>
```

### 8.3 상태 전이 시 class·텍스트·aria 동기화 (`demo/app.js`)
- 상태가 바뀔 때 `#status-badge`의 (1) variant class, (2) 텍스트를 5.1 표대로 **함께** 교체한다.
  aria-live 영역이므로 텍스트 교체만으로 낭독된다.
- 버튼 `disabled`는 5.3 활성 매트릭스대로 토글한다.
- 카운터는 항상 `limit.activeCount` / `limit.pendingCount`를 그대로 반영(별도 계산 금지).

### 8.4 반응형 (`demo/styles.css`)
```css
.dashboard { width: 100%; max-width: 560px; box-sizing: border-box; }
.dashboard__controls { display: flex; flex-wrap: wrap; gap: var(--space-control-gap); }
.dashboard__counter  { display: flex; flex-wrap: wrap; gap: 16px; }
.dashboard__header   { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
                       justify-content: space-between; }
```
- 320px에서 `overflow-x` 0, `white-space: nowrap`로 인한 넘침 금지.
- `:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }`.

### 8.5 브라우저 지원
- `<script type="module">` 기반(계약 7절). **최신 브라우저 필요** — demo README/문서에 명시.

---

## 9. mockup 참조

- 시각 mockup(동일 내용 2부):
  - **`docs/design/pause-resume-mockup.html`** — 계약 AC가 명시한 deliverable 경로.
  - **`docs/design/mockups/pause-resume-mockup.html`** — system screenshot capture 표준 경로.
- ⚠️ 계약 AC deliverable 경로(`docs/design/pause-resume-mockup.html`)와 system capture가 검사하는
  표준 경로(`docs/design/mockups/`)가 서로 다르다. 둘 다 designer 소유 `docs/design/**` 범위 안이라
  **동일 내용으로 양쪽에 생성**해 AC 명시 산출물과 screenshot capture를 모두 충족한다. 명세와
  mockup의 컬러/타이포/상태 텍스트/레이아웃은 서로 동기화되어 있다.
- mockup은 4개 상태(idle/running/draining/paused) 배지, 카운터, control(활성/비활성/포커스),
  task 목록, 320px 반응형 프레임을 정적으로 나열해 dev·reviewer·운영자가 PR만 봐도 시안을
  시각 확인할 수 있게 한다.

---

## Self-critique

1. **AC 매핑** — 4개 상태 화면 텍스트 구분(2.1·5.1·mockup), status-badge `aria-live` + pause/resume
   `aria-label`(5.3·6절), 320px wrap 무overflow(4.3·8.4·mockup), 산출물 2파일 한정·런타임 코드
   미생성(문서 상단·9절) — 모든 acceptance criteria를 문서·mockup에 반영했다.
2. **dev 구현 가이드** — 8절에 token `:root` 값, 마크업 골격, 상태 동기화, 반응형 CSS를 복사
   가능한 형태로 제시(픽셀 일치 의무 없음 명시).
3. **기존 요소 보존** — 계약의 domId/cssClass/상태 텍스트/token 이름을 재정의하지 않고 값만
   정의. draining 전용 class·token 신설 금지 원칙 준수(`status-badge--paused` 재사용).
4. **컴포넌트 매핑** — 8개 domId · 8개 cssClass · 5개 token · 4개 상태를 5·8절 표로 selector에
   1:1 매핑.
5. **모호함 flag** — deliverable 경로가 `docs/design/pause-resume-mockup.html`로 적혔으나 system
   capture 표준 경로는 `docs/design/mockups/`이다. 두 경로 모두 `docs/design/**` 소유 범위이므로
   **동일 내용으로 양쪽에 생성**해 AC 명시 산출물·capture 둘 다 충족(9절 flag). draining 색은
   blueprint 미정의라 designer 재량으로 `--color-status-paused` 재사용을 결정(2.1·5.1에 근거 명시).
