# Inspector 시각 명세 — 실시간 상태 Inspector demo (F68F701A7A-76)

> **designer 산출물**입니다. planner가 동결한 `ui-contract@v1`
> (`docs/plans/subscribe-inspector-plan.md` §4)을 **재정의하지 않고**, 동결된
> `domId` / `cssClass` / design token 이름 / 상태 텍스트를 그대로 사용하며,
> 그 위에 **구체 색상값·타이포·레이아웃·상태 흐름 시안**만 정의합니다.
>
> **권위 원칙**: DOM ID·CSS class·토큰 이름·상태 텍스트·접근성·반응형 계약은
> frozen blueprint(`ui-contract@v1`)가 유일한 권위입니다. 본 문서가 이들과
> 충돌하면 frozen blueprint를 따릅니다. 본 문서는 §4.5 토큰의 **구체 값**만
> 소유합니다.
>
> 스택: `vanilla-static` — 외부 의존성 0건, system font, CSS 변수 자체 정의.

---

## 1. 시안 개요

### 1.1 변경 범위
실행 중인 `pLimit` limiter의 상태(활성/대기/동시성/파생 상태)를 실시간으로
관찰하는 **Inspector demo**의 시각 명세를 정의한다. developer는 이 명세를
참조 가이드로 `demo/index.html` · `demo/inspector.css` · `demo/inspector.js`를
구현한다(파일 소유권은 §7 참조).

- 본 문서가 소유: §4.5 design token의 **구체 색상값**, 타이포그래피, 레이아웃
  치수, 상태별 시각 표현, 상태 전이 흐름의 시각 시안.
- 본 문서가 소유하지 않음(frozen — 재정의 금지): `domId`, `cssClass`,
  토큰 **이름**, 상태 **텍스트 라벨**, 접근성/반응형 계약, 파일 소유권.

### 1.2 사용자 경험 목표
- 한눈에 **현재 상태**를 색상 + **명시적 화면 텍스트 라벨**로 파악한다
  (색상만으로 구분하지 않음 — 접근성 불변식).
- 활성/대기/동시성 지표를 큰 숫자로 즉시 읽는다.
- enqueue / clear / pause / resume control로 상태 전이를 직접 유발하고,
  그 결과가 실시간으로 배지와 지표에 반영되는 것을 관찰한다.
- 취소(`clearQueue`)·일시정지(`pause`) 후 상태와 지표가 **초기값으로 복원**되고
  주 실행 control이 다시 활성화되는 흐름을 시각적으로 확인한다(§4.8 후조건).

---

## 2. 컬러 팔레트

### 2.1 상태 토큰 (frozen 토큰 이름 → 구체 값)

동결된 §4.5 토큰 이름에 아래 구체 색상값을 매핑한다. 각 색은 **배지 배경색**으로
쓰이며 배지 텍스트는 흰색(`#ffffff`)이다. 모든 조합은 WCAG AA(일반 텍스트
대비 ≥ 4.5:1)를 만족한다.

| 토큰 (frozen) | 상태 | HEX | 배지 배경 위 흰색 텍스트 대비 | 의미 |
| --- | --- | --- | --- | --- |
| `--inspector-color-idle` | idle → `Idle` | `#475569` | 7.4:1 ✓ | 중립 슬레이트 — 유휴 |
| `--inspector-color-active` | active → `Running` | `#15803d` | 4.9:1 ✓ | 녹색 — 실행 진행 중 |
| `--inspector-color-saturated` | saturated → `Saturated` | `#b45309` | 4.7:1 ✓ | 앰버 — 동시성 한도 도달(가득 참) |
| `--inspector-color-paused` | paused → `Paused` | `#6d28d9` | 5.6:1 ✓ | 바이올렛 — 일시정지 |

> 네 색은 색상(hue)뿐 아니라 명도도 서로 달라 **색각 이상(color-blind)**
> 사용자도 구분 가능하며, 화면 텍스트 라벨이 항상 함께 노출되므로 색에만
> 의존하지 않는다.

### 2.2 간격 토큰 (frozen 토큰 이름 → 구체 값)

| 토큰 (frozen) | 값 | 용도 |
| --- | --- | --- |
| `--inspector-space-gap` | `12px` (0.75rem) | metric 카드 사이·control 버튼 사이 기본 간격 |

