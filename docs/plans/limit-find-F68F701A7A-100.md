# limit.find 실행 설계 (Execution Blueprint) — F68F701A7A-100

동결 상태: **FROZEN**
producer: planner (F68F701A7A-103)
consumers: designer(F68F701A7A-101), developer(F68F701A7A-102), tester(F68F701A7A-105)
frozen interface: `planning-contract@v1`

> 본 문서는 `limit.find(iterable, predicate)`의 공개 API·타입·동작 불변식·검증 범위를
> 동결한다. designer/developer는 아래 계약을 재정의하지 않고 그대로 따른다.
> `find`는 **additive** 이며 기존 `map`/`mapSettled`/`filter`/`clearQueue`/`concurrency`
> 동작을 변경하지 않는다.

---

## 0. 배경 · 설계 근거

`limit`은 이미 `map`(전체 수집), `mapSettled`(전체 settle 수집), `filter`(조건 통과분 수집)를
동일한 lazy(async)/eager(sync) draw 엔진 위에 additive 로 제공한다. `find`는 여기에
**"입력 순서상 첫 일치 1건에서 조기 종료"** 라는 새로운 aggregation 을 추가한다.

`find`가 `map`/`filter` 와 본질적으로 다른 점:

- `filter`/`map`은 **모든** 항목의 predicate/mapper 결과를 소비해야 결과가 확정된다.
- `find`는 **입력 순서상 가장 앞선 일치 index 가 확정되는 즉시** 결과가 결정되며, 그
  이후 항목은 더 이상 draw 하지 않는다.

따라서 `find`는 `mapAsyncIterable`(전량 소비)을 그대로 재사용할 수 없고, 조기 종료를
지원하는 **bounded draw 스케줄러**가 필요하다(§5 구현 지침). 단, draw/scheduling/cleanup
불변식은 기존 `mapAsyncIterable` 을 모델로 삼아 동일한 원칙을 따른다.

---

## 1. 공개 API · 타입 시그니처 (동결)

### 1.1 시그니처

```
limit.find(iterable, predicateFunction) => Promise<Input | undefined>
```

- `iterable`: `Iterable<Input> | AsyncIterable<Input>`
- `predicateFunction`: `(input: Input, index: number) => PromiseLike<boolean> | boolean`
- 반환: 입력 순서상 **첫 일치 항목의 원본 값**(`Input`). 일치 항목이 없으면 `undefined`.

### 1.2 `index.d.ts` 반영 형태 (동결)

`LimitFunction` 과 `LimitedFunction` **양쪽** 타입에 아래 멤버를 추가한다. 시그니처는
두 타입에서 동일하다.

```ts
/**
Process an iterable or async iterable of inputs with limited concurrency, resolving to the
first input item (in input/draw order) whose predicate resolves truthy.

The predicate function receives the item value and its index, and may be synchronous or
asynchronous. An item matches when the predicate's return value (awaited if a promise) is
truthy, matching `Array.prototype.find`.

The resolved value is the original input item (not the predicate's boolean), chosen by the
lowest input index — independent of the order in which predicates complete. Resolves to
`undefined` when no item matches.

Once the first-matching index is confirmed, no further items are drawn from the iterable and
predicates that have not started are never started. Predicates already in flight are allowed
to settle so they never surface as unhandled rejections; for an async iterable the iterator's
`return()` is called once for cleanup.

Like `map`/`filter` (and unlike `mapSettled`), a predicate rejection is fatal before the call
settles: it rejects the returned promise with that reason and stops drawing new items.

Async iterables are consumed lazily: the next value is only pulled when a concurrency slot
frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes
it safe to pass infinite or streaming async iterables.

@param iterable - An iterable or async iterable containing an argument for the given predicate.
@param predicateFunction - Predicate function returning a boolean (or a promise for one).
@returns A promise resolving to the first matching input item, or `undefined`.
*/
find: <Input> (
	iterable: Iterable<Input> | AsyncIterable<Input>,
	predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
) => Promise<Input | undefined>;
```

`LimitedFunction`(= `limitFunction()` 반환) 쪽 `find`는 **underlying limiter 의 `find` 로
위임(delegate)** 하며 스케줄링/aggregation 로직을 중복 구현하지 않는다(기존 `filter`/
`subscribe` delegation 패턴과 동일).

---

