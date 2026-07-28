# 큐 압력 실험실 시각 명세 (Queue Pressure Lab — Visual Spec)

- Jira: F68F701A7A-138 (designer) — planner 청사진 F68F701A7A-137 / 동결 F68F701A7A-140
- 대상 저장소: skfive/p-limit
- 계약 권위(Authority): 본 문서는 `ui-contract@v1` **frozen blueprint**(`docs/plans/queue-pressure-lab-F68F701A7A-137.md`)를 **시각적으로 렌더링**한 것이다. selector·상태·token·접근성·반응형 값을 **재정의하지 않고 그대로 사용**한다.
- mockup 참조: [`docs/design/queue-pressure-lab-mockup.html`](./queue-pressure-lab-mockup.html) (다크·라이트 대응 정적 mockup — 본 문서와 동일 경로)

> designer 산출물 범위: **시각 명세 + 정적 mockup HTML**. 런타임 HTML/CSS/JS는 developer(F68F701A7A-139)가 `demo/queue-pressure-lab/`에 additive로 구현한다. 본 문서는 코드가 아니라 시각 계약을 렌더링한다.

---

## 1. 시안 개요

### 1.1 변경 범위
- p-limit의 동시성 제어(`concurrency`)와 `activeCount`/`pendingCount` introspection을 시각화하는 **정적 데모 인터페이스**의 시각 시안.
- 운영자가 **동시성 한도**·**작업 개수**를 입력하고 실행하면 활성/대기 카운트와 진행 상태를 실시간 텍스트로 확인한다.

### 1.2 사용자 경험 목표
- 한 화면(단일 패널) 안에서 입력 → 실행 → 상태 관찰 → 초기화 흐름이 끊김 없이 이어진다.
- 상태(`idle`/`running`/`completed`/`error`)를 **색상과 화면 텍스트 양쪽으로** 명확히 구분한다(색상만으로 구분하지 않음).
- 마우스 없이 **키보드만으로 전 control 조작** 가능하고, 상태 변화는 live region으로 안내된다.
- **다크·라이트** 모두에서 대비가 유지되고, **320px** 폭에서 가로 넘침이 없다.

---

## 2. 컬러 팔레트

### 2.1 동결 토큰 (frozen — 변경 금지)
| 변수 | 값(HEX) | 용도 |
| --- | --- | --- |
| `--qpl-color-action-primary` | `#2563eb` | 주 실행 control(`qpl-run`) 강조 |
| `--qpl-color-success` | `#15803d` | `completed` 상태 강조 |
| `--qpl-color-error` | `#b91c1c` | `error` 상태 강조 |

### 2.2 mockup 보조 중립 토큰 (테마 대응용 — 동결 토큰과 별개, 신규 정의)
> frozen 토큰을 재정의하지 않으며, 다크·라이트 표현을 위한 **표면/텍스트/경계** 중립 토큰만 추가한다. developer는 이 중립 토큰명을 **참고 가이드**로 사용하되 픽셀 일치 의무는 없다.

| 변수 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--qpl-surface` | `#ffffff` | `#0f172a` | 패널 배경 |
| `--qpl-surface-muted` | `#f1f5f9` | `#1e293b` | 카운트/결과 카드 배경 |
| `--qpl-text` | `#0f172a` | `#e2e8f0` | 본문 텍스트 |
| `--qpl-text-muted` | `#475569` | `#94a3b8` | 보조 텍스트/캡션 |
| `--qpl-border` | `#cbd5e1` | `#334155` | 경계선/구분선 |

- 테마 전환은 `@media (prefers-color-scheme: dark)`로 중립 토큰만 재지정한다. **frozen 토큰(action-primary/success/error)은 두 테마 공통 고정값**이며, 다크에서는 강조 텍스트 배지에 충분한 대비를 위해 밝은 표면 위 배지(흰 텍스트) 형태로 사용한다.
- 상태 색 대비: `completed`=success 초록, `error`=error 빨강, `running`=action-primary 파랑, `idle`=중립 muted. 색과 **함께** 상태명 텍스트를 반드시 노출한다.

