# `limit.mapSettled` 실행 설계 동결 (F68F701A7A-91)

> 본 문서는 planning-contract@v1 (`sha256:9d14c7ed3148e4066f6e599647324efd4c18c00fda81b6c895acac139f0f187b`)의
> runtime-artifact 이며, designer(F68F701A7A-89)·developer(F68F701A7A-90)·tester(F68F701A7A-93)가
> 추측 없이 따라야 하는 **동결된 인터페이스**입니다. 아래 시그니처·결과 형식·불변식은 downstream이 변경하지 않습니다.

---

## 0. 요약 (한눈에)

- 신규 공개 메서드 `limit.mapSettled(iterable, mapperFunction)` 를 **additive** 하게 추가한다.
- 기존 `limit.map` 과 동일한 인자 형태·순서 보존·lazy consumption 을 따르되,
  **개별 mapper 실패가 전체 호출을 reject 하지 않는다** (`Promise.allSettled` 호환).
- 결과는 입력(draw) 순서를 보존한 `Array<PromiseSettledResult<ReturnType>>` 이다.
- 수정 허용 파일: `index.js`, `index.d.ts`, `test.js`, `index.test-d.ts`, `readme.md` 로 한정한다.
- 추천 Skill 3종(Node.js ESM authoring, AVA, tsd)은 **미설치**이므로 사용을 전제로 삼지 않는다.

---

## 1. 사용자 시나리오

1. **부분 실패 허용 배치 처리**: 사용자는 URL 목록을 제한 동시성으로 fetch 하되, 일부 URL이 실패해도
   전체가 실패하지 않고 성공/실패를 각 항목별로 받고 싶다. 기존 `limit.map` 은 첫 실패에서 전체가 reject 되어
   `Promise.allSettled` 스타일 결과를 얻으려면 mapper 를 사용자가 직접 try/catch 로 감싸야 한다.
   `limit.mapSettled` 는 이 보일러플레이트를 제거한다.
2. **스트리밍/무한 async iterable**: 사용자는 async generator 로 흘러오는 입력을 O(concurrency) 만큼만
   in-flight 로 유지하며 각 항목의 성공/실패를 순서대로 수집하고 싶다.
3. **결과 집계**: 사용자는 반환된 settled 배열을 순회하며 `status` 로 성공/실패를 분기하고,
   실패 개수를 세거나 실패 reason 을 로깅한다.

---

## 2. 공개 API 시그니처 (동결)

### 2.1 런타임 시그니처

```js
limit.mapSettled(iterable, mapperFunction)
```

- `iterable`: `Iterable<Input>` 또는 `AsyncIterable<Input>` — 각 원소가 `mapperFunction` 의 입력.
- `mapperFunction(input, index)`: promise-returning/async 또는 동기 함수. `index` 는 draw 순서(0-based).
- 반환: `Promise<Array<PromiseSettledResult<ReturnType>>>` — 입력(draw) 순서를 보존한 settled 결과 배열.
- 인자 개수·순서·이름은 `limit.map` 과 **정확히 동일**하다 (`mapSettled(iterable, mapperFunction)`). 이 형태를 downstream이 변경하지 않는다.

### 2.2 `index.d.ts` 타입 형태 (동결)

`LimitFunction` 타입과 `LimitedFunction` 타입 **양쪽 모두**에 아래 멤버를 추가한다
(기존 `map` 은 `LimitFunction` 에만 있으나, `mapSettled` 는 `map` 과 짝을 이루므로 동일 위치에 추가한다.
`LimitedFunction` 에는 현재 `map` 이 없으므로, **`mapSettled` 도 `LimitFunction` 에만 추가**하여 기존
`map` 의 노출 범위와 대칭을 유지한다 — developer 는 `map` 이 선언된 타입에만 `mapSettled` 를 추가할 것).

```ts
/**
Process an iterable or async iterable of inputs with limited concurrency, settling every result.

Like {@link LimitFunction.map}, but individual mapper rejections never reject the returned
promise. Each element is reported as a `PromiseSettledResult`, so the result mirrors
`Promise.allSettled` while preserving input (draw) order.

Async iterables are consumed lazily: the next value is only pulled when a concurrency slot
frees up, so at most `concurrency` items are drawn but not yet settled at any time. Sync
iterables retain the eager behavior.

@param iterable - An iterable or async iterable containing an argument for the given function.
@param mapperFunction - Promise-returning/async function.
@returns A promise resolving to one `PromiseSettledResult` per input, in input (draw) order.
*/
mapSettled: <Input, ReturnType> (
	iterable: Iterable<Input> | AsyncIterable<Input>,
	mapperFunction: (input: Input, index: number) => PromiseLike<ReturnType> | ReturnType
) => Promise<Array<PromiseSettledResult<ReturnType>>>;
```

