# 동시성 시각화 예제 — 구현 설계 (F68F701A7A-42)

## 1. 목적

`p-limit`(동시 실행 개수를 제한하는 promise 유틸리티)의 동작을 브라우저에서 눈으로
확인할 수 있는 정적 예제를 `examples/concurrency-visualizer/`에 추가한다.
사용자가 동시성 값(concurrency)을 조절하면서 "대기 중(pending) → 실행 중(active) →
완료(done)"로 전환되는 작업들을 실시간으로 관찰할 수 있게 한다.

이 문서는 designer(F68F701A7A-40)와 developer(F68F701A7A-41)가 병렬로 작업하기 위한
공통 계약이다. 두 역할 모두 아래 파일 구조·상태 모델·DOM 계약을 그대로 따른다.

## 2. 구현 범위

### 포함 (in scope)
- `p-limit`의 공개 API만 사용하는 순수 브라우저(ESM) 정적 예제 1개
- 동시성 값 조절 UI(슬라이더/입력) → `limit.concurrency` 실시간 반영
- 개별 작업(task)의 상태(대기/실행/완료/에러) 시각화
- 집계 카운터(activeCount/pendingCount/concurrency) 표시
- 예제 실행 방법을 안내하는 README

### 제외 (out of scope, non-goals)
- **외부 CDN, 프레임워크(React/Vue 등), 신규 npm 의존성 추가 금지** — 저장소 루트
  `package.json`의 `dependencies`/`devDependencies`는 변경하지 않는다.
- **`index.js` / `index.d.ts`(p-limit 코어) API 변경 금지** — 예제는 기존 공개 API
  (`pLimit(concurrency)`, 반환된 `limit()` 함수, `limit.activeCount`,
  `limit.pendingCount`, `limit.concurrency` getter/setter)만 소비한다. p-limit이
  작업(task) 단위 이벤트/훅을 제공하지 않으므로, 개별 task의 상태 추적은 예제 코드
  내부의 래퍼(아래 3.2절)로 구현하고 코어 라이브러리는 건드리지 않는다.
- 빌드 도구(번들러/트랜스파일러) 도입 — 브라우저 네이티브 ESM(`<script type="module">`)
  으로 동작해야 하며, `index.js`를 상대 경로로 그대로 import한다.
- 디자인 시안(색상·타이포·애니메이션 디테일) — designer 담당. 이 문서는 DOM
  구조·id·class·data-attribute 계약만 정의한다.
- 실제 네트워크 요청 — 데모 task는 `setTimeout` 기반의 인위적 지연으로 시뮬레이션한다
  (외부 API 의존 금지, 오프라인에서도 동작해야 함).

## 3. 예제 파일 구조

```
examples/concurrency-visualizer/
├── index.html        # DOM 구조 (developer 작성, 3.3절 계약 준수)
├── style.css          # 시각 스타일 (designer 담당)
├── main.js             # 로직: p-limit 사용, 상태 관리, DOM 갱신 (developer 담당)
├── readme.md          # 실행 방법 (예: 정적 서버로 열기, 빌드 불필요)
└── tests/
    └── task-state.test.js  # 순수 로직(상태 리듀서) 단위 테스트 (tester 담당, F68F701A7A-44)
```

- `main.js`는 저장소 루트의 `index.js`를 `../../index.js` 상대 경로로 import한다.
- `tests/`는 DOM에 의존하지 않는 **순수 함수**만 검증 대상으로 한다(3.2절의 상태
  리듀서). DOM 조작/브라우저 API는 단위 테스트 범위에서 제외한다(수동/E2E 확인 영역).

## 4. 상태 모델

### 4.1 집계 상태 (aggregate) — p-limit 인스턴스에서 직접 읽음
개별 계산으로 중복·드리프트를 만들지 않기 위해, 집계 수치는 항상 p-limit 인스턴스의
값을 단일 진실 소스(source of truth)로 사용한다.

| 필드 | 출처 | 설명 |
|---|---|---|
| `activeCount` | `limit.activeCount` | 현재 실행 중인 작업 수 |
| `pendingCount` | `limit.pendingCount` | 대기열에 쌓인 작업 수 |
| `concurrency` | `limit.concurrency` | 현재 동시 실행 허용 개수(get/set 가능) |

### 4.2 개별 task 상태 (per-task) — 예제 코드가 자체 관리
p-limit은 task 단위 식별자나 상태 이벤트를 제공하지 않으므로, 예제는 아래 형태의
경량 래퍼로 각 task를 감싸 로컬 상태를 추적한다(코어 API 변경 없음).

```js
// task 상태 shape
{
  id: number,
  state: 'queued' | 'active' | 'done' | 'error',
  startedAt: number | null,
  endedAt: number | null,
}
```

상태 전이: `queued → active → (done | error)`. 전이는 오직
`limit(() => trackedWork(task))` 실행 시점(= active 진입)과 해당 프라미스
resolve/reject 시점(= done/error 진입)에서만 발생한다. `queued`는 task 생성 직후
(아직 `limit()` 콜백이 호출되기 전) 초기 상태다.

상태 갱신은 순수 함수(리듀서)로 분리해 `tests/task-state.test.js`에서 DOM 없이
검증 가능하게 한다. 예: `applyTransition(tasks, id, nextState, timestamp) → tasks`.

## 5. 실시간 갱신 흐름

1. 사용자가 "작업 N개 시작" 또는 페이지 로드 시 N개의 task 객체를 `queued` 상태로 생성한다.
2. 각 task마다 `limit(() => trackedWork(task))`를 호출한다. `trackedWork`는:
   - 호출 즉시 해당 task를 `active`로 전이시키고 `render()`를 호출한다.
   - 인위적 지연(`setTimeout` 기반 promise) 후 성공/실패를 랜덤 또는 고정 시나리오로 결정한다.
   - 완료 시 task를 `done` 또는 `error`로 전이시키고 `render()`를 호출한다.