---

## 3. 타이포그래피

- font-family: **system UI stack** — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif` (vanilla-static: 외부 폰트 의존 없음).

| 역할 | 요소 | size | weight | line-height |
| --- | --- | --- | --- | --- |
| heading | 실험실 제목(`h1`) | `1.5rem` (24px) | 700 | 1.3 |
| section | 카운트/결과 소제목(`h2`) | `1rem` (16px) | 600 | 1.4 |
| body | 입력 label·상태 텍스트 | `0.95rem` (≈15px) | 400 | 1.5 |
| metric | 카운트 숫자(`qpl__metric` 값) | `1.75rem` (28px) | 700 | 1.2 |
| caption | 결과 항목·보조 안내 | `0.85rem` (≈13.6px) | 400 | 1.45 |

- 숫자 카운트는 정렬 안정성을 위해 `font-variant-numeric: tabular-nums` 권장.

---

## 4. 레이아웃

### 4.1 섹션 구조 (`#qpl-root .qpl` 내부, 위→아래)
1. **헤더** — 실험실 제목 + 한 줄 설명(caption).
2. **컨트롤 패널**(`.qpl__panel`) — 입력 2개 + 실행/초기화 버튼.
   - `qpl-concurrency-input`(동시성 한도), `qpl-task-count-input`(작업 개수) — 각각 연결된 `<label>`.
   - `qpl-run`(주 실행), `qpl-reset`(초기화/취소).
3. **메트릭 영역** — `qpl-active-count`(활성)·`qpl-pending-count`(대기) 2개 `.qpl__metric` 카드.
4. **상태 영역**(`.qpl__status`, `#qpl-status`) — 상태명 + 안내 텍스트(live region).
5. **결과 영역**(`.qpl__results`, `#qpl-results`) — 완료/실패 요약·항목 목록.

### 4.2 spacing
- control 간 간격은 **동결 토큰** `--qpl-space-control-gap`(`12px`)을 그대로 사용.
- 섹션 간 세로 간격 `16px`, 패널 내부 padding `16px`(보조값 — 동결 대상 아님).

### 4.3 breakpoint 별 동작 (반응형 계약)
- 패널 최대 너비는 **동결 토큰** `--qpl-max-width`(`720px`) 이내, 중앙 정렬.
- **≥ 640px(넓은 화면)**: 입력 2개를 가로 2열, 메트릭 카드 2개를 가로 2열로 배치.
- **< 640px ~ 320px(좁은 화면)**: 입력·버튼·메트릭 카드를 **세로 1열로 재배치**, 버튼은 full-width.
- **320px에서 content overflow 없음** — 긴 결과 텍스트는 `overflow-wrap: anywhere`로 줄바꿈, 가로 스크롤 금지.
- 구현 권장: `.qpl__panel`은 `display:flex; flex-wrap:wrap; gap:var(--qpl-space-control-gap)`, 좁은 폭에서 각 항목 `flex:1 1 100%`.

---

## 5. 컴포넌트 명세

### 5.1 루트 컨테이너 — `#qpl-root.qpl`
- 역할: 실험실 전체 래퍼. `--qpl-max-width` 이내 중앙 정렬.
- 상태 반영: 현재 상태를 하위 `#qpl-status`/색상 배지가 표현(색+텍스트).

### 5.2 입력 — `#qpl-concurrency-input`, `#qpl-task-count-input`
| props/속성 | 값 |
| --- | --- |
| type | `number` (`min` 유효값, 정수) |
| label 연결 | 각 input `id`에 대응하는 `<label for="…">` (동시성 한도 / 작업 개수) |
| 상태 | 기본 / focus(포커스 링 가시) / invalid(0·음수·빈 값 안내) |
| 인터랙션 | 키보드 입력·스피너, invalid 시 실행 차단하고 `qpl-status`에 입력 오류 텍스트 |

