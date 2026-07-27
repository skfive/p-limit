# 스냅샷 API·진단 데모 실행 계약 (F68F701A7A-121)

> **문서 성격**: 이 문서는 planner가 designer(F68F701A7A-119)·developer(F68F701A7A-120)·tester(F68F701A7A-123)가 병렬로 따를 **실행 설계**를 동결한 것입니다.
> **권위 순서**: frozen blueprint(ROLE_WORK_PACKET_V2의 `frozen_interfaces`)가 파일 소유권·selector·token·상태 계약의 **유일한 권위**이며, 본 문서는 이를 재정의하지 않고 그대로 렌더링·설명합니다.
> **동결 계약 ID**: `planning-contract@v1` (`sha256:bc5aee88…`), `ui-contract@v1` (`sha256:17615ac8…`).

---

## 0. 범위와 비목표

### 범위
- 읽기 전용 상태 **스냅샷 API**의 반환 shape·시그니처 동결 (additive, plain object).
- 진단 **데모 UI 계약**(selector·상태 모델·token·접근성·반응형)의 실행 설계 렌더링.
- 기존 공개 API·동작을 바꾸지 않는 **additive 호환 정책** 명시.
- designer / developer 간 **파일 소유 경계** 확정.

### 비목표 (이 문서/이 Epic에서 하지 않는 것)
- 기존 공개 API(`activeCount`, `pendingCount`, `concurrency`, `pause`/`resume`, `subscribe`, `map`/`filter`/`find` 등)의 시그니처·동작·타이밍 변경.
- 새 파일·새 역할·새 요구사항 추가. (frozen blueprint에 없는 파일/owner/token/selector 도입 금지)
- 데모의 스타일 시안(디자인 mockup) 자체 작성 — designer 소유.

---

## 1. 사용자 시나리오

### S1. 라이브러리 사용자(개발자)
읽기 전용 스냅샷 API 사용자는, 리스너 구독(`subscribe`) 없이도 **현재 순간의 limiter 상태를 동기적으로 한 번에** 읽고 싶다. 개별 getter(`activeCount`, `pendingCount`, `concurrency`, `isPaused`)를 여러 번 읽는 대신, 서로 정합적인(같은 시점의) 단일 plain object를 얻어 로깅·대시보드·디버깅에 쓴다.

### S2. 진단 데모 관찰자(운영자/평가자)
데모 페이지를 열어, 작업을 추가(`add`)하고 일시정지(`pause`)·재개(`resume`)·비우기(`clear`)를 조작하며, limiter의 active/pending/concurrency/일시정지 상태가 화면에 **텍스트 라벨과 색상**으로 실시간 반영되는지 확인한다. 스크린리더 사용자도 상태 변화를 `aria-live`로 듣는다.

### S3. 후속 페르소나(designer/developer/tester)
동일한 selector·token·상태 계약을 참조해 각자 파일을 병렬로 구현하고, 서로의 selector를 재정의하지 않은 채 하나의 데모로 합쳐진다.

---

## 2. 스냅샷 API 실행 설계 (planning-contract@v1)

### 2.1 시그니처 (exact, additive)
`index.js` / `index.d.ts`(둘 다 developer 소유)에 아래를 **추가**한다. 인자를 받지 않는 동기 읽기 전용 메서드다.

```ts
// index.d.ts — LimitFunction 및 LimitedFunction 양쪽에 추가
snapshot: () => Readonly<LimiterStateSnapshot>;

export type LimiterStateSnapshot = {
	readonly activeCount: number;   // 현재 실행 중인 promise 수
	readonly pendingCount: number;  // 대기 중인(아직 시작 안 된) promise 수
	readonly concurrency: number;   // 현재 concurrency 한도 (Infinity 가능)
	readonly isPaused: boolean;     // pause() 이후 resume() 이전이면 true
};
```

- **반환값**: `Object.freeze({activeCount, pendingCount, concurrency, isPaused})` 형태의 **plain object**. 매 호출마다 그 순간의 값으로 새 frozen 객체를 만든다(살아있는 참조가 아님).
- **필드 4개 exact**: `activeCount`, `pendingCount`, `concurrency`, `isPaused`. 이 이상/이하 없음.
- **동기·부작용 없음**: 호출은 스케줄링·타이밍·settlement에 영향을 주지 않는다. `O(1)` 읽기.
- `LimitedFunction`(= `limitFunction()` 반환)의 `snapshot()`은 내부 limiter의 `snapshot()`으로 **위임**한다(스케줄링 로직 중복 금지).