- 제네릭: `<Input, ReturnType>` — `map` 과 동일.
- 반환 타입: `Promise<Array<PromiseSettledResult<ReturnType>>>`.
  - `PromiseSettledResult<T>` 는 TypeScript 표준 라이브러리 내장 타입이므로 **직접 정의하지 않는다**
    (`lib.es2020.promise.d.ts` 제공). 새 타입 alias 를 만들지 말 것.
- mapper 반환은 `PromiseLike<ReturnType> | ReturnType` — 동기 반환도 허용 (`map` 과 동일).

---

## 3. 동작 정의

### 3.1 동기 iterable (eager 경로)

`Symbol.asyncIterator` 가 없으면 기존 `map` 의 eager 경로를 그대로 따르되 `Promise.all` 대신
`Promise.allSettled` 를 사용한다.

```js
const promises = Array.from(iterable, (value, index) => generator(function_, value, index));
return Promise.allSettled(promises);
```

- 모든 원소가 즉시 enqueue 되고, 각 mapper 는 기존 스케줄링 경로(`generator`)를 통과하므로
  `activeCount <= concurrency` 불변이 그대로 유지된다.
- `Promise.allSettled` 가 draw 순서(=배열 인덱스 순서)를 보존한다.

**예시 (동기 iterable):**

```js
const limit = pLimit(2);
const results = await limit.mapSettled([1, 2, 3], async n => {
	if (n === 2) {
		throw new Error('boom');
	}
	return n * 10;
});
// results === [
//   {status: 'fulfilled', value: 10},
//   {status: 'rejected',  reason: Error('boom')},
//   {status: 'fulfilled', value: 30},
// ]
```

### 3.2 async iterable (lazy 경로)

async iterable 은 `map` 의 `mapAsyncIterable` 과 동일하게 lazy 하게 소비하되,
**mapper 실패의 처리만 다르다**. 결과는 draw 인덱스로 저장되어 완료 순서와 무관하게 입력 순서를 보존한다.

핵심 규칙 (map 대비 차이):

| 이벤트 | `limit.map` (기존) | `limit.mapSettled` (신규) |
| --- | --- | --- |
| mapper 성공 | `results[i] = value` | `results[i] = {status:'fulfilled', value}` |
| **mapper 실패** | 전체 reject + iterator.return() | `results[i] = {status:'rejected', reason}` **후 계속 소비** |
| iterator.next() 실패 | 전체 reject + iterator.return() | 전체 reject + iterator.return() (동일) |
| iterator 소진 & in-flight 0 | resolve(results) | resolve(results) |

- **mapper 실패는 settled 결과로 기록하고 소비를 계속한다.** 개별 실패는 전체 호출을 reject 하지 않으며,
  `mapSchedulers` 에서 스케줄러를 제거하지도 않는다. 실패한 슬롯은 정상 완료와 동일하게 다음 draw 를 유발한다.
- **입력 iterable 자체(iterator.next())의 throw 는 전체 reject** 한다. 이는 `Promise.allSettled` 가
  이미 materialize 된 promise 배열을 받는 것과 달리 입력 소비 자체의 실패이며, `map` 과 동일하게
  `iterator.return()` 을 best-effort 1회 호출한 뒤 reject 한다. 이 경우에만 mapSettled 가 reject 된다.
- 결과 배열의 `length` 는 소비된 입력 개수와 같다 (성공/실패 무관하게 각 인덱스에 settled 항목 채움).

**예시 (async iterable, 부분 실패):**

```js
async function* source() {
	yield 'a';
	yield 'b'; // 실패 예정
	yield 'c';
}

const limit = pLimit(2);
const results = await limit.mapSettled(source(), async value => {
	if (value === 'b') {
		throw new Error('bad');
	}
	return value.toUpperCase();
});
// results === [
//   {status: 'fulfilled', value: 'A'},
//   {status: 'rejected',  reason: Error('bad')},
//   {status: 'fulfilled', value: 'C'},
// ]
```

### 3.3 순서 보존 불변식

- 성공/실패 여부, 완료(settle) 순서와 무관하게 결과 배열의 인덱스 `i` 는 항상 draw 순서 `i` 번째 입력에 대응한다.
- 이는 `map` 과 동일한 draw-index 저장 방식으로 보장한다.

---

## 4. 기존 계약 상호작용 (불변 유지 조건)

`mapSettled` 는 개별 mapper 를 기존 `generator()` 스케줄링 경로로 실행하므로, 아래 기존 계약을 **깨지 않는 additive 변경**만 허용한다.

### 4.1 concurrency (동시성)

- in-flight 는 항상 `<= concurrency`. lazy 경로는 `map` 과 동일하게 `mapSchedulers` Set 에 스케줄러를 등록하여,
  런타임 `concurrency` 상승 시 추가 draw 가 promote 되도록 한다.