## 2. 동작 불변식 (동결 · 각 항목은 검증 가능한 조건)

### INV-1. 입력 순서 기준 첫 일치 반환

- 결과는 predicate 가 truthy 로 resolve 된 항목 중 **입력(draw) index 가 가장 작은** 항목의
  원본 값이다. predicate **완료 순서와 무관**하다.
- 검증(G/W/T):
  - Given `concurrency >= 2`, 입력 `[a, b]`, `predicate(a)`는 느리게 truthy, `predicate(b)`는
    빠르게 truthy 로 resolve.
  - When `await limit.find([a, b], p)`.
  - Then 반환값은 `a` (더 늦게 완료돼도 index 가 작으므로 승리).

### INV-2. 결과 확정 후 조기 종료 (새 항목 소비 중단)

- 입력 순서상 첫 일치 index 가 **확정**되면(= 그보다 작은 index 의 predicate 가 하나도
  미확정 상태로 남아있지 않음), 반환 promise 가 resolve 되고 이후 iterable 에서 **새 항목을
  draw 하지 않으며 아직 시작되지 않은 predicate 는 시작되지 않는다.**
- 확정 규칙:
  - `matchIndex` = 지금까지 truthy 로 확인된 index 중 최솟값.
  - `matchIndex` 가 존재하면 그보다 큰 index 는 결과가 될 수 없으므로 **새 draw 를
    전면 중단**(모든 신규 draw 의 index 는 기존보다 크다).
  - `values[matchIndex]` 로 resolve 하는 시점 = `matchIndex` 보다 작은 index 의 in-flight
    predicate 가 **모두 settle** 된 순간(없으면 즉시).
  - 대기 중 더 작은 index 가 truthy 로 resolve 되면 `matchIndex` 를 하향 갱신한다.
- 검증(G/W/T):
  - Given async iterable 이 draw 될 때마다 카운터를 올리고, index 2 항목이 처음으로 truthy.
  - When `await limit.find(iter, p)`.
  - Then 반환값은 index 2 항목이고, iterable 에서 draw 된 총 항목 수는
    `concurrency` 를 고려한 상한 이내이며 index 2 이후 항목은 draw 되지 않는다
    (무한/스트리밍 async iterable 이 hang 없이 종료).

### INV-3. 이미 시작된 predicate 의 완주·정리 (unhandled rejection 방지)

- 결과 확정으로 call 이 이미 settle 된 뒤라도, **이미 시작된 predicate 는 끝까지 진행**되며
  그 이후의 resolve/reject 결과는 **swallow** 되어 unhandled rejection 을 만들지 않는다.
- async iterable 의 조기 종료 시 iterator 의 `return()` 이 존재하면 **정확히 1회** 호출된다
  (`for await...of` 의 조기 이탈 자원 해제와 동일, 기존 `mapAsyncIterable.finalizeReject`
  패턴과 정합).
- 검증(G/W/T):
  - Given `concurrency >= 3`, index 0 이 truthy 로 먼저 확정되고, index 1/2 predicate 가
    이후 reject.
  - When `await limit.find(...)`.
  - Then call 은 index 0 값으로 resolve 되고, index 1/2 의 이후 reject 는 process 의
    unhandled rejection 을 유발하지 않는다(테스트에서 `notThrowsAsync` + microtask flush 로
    가드).

### INV-4. sync / async iterable 소비 중단

- async iterable: lazy 소비(§INV-6). 결과 확정 시 draw 중단 + `return()` 1회.
- sync iterable: **lazy bounded 소비**로 통일한다. `find`는 신규 메서드이므로 보존해야 할
  기존 timing 이 없고, 조기 종료를 sync 에서도 관찰 가능하게 하려면 전량 materialize 를
  피해야 한다. 따라서 sync iterable 도 iterator 에서 한 번에 최대 `concurrency` 개만 pull 하며,
  결과 확정 시 남은 항목을 pull 하지 않는다.
  - 근거(설계 결정): `map`/`filter`/`mapSettled` 의 sync eager 경로는 backward-compat timing
    보존이 목적이지만, `find` 에는 보존 대상 legacy 가 없고 조기 종료가 핵심 가치이므로 sync/
    async 를 단일 lazy 경로로 둔다.