### 2.2 기존 `subscribe`/`LimiterSnapshot`과의 관계 (혼동 방지)
- 기존 `subscribe(listener)`가 전달하는 `LimiterSnapshot`(`activeCount`/`pendingCount`/`concurrency`/`status`)은 **변경하지 않는다**. `status` 필드(`idle|active|saturated|paused`)도 그대로 유지.
- 본 스냅샷 API는 **동기 read** 용도의 별도 진입점이며 `isPaused: boolean`을 노출한다. `subscribe`의 push 계약을 재정의하지 않는다.
- 두 shape를 강제로 통합하지 않는다(over-abstraction 금지). developer는 필요 시 내부 상태 계산을 재사용할 수 있으나 `subscribe` payload를 바꿔서는 안 된다.

### 2.3 필드 의미 (기존 구현과 정합)
| 필드 | 소스 | 값 규칙 |
|---|---|---|
| `activeCount` | 내부 `activeCount` | 0 이상 정수 |
| `pendingCount` | `queue.size` | 0 이상 정수 |
| `concurrency` | 살아있는 `concurrency` | 양의 정수 또는 `Infinity` |
| `isPaused` | 내부 `paused` | `pause()` 후 `true`, `resume()` 후 `false` |

---

## 3. 진단 데모 UI 계약 (ui-contract@v1, blueprint-frozen)

아래 값은 frozen blueprint에서 **그대로 옮긴** 것이다. designer·developer는 selector와 token을 **변경·재정의하지 않는다**.

### 3.1 파일과 소유자 (frozen — 새 파일/owner 추가 금지)
| 파일 | 소유자 | artifact-policy |
|---|---|---|
| `demo/index.html` | **developer** | additive |
| `demo/status-demo.css` | **developer** | additive |
| `demo/status-demo.js` | **developer** | additive |
| `index.d.ts` | **developer** | additive |
| `index.js` | **developer** | additive |
| `docs/design/status-snapshot-demo-F68F701A7A-118.md` | **designer** | additive |
| `docs/design/status-snapshot-mockup-F68F701A7A-118.html` | **designer** | additive |

> `docs/plans/**`는 planner(본 문서) 소유. 위 표 밖의 파일은 이 Epic에서 생성/수정하지 않는다.

### 3.2 DOM ID (frozen)
| ID | 용도 |
|---|---|
| `snapshot-panel` | 스냅샷 표시 패널 컨테이너 |
| `snapshot-active-count` | `activeCount` 값 표시 |
| `snapshot-pending-count` | `pendingCount` 값 표시 |
| `snapshot-concurrency` | `concurrency` 값 표시 |
| `snapshot-pause-state` | 일시정지 상태(`isPaused`) 텍스트 표시 |
| `demo-add-task` | 작업 추가 control |
| `demo-pause` | 일시정지 control |
| `demo-resume` | 재개 control |
| `demo-clear` | 대기열 비우기 control |

### 3.3 CSS 클래스 (frozen)
| 클래스 | 용도 |
|---|---|
| `status-panel` | 패널 루트 |
| `status-card` | 개별 상태 카드 |
| `status-card__label` | 카드 라벨 텍스트 |
| `status-card__value` | 카드 값 텍스트 |
| `status-card--running` | 실행 중 상태 modifier |
| `status-card--paused` | 일시정지 상태 modifier |
| `demo-controls` | control 그룹 컨테이너 |
| `demo-controls__button` | control 버튼 |

### 3.4 상태 모델 (frozen states)
데모의 UI 상태는 `idle`, `running`, `paused`, `resumed`, `cleared` 다섯 가지다. 각 상태는 **색상만으로 구분하지 않고 화면 텍스트 라벨과 접근성 이름으로도** 노출한다.

