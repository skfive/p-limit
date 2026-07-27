# snapshot().status — README 정보구조·문구 설계 (F68F701A7A-125)

- **작업**: F68F701A7A-125 · README status 정보구조·문구 설계
- **역할**: designer (정보 구조 + 확정 문구 제공, 코드 구현 없음)
- **consumer**: developer(F68F701A7A-126) — 이 명세를 `readme.md` 에 반영
- **근거 계약**: `planning-contract@v1` (`docs/plans/snapshot-status-plan-F68F701A7A-124.md`) + `index.d.ts`(`LimiterStatus` / `LimiterStateSnapshot`)
- **성격**: 브라우저 UI 없음. README(문서) 텍스트 정보구조·확정 문구 설계.

> README 는 영어 OSS 문서이므로 **README 에 그대로 들어갈 확정 문구는 영어**로 제공하고, 설계 의도·판단 설명은 한국어로 병기한다. developer 는 영어 블록을 복사해 `readme.md` 에 반영한다.

---

## 1. 시안 개요

### 변경 범위
`snapshot()` 반환 객체에 additive 로 추가되는 `status` 필드를 README 문서에 노출한다. 문서 산출물은 세 덩어리다.

1. **상태 표(status table)** — `idle | active | saturated | paused` 4개 상태의 라벨·설명·파생 조건·우선순위를 **색상 의존 없이** 텍스트/순위 숫자로 표현.
2. **snapshot() API 예시** — `status` 를 읽는 최소 용례.
3. **limitFunction 예시** — 위임(delegation)으로 동일 `status` 계약을 공유함을 보이는 용례.

### 사용자 경험 목표
- README 독자가 **표 하나만 보고** 4개 상태의 의미와 "언제 어느 status 가 나오는지"를 판단할 수 있다.
- 우선순위(`paused > saturated > active > idle`)와 `Infinity` 경계(무한 concurrency 는 never saturated)를 **오해 없이** 전달한다.
- 색을 못 보는 환경(터미널 렌더, 흑백 인쇄, 스크린리더)에서도 정보 손실이 없다 → **색상 대신 순위 숫자·상태 문자열·조건식**으로 구분.

---

## 2. 컬러 팔레트

> 이 작업은 문서(README) 텍스트 설계이므로 제품 UI 컬러 토큰이 아니라 **mockup(문서 미리보기) 렌더링용 팔레트**만 정의한다. 실제 README 는 GitHub 마크다운 렌더러가 스타일링하며, **정보 전달은 색에 의존하지 않는다**(AC: 색상 의존 없음).

| 역할 | 토큰 | HEX | 용도 (mockup 한정) |
|---|---|---|---|
| background | `--bg` | `#ffffff` | 문서 배경 |
| surface | `--surface` | `#f6f8fa` | 코드블록·표 헤더 배경 |
| border | `--border` | `#d0d7de` | 표/코드블록 경계선 |
| text | `--text` | `#1f2328` | 본문 텍스트 |
| text-muted | `--text-muted` | `#59636e` | 설명·캡션 |
| accent | `--accent` | `#0969da` | 링크·인라인 코드 강조 |
| code | `--code` | `#0550ae` | 인라인 status 문자열 강조 |

- 상태 구분은 **배경색 배지 대신 우선순위 숫자(1~4) + `monospace` 상태 문자열**로 한다. 색 배지를 쓰더라도 그것은 보조이며, 표의 "Priority" 열과 "status" 열만으로 완전히 구분 가능해야 한다.

---

## 3. 타이포그래피

> mockup 렌더링 기준. system font stack 사용, 외부 폰트 의존 0건.

| 요소 | font-family | size | weight | line-height |
|---|---|---|---|---|
| heading (h1/h2) | system-ui, -apple-system, Segoe UI, sans-serif | 28 / 20 px | 600 | 1.25 |
| body | system-ui, -apple-system, Segoe UI, sans-serif | 16 px | 400 | 1.6 |
| caption | system-ui, sans-serif | 13 px | 400 | 1.5 |
| code / status 문자열 | ui-monospace, SFMono-Regular, Menlo, monospace | 14 px | 400 | 1.45 |

- README 의 상태 문자열(`'idle'` 등)은 항상 **인라인 코드(monospace)** 로 표기해 산문과 구분한다.

---

## 4. 레이아웃 (문서 섹션 구조)

README 의 `snapshot()` 문서 블록에 아래 순서로 삽입한다. 기존 `snapshot()` 설명·필드 표는 보존하고 **status 관련 내용만 additive** 로 덧붙인다.

```
snapshot()  (기존 섹션)
├─ 기존 설명: activeCount / pendingCount / concurrency / isPaused
├─ [+] status 필드 한 줄 요약  ......................... §5-A
├─ [+] Status table (Priority | status | Condition | Meaning)  §5-B
├─ [+] Notes: 우선순위·Infinity 경계·pendingCount 비관여  §5-C
├─ [+] Example: snapshot().status 읽기  ............... §6-A
└─ [+] Example: limitFunction 위임 동일성  ............ §6-B
```