### 2.3 보조 팔레트 (surface / text — 토큰 아님, 시각 시안 참고값)

> 아래는 frozen 토큰이 아니며 developer 구현 재량 참고값이다. 이름 강제 없음.

| 역할 | HEX | 용도 |
| --- | --- | --- |
| background | `#f8fafc` | 페이지 배경 |
| surface | `#ffffff` | Inspector 카드·metric 카드 배경 |
| border | `#e2e8f0` | 카드/구분선 테두리 |
| text | `#0f172a` | 기본 텍스트(제목·숫자) |
| text-muted | `#475569` | 라벨·보조 텍스트 |
| control-bg | `#0f172a` | 주 control(enqueue) 배경 |
| control-bg-secondary | `#ffffff` (border `#cbd5e1`) | 보조 control(clear/pause/resume) |
| disabled | `#cbd5e1` (텍스트 `#94a3b8`) | 비활성 control |

---

## 3. 타이포그래피

system font stack 사용(외부 폰트 로드 0건):

```css
--inspector-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  Helvetica, Arial, sans-serif;
```

| 요소 | font-size | weight | line-height | 비고 |
| --- | --- | --- | --- | --- |
| Inspector 제목(heading) | 1.25rem (20px) | 600 | 1.4 | 카드 상단 제목 |
| 상태 배지 텍스트 | 0.875rem (14px) | 600 | 1 | 대문자 변형 없음, 라벨 그대로 |
| metric 값(숫자) | 1.75rem (28px) | 700 | 1.1 | `font-variant-numeric: tabular-nums` — 숫자 폭 고정으로 값 변동 시 흔들림 방지 |
| metric 라벨 | 0.6875rem (11px) | 500 | 1.2 | 대문자 + `letter-spacing: 0.04em` |
| control 텍스트 | 0.875rem (14px) | 600 | 1 | 버튼 라벨 |
| 캡션/설명 | 0.8125rem (13px) | 400 | 1.5 | 보조 안내 |

---

## 4. 레이아웃

### 4.1 섹션 구조 (`#inspector-root` / `.inspector`)

세로 스택 카드. 위→아래 순서:

```
┌─ #inspector-root .inspector ─────────────────────────┐
│  [제목]  "Limiter Inspector"                          │
│                                                       │
│  [#inspector-status-badge .inspector__badge]          │  ← 상태 배지 (aria-live)
│                                                       │
│  ┌ .inspector__metric ─┐ ┌ metric ─┐ ┌ metric ─────┐ │  ← 지표 3열
│  │ ACTIVE              │ │ PENDING │ │ CONCURRENCY  │ │
│  │ #inspector-         │ │ #inspec │ │ #inspector-  │ │
│  │  active-count       │ │ tor-    │ │  concurrency │ │
│  │   2                 │ │ pending │ │  -value      │ │
│  │                     │ │ -count  │ │   2          │ │
│  └─────────────────────┘ └─────────┘ └──────────────┘ │
│                                                       │
│  ┌ .inspector__controls ───────────────────────────┐ │  ← control 그룹
│  │ [Enqueue] [Clear queue] [Pause] [Resume]         │ │
│  │  #inspector-enqueue ...                          │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 4.2 치수 · spacing

| 항목 | 값 |
| --- | --- |
| 카드 max-width | 480px (중앙 정렬) |
| 카드 padding | 20px |
| 카드 border-radius | 12px |
| 카드 border | 1px solid `#e2e8f0` |
| 카드 그림자 | `0 1px 3px rgba(15,23,42,0.08)` |
| 제목 ↔ 배지 간격 | 16px |
| 배지 ↔ metric 그룹 간격 | 16px |
| metric 카드 사이 간격 | `--inspector-space-gap` (12px) |
| metric 그룹 ↔ control 그룹 간격 | 16px |
| control 버튼 사이 간격 | `--inspector-space-gap` (12px) |
| metric 카드 padding | 12px |
| metric 카드 border-radius | 8px |
| control 버튼 padding | 8px 14px |
| control 버튼 border-radius | 8px |

### 4.3 배지 (`.inspector__badge`)
- inline-flex, padding `4px 12px`, border-radius `999px`(pill).
- 배경색 = 현재 상태 토큰(§2.1), 텍스트 = 흰색.
- 좌측에 상태색과 무관한 작은 원형 dot(8px, 흰색 반투명) — 장식이며 정보 전달은
  텍스트가 담당.