| 상태 | 진입 트리거 | 화면 텍스트 라벨(예) | 카드 modifier |
|---|---|---|---|
| `idle` | 초기 / 실행·대기 모두 0 | "대기 없음" / "유휴" | (기본) |
| `running` | 활성 작업 존재, 미일시정지 | "실행 중" | `status-card--running` |
| `paused` | `pause()` 호출 후 | "일시정지" | `status-card--paused` |
| `resumed` | `resume()` 호출 후 | "실행 중"(running으로 복귀) | `status-card--running` |
| `cleared` | `clearQueue()`로 대기열 비움 | "대기열 비움" → 초기값 복귀 | (기본) |

- **후조건(초기화·취소·실패)**: 초기화·취소(clear)·실패 뒤에는 상태 표시와 진행 표시를 **초기값으로 되돌리고**, 주 실행 control(`demo-add-task`)을 **다시 사용 가능**하게 한다.
- `snapshot-pause-state`는 `isPaused === true`면 "일시정지", 아니면 "실행 가능/실행 중" 텍스트를 표시한다(색상 외 텍스트 라벨 필수).

### 3.5 디자인 토큰 (frozen 값 — 재정의 금지)
| 토큰 | 값 |
|---|---|
| `--color-status-running` | `#16a34a` |
| `--color-status-paused` | `#d97706` |
| `--color-status-idle` | `#64748b` |
| `--space-card-gap` | `12px` |
| `--radius-card` | `8px` |

### 3.6 접근성 (frozen)
- 상태 변화는 `aria-live="polite"` region으로 스크린리더에 알린다.
- `demo-add-task` / `demo-pause` / `demo-resume` / `demo-clear` 각 control은 **명시적 `aria-label`**을 가진다.
- 모든 control은 키보드 **Tab / Enter / Space**로 조작 가능하다.
- 상태는 색상뿐 아니라 **텍스트 라벨**(예: "실행 중", "일시정지")로 표시한다.
- 모든 상태는 색상만으로 구분하지 않고 상태명을 **화면 텍스트와 접근성 이름** 양쪽에 노출한다.

### 3.7 반응형 (frozen)
- **≥320px**: 상태 카드가 **세로 스택**으로 재배치되며 content overflow가 없다.
- **≥640px**: 상태 카드가 **다열 grid** 레이아웃으로 확장된다.

---

## 4. Acceptance Criteria (Given/When/Then)

### AC1 — 스냅샷 API shape/시그니처
- **Given** `pLimit(2)`로 만든 `limit`에 작업이 실행·대기 중일 때,
- **When** `limit.snapshot()`을 호출하면,
- **Then** `Object.isFrozen(result) === true`이고, 키가 정확히 `{activeCount, pendingCount, concurrency, isPaused}` 4개이며, 각각 그 순간의 `activeCount`/`pendingCount`/`concurrency`/`isPaused`와 일치한다.

### AC2 — 부작용 없음(additive)
- **Given** 임의 시점의 `limit`,
- **When** `snapshot()`을 여러 번 호출해도,
- **Then** 스케줄링·실행 순서·settlement·타이밍이 스냅샷 미호출 때와 동일하고, 기존 공개 API(`activeCount`/`pendingCount`/`concurrency`/`pause`/`resume`/`subscribe`/`map`/`filter`/`find` 등)의 동작·시그니처가 변하지 않는다.

### AC3 — `limitFunction` 위임
- **Given** `limitFunction(fn, {concurrency: 1})`로 만든 함수,
- **When** 그 함수의 `snapshot()`을 호출하면,
- **Then** 내부 limiter의 `snapshot()`과 동일한 shape·값을 반환한다(로직 중복 없이 위임).

### AC4 — 일시정지 반영
- **Given** `limit.pause()` 호출 후,
- **When** `limit.snapshot()`을 읽으면,
- **Then** `isPaused === true`이고, `resume()` 후 다시 읽으면 `isPaused === false`이다.

### AC5 — 데모 selector·상태·접근성 고정
- **Given** 데모 페이지가 로드되었을 때,
- **When** DOM을 조회하면,
- **Then** §3.2의 모든 DOM ID와 §3.3의 모든 CSS 클래스가 존재하고, 각 control은 명시적 `aria-label`을 가지며, 상태 region은 `aria-live="polite"`이다.