- **spacing**: 각 하위 블록 사이 1 빈 줄(마크다운 문단 구분). 표 앞뒤 1 빈 줄.
- **breakpoint**: README 는 반응형 UI 아님 — GitHub 렌더 폭에 맡긴다. 표는 4열을 넘기지 않아 좁은 폭에서도 가로 스크롤 최소.
- **삽입 위치**: 기존 `snapshot()` 반환 필드 설명 **직후**, `subscribe()` 섹션 **이전**(두 표면의 status 일관성을 자연스럽게 연결).

---

## 5. 컴포넌트 명세 — Status 정보 블록

### 5-A. status 필드 한 줄 요약 (README 확정 문구, 영어)

```md
`snapshot()` also returns a `status` field: a single derived, human-facing
label summarizing the limiter's current state. It is `'idle'`, `'active'`,
`'saturated'`, or `'paused'`, chosen by a fixed priority order.
```

- 설계 의도: 표를 읽기 전 **1문장으로 "무엇인지"** 를 못박는다. `LimiterStatus` 어휘 4종을 순서대로 노출.

### 5-B. Status table (README 확정 문구, 영어) — **색상 의존 없음**

| 상태 | 정보 요소 | 값 |
|---|---|---|
| 표 헤더 | 4열 | `Priority` · `status` · `Condition (first match wins)` · `Meaning` |
| 구분 수단 | 색 아님 | **Priority 순위 숫자(1~4)** + **monospace status 문자열** |

README 에 그대로 넣을 표:

```md
The status is derived by checking these conditions in order and taking the
**first** one that matches (higher priority wins):

| Priority | `status`      | Condition (first match wins)        | Meaning                                                        |
| -------- | ------------- | ----------------------------------- | -------------------------------------------------------------- |
| 1        | `'paused'`    | `isPaused === true`                 | Paused; no queued task starts until `resume()`.                |
| 2        | `'saturated'` | `activeCount >= concurrency`        | Every concurrency slot is occupied; no free slot.              |
| 3        | `'active'`    | `activeCount > 0`                   | At least one task is running and a free slot still remains.    |
| 4        | `'idle'`      | `activeCount === 0`                 | Nothing is running.                                            |
```

- **AC(색상 의존 없음) 충족 근거**: 순위는 `Priority` 열의 숫자 1~4, 상태 식별은 `status` 열의 문자열, 판정은 `Condition` 열의 조건식으로 전달 — 어떤 셀도 색으로만 의미를 전달하지 않는다.
- **1:1 정합 근거**: 조건식·우선순위는 plan §2 표(30~35행)와 문자 그대로 동일. 어휘는 `index.d.ts` `LimiterStatus` 와 동일.

### 5-C. Notes 블록 (README 확정 문구, 영어)

```md
Notes:

- **Priority is fixed** as `paused` > `saturated` > `active` > `idle`. For
  example, a saturated limiter that is then paused reports `'paused'`.
- **Infinite concurrency is never `'saturated'`.** With `concurrency` set to
  `Infinity`, `activeCount >= Infinity` is always `false`, so the status is
  only ever `'paused'`, `'active'`, or `'idle'`. This matches `isSaturated`.
- **`pendingCount` does not affect `status`.** A limiter with queued-but-not-
  started tasks (`activeCount === 0`, not paused) is still `'idle'`. Do not
  read `'idle'` status as "the queue is empty"; use `pendingCount`/`isIdle`
  for that.
- **`snapshot().status` and the `subscribe()` payload agree.** At the same
  moment both surfaces derive the same `status` value from the same rules.
```

- 설계 의도: plan §2·§3 의 동결 규칙 4개(우선순위 고정 / Infinity never saturated / pendingCount 비관여 / 표면 일관성 INV-5)를 문서 독자용 문장으로 1:1 매핑. `isIdle` 게터와 status `'idle'` 의 의미 차이(plan 40행)를 명시해 오해 차단.

### 5-D. 상태별 라벨·설명 문구 카탈로그 (dev/tester 참조용, AC-1)

각 상태의 "화면 텍스트"(README 라벨 + 설명 문구)를 색상 없이 단건으로 정리:

| status(라벨) | 파생 조건 | 설명 문구(영어, README/툴팁 재사용 가능) |
|---|---|---|
| `idle` | `activeCount === 0` (비paused) | "Nothing is running." |
| `active` | `activeCount > 0` (여유 슬롯 있음) | "At least one task is running and a free slot still remains." |
| `saturated` | `activeCount >= concurrency` (유한) | "Every concurrency slot is occupied; no free slot." |
| `paused` | `isPaused === true` | "Paused; no queued task starts until resume()." |

---

## 6. API 예시 정보 구조 (AC-2)

### 6-A. snapshot().status 읽기 (README 확정 문구, 영어)

````md
```js
import pLimit from 'p-limit';

const limit = pLimit(2);

limit.snapshot().status; //=> 'idle'

limit(() => new Promise(() => {})); // start one long-running task
limit.snapshot().status; //=> 'active'

limit(() => new Promise(() => {})); // fill the second (last) slot
limit.snapshot().status; //=> 'saturated'

limit.pause();
limit.snapshot().status; //=> 'paused'  (priority: paused wins over saturated)
```
````