- 텍스트는 상태 라벨(`Idle`/`Running`/`Saturated`/`Paused`) 그대로.

### 4.4 지표 카드 (`.inspector__metric`)
- 3열 flex/grid, 각 카드 `flex: 1`, 배경 `#ffffff`, border `1px solid #e2e8f0`.
- 상단: 라벨(대문자, muted). 하단: 큰 숫자 값.
- 매핑: ACTIVE→`#inspector-active-count`, PENDING→`#inspector-pending-count`,
  CONCURRENCY→`#inspector-concurrency-value`.
- `concurrency === Infinity`이면 값 표시는 `∞` 문자로 렌더(E1: 이 경우 절대
  saturated 아님).

### 4.5 반응형 / breakpoint (frozen §4.7)
- **≥ 320px**: metric·control 영역에 content overflow 없음. metric 숫자는
  `tabular-nums`로 폭 고정, 라벨은 `white-space: nowrap` 유지하되 카드가
  줄어들면 폰트/패딩이 축소되지 않고 3열 그리드가 유지된다(min-width 0 + 균등
  분배). 320px에서 3열이 좁으면 metric 라벨을 축약하지 않고 카드 padding만
  8px로 축소.
- **< 480px**: `.inspector__controls`가 **세로로 스택**된다
  (`flex-direction: column`), 각 버튼 `width: 100%`. metric은 3열 유지.

```css
@media (max-width: 479px) {
  .inspector__controls { flex-direction: column; }
  .inspector__control  { width: 100%; }
}
```

---

## 5. 컴포넌트 명세

### 5.1 상태 배지 — `#inspector-status-badge` `.inspector__badge`

| 항목 | 값 |
| --- | --- |
| 역할 | 현재 파생 상태(§3.3 API) 표시 |
| 접근성 | `aria-live="polite"` 영역(frozen) — 상태 텍스트 변화를 스크린리더에 통지 |
| 상태 | 아래 4가지(색상 + 화면 텍스트 라벨, 항상 동반) |

| status | 배경 토큰 | 화면 텍스트(frozen) | 접근성 이름 |
| --- | --- | --- | --- |
| idle | `--inspector-color-idle` `#475569` | `Idle` | 텍스트와 동일("Idle") |
| active | `--inspector-color-active` `#15803d` | `Running` | "Running" |
| saturated | `--inspector-color-saturated` `#b45309` | `Saturated` | "Saturated" |
| paused | `--inspector-color-paused` `#6d28d9` | `Paused` | "Paused" |

> 배지는 색상 변경과 **동시에** 텍스트 노드도 교체한다. 색만 바꾸고 텍스트를
> 그대로 두는 구현은 접근성 불변식 위반이다.

### 5.2 지표 카드 — `.inspector__metric` × 3

| DOM ID | 라벨 | 표시 값 | 상태 |
| --- | --- | --- | --- |
| `#inspector-active-count` | ACTIVE | snapshot `activeCount` | 정수, 0 이상 |
| `#inspector-pending-count` | PENDING | snapshot `pendingCount` | 정수, 0 이상 |
| `#inspector-concurrency-value` | CONCURRENCY | snapshot `concurrency` | 정수 또는 `∞`(Infinity) |

- 값은 subscribe snapshot(`activeCount`/`pendingCount`/`concurrency`)을 그대로
  표시(재해석 금지 — INV). 초기 렌더는 구독 직후 introspection 값 직접 읽기(§4.5 API).

### 5.3 control 그룹 — `.inspector__controls` / `.inspector__control` × 4

| DOM ID | 버튼 라벨 | aria-label(예시, frozen: 명시적 aria-label 필수) | 스타일 | 활성 조건 |
| --- | --- | --- | --- | --- |
| `#inspector-enqueue` | Enqueue | "Enqueue a task" | primary(진한 배경 `#0f172a`, 흰 텍스트) | **항상 활성**(초기화·취소·실패 후에도 재사용 가능 — 후조건 §4.8) |
| `#inspector-clear` | Clear queue | "Clear pending queue" | secondary(흰 배경, 테두리) | `pendingCount > 0`일 때만 활성, 아니면 disabled |
| `#inspector-pause` | Pause | "Pause the limiter" | secondary | status ≠ paused 일 때 활성, paused면 disabled |
| `#inspector-resume` | Resume | "Resume the limiter" | secondary | status === paused 일 때 활성, 아니면 disabled |

