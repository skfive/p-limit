# 결정론적 스케줄러 상태 머신 회귀 테스트 설계 (F68F701A7A-24)

## 배경 및 목표

현재 `p-limit`의 스케줄러(`index.js`가 노출하는 `pLimit()`/`limitFunction()`)는 개별 시나리오
단위의 유닛 테스트(`test.js`)로 검증되어 왔다 — concurrency 승격(test.js:729-765), `clearQueue`
(+`reason`/`rejectOnClear`)(test.js:184-417), `map`(동기/비동기 iterable, lazy 소비)
(test.js:449-679), `onIdle()`(test.js:991-1186) 등 각 기능은 F68F701A7A-6/11/16/20 명세를 거쳐
개별적으로는 촘촘히 커버되어 있다.

그러나 이 기능들이 **같은 인스턴스 안에서 임의 순서로 조합**될 때(예: `map()` 진행 중
`clearQueue()` → 동시에 `concurrency` 증가 → 그 직후 `onIdle()` 대기 등)의 조합 폭발은 개별
시나리오 테스트만으로는 다 덮을 수 없다. 본 명세는 **고정 seed로 결정론적 operation 시퀀스를
생성**하고, 매 스텝마다 **참조 모델(reference model)**과 실제 `limit` 인스턴스의 관찰 가능한
상태를 대조하는 **상태 머신(model-based) 회귀 테스트**의 계약을 정의한다. 코드는 작성하지
않으며, developer(F68F701A7A-25)가 이 계약대로 테스트 파일(`test-*.js` 패턴)을 구현한다.

## 범위

- 신규 테스트 파일 설계(예: `test-scheduler-state-machine.js`, 실제 파일명·배치는 developer
  재량이나 `test-*.js` 패턴을 따를 것) — 대상은 `pLimit()`이 반환하는 `limit` 함수의 공개 표면
  (`activeCount`, `pendingCount`, `concurrency` get/set, `clearQueue(reason?)`, `onIdle()`,
  `map(iterable, mapper)`)이다.
- `index.js`/`index.d.ts`/`readme.md` 변경 없음 — 순수 테스트 설계이며 구현 코드는 이 명세의
  범위 밖이다.
- 기존 `test.js`의 개별 시나리오 테스트는 유지한다. 본 설계는 그것을 대체하지 않고 **조합
  케이스**를 보완한다.
- `limitFunction()`은 내부적으로 `pLimit()`을 위임 노출하는 wrapper이므로(F68F701A7A-6/16 명세로
  이미 확립) 본 상태 머신 테스트는 `pLimit()` 인스턴스만 대상으로 하고 `limitFunction()`은
  범위 밖으로 둔다(위임 검증은 기존 개별 테스트로 충분 — test.js:844-980).

## 제약 재확인

1. **결정론**: 동일 seed → 동일 operation 시퀀스 → 동일 결과. `Math.random()` 사용 금지 — 인라인
   PRNG(seed 정수 입력)만 사용한다.