### 5.3 실행 버튼 — `#qpl-run.qpl__run`
| props/속성 | 값 |
| --- | --- |
| 강조색 | `--qpl-color-action-primary`(`#2563eb`) 배경, 흰 텍스트 |
| aria-label | 명시적 지정(예: "큐 압력 실험 실행") — **필수** |
| 상태 | 기본 / hover / focus(포커스 링) / disabled(`running` 중 비활성) |
| 인터랙션 | 클릭·Enter·Space로 실행, `running` 동안 비활성으로 중복 실행 차단 |

### 5.4 초기화 버튼 — `#qpl-reset.qpl__reset`
| props/속성 | 값 |
| --- | --- |
| 스타일 | 보조(secondary) — 중립 표면 + 경계선, 텍스트 강조 |
| aria-label | 명시적 지정(예: "실험 초기화 및 취소") — **필수** |
| 상태 | 기본 / hover / focus / (idle에서 눌러도 idempotent, 부작용 없음) |
| 인터랙션 | `running` 중 누르면 취소(`clearQueue` 소비) → 카운트·results 초기화 → `idle` 복귀 |

### 5.5 메트릭 카드 — `.qpl__metric` (`#qpl-active-count`, `#qpl-pending-count`)
- 활성(`activeCount`)·대기(`pendingCount`)를 각각 label + 큰 숫자(`tabular-nums`)로 표시.
- `running` 중 실시간 갱신, 초기/초기화 시 `0`.

### 5.6 상태 영역 — `#qpl-status.qpl__status`
- `aria-live="polite"` region — **상태명 텍스트**로 안내(필수).
- 상태별 표시(색 + 텍스트 동시):

| 상태 | 배지 색(토큰) | 화면 텍스트(예시) |
| --- | --- | --- |
| `idle` | 중립 muted | "대기(idle)" |
| `running` | `--qpl-color-action-primary` | "실행 중(running)" |
| `completed` | `--qpl-color-success` | "완료(completed)" + 요약 |
| `error` | `--qpl-color-error` | "오류(error)" + 실패 텍스트 |

### 5.7 결과 영역 — `#qpl-results.qpl__results`
- `completed` 시 처리 요약·항목 목록, `error` 시 실패 항목 텍스트.
- 긴 텍스트 줄바꿈(`overflow-wrap: anywhere`), 세로 재배치로 320px 가로 스크롤 없음.

### 5.8 상태 전이 요약 (frozen 상태 모델)
```
idle ──run──▶ running ──모든 작업 종료──▶ completed ──▶ idle(재사용 가능)
                 │
                 ├──reset(취소)──▶ idle (카운트·results 초기화)
                 └──작업 실패──▶ error ──▶ idle (진행 표시 초기화, qpl-run 재사용)
```
- **후조건 불변식**: 초기화·취소·실패 뒤 상태·카운트·results를 **초기값으로 되돌리고** `qpl-run`을 **재사용 가능**하게 한다.

---

## 6. dev 구현 가이드 (developer F68F701A7A-139 참고 — 픽셀 일치 의무 없음)

> developer 소유 파일: `demo/queue-pressure-lab/{index.html,styles.css,app.js}` (additive). 아래는 계약 반영을 돕는 권장 지침이며 selector/token/상태 값은 **변경 없이 그대로** 사용한다.

1. **CSS 변수 정의**: `:root`(또는 `.qpl`)에 동결 토큰 5종을 exact하게 선언
   - `--qpl-color-action-primary:#2563eb; --qpl-color-success:#15803d; --qpl-color-error:#b91c1c; --qpl-space-control-gap:12px; --qpl-max-width:720px;`
