# limit.map — Iterable/AsyncIterable 지연 소비 명세 (F68F701A7A-11)

## 배경 및 목표

`limit.map`의 현재 구현(index.js:106-111)은 다음과 같다.

```js
map: {
	async value(iterable, function_) {
		const promises = Array.from(iterable, (value, index) => generator(function_, value, index));
		return Promise.all(promises);
	},
},
```

`Array.from(iterable, ...)`는 `iterable`을 **동기적으로 즉시 전부 소진**한다. 이는 두 가지 문제를
만든다.

1. **AsyncIterable 미지원**: `Array.from`은 `Symbol.iterator`만 사용하고 `Symbol.asyncIterator`를
   사용하지 않는다. `async function*`이나 스트림 기반 async iterable을 넘기면 `TypeError:
   iterable is not iterable`로 즉시 실패한다.
2. **선적재(pre-loading)**: 무한 제너레이터나 "다음 값을 얻는 데 비용이 드는" iterable(파일 라인
   스트리밍 등)을 넘기면, 실제로 concurrency 슬롯이 하나도 안 남았어도 전체 iterable을 먼저
   완전히 당겨온 뒤에야 mapper 호출이 시작된다 — 무한 iterable이면 이 시점에 영원히 행잉한다.

본 명세는 `limit.map`이 **`Iterable<Input>` 과 `AsyncIterable<Input>`을 모두 입력으로 받고,
concurrency 슬롯이 비었을 때만 다음 값을 당겨오는 지연 소비(lazy consumption)로 동작하도록** 하는
입출력 계약·제약·edge case·복잡도 목표를 정의한다. 코드는 작성하지 않으며, 개발자가 1:1로 구현할
수 있는 계약만 정의한다.

선례 참고: `docs/design/limitfunction-api-F68F701A7A-6.md` (동일 epic의 선행 planner 산출물) 하나만
스타일 선례로 확인했다. 다른 모듈은 탐색하지 않았다.

## 범위

- `index.js`: `map` 구현을 `Array.from` 기반 즉시 소진에서 iterator 기반 지연 소비로 교체.
- `index.d.ts`: `map`의 `iterable` 파라미터 타입을 `Iterable<Input>`에서
  `Iterable<Input> | AsyncIterable<Input>`로 확장(additive, union 확장이므로 breaking 아님).
- 신규 런타임 의존성 추가 금지 — 언어 내장 iteration protocol(`Symbol.iterator`,
  `Symbol.asyncIterator`, `for await...of`)과 기존 `pLimit` 내부 스케줄링(`generator`/큐)만 재사용.
- `readme.md`의 `limit.map` 절 문서 갱신은 구현 PR에서 함께 진행(본 명세는 계약 정의가 목적).

## 입력 사양

| 파라미터 | 타입 | 변경 여부 |
|---|---|---|
| `iterable` | `Iterable<Input> \| AsyncIterable<Input>` | **확장** (기존 `Iterable<Input>`만 지원) |
| `mapperFunction` | `(input: Input, index: number) => PromiseLike<ReturnType> \| ReturnType` | 변경 없음(sync/async 모두 기존과 동일하게 지원) |
| concurrency | 감싸는 `limit` 인스턴스의 현재 `concurrency` 값(getter/setter로 조회·변경, index.js:91-104) | 변경 없음 — `map`은 별도 concurrency 파라미터를 받지 않는다 |

- 소비 프로토콜: `iterable`에 `Symbol.asyncIterator`가 있으면 그것을 우선 사용하고, 없으면
  `Symbol.iterator`를 사용한다(`for await...of`의 기본 동작과 동일 — sync iterable도 그대로 동작).
- `mapperFunction`은 `(input, index)`로 호출되며 `index`는 iterator에서 뽑아낸(draw) 순서 기준
  0-based다(변경 없음).

## 출력 사양

- 반환 타입: `Promise<ReturnType[]>` (변경 없음).
- **순서 보존 계약**: `results[i]`는 iterator에서 **i번째로 draw된 입력**에 대응하는 mapper 결과다.
  mapper의 **완료(resolve/reject) 순서와 무관하게** 항상 draw 순서로 정렬된 배열이 반환된다
  (기존 `test.js:284-297` `map passes index and preserves order with concurrency`와 동일한 계약을
  AsyncIterable 입력에도 동일하게 적용).
- 실패 시: `mapperFunction`이 하나라도 reject/throw 하거나 iterator 자체가 throw/reject 하면,
  `limit.map`이 반환한 promise는 그 사유로 reject 한다(`Promise.all`과 동일한 fail-fast 계약,
  변경 없음).

## 제약 (Constraints)

1. **선적재 금지 (no pre-loading)** — iterator의 `next()`는 concurrency 슬롯이 비어 있을 때만
   호출된다. 임의 시점에 "이미 draw했지만 아직 완료(resolve/reject)되지 않은 항목 수"는
   `concurrency`를 초과할 수 없다. 즉 다음 draw는 반드시 "직전 draw들 중 하나가 완료된 이후"에만
   일어난다(초기 채움은 예외 — 아래 3번 참조).
   - 반례(as-is, 위반 사례): `Array.from(iterable, ...)`는 iterable 전체를 동기적으로 즉시
     소진한다 — 무한 iterable에서 행잉하거나 AsyncIterable을 아예 지원하지 못한다.