- 검증(G/W/T):
  - Given lazy 하게 값을 만들어내는 sync generator(`function*`)로 side-effect 카운터를 노출.
  - When index 1 이 첫 일치.
  - Then index 2 이후 값은 generator 에서 pull 되지 않는다(카운터로 확인).

### INV-5. predicate rejection 시 전체 호출 reject

- call 이 아직 settle 되지 않은 시점에 **어떤** predicate 든 reject 하면, 반환 promise 를
  그 reason 으로 **즉시 reject** 하고 새 항목 draw 를 중단하며 async iterator `return()` 을
  1회 호출한다(`map`/`filter` 와 동일, `mapSettled` 와 반대).
- 이미 settle(resolve/reject) 된 이후의 predicate reject 는 §INV-3 에 따라 swallow.
- 검증(G/W/T):
  - Given 첫 항목 predicate 가 reject.
  - When `limit.find(...)`.
  - Then 반환 promise 가 동일 reason 으로 reject(`t.throwsAsync` 로 reason 일치 확인)되고,
    async iterable 이면 `return()` 이 1회 호출된다.

### INV-6. concurrency 정책 준수

- 임의 시점에 "draw 되었으나 아직 settle 되지 않은" predicate 수 ≤ 현재 `concurrency`.
- 각 predicate 는 기존 `generator` 스케줄링 경로를 통과하므로 `activeCount <= concurrency`
  불변식은 limiter 자체가 강제한다(중복 스케줄링 금지).
- 실행 중 `concurrency` 상향 시 추가 draw 를 승격하는 동작은 기존 `mapSchedulers` 재기동
  메커니즘과 정합해야 한다(단, 이미 결과가 확정된 뒤에는 추가 draw 하지 않는다 — §INV-2).
- 검증(G/W/T):
  - Given `concurrency = 2`, 다수 항목이 모두 느리게 falsy 후 마지막이 truthy.
  - When `find` 진행 중 `limit.activeCount` 관측.
  - Then 관측된 최대 in-flight 수 ≤ 2.

### INV-7. pause / resume 상호작용

- `pause()` 상태에서는 **새 predicate 를 draw/시작하지 않는다**(스케줄러가 `paused` 를
  존중, 기존 `mapAsyncIterable.schedule` 의 `paused` 가드와 동일).
- 이미 실행 중인 predicate 는 paused 상태에서도 정상 settle 된다. 따라서 실행 중인
  predicate 만으로 첫 일치 index 가 확정 가능하면 **paused 상태에서도 `find` 는 resolve 될
  수 있다**(running task 는 pause 와 무관하게 settle 되는 기존 semantics 와 정합).
- `resume()` 시 보류된 draw 가 재기동되어 정상 스케줄링을 회복한다.
- 검증(G/W/T):
  - Given `concurrency = 1`, `pause()` 후 `find` 호출, 이후 `resume()`.
  - When resume 전/후 관측.
  - Then resume 전에는 어떤 predicate 도 시작되지 않고(첫 항목 side-effect 없음), resume
    후 draw 가 시작되어 정상적으로 resolve 된다.

### INV-8. clearQueue 상호작용

- `find` 의 predicate 는 `generator` 경로로 enqueue 되므로, 시작 전 pending 상태에서
  `clearQueue(reason)` 대상이 될 수 있다. 이 경우 해당 predicate 의 내부 promise 가
  reject/discard 되는 기존 `clearQueue` semantics 를 그대로 따른다.
  - `clearQueue(reason)` 또는 `rejectOnClear` 로 pending predicate 가 **reject** 되면,
    그 reject 는 §INV-5 의 "predicate rejection" 과 동일하게 취급되어(아직 settle 전이면)
    `find` call 을 그 reason 으로 reject 한다.
  - `find` 는 `clearQueue` 를 **특수 처리하지 않는다**(additive · 기존 동작 불변). `find`
    내부에서 `clearQueue` 를 호출하지 않는다.
- 검증(G/W/T):
  - Given `concurrency = 1`, 첫 predicate 는 실행 중, 나머지는 pending 인 상태에서
    `limit.clearQueue(new Error('x'))` (또는 `rejectOnClear: true` + `clearQueue()`).
  - When pending predicate 가 reject.
  - Then 첫 predicate 가 아직 미확정이면 `find` 는 해당 reason 으로 reject 된다.

### INV-9. 경계 케이스