2. **wall-clock 비의존**: `delay(ms)`처럼 실제 경과 시간에 의존하는 assertion(`inRange(end(), ...)`
   같은 test.js:17-26 패턴)은 사용하지 않는다. job의 "완료 시점"은 시퀀스가 명시적으로 트리거하는
   `SETTLE` operation으로만 결정한다(§5). 단, `await Promise.resolve()` / `queueMicrotask` 같은
   **microtask 동기화**는 "wall-clock 의존"이 아니므로 허용된다 — 실제 스케줄러가 승격을
   microtask로 미루는 지점(§6 "비교 타이밍" 참조, test.js:888-889 "Promotion of queued work
   happens in a microtask" 코멘트 근거)이 있기 때문에 오히려 **필수**다.
3. **5초 이내**: 전체 회귀 스위트(seed 목록 × 시퀀스) 실행 시간 예산. real timer를 쓰지 않으므로
   시퀀스당 실행 시간은 사실상 microtask 처리 시간뿐이다(§9).
4. **신규 의존성 없음**: PRNG는 `package.json`에 패키지를 추가하지 않고 인라인 구현(§5). 기존
   `ava`/`in-range`/`time-span`/`random-int` 이상의 신규 devDependency도 추가하지 않는다(단,
   `random-int`/`time-span`은 wall-clock 기반이라 본 테스트에는 사용하지 않는다 — 순수 결정론
   PRNG만 사용).

## 참조 모델 (Reference Model) 설계

참조 모델은 `index.js`의 내부 구현을 재구현하는 것이 아니라, **공개 계약(observable contract)만**
최소 상태로 시뮬레이션하는 순수 JS 객체다. 실제 구현 세부(내부 자료구조, microtask 스케줄 방식)를
몰라도 관찰 가능한 값만으로 비교 가능해야 한다.

### 상태

```
model = {
  concurrency: number,       // 생성 시 초기값, SET_CONCURRENCY로 변경 가능
  rejectOnClear: boolean,    // 생성 시 고정 — 이후 변경 불가(실제 API에도 setter 없음)
  queue: JobId[],            // FIFO 대기열 (pending)
  active: Set<JobId>,        // 실행 중인 job id 집합
  startedOrder: JobId[],     // 실행이 "시작된" 순서(전체 누적, FIFO 검증용)
  startCounts: Map<JobId, number>, // job당 시작 횟수(최대 1회 검증용)
  settled: Map<JobId, {status: 'fulfilled'|'rejected', value}>, // 정산 결과
  mapInFlight: number,       // 진행 중인 limit.map() 호출 수 (onIdle 3번째 조건 대응)
  idleWaiterCount: number,   // 등록된 onIdle() waiter 수 (resolve 여부만 추적, Promise 객체 비교 안 함)
}
```

### 전이 규칙

| 연산 | 참조 모델 전이 |
|---|---|
| `enqueue(jobId)` | `active.size < concurrency`이면 즉시 `active.add(jobId)` + `startedOrder.push(jobId)` + `startCounts` 증가(**동기, microtask 지연 없음** — test.js:109-110 `activeCount`/`pendingCount`가 호출 직후 동기적으로 관찰됨을 근거). 아니면 `queue.push(jobId)`. |
| `settle(jobId, status, value)` | `active.delete(jobId)` + `settled.set(jobId, {status, value})` → `queue`에 남은 항목이 있고 `active.size < concurrency`이면 `queue.shift()`를 `active`로 승격(FIFO, **동일 tick으로 취급** — 실제 구현도 job 정산 자체가 이미 promise 정산이라 최소 1 microtask는 걸리므로 모델·실제 둘 다 "정산 후 microtask flush 시점"에 비교). |
| `clearQueue(reason)` | `removed = queue.length`; `rejectOnClear`가 `true`이면 각 `queue` 항목을 `reason`(인자로 명시된 경우) 또는 기본 `AbortError`로 reject 처리하고 `settled`에 기록, `rejectOnClear`가 `false`이면 인자로 `reason`이 **명시**된 경우(`undefined`가 아닌 모든 값 — `null`/`0`/`false` 포함, test.js:377-417 근거)만 그 `reason`으로 reject, 인자가 없으면 조용히 버림(정산 기록 없음); `queue = []`; **동기** 처리, `active`는 변경하지 않는다. 반환값은 `removed`(test.js:257-272, 267-268 `removed` 반환값 근거). |
| `setConcurrency(n)` | `concurrency = n`; `queue`에 남은 항목이 있고 `active.size < concurrency`인 동안 `queue.shift()`를 승격 — 단, **이 승격은 실제 구현에서 microtask 지연**이 있으므로(test.js:888-889), 모델과 실제 값을 비교할 때는 `SET_CONCURRENCY` 직후가 아니라 그 다음 `FLUSH_MICROTASK` 이후로 미룬다(§6). |
| `startMap(iterableSpec)` | `mapInFlight += 1`; 내부적으로 iterable의 각 원소를 `enqueue`와 동일한 규칙으로 소비(동기 iterable은 즉시 전개, 비동기 iterable은 lazy 소비 — test.js:559-584 "lazily consumes" 근거)하고, 전체가 settle되면 `mapInFlight -= 1`. |
| `waitIdle()` | `idleWaiterCount += 1`; `isIdle()`이 이미 참이면 즉시 감소(등록되지 않은 것으로 취급) — `isIdle() ⟺ active.size === 0 && queue.length === 0 && mapInFlight === 0`(F68F701A7A-16 명세의 3-조건 predicate와 동일, docs/design/onidle-api-F68F701A7A-16.md §1 근거). |

## 불변식 (Invariants) — AC 9개 항목 1:1 매핑

| ID | 불변식 | 참조 모델 측 검증식 | 실제 `limit` 측 관찰식 | 체크 시점 |
|---|---|---|---|---|
| I1 | `activeCount <= concurrency` | `model.active.size <= model.concurrency` | `limit.activeCount <= limit.concurrency` | 매 스텝(op) 적용 후 항상 |
| I2 | `pendingCount` 일치 | — | `limit.pendingCount === model.queue.length` | 매 스텝 후(단, `SET_CONCURRENCY` 직후는 §6에 따라 1 microtask 유예) |
| I3 | FIFO 시작 순서 | `model.startedOrder` | job 본문이 자신의 id를 직접 기록한 `realStartedOrder` 배열(§6) | 시퀀스 종료 시 전체 비교 + 중간에도 두 배열의 공통 prefix 길이만큼은 계속 일치해야 함 |
| I4 | job당 최대 1회 시작 | `model.startCounts.get(id) <= 1` (all) | job 본문 내부 카운터(§6) `<= 1` (all) | 매 시작 이벤트마다, 최종적으로 전체 재확인 |
| I5 | `clearQueue` 범위 | `activeCount` 불변, `removed === pendingCountBefore` | `limit.activeCount`는 `clearQueue()` 호출 전후 불변, `limit.clearQueue()` 반환값 `=== pendingCountBefore` | `CLEAR_QUEUE`/`CLEAR_QUEUE_REASON` 직후(동기) |
| I6 | Promise 정산 | 모든 enqueue된 job이 `settled`에 정확히 1건 존재 | 각 job이 반환한 promise가 `Promise.allSettled` 기준 정확히 1회 fulfilled/rejected | 시퀀스 종료(drain) 후 전체 |
| I7 | `onIdle()` 완료 조건 | waiter는 `isIdle()`이 참이 되는 시점에만 resolve로 취급 | `onIdle()`이 반환한 promise가 그 이전에는 resolve되지 않고(§6 `isStillPending` 패턴, test.js:988-989), `isIdle()` 전이 시점에 정확히 resolve | `WAIT_IDLE` 등록 이후 매 스텝, 최종 drain 시 |
| I8 | 종료 시 count 0 수렴 | `active.size === 0 && queue.length === 0` | `limit.activeCount === 0 && limit.pendingCount === 0` | 시퀀스 종료(모든 job 정산 완료) 후 |
| I9 | unhandled rejection 0 | (모델에는 해당 없음 — 모델은 promise를 실제로 만들지 않음) | 시퀀스 실행 전체 구간 동안 `process`의 `unhandledRejection` 이벤트가 0회 발생 | 시퀀스 실행 전 리스너 등록 → 종료 후 카운트 확인 |

## Seed 기반 Operation 시퀀스 생성

### PRNG (인라인, 신규 의존성 없음)

```js
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- 입력: 32비트 정수 `seed`. 출력: `[0, 1)` 균등분포 난수를 생성하는 결정적 함수.
- 동일 `seed` → 항상 동일한 난수열 → 항상 동일한 operation 시퀀스. 이 함수 자체가 이 명세의
  "결정론" 제약의 근거다.

### Operation 어휘 (opcode)

| opcode | 파라미터 | 사전조건(생성 시 필터) | 설명 |
|---|---|---|---|
| `PUSH_RESOLVE` | 없음(항상 valid) | 없음 | 나중에 `SETTLE`로 수동 resolve될 job을 enqueue |
| `PUSH_REJECT` | 없음 | 없음 | 나중에 `SETTLE`로 수동 reject될 job을 enqueue(async reject) |
| `PUSH_SYNC_THROW` | 없음 | 없음 | 스케줄러가 시작하는 즉시 동기적으로 throw하는 job(test.js:67-85 근거) — 별도 `SETTLE` 불필요, 시작=정산 |
| `SETTLE(jobId)` | 대상 jobId | 현재 `active`이며 아직 정산되지 않은 `PUSH_RESOLVE`/`PUSH_REJECT` job이 1개 이상 존재 | 지정(또는 후보 중 seed로 선택한) job의 deferred resolve/reject 콜백을 실제로 호출 |
| `SET_CONCURRENCY(n)` | `n ∈ {1,2,3,5}` | 없음 | `limit.concurrency = n` |
| `CLEAR_QUEUE` | 없음 | 없음(빈 큐에서도 valid — no-op 케이스 커버) | `limit.clearQueue()` |
| `CLEAR_QUEUE_REASON(reason)` | `reason ∈ {new Error('x'), 'string-reason', null, 0, {code:'X'}}` | 없음 | `limit.clearQueue(reason)` |
| `START_MAP(size, failAtIndex\|null, kind)` | `size∈[1,6]`, `failAtIndex`는 실패 없음 또는 `[0,size)`, `kind∈{sync-iterable, async-iterable}` | 없음 | `limit.map(iterable, mapper)` 시작 — 내부 원소들은 각각 `PUSH_RESOLVE`류와 동일하게 취급되되 `SETTLE`은 고정 지연 없이 harness가 즉시 트리거(원소별 개별 `SETTLE_MAP_ITEM` 서브 오퍼레이션, 아래 참고) |
| `WAIT_IDLE` | 없음 | 없음 | `limit.onIdle()` 호출, 반환 promise를 waiter 목록에 등록 |
| `FLUSH_MICROTASK` | 없음 | 없음 | `await Promise.resolve()` — 실제 스케줄러의 microtask 지연 승격(§6)을 모델과 동기화하기 위한 tick |

- `START_MAP`으로 생긴 개별 원소는 opLog상 별도 엔트리로 펼치지 않고 `START_MAP`의 파라미터
  (`size`, `failAtIndex`, `kind`)만으로 전체가 재현 가능해야 한다 — mapper는 harness가 정의하는
  고정 함수(예: `index === failAtIndex`면 reject, 아니면 즉시 resolve하되 `FLUSH_MICROTASK` 몇 회
  후 정산)로, **PRNG 추가 소비 없이** 결정론적으로 동작한다.

### 시퀀스 생성 알고리즘

1. seed로부터 `rng = mulberry32(seed)`를 만든다.
2. `rng()`로 초기 `concurrency ∈ {1,2,3,5}`와 `rejectOnClear ∈ {true, false}`를 결정한다(limiter
   구성 축 — `rejectOnClear`는 생성 후 불변이므로 시퀀스 전체에서 고정).
3. `rng()`로 시퀀스 길이 `L ∈ [20, 60]`을 결정한다.
4. `L`번 반복하며 각 스텝마다:
   - 현재 모델 상태 기준으로 **사전조건을 만족하는 opcode 후보 집합**을 계산한다(`SETTLE`은
     정산 가능한 job이 있을 때만 후보에 포함, 나머지는 항상 후보).
   - 가중치 테이블(`PUSH_* 40%, SETTLE 20%, CLEAR_QUEUE* 15%, SET_CONCURRENCY 10%, WAIT_IDLE 10%,
     START_MAP 5%`)로 `rng()` 결과를 후보 집합 안에서 정규화해 opcode를 뽑는다. 후보가 비어있는
     opcode 그룹은 자동 제외(예: `SETTLE` 후보가 없으면 나머지 그룹 비중으로 재정규화).
   - 필요한 파라미터(`n`, `reason` 종류, `size` 등)도 `rng()`로 추가 결정한다.
   - 선택된 op를 모델에 전이시키고, opLog에 `{index, opcode, params}`로 append한다.
5. 시퀀스 끝에 고정 `DRAIN` 종료 절차(옵코드 아님, 러너 고정 로직)를 붙인다: 아직 미정산인 모든
   job에 대해 `SETTLE`을 강제로 적용하고 `FLUSH_MICROTASK`를 안정될 때까지(최대 8회) 반복한 뒤
   I6/I8/I9를 최종 확인한다.

### 실행 매트릭스

- seed 목록은 **고정 상수 배열**로 관리한다(예: `const SEEDS = Array.from({length: 40}, (_, i) => i + 1)`
  — `Math.random()`으로 매 실행 다른 seed를 뽑지 않는다. 이것이 "결정론" 제약의 실행 측 근거다.
- 각 seed는 §5-2에서 결정되는 `(concurrency, rejectOnClear)` 조합을 포함하므로 별도의 곱집합
  순회는 불필요하다 — seed 자체가 구성까지 결정론적으로 포함한다.

## 비교 타이밍 규칙 (§6)

- **동기 비교 가능**: `enqueue`(PUSH_*), `clearQueue`/`clearQueue(reason)` 직후에는 실제 `limit`도
  동기적으로 값을 반영하므로(test.js:109-110, 192-193, 267-268 등) 호출 직후 바로 I1/I2/I5를
  비교한다.
- **microtask 유예 필요**: `SET_CONCURRENCY`로 인한 대기열 승격은 microtask 지연이 있다(test.js:888-889
  주석 근거) — `SET_CONCURRENCY` 스텝 자체는 `FLUSH_MICROTASK`를 시퀀스에 별도로 끼워 넣지
  않으며, **다음에 오는 `FLUSH_MICROTASK`(자연 발생분 또는 러너가 매 스텝 뒤에 삽입하는 1회
  기본 microtask flush) 이후에** I1/I2를 비교한다. 즉 러너는 매 스텝 적용 후 **기본으로 1회
  `await Promise.resolve()`를 삽입**하고, 그 다음에 invariants를 체크하는 것을 표준 루프로
  삼는다(별도 opcode `FLUSH_MICROTASK`는 "추가로 여러 tick을 강제로 늘리고 싶을 때"를 위한
  명시적 추가 수단).
- **FIFO/최대 1회 시작 관찰(I3/I4)**: job 본문 자체가 스케줄러에 의해 호출되는 순간 자신의 id를
  `realStartedOrder.push(jobId)`하고 `realStartCounts.set(jobId, (get(jobId)||0)+1)`을 수행한다
  (test.js의 `running.push(value)`류 계측 패턴과 동일한 방식, test.js:732-736 근거) — 라이브러리
  내부를 훅킹하지 않고 harness가 제공하는 job 함수 자체의 부수효과로 관찰한다.
- **unhandled rejection(I9)**: 시퀀스 실행 시작 전 `process.on('unhandledRejection', handler)`를
  등록해 카운터를 증가시키고, 종료 후 리스너를 제거하며 카운터가 0인지 확인한다. `PUSH_REJECT`/
  `CLEAR_QUEUE`(reject 유발)로 생성되는 모든 promise는 러너가 즉시 `.catch()` 또는
  `Promise.allSettled` 대상 배열에 등록해 두어야 한다 — "아직 아무도 참조하지 않는 rejected
  promise가 한 tick이라도 존재"하지 않도록 enqueue 시점에 바로 등록한다.

## Edge Case → Operation 매핑 (AC 10개 항목 커버리지)

| # | Edge Case | Operation 조합 | 검증 불변식 |
|---|---|---|---|
| 1 | 빈 queue | 시퀀스에 `CLEAR_QUEUE`만 있고 사전 `PUSH_*` 없음(seed 중 최소 1개는 이 케이스를 강제 생성 — 길이 0~1 특수 시퀀스를 seed 목록과 별개로 고정 케이스로 추가) | I5(`removed === 0`) |
| 2 | sync throw | `PUSH_SYNC_THROW` 다음에 오는 `PUSH_RESOLVE`가 정상적으로 시작되는지 | I3, I4, I6 |
| 3 | async reject | `PUSH_REJECT` → `SETTLE(jobId)`(reject 트리거) | I6(rejected 기록), I9(unhandled 없음) |
| 4 | concurrency 동적 증감 | `SET_CONCURRENCY(낮은값)` → 여러 `PUSH_RESOLVE` → `SET_CONCURRENCY(높은값)` → `FLUSH_MICROTASK` | I1, I2, I3(승격 순서 FIFO 유지) |
| 5 | clearQueue 반복 | `CLEAR_QUEUE` 연속 2회(두 번째는 pending 0 상태, `removed===0`) | I5 |
| 6 | rejectOnClear true/false | 시퀀스 구성 축 자체(§5-2)에서 두 값 모두 seed 목록에 고르게 등장하도록 가중치 조정(각 값이 `SEEDS` 중 최소 40% 이상 등장하도록 생성 후 검산) | I5, I6 |
| 7 | reason 유무 | `CLEAR_QUEUE`(인자 없음) vs `CLEAR_QUEUE_REASON(reason)`(Error/string/null/falsy/object 각각) | I5, I6 |
| 8 | 다중 onIdle waiter | `WAIT_IDLE` 연속 2~3회 호출 후 전체 drain | I7(모두 동일 전이 시점에 resolve) |
| 9 | AsyncIterable map 중 오류 | `START_MAP(size, failAtIndex=k, kind='async-iterable')` | I3, I4(개별 draw), I6(map 자체는 reject) |
| 10 | 재사용 | 한 시퀀스가 I8을 만족(완전 drain)한 뒤에도 러너가 종료하지 않고 이어서 새 `PUSH_RESOLVE`를 주입하는 "확장 시퀀스"(seed 목록 중 일부는 `DRAIN` 후 추가 `L2 ∈ [5,15]` 스텝을 이어 붙임) | I1~I9 전체(리셋 없이 동일 인스턴스로 계속 검증) |

## 실패 재현 (Reproduction) 출력 방식

실패 시 반드시 아래 필드를 포함해 실패 메시지를 구성한다(AVA `t.fail(message)` 사용):

- `seed`: 해당 시퀀스를 생성한 정수 seed
- `stepIndex`: 불일치가 감지된 opLog 인덱스(0-based, `DRAIN` 단계는 `L`로 표기)
- `invariantId`: 위반된 불변식 ID(`I1`~`I9`)
- `expected` / `actual`: 참조 모델 값과 실제 관찰값
- `config`: `{concurrency, rejectOnClear}` (시퀀스 시작 시 고정된 구성)
- `opLog`: `0..stepIndex`까지 실행된 `{opcode, params}` 배열 전체(재현에 필요한 전체 prefix)

```js
t.fail(
  `seed=${seed} step=${stepIndex} invariant=${invariantId} `
  + `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} `
  + `config=${JSON.stringify(config)} ops=${JSON.stringify(opLog)}`,
);
```

- **재현 절차**: seed + `config`만으로도 §5 생성 알고리즘을 다시 돌리면 동일한 전체 시퀀스가
  재생성되지만(PRNG가 결정론적이므로), `opLog`를 실패 메시지에 그대로 남겨두는 이유는 "이후 생성
  알고리즘이 수정되어도 실패 **당시**의 정확한 시퀀스"를 안전망으로 보존하기 위함이다 — 디버깅
  시에는 `opLog`를 그대로 재생(replay)해 `stepIndex`까지만 실행하면 된다.
- seed 목록은 §5 실행 매트릭스에서 정의한 고정 상수 배열을 사용하므로, CI에서 실패한 seed 번호를
  그대로 로컬에서 `SEEDS`에 해당 값 하나만 남겨 재실행하는 것으로 재현이 가능하다.
- shrinking(실패 시퀀스 자동 축소)은 본 명세의 범위 밖이다(§Out of scope) — 최초 버전은
  seed+stepIndex+opLog 재현만 보장한다.

## 복잡도/성능 예산

- 시퀀스당 실제 소요 시간은 microtask 처리 비용뿐이다(실제 timer 미사용) — `L∈[20,60]` ×
  `SEEDS.length≈40` 규모에서 5초 예산 안에 충분히 여유가 있을 것으로 예상되나, 정확한 상한은
  developer가 실측 후 `L`/`SEEDS.length`를 조정한다(가이드 시작값: `L≈20~60`, seed 수 `≈40`).
- 매 스텝 invariant 체크는 O(1)(`activeCount`/`pendingCount`/`Set.size` 비교) 또는 O(k)(`opLog`
  길이 k에 비례하는 배열 비교, I3/I4는 시퀀스 종료 시 1회만 O(k)로 수행) — 시퀀스 길이에 대해
  선형 이상으로 증가하지 않는다.

## Out of scope (본 작업에서 명세하지 않음)

- fast-check 등 property-based 테스트 라이브러리 도입 — 신규 의존성 제약 위반이므로 금지.
- 실패 시퀀스 자동 축소(shrinking) 알고리즘 — 후속 과제.
- `limitFunction()` 자체의 상태 머신 테스트 — 위임 검증은 기존 개별 테스트로 충분하다고 판단,
  범위 밖.
- 실제 wall-clock 기반 동시성 타이밍 테스트(test.js의 `concurrency: 1`/`concurrency: 4` 같은
  기존 시나리오) — 그대로 유지, 본 설계로 대체하지 않는다.
- 멀티 프로세스/워커 환경에서의 스케줄러 동작 — 단일 프로세스 결정론 테스트만 다룬다.

## 마이그레이션/검증 체크리스트 (developer 대상)

- [ ] `SEEDS` 배열은 상수로 고정되며 `Math.random()`을 어디에도 사용하지 않는다.
- [ ] 모든 job 함수(PUSH_*, map mapper)는 `delay(ms)` 대신 harness가 제어하는 deferred
      resolve/reject만 사용한다(`SETTLE` 전까지 절대 자체적으로 정산되지 않아야 함).
- [ ] `SET_CONCURRENCY` 이후 invariant 비교는 최소 1회 `await Promise.resolve()` 이후에
      수행한다(§6).
- [ ] `process.on('unhandledRejection', ...)` 리스너가 시퀀스마다 등록/해제되어 누적되지 않는다
      (다음 시퀀스로 카운터가 새어나가지 않도록 `afterEach` 또는 시퀀스 시작/종료 시점에 초기화).
- [ ] 실패 메시지에 `seed`/`stepIndex`/`invariantId`/`expected`/`actual`/`config`/`opLog`가 모두
      포함된다(§실패 재현).
- [ ] 기존 `test.js`의 모든 테스트는 본 신규 테스트 추가와 무관하게 변경 없이 통과한다(순수
      추가 테스트 파일이며 `index.js`를 건드리지 않으므로 회귀 없음이 자명해야 함).
- [ ] 전체 신규 스위트 실행 시간이 5초를 넘지 않는다(로컬 실측 후 `L`/seed 수 조정).

## 구현자 착수 요약

1. `mulberry32(seed)` 인라인 구현 + `SEEDS` 상수 배열 정의.
2. 참조 모델 클래스/팩토리 함수(§ 참조 모델) 구현 — `index.js`를 import하지 않는 순수 객체.
3. opcode 테이블(§5) 그대로 시퀀스 생성기 구현.
4. 러너: 매 스텝마다 `(모델 전이, 실제 `limit` 호출)`을 함께 수행 → 1회 기본 `await
   Promise.resolve()` → I1/I2(+해당 시 I5/I7) 비교 → 시퀀스 종료 시 `DRAIN` 절차 → I3/I4/I6/I8/I9
   최종 비교.
5. 불일치 시 §실패 재현 포맷으로 `t.fail(...)` 1회 호출(첫 불일치에서 즉시 중단 — 이후 스텝은
   실행하지 않는다, 파생 오류로 인한 노이즈 방지).
