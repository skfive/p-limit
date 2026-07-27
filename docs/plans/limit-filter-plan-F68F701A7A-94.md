# limit.filter 실행 계약 (동결) — F68F701A7A

> planning-contract@v1
> producer: planner (F68F701A7A-97)
> consumers: designer (F68F701A7A-95), developer (F68F701A7A-96), tester (F68F701A7A-99)
> interface_checksum: sha256:f96b395f3e72a87d12ab2f6ca01cf55ccb5504055f6e8cb7fdc099e6044eaa44

본 문서는 `limit.filter(iterable, predicate)`의 공개 API·타입·iterable 소비 방식·순서
보존·predicate rejection 전파·기존 계약(map/mapSettled/pause·resume/concurrency/clearQueue)과의
상호작용·수정 허용 파일·검증 범위를 **동결(frozen)** 한다. designer와 developer는 이 계약을
변경 없이 따른다. 기존 공개 API는 **additive**(추가)로만 확장하며, 기존 시그니처·동작·타이밍은
변경하지 않는다.

---

## 0. 배경 및 근거 (기존 코드 사실)

- 저장소는 순수 ESM Node 라이브러리(`"type": "module"`)이며 default export `pLimit`,
  named export `limitFunction`을 제공한다.
- 이미 존재하는 배치 처리 API: `limit.map(iterable, mapperFunction)`,
  `limit.mapSettled(iterable, mapperFunction)` — 이 둘과 시그니처·소비 방식·순서 보존
  규칙을 **일관되게 mirror** 하여 `filter`를 설계한다.
- 내부 스케줄링 근거(`index.js`):
  - 모든 draw는 `generator(function_, value, index)`를 통해 실행되어
    `activeCount <= concurrency` 불변식이 limiter 자체로 강제된다.
  - sync iterable은 `mapEager`(즉시 전개), async iterable은 `mapAsyncIterable`
    (지연 소비, 동시 draw ≤ `concurrency`)로 처리된다.
  - lazy 스케줄러는 `mapSchedulers` Set에 등록되어 concurrency 상승/`resume()` 시 재기동된다.
  - `isIdle()`는 `activeCount === 0 && queue.size === 0 && mapSchedulers.size === 0`.

`filter`는 위 엔진(`generator` / lazy 소비 / `mapSchedulers` 등록)을 **재사용**하며 스케줄링
로직을 중복 구현하지 않는다.

---

## 1. 공개 API 시그니처 (동결)

### 1.1 런타임 (index.js — `Object.defineProperties(generator, …)`에 `filter` 추가)

```js
limit.filter(iterable, predicateFunction) => Promise<Input[]>
```

- `filter`는 `map`/`mapSettled`와 동일하게 `async value(iterable, function_)` 형태의
  프로퍼티 메서드로 정의한다.
- `limitFunction(fn, options)`이 반환하는 함수도 **동일한 `filter` 메서드를 위임(delegate)**
  하여 노출한다(`map`/`clearQueue` 등 기존 위임 패턴과 동일). 위임만 하고 스케줄링 로직을
  중복 구현하지 않는다.

### 1.2 타입 (index.d.ts — `LimitFunction`, `LimitedFunction`에 추가)

```ts
filter: <Input> (
	iterable: Iterable<Input> | AsyncIterable<Input>,
	predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
) => Promise<Input[]>;
```

- 제네릭은 `<Input>` 하나만 사용한다(`map`은 `<Input, ReturnType>`이지만 `filter`의
  반환 원소 타입은 항상 입력 원소 타입 `Input`이므로 `ReturnType`이 없다).
- predicate 반환 타입은 `PromiseLike<boolean> | boolean` — sync/async predicate 모두 허용.
- 반환 타입은 `Promise<Input[]>` — 원본 항목(predicate가 반환한 boolean이 아님)의 배열.
- `LimitFunction`과 `LimitedFunction<Arguments, ReturnType>` **양쪽 모두**에 동일 시그니처를
  추가한다(기존 `map`/`mapSettled`가 양쪽에 있는 것과 동일하게).

---

## 2. iterable 소비 방식 (동결)

`map`/`mapSettled`와 **동일한 이원화 소비**를 따른다.

- **sync iterable** (`Iterable<Input>`): 기존 eager 경로와 동일하게 모든 원소를 draw 순서대로
  즉시 `generator`에 전개하여 스케줄에 올린다. 100% 하위 호환 타이밍.