- 빈 iterable → `undefined` 로 resolve.
- 모든 predicate 가 falsy → `undefined` 로 resolve(모든 항목 소비 후, in-flight 0 시점).
- `predicate` 반환값은 JS truthiness 로 판정한다(`Array.prototype.find` 와 동일; boolean 이
  아니어도 truthy 면 일치로 간주 — 타입은 `boolean` 을 요구하지만 런타임 판정은 truthiness).
- `index` 는 0-based draw 순서이며 갱신은 draw 시점에 단조 증가한다.

---

## 3. 수정 허용 파일 (동결)

아래 5개 파일만 수정한다. 그 외 파일은 손대지 않는다.

| 파일 | 변경 내용 |
| --- | --- |
| `index.js` | `LimitFunction`(generator)의 `find` 메서드 정의 추가, `limitFunction`의 `find` delegation 추가. bounded draw 스케줄러(조기 종료 지원) 추가. 기존 `map`/`mapSettled`/`filter`/`clearQueue`/스케줄링 경로 변경 금지. |
| `index.d.ts` | `LimitFunction` · `LimitedFunction` 타입에 `find` 시그니처 추가(§1.2). |
| `test.js` | `find` 동작 불변식(INV-1..9) AVA 테스트 추가. |
| `index.test-d.ts` | `find` 반환 타입(`Promise<Input | undefined>`) 및 predicate 시그니처 tsd 타입 단언 추가. |
| `readme.md` | `### limit.find(iterable, predicateFunction)` API 섹션 추가. |

---

## 4. 검증 범위 (동결)

- test scope: **focused** — 단, `find` 는 공용 스케줄링 경로(`generator`/`resumeNext`/
  `mapSchedulers`)를 공유하므로 회귀 방지를 위해 **전체 test suite** 를 실행한다.
- 검증 명령: `npm test` (`xo` lint → `ava` 단위 테스트 → `tsd` 타입 테스트).
- 통과 기준:
  1. `find` 신규 AVA 테스트가 INV-1..9 를 커버하고 모두 통과.
  2. `index.test-d.ts` 가 `find` 반환/파라미터 타입을 단언하고 tsd 통과.
  3. 기존 `map`/`mapSettled`/`filter`/`clearQueue`/`concurrency`/`pause`/`subscribe` 테스트
     전부 그대로 통과(무회귀).
  4. `xo` lint 통과.

---

## 5. 구현 지침 (developer 참고 · 비규범적)

- `find` 는 `mapAsyncIterable`(전량 소비)을 **그대로** 재사용할 수 없다. 조기 종료를 위한
  전용 bounded 스케줄러가 필요하되, 아래 원칙을 기존 엔진과 정합되게 따른다:
  - 각 predicate 는 `generator(predicate, value, index)` 를 통해 실행하여 `concurrency`
    강제를 limiter 에 위임한다(중복 스케줄링 금지 — INV-6).
  - `paused` 가드, `drawing` 재진입 가드, `settled` 가드, `iterator.return()` 1회 cleanup 은
    `mapAsyncIterable` 의 패턴을 재사용한다(INV-3, INV-5, INV-7).
  - `mapSchedulers` 에 스케줄러를 등록/해제하여 concurrency 상향·resume 시 재기동되게 하고,
    settle 시 반드시 `mapSchedulers.delete(...)` + `notifyIdle()` 를 호출한다.
- sync iterable 은 `iterable[Symbol.iterator]()` 로 얻은 iterator 를 async 스케줄러와 동일한
  bounded 방식으로 소비한다(INV-4). 즉 sync/async 를 단일 draw 루프로 통합한다.
- 결과 확정 판정은 `matchIndex`(최소 truthy index)와 "matchIndex 보다 작은 in-flight 존재
  여부" 로 계산한다(INV-2). matchIndex 확정 후에는 새 draw 를 하지 않는다.
- `find` 는 additive 이며 `index.js` 의 기존 스케줄링/aggregation 코드를 수정하지 않는다.

---

## 6. designer 인계 사항

- 본 문서는 순수 라이브러리 동작 계약이며 **UI 디자인 시안은 없다**. designer 는 필요 시
  README API 문서의 문구/예제 톤을 기존 `map`/`filter` 섹션과 일관되게 정리하는 수준으로
  관여하며, §1/§2 의 공개 API·타입·동작 계약은 재정의하지 않는다.