2. **DOM ID**: `qpl-root`, `qpl-concurrency-input`, `qpl-task-count-input`, `qpl-run`, `qpl-reset`, `qpl-active-count`, `qpl-pending-count`, `qpl-results`, `qpl-status` — 정확히 이 값.
3. **CSS class(스타일 훅)**: `qpl`, `qpl__panel`, `qpl__control`, `qpl__run`, `qpl__reset`, `qpl__metric`, `qpl__results`, `qpl__status`.
4. **접근성**:
   - `qpl-run`/`qpl-reset`에 명시적 `aria-label`.
   - 각 input에 `<label for>` 연결.
   - `qpl-status`에 `aria-live="polite"`, 상태명 텍스트 노출.
   - 포커스 가시성(`:focus-visible` outline) + 논리적 Tab 순서(입력 → run → reset).
5. **상태 반영**: 4상태를 화면 텍스트 + 색으로 동시 노출. `running` 중 `qpl-run` `disabled`.
6. **반응형**: `.qpl`는 `max-width:var(--qpl-max-width); margin:0 auto`, `.qpl__panel`은 flex-wrap + `gap:var(--qpl-space-control-gap)`, 320px에서 세로 재배치·가로 스크롤 없음.
7. **테마**: `@media (prefers-color-scheme: dark)`로 중립 표면/텍스트만 재지정(frozen 토큰 유지).
8. **API 소비**: `pLimit(concurrency)`로 limiter 생성, `limit.activeCount`/`limit.pendingCount` 조회, 취소 시 `limit.clearQueue()`. `index.js`/`index.d.ts` 시그니처 **변경 금지**.

### 6.1 상태별 클래스·색 매핑 권장 (AC 매핑 기준)
| 상태 | qpl-status 텍스트 | 강조 토큰 | qpl-run |
| --- | --- | --- | --- |
| idle | "대기(idle)" | 중립 | 사용 가능 |
| running | "실행 중(running)" | action-primary | 비활성 |
| completed | "완료(completed)" | success | 사용 가능(idle 복귀) |
| error | "오류(error)" | error | 사용 가능(idle 복귀) |

---

## 7. mockup 참조
- 파일: [`docs/design/queue-pressure-lab-mockup.html`](./queue-pressure-lab-mockup.html)
- 내용: 라이트/다크 테마 대응 단일 self-contained HTML. 4개 상태(`idle`/`running`/`completed`/`error`)를 `<section>`으로 나란히 렌더링하고, 동결 selector/토큰/접근성 속성을 그대로 표현.
- 목적: reviewer/운영자/dev가 markdown을 읽지 않고도 시안을 시각 확인. dev의 실제 산출물이 아니라 **시각 시뮬레이션**이며 픽셀 일치 의무는 없다.

---

## 8. Self-critique
- **AC 매핑**: (1) frozen domId/class/token/상태 그대로 사용 → §2·§5·§6에 exact 명시, mockup에 동일 selector 반영. (2) 상태를 색+화면 텍스트 동시 노출·320px 가로 넘침 없음 → §4.3·§5.6·§5.8. (3) 시각 명세/mockup만 생성, 런타임 코드 미생성 → 산출물 2개로 한정.
- **dev 구현 가이드**: §6에 CSS 변수·DOM ID·class·접근성·반응형·API 소비를 단계별로 제공.
- **기존 요소 보존**: `index.js`/`index.d.ts` 공개 API·기존 테스트·README 변경 없음(§6-8). designer는 `docs/design/**`만 수정.
- **컴포넌트 매핑**: 9개 DOM ID·8개 class 모두 컴포넌트 명세(§5)와 mockup에 1:1 매핑.
- **모호함 flag**: mockup 경로는 frozen 계약이 명시한 `docs/design/queue-pressure-lab-mockup.html`(mockups/ 하위 아님)을 authority로 따름. 중립 보조 토큰은 다크·라이트 표현용 신규 추가이며 frozen 토큰을 재정의하지 않음 — 이 점을 §2.2에 명시.