2. **active ≤ concurrency** — 임의 시점에 실행 중(= `mapperFunction` 호출 후 완료 대기)인 작업
   수는 현재 `concurrency` 값을 초과할 수 없다. 기존 `limit()`/`activeCount` 계약(index.js:17-30)
   과 동일하게 유지되어야 한다 — `map`이 내부적으로 concurrency 제어 로직을 별도로 재구현하는
   것이 아니라 기존 `generator`/큐 경로를 재사용/위임하는 것을 권장한다(중복 스케줄링 로직 금지).
3. **초기 채움**: `map` 시작 시점에 최대 `concurrency`개까지는 즉시(순차적으로) draw하여 슬롯을
   채울 수 있다 — 이것이 "선적재"는 아니다. `concurrency`개를 초과해서 미리 draw하는 것만 금지
   대상이다.
4. **신규 런타임 의존성 0** — `package.json`에 새 dependency를 추가하지 않는다. 언어 내장
   iteration protocol만 사용(현재 유일한 의존성인 `yocto-queue` 그대로 유지).
5. 기존 `limit.map(iterable, mapperFunction)` 시그니처(파라미터 개수·이름·반환 타입)는 변경하지
   않는다 — `iterable` 파라미터 타입만 union으로 넓어진다.
6. 동기 iterable(배열, `Set`, `Map`, 배열 이터레이터 등)에 대한 기존 동작·타이밍은 100%
   하위호환이어야 한다 — 기존 `test.js`의 `map` 관련 테스트가 전부 그대로 통과해야 한다.

## 복잡도 목표

- **시간**: mapper 호출은 소진된 iterator 항목 수 n에 대해 정확히 O(n)회(항목당 1회). 스케줄링
  오버헤드는 기존 `limit()` 큐 사용과 동일하게 O(1) enqueue/dequeue(`yocto-queue` 기반).
- **공간**: 임의 시점에 메모리에 "진행 중이거나 draw되었지만 미완료인" 항목은 **O(concurrency)**
  이지 O(n)이 아니다(선적재 금지 제약과 직결 — 무한/대형 iterable을 상수 메모리로 처리 가능해야
  함). 단, 최종 반환 배열은 완료된 전체 결과를 담아야 하므로 반환 시점 기준 결과 배열 자체는
  불가피하게 O(n)이다.

## Edge Case 목록 (검증 가능한 개별 항목)

1. **빈 iterator**: `iterable`의 첫 `next()` 호출이 즉시 `{done: true}`를 반환하면 → `limit.map`
   은 빈 배열 `[]`로 resolve하고, `mapperFunction`은 한 번도 호출되지 않는다.
2. **iterator가 throw/reject**: sync iterator의 `next()`가 동기적으로 예외를 던지거나, async
   iterator의 `next()`가 반환한 promise가 reject되면 → `limit.map`이 반환한 promise가 그 사유로
   reject한다. 이 시점 이후 iterator에서 추가 `next()` 호출은 없어야 한다.
3. **mapper가 reject/throw**: 진행 중인 draw 중 하나라도 `mapperFunction`이 reject/throw하면 →
   `limit.map`의 promise가 그 사유로 reject한다(`Promise.all`과 동일). 이 reject가 확정된 이후
   iterator에서 **새로운 draw를 추가로 시작하지 않는다**(이미 시작되어 진행 중이던 다른 작업들은
   완료까지 진행되나 결과는 버려진다 — reject가 우선).
4. **도착(draw)/완료(settle) 순서 불일치**: `concurrency > 1`일 때 나중에 draw된 항목이 먼저
   완료될 수 있다 — 최종 결과 배열은 완료 순서가 아니라 **draw(입력) 순서**를 유지해야 한다.
   (sync iterable: 기존 `test.js:284-297` 패턴, AsyncIterable에도 동일 계약 적용.)
5. **동적 concurrency 변경**: `map` 진행 중 `limit.concurrency = N`으로 변경될 수 있다.
   - 증가 시: 새로 확보된 슬롯 수만큼 iterator에서 추가 draw를 시작해 active 작업 수를 새 한도
     까지 올린다(기존 `concurrency` setter의 `queueMicrotask` 승격 시점, index.js:94-104와 일치하는
     타이밍).
   - 감소 시: 이미 실행 중인 작업을 강제 중단하지 않는다. 이후 슬롯이 하나씩 비워질 때, active가
     새 한도보다 낮은 동안에만 새 draw를 재개한다.