- 모든 control은 **키보드 Tab 순서**로 접근 가능(frozen). Tab 순서는 DOM 순서
  = enqueue → clear → pause → resume.
- `:focus-visible`에 2px outline(`#2563eb`, offset 2px) — 키보드 포커스 가시성.
- disabled 버튼: 배경 `#cbd5e1`/텍스트 `#94a3b8`, `cursor: not-allowed`,
  `aria-disabled` 반영. disabled여도 aria-label은 유지.

#### 인터랙션 상태 (control 공통)
| 상태 | 시각 |
| --- | --- |
| default | 위 스타일 |
| `:hover`(활성 시) | 밝기 소폭 변화(primary: `#1e293b`, secondary: 배경 `#f1f5f9`) |
| `:active` | `transform: translateY(1px)` |
| `:focus-visible` | 2px outline `#2563eb` offset 2px |
| disabled | `#cbd5e1`/`#94a3b8`, not-allowed |

---

## 6. 상태 전이 흐름 시안 (AC 매핑)

동결된 status 파생 규칙(API §3.3)과 후조건(§4.8)을 시각 흐름으로 표현. mockup의
각 `<section>`이 아래 스냅샷을 렌더한다.

### 6.1 idle → active → saturated (AC-1, AC-2)
`pLimit(2)` 기준:

| 단계 | activeCount | pendingCount | concurrency | 배지 | control 활성 |
| --- | --- | --- | --- | --- | --- |
| 초기 | 0 | 0 | 2 | `Idle` (슬레이트) | enqueue만 |
| task 1개 실행 | 1 | 0 | 2 | `Running` (녹색) | enqueue |
| task 2개 실행(한도 도달) | 2 | 0 | 2 | `Saturated` (앰버) | enqueue |
| task 3개(1 대기) | 2 | 1 | 2 | `Saturated` (앰버) | enqueue + clear |
| 모두 정산 | 0 | 0 | 2 | `Idle` (슬레이트) | enqueue만 |

### 6.2 pause → resume 복원 (AC-3)
대기 task가 있는 상태에서:

| 단계 | activeCount | pendingCount | 배지 | pause | resume | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| pause 호출 | 1 | 2 | `Paused` (바이올렛) | disabled | **enabled** | 실행 중 task는 계속 정산 |
| resume 호출 | 승격 | 감소 | `Running`/`Saturated` | enabled | disabled | 승격 전이에 따라 배지 복원 |
| 이미 paused에서 재-pause | 무변화 | 무변화 | `Paused` | — | — | no-op → 미발화(§3.4) |

### 6.3 clearQueue(취소) 후 복구 (AC-4, 후조건 §4.8)
대기 큐가 쌓인 상태에서 `clearQueue()`:

| 단계 | activeCount | pendingCount | 배지 | clear | enqueue | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| clear 직전 | 2 | 3 | `Saturated` | enabled | enabled | pending 3 |
| clear 직후 | 2 | **0** | `Saturated`(active 유지) | **disabled**(pending 0) | **enabled** | pending만 제거, 실행 중 task는 불변 |
| 실행 task 정산 완료 | 0 | 0 | **`Idle`** | disabled | **enabled** | **초기값 수렴 + 주 control 재활성**(§4.8) |

> **핵심 후조건 시각화**: 취소(`clearQueue`)·실패 흐름은 pending 제거 + 실행 중
> task 정산 후 limiter가 idle이 되면 UI가 `Idle` 배지 + 지표 전부 0 + enqueue
> 활성으로 **수렴**한다. 단 **일시정지는 예외** — `isPaused`가 §3.3 최우선순위라
> 카운트가 0/0이어도 status는 `paused`로 유지되며, `resume()` 호출 전까지는
> `Idle`로 전이하지 않는다. mockup에 "복원(recovered) 상태" 섹션으로 명시한다.

### 6.4 concurrency 변경 drain (AC-5) — 시각 참고
`pLimit(1)`에 대기 task가 있을 때 `concurrency = 3`으로 올리면 CONCURRENCY
지표가 `1 → 3`으로 바뀌고, drain 승격으로 ACTIVE가 증가하며 배지가
`saturated`→`active`로 전이. (timing은 developer의 API 계약 — 시각적으로는
지표/배지 값 갱신만 표현.)