- concurrency **상승** 시: `concurrency` setter 의 microtask drain 이 `mapSchedulers` 를 재-wake 하여
  새 한도까지 draw 를 늘린다 (기존 동작 그대로 재사용).
- concurrency **하강** 시: 이미 in-flight 인 task 는 그대로 완료되고, 새 draw 는 낮아진 한도를 따른다.

### 4.2 pause / resume

- `paused` 상태에서는 lazy 스케줄러(`schedule()`)의 `paused` 가드에 의해 새 draw 가 멈춘다
  (mapper 실패로 인한 재-draw 도 동일하게 멈춤). 이미 in-flight 인 task 는 정상 settle 된다.
- `resume()` 시 `mapSchedulers` 를 순회해 draw 를 재개한다 (기존 동작 재사용).
- **불변**: pause 는 이미 실행 중인 mapper 를 취소하지 않는다. mapSettled 는 이 시맨틱을 변경하지 않는다.

### 4.3 clearQueue

- `clearQueue(reason)` 는 **아직 시작되지 않은 pending 큐 항목**만 제거한다. `mapSettled` 의 각 draw 는
  `generator()` 를 통해 큐에 들어가므로, 아직 start 되지 않은 mapSettled task 도 clearQueue 대상이 될 수 있다.
- 이 경우 해당 task 의 내부 promise 는 `rejectOnClear`/`reason` 규칙에 따라 reject 되며, 그 rejection 은
  `mapSettled` 의 lazy 경로 `runTask` 의 catch 에서 **해당 인덱스의 `{status:'rejected', reason}` 로 기록**된다.
  즉 clearQueue 로 인한 실패도 개별 settled 결과로 흡수되고 전체 mapSettled 는 reject 되지 않는다.
- **불변**: `clearQueue` 의 반환값(제거된 pending 개수)·이미 실행 중인 task 미영향·`notifyListeners`/`notifyIdle`
  emission 조건은 변경하지 않는다.

### 4.4 onIdle / isIdle / subscribe

- lazy `mapSettled` 도 `map` 과 동일하게 `mapSchedulers` 에 등록되므로, draw 가 진행 중인 동안 limiter 는
  idle 로 판정되지 않는다 (`isIdle` 의 `mapSchedulers.size === 0` 조건 재사용).
- `subscribe` 스냅샷/emission 시맨틱은 변경하지 않는다 (mapSettled 는 별도 transition 을 새로 정의하지 않고
  기존 enqueue/start/settle transition 만 사용).

### 4.5 additive 무결성

- 기존 `limit.map`, async iterable lazy consumption, pause/resume, concurrency 변경, clearQueue,
  subscribe/onIdle 계약을 **깨뜨리지 않는다**. `mapSettled` 미사용 코드의 타이밍·settle 시맨틱은 100% 동일하다.

---

## 5. 수정 허용 파일 (동결) 과 focused 테스트 범위

### 5.1 수정 허용 파일 (이 목록으로 한정)

| 파일 | 변경 내용 |
| --- | --- |
| `index.js` | `Object.defineProperties(generator, {...})` 에 `mapSettled` value 메서드 추가. lazy 경로는 `mapAsyncIterable` 패턴을 재사용하되 mapper 실패를 settled 결과로 흡수하는 변형을 추가 (또는 공통 헬퍼에 `settleMode` 분기). 동기 경로는 `Promise.allSettled` 사용. |
| `index.d.ts` | `LimitFunction` 타입에 `mapSettled` 멤버 추가 (§2.2). |
| `test.js` | AVA 테스트 추가 (§5.3). |
| `index.test-d.ts` | tsd 타입 테스트 추가 (§5.3). |
| `readme.md` | `### limit.map(...)` 섹션 바로 뒤에 `### limit.mapSettled(iterable, mapperFunction)` 섹션 추가. `Promise.allSettled` 호환 결과·부분 실패 비-reject·lazy 소비를 명시. |

- 위 5개 파일 **외 수정 금지**. 특히 `.github/workflows/`, `package.json` 등은 손대지 않는다.

### 5.2 focused 테스트 범위 (동결)

`BRIX_TEST_SCOPE=focused` — mapSettled 및 그와 코드를 공유하는 lazy consumption/스케줄링 회귀를 커버한다.
전체 정적 검증·단위 테스트(`xo && ava && tsd`, 즉 `npm test`)를 회귀 가드로 실행한다
(mapSettled 가 `generator`/`mapSchedulers` 등 공통 경로를 건드리므로 map/concurrency/pause 회귀 확인 필수).

### 5.3 필수 테스트 케이스 (developer/tester 참조)