- **async iterable** (`AsyncIterable<Input>`, 즉 `iterable[Symbol.asyncIterator]`가 함수):
  **지연 소비**한다. 다음 값은 concurrency 슬롯이 빌 때만 `iterator.next()`로 당겨오며,
  임의 시점에 "draw되었으나 아직 settle되지 않은" 원소 수는 최대 `concurrency`개다.
  따라서 무한/스트리밍 async iterable에도 O(concurrency) 메모리로 안전하다.
- 분기 판정은 `map`과 동일하게 `typeof iterable[Symbol.asyncIterator] === 'function'`으로 한다.

### 2.1 predicate 호출 규약

- predicate는 각 원소에 대해 `predicateFunction(value, index)`로 호출된다.
- `index`는 **draw 순서 인덱스**(0-based)이며 `map`/`mapSettled`의 index 의미와 동일하다.
- 각 predicate 호출은 `generator(predicateFunction, value, index)`를 통해 실행되어
  `activeCount <= concurrency` 불변식이 limiter로 강제된다.

---

## 3. 순서 보존 및 결과 구성 규칙 (동결)

- 결과 배열은 predicate가 **truthy**를 반환한 **원본 항목만** 포함한다.
- 포함되는 항목들의 상대 순서는 **입력(draw) 순서**를 보존한다 — predicate/mapper의 **완료
  순서와 무관**하다. (예: 인덱스 5의 predicate가 인덱스 2보다 먼저 완료되어도, 둘 다 통과하면
  결과에서 2가 5보다 앞선다.)
- **truthy 판정**: predicate 반환값(또는 그 Promise를 await한 값)을 JavaScript 기본
  truthiness로 판정한다(`Boolean(result)`). `Array.prototype.filter` 및 `p-filter`의
  통상 의미와 일치한다. `true`/1/비어있지 않은 문자열 등 = 포함, `false`/0/`''`/`null`/
  `undefined`/`NaN` = 제외.
- 결과 배열에는 **구멍(hole)이 없다**. 내부적으로 draw 인덱스별 통과 여부를 기록한 뒤
  입력 순서로 **compact**(제외 항목 제거)하여 밀집 배열로 반환한다.
- **빈 iterable** → `Promise<[]>`(빈 배열)로 resolve.
- **모두 제외** → `Promise<[]>`로 resolve.
- **모두 통과** → 입력 순서 그대로의 원본 항목 배열로 resolve.

---

## 4. predicate rejection 전파 규칙 (동결)

`filter`는 `mapSettled`가 아니라 **`map`과 동일한 fail-fast** 시맨틱을 따른다.

- 어떤 predicate 호출이든 **reject되면(또는 throw)** 반환된 promise 전체가 **그 사유(reason)로
  reject** 된다. 개별 실패를 per-item 결과로 흡수하지 않는다.
- **첫 rejection이 결과를 확정**한다. 확정(settled) 이후 도착하는 다른 predicate의 결과/실패는
  무시된다(중복 settle 없음).
- rejection 발생 시 **입력 iterator 정리**: `iterator.return`이 함수면 **정확히 1회** 호출하여
  자원을 해제한다(`for await...of`의 조기 종료와 동일, `map`/`mapSettled`와 동일한 best-effort
  cleanup). cleanup 중 발생한 오류는 삼킨다(원래 reason이 우선).
- **입력 iterable 자체의 실패**(`iterator.next()` rejection)도 반환 promise를 그 error로
  reject하며, 위와 동일하게 `iterator.return()` 1회 cleanup을 수행한다.
- 확정 이후에는 새로운 draw를 시작하지 않는다(더 이상 `iterator.next()`를 호출하지 않음).

> 정리: `filter`의 실패 전파는 `map`과 동일(fail-fast, 첫 실패로 전체 reject).
> `mapSettled`의 per-item 흡수 방식은 `filter`에 **적용하지 않는다**.

---

## 5. 기존 계약과의 상호작용 불변식 (동결)

`filter`는 별도 스케줄링을 만들지 않고 기존 엔진을 재사용하므로, 아래 불변식이 자동으로 성립하도록
구현한다.

### 5.1 concurrency 불변식
- 임의 시점에 실행 중인 predicate 수 ≤ 현재 `concurrency`. `generator` 경로로만 실행하여 강제.
- async iterable에서 동시에 "draw되었으나 미settle"인 원소 수 ≤ `concurrency`.