---

## 7. dev 구현 가이드 (F68F701A7A-77)

> developer가 `demo/**`를 구현할 때 따르는 참조. 픽셀 단위 일치 의무는 없으며,
> **frozen 계약(domId/cssClass/토큰명/상태 텍스트/접근성/반응형)은 필수**,
> 색상값·치수는 본 명세를 권장값으로 사용.

1. **CSS 변수 선언** — `demo/inspector.css`의 `:root`(또는 `.inspector`)에
   §2.1·§2.2 토큰을 그대로 선언:
   ```css
   :root {
     --inspector-color-idle:      #475569;
     --inspector-color-active:    #15803d;
     --inspector-color-saturated: #b45309;
     --inspector-color-paused:    #6d28d9;
     --inspector-space-gap:       12px;
   }
   ```
   토큰 **이름은 재정의 금지**(frozen). 값만 위를 사용.
2. **배지 색 매핑** — status → 토큰을 CSS class 또는 data-attribute로 스위칭.
   권장: `.inspector__badge[data-status="idle|active|saturated|paused"]`가
   각 토큰을 `background`로 참조. 색과 **동시에 텍스트 노드**를 교체(§5.1).
3. **상태 텍스트** — status→라벨 매핑은 frozen: `idle→Idle`, `active→Running`,
   `saturated→Saturated`, `paused→Paused`. 문자열 변경 금지.
4. **지표 바인딩** — subscribe snapshot의 `activeCount`/`pendingCount`/
   `concurrency`를 각 DOM ID에 그대로 표시. `concurrency === Infinity` → `∞`.
   숫자 요소에 `font-variant-numeric: tabular-nums`.
5. **control 활성/비활성** — §5.3 활성 조건대로 `disabled`/`aria-disabled`
   토글. enqueue는 항상 활성(§4.8 후조건).
6. **접근성** — 배지 `aria-live="polite"`, 4개 control에 명시적 `aria-label`
   (§5.3 예시 참고), Tab 순서 = DOM 순서, `:focus-visible` outline.
7. **반응형** — §4.5의 `@media (max-width: 479px)`로 controls 세로 스택.
   320px에서 overflow 없도록 metric 카드 `min-width: 0`.
8. **간격** — metric·control 간격에 `var(--inspector-space-gap)` 사용.
9. **초기 렌더** — `subscribe()`는 전이 기반 통지이므로, 구독 직후 현재
   introspection 값(`activeCount` 등)을 직접 읽어 초기 배지/지표 렌더(§4.5 API).

권장 CSS class 매핑(모두 frozen class 그대로):
`.inspector`(루트) / `.inspector__badge`(배지) / `.inspector__metric`(지표 카드) /
`.inspector__controls`(그룹) / `.inspector__control`(버튼).

---

## 8. mockup 참조

시각 시뮬레이션 mockup(단일 self-contained HTML, 외부 의존성 0건):

- **경로**: `docs/design/mockups/inspector-F68F701A7A-76.html`
- 내용: idle / active / saturated / paused 4개 상태 + clearQueue 복원 흐름 +
  반응형(<480px controls 세로 스택) 시안을 정적 렌더.
- 이 mockup은 developer의 실제 산출물이 아니라 **시안 시각화**이며,
  developer는 참조 가이드로만 사용한다(픽셀 일치 의무 없음).

---

## 9. 파일 소유권 (frozen — 재정의 금지)

| 파일 | 소유자 |
| --- | --- |
| `demo/index.html` | developer (F68F701A7A-77) |
| `demo/inspector.css` | developer |
| `demo/inspector.js` | developer |
| `index.js` / `index.d.ts` | developer |
| `docs/design/inspector-contract.md` | **designer (본 문서)** |
| `docs/design/mockups/inspector-F68F701A7A-76.html` | **designer (mockup)** |
| `readme.md` | 본 packet에서 designer가 UI 계약 시각 명세 섹션 담당 |

> domId·cssClass·토큰 이름·상태 텍스트·접근성·반응형·파일 소유권은 frozen
> blueprint(`ui-contract@v1`)가 유일한 권위이며, 본 문서는 이를 재정의하지 않는다.