동기 iterable:
- [S1] 전부 성공 → 모든 항목 `{status:'fulfilled', value}`, 입력 순서 보존.
- [S2] 일부 mapper 실패 → 해당 인덱스만 `{status:'rejected', reason}`, 전체는 resolve (reject 아님).
- [S3] 빈 iterable → `[]` 로 resolve.
- [S4] `index` 인자가 mapper 에 0-based 순서로 전달됨.
- [S5] concurrency=1 에서 순차 실행 + 순서 보존.

async iterable:
- [A1] async generator 전부 성공 → settled 성공 배열, 순서 보존.
- [A2] 중간 mapper 실패 → 해당 인덱스 rejected, 이후 항목도 계속 소비되어 settled 됨.
- [A3] lazy 소비: 동시 in-flight 가 `concurrency` 를 넘지 않음 (map 의 동일 검증 방식 재사용).
- [A4] **iterator.next() throw → 전체 mapSettled reject** + `iterator.return()` 1회 호출 (mapper 실패와 구분).
- [A5] concurrency 를 실행 중 상승시키면 추가 draw 가 promote 됨.

상호작용:
- [I1] pause 중에는 새 draw 없음, resume 후 재개 + 최종 settled 배열 완성.
- [I2] clearQueue(reason) 로 제거된 pending mapSettled task 는 해당 인덱스 rejected 로 흡수, 전체는 reject 안 됨.
- [I3] mapSettled 진행 중 `isIdle === false`, 완료 후 `onIdle()` resolve.

타입 (tsd, `index.test-d.ts`):
- [T1] `expectType<Promise<Array<PromiseSettledResult<number>>>>(limit.mapSettled([1], async n => n))`.
- [T2] async iterable 입력에 대해서도 동일 반환 타입.
- [T3] mapper 의 `index` 파라미터가 `number` 로 추론됨.

---

## 6. edge case · 실패 케이스

| ID | 케이스 | 기대 동작 |
| --- | --- | --- |
| E1 | 빈 iterable | 즉시 `[]` 로 resolve, limiter 상태 미변경. |
| E2 | 모든 mapper 실패 | 전부 `{status:'rejected', reason}`, mapSettled 는 resolve (reject 아님). |
| E3 | mapper 가 동기 throw | 해당 인덱스 `{status:'rejected', reason}` 로 기록 (async throw 와 동일 취급 — `generator` 가 `async () => fn(...)` 로 감싸므로 자연 흡수). |
| E4 | mapper 가 non-Error 를 throw (문자열/`undefined`/`null`) | `reason` 에 던진 값을 **verbatim** 저장 (변형·wrapping 금지). |
| E5 | async iterator 의 `next()` 가 reject | 전체 mapSettled reject, `iterator.return()` best-effort 1회. |
| E6 | 무한 async iterable + 유한 소비 없음 | 사용자가 소비를 끝내지 않으면 resolve 안 됨 — 이는 `map` 과 동일한 사용자 책임(문서에 명시). |
| E7 | concurrency=Infinity | draw 제한 없이 소비, in-flight 상한 없음 (map 과 동일). |
| E8 | clearQueue 로 pending 제거 | §4.3 대로 해당 인덱스 rejected 흡수. |
| E9 | 중복/희소 인덱스 | 결과 배열은 draw 순서로 dense 하게 채워짐 (hole 없음). |

---

## 7. 추천 Skill / MCP 관련 명시

- orientation 이 추천한 Skill 3종 — **Node.js ESM package authoring**, **AVA test framework**,
  **tsd type testing** — 은 현재 Run 에 **미설치(assigned_skills: none)** 이다.
- 따라서 본 설계와 downstream 구현은 이 Skill 들의 자동 활성화·사용을 **전제로 삼지 않는다**.
  developer/tester 는 저장소에 이미 존재하는 devDependency(`ava`, `tsd`, `xo`)와 기존 테스트 패턴만으로 작업한다.
- 추천 MCP(GitHub MCP)도 본 planner Run 에 미할당이며, lifecycle write 는 worker 가 처리한다.

---

## 8. downstream handoff 계약 (동결 요약)

designer(F68F701A7A-89)·developer(F68F701A7A-90)·tester(F68F701A7A-93)가 지켜야 할 불변식:

1. 공개 API 시그니처 `limit.mapSettled(iterable, mapperFunction)` 와 결과 형식을 변경하지 않는다.
2. 결과는 입력 순서를 보존한 `Promise.allSettled` 호환 배열
   (`{status:'fulfilled',value} | {status:'rejected',reason}`)이며, **개별 실패가 전체 호출을 reject 하지 않는다**.
   단 입력 iterator 자체의 실패(§3.2 / E5)는 전체 reject 한다.
3. 기존 `limit.map`, async iterable lazy consumption, pause/resume, concurrency 변경, clearQueue 계약을
   깨지 않는 **additive 변경만** 허용한다.
4. 수정 허용 파일은 `index.js`, `index.d.ts`, `test.js`, `index.test-d.ts`, `readme.md` 로 한정한다.