- 설계 의도: 한 리미터의 상태가 `idle → active → saturated → paused` 로 **우선순위 규칙을 실증**하도록 순차 진행. 마지막 줄에서 saturated 위에 paused 가 우선함을 주석으로 못박음(plan §2 우선순위 경계, plan §7 focused 테스트의 우선순위 경계와 동일 시나리오).

### 6-B. limitFunction 위임 동일성 (README 확정 문구, 영어)

````md
```js
import {limitFunction} from 'p-limit';

const run = limitFunction(async () => doSomething(), {concurrency: 1});

// `limitFunction` delegates `snapshot()` to its underlying limiter, so it
// exposes the exact same `status` contract and values.
run.snapshot().status; //=> 'idle'

run(); // occupies the single slot
run.snapshot().status; //=> 'saturated'
```
````

- 설계 의도: plan §4 / INV-6(공통 인터페이스·위임 유지)을 예시로 못박음. `limitFunction` 이 별도 파생 없이 **위임으로 동일 status** 를 노출한다는 계약을 독자에게 전달. `concurrency: 1` 이라 단일 슬롯 점유 즉시 `saturated` 가 되는 최소 예시.

### 6-C. Infinity 경계 예시 (선택 삽입, 영어)

````md
```js
const unbounded = pLimit(Infinity);

unbounded(() => new Promise(() => {}));
unbounded.snapshot().status; //=> 'active'  (never 'saturated' with Infinity)
```
````

- 설계 의도: plan §3 / INV-4 를 짧게 실증. developer 가 README 지면이 길어지면 이 블록은 §5-C Notes 의 Infinity 문장으로 갈음 가능(중복 방지) — **필수 아님**, 우선순위 낮음.

---

## 7. dev 구현 가이드 (developer F68F701A7A-126 용)

> designer 는 코드를 구현하지 않는다. 아래는 developer 가 `readme.md` 에 반영할 **문서 편집 단계**만 안내한다. 소스(`index.js`/`index.d.ts`) 구현은 F68F701A7A-126 packet 을 따른다.

1. **삽입 위치 확인**: `readme.md` 의 `snapshot()` 섹션에서 기존 반환 필드(`activeCount`/`pendingCount`/`concurrency`/`isPaused`) 설명 직후를 찾는다.
2. **§5-A** 한 줄 요약 문단을 삽입한다.
3. **§5-B** Status table 을 그대로 붙여넣는다(4열 유지, 조건식·우선순위 변경 금지).
4. **§5-C** Notes 블록을 표 아래에 붙여넣는다.
5. **§6-A** snapshot 예시 코드블록을 삽입한다. (§6-C Infinity 예시는 지면 여유 시 선택 삽입, 아니면 §5-C 문장으로 갈음.)
6. **§6-B** limitFunction 위임 예시를 `limitFunction` 문서 섹션(또는 snapshot 예시 직후)에 삽입한다.
7. **어휘/조건 표기 규칙**: 상태 문자열은 항상 인라인 코드(`` `'idle'` ``)로. 조건식은 `index.js` 실제 식(`activeCount >= concurrency` 등)과 문자 일치.
8. **금지**: `subscribe()`/`LimiterSnapshot` 페이로드 문서를 바꾸지 말 것(INV-5). 기존 필드 설명 문구를 재작성하지 말 것(additive only).

- 권장 클래스/변수명(mockup 참고): 실제 README 는 CSS 클래스가 없으므로 해당 없음. mockup 의 status 셀은 `.status-cell` + `data-status="idle|active|saturated|paused"` 로 표기(색은 보조, 텍스트가 주).

---

## 8. mockup 참조

- 시각 mockup HTML: **`docs/design/mockups/snapshot-status-F68F701A7A-124.html`**
- 내용: 본 명세 §5(Status table) + §6(API 예시)를 GitHub README 느낌으로 렌더한 단일 self-contained HTML.
- 용도: reviewer/운영자/developer 가 표·예시의 최종 정보구조를 **한눈에 시각 확인**. dev 의 실제 산출물 아님(README 문구는 §5·§6 영어 블록이 정본).
- 색상 의존 없음 확인용: mockup 의 status 셀은 순위 숫자 + monospace 문자열로 구분되며, 색 배지는 보조 표기임을 시각적으로 보인다.

---

## 9. AC 매핑 (self-check)

| Acceptance Criteria | 충족 위치 |
|---|---|
| idle/active/saturated/paused 각 상태의 화면 텍스트(라벨·설명)와 우선순위 표가 **색상 의존 없이** 명시 | §5-B(Priority 숫자+status 문자열+조건식), §5-D(라벨·설명 카탈로그) |
| snapshot() 및 limitFunction 용례를 포함한 README API 예시 정보 구조 | §6-A(snapshot), §6-B(limitFunction 위임), §6-C(Infinity 선택) |
| planning-contract 의 상태 어휘·우선순위와 **1:1 정합** | §5-B 조건식/우선순위 = plan §2 표, 어휘 = `index.d.ts` `LimiterStatus`, Notes = plan §3/INV-4·INV-5 |