### AC6 — 색상 외 텍스트 라벨
- **Given** limiter가 running/paused 상태일 때,
- **When** 화면과 접근성 트리를 확인하면,
- **Then** 상태가 색상뿐 아니라 텍스트 라벨("실행 중"/"일시정지")로 화면과 접근성 이름 양쪽에 노출된다.

### AC7 — 후조건 복귀
- **Given** 작업 추가로 running 상태에서,
- **When** `demo-clear`(또는 취소/실패)가 발생하면,
- **Then** 상태·진행 표시가 초기값으로 돌아가고 `demo-add-task`가 다시 조작 가능하다.

### AC8 — 반응형
- **Given** 뷰포트 폭이 320px 이상일 때 상태 카드는 세로 스택이고 overflow가 없으며,
- **When** 폭이 640px 이상이 되면,
- **Then** 상태 카드가 다열 grid로 확장된다.

---

## 5. Edge / 실패 케이스

| 케이스 | 기대 동작 |
|---|---|
| `concurrency === Infinity` | `snapshot().concurrency === Infinity`, `isPaused`/카운트는 정상. saturated 개념은 스냅샷 4필드에 포함하지 않음. |
| 실행·대기 모두 0 (idle) | `activeCount === 0 && pendingCount === 0`, 데모는 `idle` 상태 텍스트로 표시. |
| 이미 paused에서 `pause()` 재호출 | no-op, `snapshot().isPaused`는 계속 `true`(기존 idempotent 동작 유지). |
| paused 상태에서 스냅샷 읽기 | `activeCount`는 실행 중 작업 반영(일시정지는 대기 승격만 막음), `pendingCount`는 대기 반영, `isPaused === true`. |
| `clearQueue()` 직후 스냅샷 | `pendingCount === 0`으로 반영, 데모는 `cleared` → 초기값 복귀. |
| 반환 객체 mutation 시도 | frozen이라 무시(엄격 모드에서 throw). 스냅샷은 살아있는 참조가 아니므로 이후 상태 변화가 반영되지 않음(재호출 필요). |
| 데모에서 스크린리더 사용 | 상태 전이 시 `aria-live="polite"` region이 새 라벨을 읽어줌. |
| 좁은 뷰포트(320px 미만 경계) | 카드 세로 스택 유지, 가로 overflow 없음(§3.7 상한 계약은 ≥320px). |

---

## 6. 호환 / additive 정책

- 스냅샷 API는 **순수 additive**: 새 메서드/타입 추가만 하며 기존 공개 API의 시그니처·동작·타이밍·settlement을 변경하지 않는다.
- 데모·문서 파일은 모두 `additive` 정책(§3.1): 기존 파일을 파괴적으로 재작성하지 않고 신규 추가/확장한다.
- `subscribe`의 `LimiterSnapshot`(`status` 포함) 계약은 그대로 두고, 동기 read용 `LimiterStateSnapshot`(`isPaused` 포함)을 별도로 노출한다.
- token·selector·상태 계약은 frozen blueprint가 유일 권위이며, 후속 페르소나는 이를 변경·재정의하지 않는다.

---

## 7. Handoff 계약

- **designer(F68F701A7A-119)**: `docs/design/status-snapshot-demo-F68F701A7A-118.md`, `docs/design/status-snapshot-mockup-F68F701A7A-118.html`를 §3의 selector·token·상태·접근성·반응형 값을 **그대로** 반영해 작성. selector/token 재정의 금지.
- **developer(F68F701A7A-120)**: `index.js`/`index.d.ts`에 §2 스냅샷 API를 additive로 구현하고, `demo/index.html`·`demo/status-demo.css`·`demo/status-demo.js`를 §3 selector·token·상태로 구현. 색상 외 텍스트 라벨·`aria-live`·키보드 조작·후조건 복귀 필수.
- **tester(F68F701A7A-123)**: §4 AC와 §5 edge를 검증. focused scope이나 공용 `index.js` 변경이므로 회귀 가드(`npm test` = `xo && ava && tsd`) 전체를 실행.

---

## 8. 검증 명령 (참고)
- `npm install` → `npm test` (`xo && ava && tsd`)로 lint·런타임·타입 테스트를 검증한다(CI: Node 20/22/24).