6. **조기 실패 시 iterator 정리**: (2) 또는 (3)으로 `limit.map`이 조기 reject할 때, 아직 소진되지
   않은 iterator/async iterator가 `return()` 메서드를 가지고 있다면 **반드시 정확히 1회 호출**되어
   자원을 정리해야 한다(`for...of`/`for await...of`가 루프를 `break`할 때 자동으로 `return()`을
   호출하는 것과 동일한 프로토콜 — 파일 핸들·커넥션 등 iterator가 쥔 리소스 누수 방지).
   - 검증 가능 형태: `return` spy가 있는 mock iterable을 넣고, mapper reject 발생 시 `return`이
     정확히 1회 호출됐는지 확인.
   - `iterable`이 `return()`을 갖고 있지 않으면(plain 배열의 `Symbol.iterator` 등) 아무 것도 하지
     않는다(생략 가능한 optional 메서드이므로 존재 여부를 먼저 확인해야 한다).

## Out of scope (본 작업에서 명세하지 않음)

- `clearQueue()`와 `map`의 상호작용 재정의 — 기존 `test.js:217-255`, `test.js:403-442`의
  `clearQueue` + `map` 회귀 가드가 이미 그 계약을 고정하고 있다. 본 명세는 그 기존 계약을 깨지
  않아야 한다는 제약만 부과하며, 재정의하지 않는다.
- `map`의 concurrency 제어 로직 자체를 새로 설계하는 것 — 기존 `limit()` 호출 경로(`generator`/
  `enqueue`/`run`/`resumeNext`)를 재사용/위임하는 것을 전제로 한다. 신규 스케줄링 알고리즘 설계는
  범위 밖이다.
- `readme.md` 문구 최종 확정 — 구현 확정 후 developer가 함께 갱신.

## 타입 계약 (index.d.ts)

```ts
map: <Input, ReturnType> (
	iterable: Iterable<Input> | AsyncIterable<Input>,
	mapperFunction: (input: Input, index: number) => PromiseLike<ReturnType> | ReturnType
) => Promise<ReturnType[]>;
```

- `iterable` 파라미터 타입만 `Iterable<Input> | AsyncIterable<Input>`로 확장(index.d.ts:40-43).
- `mapperFunction`, 반환 타입(`Promise<ReturnType[]>`)은 변경 없음.
- JSDoc 상단 설명(`@param iterable`, `@returns` 등, index.d.ts:36-38)도 AsyncIterable 지원을
  반영해 갱신 필요(문구는 developer 재량).

## 마이그레이션 / 하위호환 체크리스트

- [ ] 기존 `test.js`의 `map` 관련 테스트(`map`, `map works when detached from the limit`,
      `map passes index and preserves order with concurrency`, `map accepts an iterable (set)`,
      `map accepts an iterable (array iterator)`, `clearQueue rejects pending map tasks ...`,
      `regression guard — clearQueue + rejectOnClear + map cancellation ...`)가 모두 변경 없이
      통과한다.
- [ ] sync 배열/`Set`/배열 이터레이터 입력 시 결과·타이밍이 변경 전과 동일하다.
- [ ] `limit.map`이 감싸는 `limit`에서 detach되어 호출돼도(`const {map} = limit`) 기존과 동일하게
      동작한다(`test.js:264-282` 패턴).
- [ ] `index.d.ts` 변경이 기존 sync `Iterable` 사용처에 타입 에러를 유발하지 않는다(union 확장은
      기존 호출부에 non-breaking).

## 회귀/신규 테스트 시나리오 (tester/developer 대상)

1. **AsyncIterable 기본 동작**: `async function* () { yield 1; yield 2; yield 3; }` 형태의 async
   generator를 `limit.map`에 넘기면, 각 mapper가 정상 호출되고 draw 순서를 보존한 배열이
   반환된다.
2. **선적재 금지 검증**: 무한(또는 매우 큰) sync/async generator + `concurrency: N`으로 `limit.map`
   호출 시, "draw했지만 미완료"인 항목 수가 어느 시점에도 N을 초과하지 않는지 카운터/로그로
   검증한다(예: generator 쪽에서 `next()` 호출 시점을 기록해 in-flight 최대값이 N을 넘는지 확인).
3. **조기 실패 + iterator 정리**: `return` spy가 달린 mock iterable/async iterable을 만들어 중간에
   mapper가 reject하도록 구성 → `limit.map`이 reject하고, `return`이 정확히 1회 호출됐는지 확인.
4. **동적 concurrency 변경**: async iterable 소비 도중 `limit.concurrency = N`(증가/감소) 변경 시
   in-flight draw 수가 새 한도에 맞춰 승격/유지되는지 확인(`test.js:365-401`의 sync 케이스를
   async iterable에 준용).
5. **도착/완료 순서 불일치**: `concurrency > 1`, mapper별 지연 시간을 인덱스 역순으로 부여해
   완료 순서를 뒤섞은 뒤, 반환 배열이 draw(입력) 순서를 유지하는지 확인(AsyncIterable 버전).
6. **빈 iterator**: 빈 배열/즉시 종료하는 async generator 모두 `[]` 반환, mapper 미호출 확인.
7. 위 신규 테스트는 관례상 `test-async-iterable.js`(본 작업 contract 범위의 tests 항목)에 tester가
   추가할 것을 전제로 한다 — 본 파일이 아직 존재하지 않으므로 신규 생성이 필요함을 tester에게
   공유한다.