### 5.2 concurrency 변경 상호작용
- 진행 중 `limit.concurrency`를 **올리면** filter의 lazy 스케줄러가 추가 draw를 승격한다.
  이를 위해 filter의 lazy 스케줄러를 **`mapSchedulers`에 등록**하고, 완료/실패 시 제거한다
  (`map`/`mapSettled`와 동일). concurrency setter의 microtask drain이 이 스케줄러를 재기동한다.
- concurrency를 **내려도** 이미 실행 중인 predicate는 중단되지 않고 정상 settle되며, 이후 draw만
  새 한도를 따른다.

### 5.3 pause / resume 상호작용
- `limit.pause()` 상태에서는 filter의 새 draw 승격이 **보류**된다(lazy 스케줄러의 `paused`
  가드로 held-off). 이미 실행 중인 predicate는 영향받지 않고 정상 settle된다.
- `limit.resume()` 시 보류됐던 filter draw가 **재기동**된다(`mapSchedulers` 순회로 재-wake).
- pause는 취소가 아니다 — 진행 중 filter는 파기되지 않는다.

### 5.4 clearQueue 상호작용
- `filter`의 predicate draw는 내부 `queue`를 공유하므로, filter 진행 중 `limit.clearQueue(reason)`
  가 호출되면 **아직 시작되지 않은(pending) filter predicate**가 큐에서 제거될 수 있다.
- `reason`이 주어지면 해당 pending predicate가 그 reason으로 reject되고, 이는 §4에 따라 filter
  반환 promise의 **rejection으로 전파**된다(`map`과 동일 흐름).
- `rejectOnClear`가 활성이고 `reason` 생략 시 pending predicate는 `AbortError`로 reject되어
  동일하게 전파된다. `rejectOnClear`가 false이고 `reason` 생략 시 pending predicate는 settle되지
  않고 폐기된다(이 경우 해당 filter 호출은 §5.5의 idle 계정에서만 정리됨 — `map`과 동일한
  기존 한계이며 filter가 새로 도입하는 동작이 아니다).
- clearQueue는 **이미 실행 중인** predicate는 취소·계정 제외하지 않는다.

### 5.5 onIdle / isIdle / isSaturated 상호작용
- 진행 중 filter는 lazy 스케줄러를 `mapSchedulers`에 등록하므로 `isIdle()` 판정
  (`mapSchedulers.size === 0` 포함)에 반영된다 — filter가 진행 중이면 limiter는 idle이 아니다.
- filter 완료/실패 시 스케줄러를 `mapSchedulers`에서 제거하고 `notifyIdle()`을 호출하여
  onIdle 대기자에게 idle 전이를 알린다(`map`/`mapSettled`와 동일).
- `isSaturated`는 predicate 실행이 슬롯을 채우는 동안 기존 규칙대로 반영된다.

### 5.6 subscribe / snapshot 상호작용
- filter의 predicate draw는 `generator`를 거치므로 enqueue/start/settle 전이마다 기존
  `notifyListeners()`가 동일하게 발생한다. filter는 **새로운 snapshot 필드나 status를 추가하지
  않는다** — snapshot 형태(`activeCount`/`pendingCount`/`concurrency`/`status`)는 불변.

### 5.7 map / mapSettled 불변
- `filter` 추가로 `map`/`mapSettled`의 시그니처·소비 방식·순서 보존·rejection 규칙·타이밍은
  **일절 변경하지 않는다**. 세 메서드는 동일한 lazy 소비 엔진을 공유하되 aggregation만 다르다
  (`map` = `Promise.all`, `mapSettled` = `Promise.allSettled`, `filter` = truthy compact).

---

## 6. 수정 허용 파일 및 검증 범위 (동결)

### 6.1 수정 허용 파일 (이 목록으로 한정)
| 파일 | 담당(후속) | 변경 성격 |
| --- | --- | --- |
| `index.js` | developer | `filter` 메서드 추가(additive), `limitFunction` 위임 추가 |
| `index.d.ts` | developer | `LimitFunction`/`LimitedFunction`에 `filter` 타입 추가(additive) |
| `readme.md` | developer | `### limit.filter(iterable, predicateFunction)` 문서 섹션 추가 |
| `test.js` | developer/tester | `filter` AVA 유닛 테스트 추가 |
| `index.test-d.ts` | developer/tester | `filter` tsd 타입 테스트 추가 |
| `docs/plans/limit-filter-plan-F68F701A7A-94.md` | planner | 본 계약 문서 |
| `docs/design/**` | designer | (해당 시) filter 관련 설계/문서 산출물 |