3. `render()`는 이벤트 기반(폴링 아님)으로, 상태가 바뀔 때만 호출한다. 데모 규모
   (기본 수십 개 task)에서는 폴링/`requestAnimationFrame` 배칭 없이 직접 호출로
   충분하다(단순성 우선, 추측성 최적화 금지).
4. 동시성 슬라이더 `input`/`change` 이벤트에서 `limit.concurrency = value`로 즉시
   반영하고, 집계 카운터 영역을 다시 렌더링한다. p-limit은 실행 중간에 concurrency
   값을 바꿔도 큐 처리를 계속하므로 별도 재시작 로직은 불필요하다.
5. "초기화/재실행" 버튼(있다면)은 기존 task 목록을 비우고 1번부터 다시 시작한다.
   진행 중인 task를 강제로 취소하는 기능은 p-limit이 제공하지 않으므로 구현하지 않는다.

## 6. designer ↔ developer handoff 계약 (DOM/data 계약)

developer는 아래 id/class/attribute를 가진 DOM을 만들고 JS로 값을 채운다.
designer는 이 요소들의 시각 표현(색상/레이아웃/애니메이션)만 정의하며, 구조 자체는
변경하지 않는다(구조 변경이 필요하면 문서 갱신 없이 임의 변경 금지 — Jira 코멘트로 조율).

| 요소 | 계약 |
|---|---|
| `#concurrency-slider` | `<input type="range">`, developer가 `change`/`input` 이벤트로 `limit.concurrency` 갱신 |
| `#concurrency-value` | 현재 concurrency 값 텍스트 표시 |
| `#active-count` | `limit.activeCount` 텍스트 표시 |
| `#pending-count` | `limit.pendingCount` 텍스트 표시 |
| `#task-grid` | task 시각화 컨테이너(부모 요소) |
| `.task[data-state="queued\|active\|done\|error"]` | task 1개당 요소 1개. `data-state`로 상태 표현, designer가 상태별 색상/스타일 지정 |
| `.task[data-id]` | task 고유 id(디버깅/테스트 대조용) |

- developer는 `data-state`/`data-id` 외 임의의 새 data-attribute가 필요하면 이
  표를 갱신하고 designer에게 Jira 코멘트로 알린다.
- designer는 위 id/class 선택자를 CSS 훅으로 그대로 사용한다(새 wrapper 요소 추가는
  가능하나 위 계약 요소의 id/class/data-attribute 이름은 변경하지 않는다).

## 7. Edge case / 실패 케이스

| 케이스 | 기대 동작 |
|---|---|
| task 실행 중 concurrency를 더 큰 값으로 변경 | 대기 중이던 task가 즉시 추가로 active 전이(큐에서 순차 소비) |
| task 실행 중 concurrency를 더 작은 값으로 변경 | 이미 active인 task는 끝까지 실행, 이후 새 task부터 새 제한 적용 |
| task가 reject(에러)됨 | `error` 상태로 표시하고 나머지 큐 처리는 계속 진행(전체 중단 없음) |
| pending 큐가 비어있고 실행 중인 task도 없음 | idle 상태 — 카운터 0 표시, 에러 없이 정상 |
| 대량 task(예: 100개 이상) 생성 | 예제는 데모 목적이므로 기본 시나리오에서 task 개수를 30개 내외로 제한(문서화된 예제 한계이며 p-limit 자체의 제약은 아님) |
| ESM `<script type="module">` 미지원 환경 | 지원 범위 밖(out of scope) — readme.md에 "최신 브라우저 필요"로 명시 |

## 8. 검증 기준 (acceptance criteria)

- **Given** `examples/concurrency-visualizer/index.html`을 정적 서버(또는 파일)로 열면
  **When** 페이지가 로드되면 **Then** concurrency 슬라이더와 초기 task 목록(전부
  `queued` 또는 즉시 일부 `active`)이 표시된다.
- **Given** task들이 진행 중일 때 **When** 슬라이더로 concurrency를 변경하면
  **Then** `#concurrency-value`, `#active-count`, `#pending-count`가 즉시 갱신되고
  active task 수가 새 concurrency 값을 넘지 않는다.
- **Given** 모든 task가 완료되면 **When** 렌더링이 끝나면 **Then**
  `#pending-count`와 `#active-count`가 0이 되고 모든 `.task` 요소의 `data-state`가
  `done` 또는 `error`다.
- **Given** `tests/task-state.test.js` **When** 상태 리듀서 단위 테스트를 실행하면
  **Then** `queued → active → done/error` 전이 로직이 DOM 없이 검증된다.
- 저장소 루트 `package.json`의 `dependencies`/`devDependencies`/`exports`는
  변경되지 않는다.
- `index.js` / `index.d.ts`(p-limit 코어 공개 API)는 변경되지 않는다.

## 9. developer/tester를 위한 열린 확인 사항 (planner가 대신 결정하지 않음)

- 저장소 루트 `package.json`의 `scripts.test`(`xo && ava && tsd`)가 저장소 전체를
  린트/테스트 대상으로 삼는지, `examples/` 하위 신규 파일이 여기 포함되는지는
  developer/tester가 실제 실행으로 확인해야 한다(planner는 파일을 실행하지 않음).
  포함된다면 xo 설정에서 예제 디렉터리를 제외할지 여부는 developer가 판단한다.
- task 실패(reject) 시나리오를 데모에서 어떤 비율/조건으로 발생시킬지(고정 vs
  랜덤)는 developer 재량이며, 위 상태 모델 계약만 지키면 된다.