- 위 목록 밖 파일은 수정하지 않는다. 기존 공개 API는 **additive로만** 확장한다.

### 6.2 검증 범위 (focused)
- **focused AVA**: `filter`에 초점을 둔 유닛 테스트를 `test.js`에 추가한다. 공통 스케줄러 코드를
  건드리므로 회귀 가드(`ava` 전체)도 실행하여 기존 `map`/`mapSettled`/pause·resume/concurrency/
  clearQueue/subscribe 동작이 깨지지 않았음을 확인한다.
- **tsd**: `index.test-d.ts`에 `filter`의 타입 계약(반환 `Promise<Input[]>`, predicate
  `(input, index) => boolean | PromiseLike<boolean>`, 잘못된 사용의 `expectError`)을 추가한다.
- **lint**: `xo`가 `npm test` 체인에 포함되므로 스타일을 준수한다.
- **browser E2E 제외**: 본 작업의 검증 범위에서 브라우저 E2E는 제외한다(assigned e2e skill 없음).
- 로컬 검증 명령은 저장소 표준 `npm test`(= `xo && ava && tsd`)를 사용한다. 실제 push/PR/CI는
  시스템이 자동 처리한다.

### 6.3 테스트가 반드시 커버해야 할 케이스 (동결된 AC → 테스트 매핑)
1. sync iterable 기본 필터링 — truthy 항목만, 입력 순서 보존.
2. async iterable 지연 소비 — 동시 draw ≤ concurrency, 순서 보존(무한/스트리밍 안전).
3. 완료 순서 ≠ 입력 순서인 경우에도 결과가 입력 순서로 정렬됨.
4. truthy/falsy 다양한 값(`0`/`''`/`null`/`undefined`/`NaN` 제외, 비어있지 않은 값 포함).
5. 빈 iterable → `[]`; 전부 제외 → `[]`; 전부 통과 → 원본 순서 배열.
6. predicate rejection → 전체 promise reject(첫 실패 reason), `iterator.return()` 1회 cleanup.
7. 입력 iterator 실패 → 전체 reject + cleanup.
8. 진행 중 concurrency 상승 → 추가 draw 승격.
9. 진행 중 pause → 새 draw 보류, resume → 재기동.
10. 진행 중 filter가 있으면 `isIdle === false`, 완료 후 `onIdle()` resolve.
11. `limitFunction`이 반환한 함수의 `.filter` 위임 동작.
12. tsd: 반환 `Promise<Input[]>`, predicate 시그니처, 오용 `expectError`.

---

## 7. 사용자 시나리오 (Given/When/Then)

### S1 — sync iterable 필터링
- **Given** `const limit = pLimit(2)`와 배열 `[1,2,3,4]`
- **When** `await limit.filter([1,2,3,4], async n => n % 2 === 0)`
- **Then** `[2, 4]`로 resolve(입력 순서 보존), 동시에 실행되는 predicate는 최대 2개.

### S2 — async(스트리밍) iterable 지연 필터링
- **Given** 페이지를 lazy하게 yield하는 async generator와 `pLimit(2)`
- **When** `await limit.filter(pages(), async url => (await head(url)).ok)`
- **Then** 슬롯이 빌 때만 다음 URL을 당겨오고(동시 draw ≤ 2), `ok`인 URL만 입력 순서로 반환.

### S3 — predicate 실패
- **Given** 세 번째 항목에서 throw하는 predicate
- **When** `limit.filter(items, predicate)`
- **Then** 반환 promise가 그 error로 reject되고, 남은 미착수 draw는 시작되지 않으며,
  async iterable이면 `iterator.return()`이 1회 호출된다.

### S4 — 진행 중 pause/resume
- **Given** 진행 중인 `limit.filter(...)`
- **When** `limit.pause()` 호출
- **Then** 새 predicate 승격이 멈추고 실행 중인 것만 settle된다.
- **When** 이어서 `limit.resume()`
- **Then** 남은 항목의 draw가 재기동되어 필터링이 완료된다.

---

## 8. Non-goals (이 작업 범위 밖)
- `map`/`mapSettled`/`subscribe`/snapshot/`clearQueue` 등 **기존 API의 시그니처·동작·타이밍 변경**.
- `filter`의 predicate 실패를 per-item으로 흡수하는 `filterSettled` 류 신규 API(요구되지 않음).
- 브라우저 E2E, 벤치마크(`benchmark.js`) 변경.
- 코드 구현 자체(developer 담당) — 본 문서는 계약 동결만 수행한다.
