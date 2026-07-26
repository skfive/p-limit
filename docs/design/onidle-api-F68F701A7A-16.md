# onIdle() 완료 대기 API 설계 명세 (F68F701A7A-16)

## 배경 및 목표

현재 `pLimit()`이 반환하는 `limit` 함수는 `activeCount` / `pendingCount`라는 **관찰용 스냅샷**만
제공한다(index.js:196-202). "limiter가 완전히 비워지는(모든 active + pending이 0이 되는) 시점"을
알고 싶은 소비자는 직접 `setInterval`로 두 값을 폴링하거나, 자신이 큐에 넣은 모든 프라미스를
별도로 추적해 `Promise.all`을 거는 수밖에 없다. 전자는 polling/timer 기반이라 낭비이고, 후자는
`clearQueue()`로 버려진 pending 작업이나 동적으로 늘어나는 `limit.map()` 호출까지는 커버하지
못한다.

본 명세는 **polling·timer 없이, limiter가 완전히 idle(activeCount === 0 && pendingCount === 0,
그리고 아래에서 정의하는 세 번째 조건)이 되는 시점에만 resolve하는 `onIdle(): Promise<void>`**를
`pLimit()`/`limitFunction()` 반환 함수에 추가하기 위한 동작 계약을 정의한다. 코드는 작성하지
않으며, developer(F68F701A7A-17)가 1:1로 구현할 수 있는 계약만 정의한다.

선례 참고: 이번 명세는 동일 epic의 선행 planner 산출물 `docs/design/limitfunction-api-F68F701A7A-6.md`
**하나만** 선례로 확인했다(스타일 및 "`limitFunction`은 `limit`과 동일한 control/observation
표면을 위임 노출한다"는 원칙). 다른 외부 모듈 탐색은 하지 않았다.

## 범위

- `index.js`:
  - `pLimit()`이 반환하는 `generator`(= `limit` 함수)에 `onIdle()` 메서드 추가
    (`Object.defineProperties(generator, {...})`, index.js:196-250 패턴에 additive).
  - `limitFunction()`이 반환하는 함수에도 동일하게 내부 `limit.onIdle()`을 위임하는 `onIdle()`
    추가 — F68F701A7A-6에서 확립되어 이미 구현된 `activeCount`/`pendingCount`/`concurrency`/
    `clearQueue` 위임 패턴(index.js:262-281)과 동일 원칙을 그대로 적용한다. `limitFunction`만
    별도의 idle 판정 로직을 새로 만들지 않는다(중복 로직 금지, 위임만).
- `index.d.ts`: `LimitFunction`(index.d.ts:1-59), `LimitedFunction<Arguments, ReturnType>`
  (index.d.ts:135-170) 각 타입에 `onIdle` 필드 반영.
- `readme.md`: `onIdle()` 절 문서화는 구현 PR에서 developer가 함께 진행(F68F701A7A-11 선례와
  동일 처리 방식). 본 명세는 계약 정의가 목적이므로 문서 문구는 확정하지 않는다.
- 신규 런타임 의존성 추가 금지 — `yocto-queue`(`queue.size`), 기존 `activeCount` 변수, 기존
  `mapSchedulers` Set(index.js:21)만 재사용한다. 새 패키지·polling·timer API(`setInterval`/
  `setTimeout`)는 사용하지 않는다.

## 목표 구현 계약 (to-be)

### 1. idle 판정 predicate — 단일 `isIdle()` 기준으로 통일

idle 여부는 다음 **세 조건의 AND**로 정의한다:

```
isIdle() ⟺ activeCount === 0 && queue.size === 0 && mapSchedulers.size === 0
```

- `activeCount === 0`: 실행 중인 작업이 없음(index.js:17).
- `queue.size === 0`: FIFO 대기열에 남은 작업이 없음(index.js:16, 200-201 `pendingCount` getter와
  동일한 소스).
- `mapSchedulers.size === 0`: **진행 중인 lazy async-iterable `limit.map()` 호출이 하나도 없음**
  (index.js:21, 87/102/192에서 이미 add/delete 관리 중인 기존 Set). 이 세 번째 조건이 필요한
  이유는 아래 "Edge Case 11" 참조 — 단순히 `activeCount`/`pendingCount`만 보면 async iterable
  map 진행 중 조기 오탐(false positive) idle이 발생할 수 있다.
- `onIdle()`의 즉시-resolve 분기와, 아래 `notifyIdle()`의 브로드캐스트 조건은 **반드시 동일한
  `isIdle()` 헬퍼를 공유**해야 한다. 두 곳에 조건을 각각 따로 작성하면(코드 중복) 한쪽만
  수정되었을 때 판정이 어긋나는 회귀를 만들기 쉽다 — 반드시 함수 하나로 추출해 두 지점에서
  호출할 것.

### 2. `onIdle()` — 즉시 resolve 조건

- Type: `() => Promise<void>`
- 호출 시점에 `isIdle()`이 `true`이면(예: 방금 생성된 limiter, 또는 모든 작업이 이미 끝난
  limiter) **새 완료된 Promise를 반환**한다 — 폴링도 타이머도 없이 즉시 resolve. (Promise
  executor 안에서 동기적으로 `resolve()`를 호출해도 무방하다 — `await`하는 쪽은 여전히 최소 1
  microtask 이후에 계속되므로 Promise 시맨틱을 위반하지 않는다.)
- `false`이면 아래 `idleWaiters`에 resolve 콜백을 등록하고, 아직 resolve되지 않은 `Promise<void>`를
  반환한다.
- 매 호출마다 **새 Promise를 생성**한다 — 과거에 resolve된 Promise를 캐시해 재사용하지 않는다
  (Edge Case 9 참조).

### 3. waiter 등록 자료구조

```
const idleWaiters = new Set(); // Set<() => void>, pLimit() 인스턴스별 독립
```

- `onIdle()`이 pending 분기를 탈 때만 `idleWaiters`에 항목이 추가된다(즉시 resolve되는 호출은
  등록하지 않는다 — "phantom" 항목 방지).
- `notifyIdle()`: `isIdle()`이 `true`이고 `idleWaiters.size > 0`이면, 등록된 모든 resolve를
  순회 호출한 뒤 `idleWaiters.clear()`로 즉시 비운다. `isIdle()`이 `false`이면 아무 것도 하지
  않는다(no-op).

### 4. `notifyIdle()` 호출 지점 (기존 "정산 지점" 4곳, additive)

idle로의 전이가 발생할 수 있는 지점은 코드 전체에서 정확히 4곳이다. 이 지점들 **외에는**
`notifyIdle()`을 호출할 필요가 없다(그 외 지점은 activeCount+pendingCount 합이 줄어들지
않거나, mapSchedulers가 줄어들지 않는 지점이기 때문 — 아래 "영향 범위" 절 참조).

1. **`next()`** (index.js:31-34) — `activeCount--` 및 `resumeNext()` 호출 **직후**에
   `notifyIdle()` 호출 추가. (`resumeNext()`가 대기열에서 다음 작업을 꺼내 `activeCount`를 다시
   올릴 수 있으므로, 반드시 `resumeNext()` 호출 *다음*에 판정해야 한다.)
2. **`clearQueue()`** (index.js:203-216) — 두 분기 모두 마지막에 `notifyIdle()` 호출 추가:
   - `rejectOnClear`가 `false`: `queue.clear()` 직후.
   - `rejectOnClear`가 `true`: `while (queue.size > 0) { ... }` 루프 종료 직후.
3. **`mapAsyncIterable`의 `settleResolve()`** (index.js:100-104) — `mapSchedulers.delete(schedule)`
   직후에 `notifyIdle()` 호출 추가(map이 성공적으로 완전히 끝나는 시점).
4. **`mapAsyncIterable`의 `finalizeReject()`** (index.js:85-98) — `mapSchedulers.delete(schedule)`
   직후(= `iterator.return()` 정리 및 최종 `reject(error)` 호출과 같은 타이밍)에 `notifyIdle()`
   호출 추가(map이 mapper reject/iterator reject로 조기 종료되는 시점).

### 5. 다중 waiter 브로드캐스트 규약

- idle 전이가 실제로 일어난 "그 순간"에 등록되어 있던 waiter는 **전부 같은 tick에** resolve된다
  (한 번의 순회 + 일괄 `clear()`). 개별 waiter 사이의 우선순위/순서 보장은 불필요하다 — "자원
  획득" 신호가 아니라 "상태 도달" 신호이므로 어느 waiter가 먼저 깨어나든 의미는 동일하다.
- `Set`은 삽입 순서를 보존하므로 구현이 삽입 순서대로 순회해도 무방하지만, 이는 구현 편의이지
  계약상 필수 요구사항은 아니다.

### 6. waiter 누수 방지 규약

- `idleWaiters`에 등록된 resolve는 `notifyIdle()`에서 **정확히 1회** 호출된 뒤 반드시 Set에서
  제거되어야 한다(`clear()`). 제거하지 않으면 이후 재사용 사이클에서 같은 resolve가 다시
  호출되거나(이미 resolve된 Promise를 다시 resolve하는 것 자체는 스펙상 no-op이지만) Set 크기가
  무한정 누적되는 메모리 누수로 이어진다.
- limiter가 영구히 idle에 도달하지 못하는 경우(예: 어떤 활성 작업이 영원히 settle되지 않는
  hang 상황)에는 `onIdle()`도 영원히 resolve되지 않는다. 이는 `Promise.all`/기존 `clearQueue()`
  경고 문서(readme.md:123-126)와 동일한 종류의 한계이며, 별도 timeout/cancel 메커니즘은 본
  명세 범위 밖이다(Out of scope 참조) — "누수 방지"는 "idle이 실제로 도달했을 때 반드시 정리됨"
  을 보장하는 것이지, "영원히 idle되지 않는 극단 케이스까지 강제로 정리"하는 것을 의미하지
  않는다.
- `onIdle()`이 반환한 Promise를 아무도 `await`하지 않고 버려도(orphan) 참조 자체는 idle 도달
  시 `notifyIdle()`이 자동으로 정리(clear)하므로, "영원히 idle되지 않는" 극단 케이스를 제외하면
  `idleWaiters`의 크기는 항상 "현재 outstanding onIdle() 호출 수" `w`로 유한하게 수렴한다.

## 제약 (Constraints)

1. **polling/timer 금지** — `setInterval`/`setTimeout`/재귀 `setImmediate` 등으로 상태를 주기적으로
   재확인하는 로직을 추가하지 않는다. idle 판정은 오직 위 4개 기존 정산 지점에서 이벤트 기반으로만
   트리거된다.
2. **신규 런타임 의존성 0** — `package.json`에 새 dependency를 추가하지 않는다.
3. **기존 public API 무변경** — `activeCount`/`pendingCount`/`concurrency`(get/set)/`clearQueue()`/
   `map()`, 그리고 `limitFunction()`이 위임 노출하는 동일 세트의 시그니처·타이밍·값은 전혀
   변경하지 않는다. `onIdle()`은 순수 additive 확장이다.
4. **기존 스케줄링 로직 비침습** — `enqueue`/`run`/`resumeNext`/`mapAsyncIterable`의 draw 로직
   자체는 건드리지 않는다. 위 4개 지점에 `notifyIdle()` 호출을 "추가"하는 것 외에는 제어 흐름을
   바꾸지 않는다.

## 복잡도 목표

- **정산당 O(1)**: `next()`/`clearQueue()`/`settleResolve()`/`finalizeReject()` 각 호출마다
  수행하는 `isIdle()` 판정은 `activeCount`(변수 읽기), `queue.size`(yocto-queue의 카운터 기반
  getter, O(1)), `mapSchedulers.size`(`Set.size`, O(1)) 세 값을 비교하는 것뿐이다 — 대기 중인
  waiter 수 `w`나 큐 길이 `n`에 비례하지 않는다.
- **resolve 시 O(w)**: `isIdle()`이 `true`로 판정된 "그 순간"에만 등록된 waiter 전체(`w`개)를
  순회하며 resolve한다. idle 전이가 아닌 평범한 정산(예: 아직 다른 작업이 active로 남아있는
  `next()` 호출)에서는 이 O(w) 비용이 전혀 발생하지 않는다 — `isIdle()`이 `false`면 순회 자체를
  하지 않기 때문이다.
- **메모리 O(w)**: `idleWaiters` 하나의 `Set`만 추가되며, 그 크기는 현재 "resolve 대기 중인
  `onIdle()` 호출 수" `w`에 비례한다. 큐 길이 `n`이나 완료된 작업 수와는 무관하다 — 완료된
  작업의 정보를 별도로 누적 저장하지 않는다(정산 즉시 판정하고 버리는 stateless 체크).

## Edge Case 목록 (검증 가능한 개별 항목)

1. **즉시 resolve(빈 limiter)**: 방금 생성된 `pLimit(n)` 또는 이미 모든 작업이 끝나 있는
   limiter에서 `onIdle()` 호출 → `activeCount === 0`, `pendingCount === 0`,
   `mapSchedulers.size === 0` → polling 없이 (다음 microtask에) resolve. `idleWaiters`에는
   등록되지 않는다.
2. **다중 waiter**: `onIdle()`을 (모두 non-idle 상태에서) 3회 연속 호출 → 세 Promise 모두
   서로 다른 객체이지만, 동일한 idle 전이 시점에 함께 resolve된다.
3. **활성 작업 도중 호출**: `activeCount > 0`인 상태에서 `onIdle()` 호출 → `idleWaiters`에
   등록만 되고, 모든 active/pending/in-flight map이 0이 될 때까지 resolve되지 않는다.
4. **mapper reject**: `limit.map()`의 mapper 하나가 reject해도 해당 개별 task는 `run()`의
   `try { await result; } catch {}` (index.js:46-48)를 통해 정상적으로 `next()`까지 도달해
   `activeCount`를 감소시킨다 → 성공/실패 여부와 무관하게 "완료"로 취급되어 idle 판정에
   동일하게 반영된다.
5. **sync throw**: `function_`이 동기적으로 throw해도 `run()`의 `(async () =>
   function_(...arguments_))()` 래핑(index.js:38)이 이를 rejected promise로 변환하므로
   `next()` 호출 경로는 4번과 동일 — `onIdle()` 판정에 특별 취급이 필요 없다.
6. **`clearQueue()` (`rejectOnClear`: false/미지정)**: pending 작업을 조용히 버린다. 이 시점에
   `activeCount`가 이미 0이었다면 `clearQueue()` 직후 즉시 idle 전이(대기 중이던 `onIdle()`
   waiter가 즉시 resolve). `activeCount > 0`이면 idle 아님 — 남은 active 작업들이 각자 `next()`를
   통해 완료될 때까지 대기.
7. **`clearQueue()` (`rejectOnClear`: true)**: pending 작업이 `AbortError`로 reject된다. idle
   판정 시점/조건은 6번과 동일(활성 작업 존재 여부만 영향, pending이 조용히 버려지는지
   reject되는지는 idle 판정과 무관).
8. **동적 concurrency 변경**: `concurrency`를 늘리거나 줄여도 그 자체만으로는 idle 전이가
   발생하지 않는다 — concurrency setter의 `queueMicrotask` 승격 루프(index.js:224-234)는
   `resumeNext()`를 반복 호출해 "pending → active" 이동만 시킬 뿐, active+pending의 합은
   변하지 않는다(idle을 유발하는 감소가 아니다). 따라서 이 루프 안에는 `notifyIdle()`을 추가할
   필요가 없다 — `onIdle()`은 concurrency 변경 시점과 무관하게, 최종적으로 모든 작업이
   settle되는 시점에만 resolve된다.
9. **idle 후 재사용**: `onIdle()`이 한 번 resolve된 뒤 새로운 `limit(fn)`/`limitedFn(...)` 호출이
   들어와도(재사용), 그 이후에 호출하는 새로운 `onIdle()`은 다시 "즉시 resolve 아님" 상태로
   정상 등록된다. 과거에 resolve된 Promise 인스턴스가 캐시되어 재사용되지 않는다(매 호출마다
   신규 Promise 생성, Edge Case 2 참조).
10. **`limit.map()` 동기 iterable**: `Array.from(iterable, ...)`(index.js:246) 기반 즉시 전개
    경로는 `mapSchedulers`에 아무 것도 등록하지 않는다 → `activeCount`/`pendingCount`만으로
    idle 판정이 정확하다(추가 지연·특수 처리 불필요).
11. **`limit.map()` 비동기 iterable(lazy) 진행 중 — 핵심 레이스 케이스**: async iterable을
    lazy하게 소비하는 `mapAsyncIterable`(index.js:77-194)의 draw 스케줄링(`schedule()` →
    `drawOne()`)은 해당 draw가 만든 개별 task의 `next()` 호출과는 **별도의 microtask 경로**로
    진행된다. 즉, 마지막으로 시작된 draw가 완료되어 `next()`가 `activeCount`를 0으로 낮추는
    시점과, 그 draw를 만든 `limit.map()` 호출이 다음 값을 계속 뽑을지(iterator가 아직
    소진되지 않음) 여부가 확정되는 시점 사이에는 시간 간격이 있을 수 있다. 이 간격 동안
    `activeCount === 0 && pendingCount === 0`이 "일시적으로" 참이 될 수 있으므로, 이 두 값만
    보고 idle을 판정하면 **아직 진행 중인 `limit.map()` 도중에 `onIdle()`이 조기(false positive)
    resolve**되는 결함이 생긴다. 이를 막기 위해 `isIdle()` predicate에 `mapSchedulers.size === 0`
    조건을 포함한다 — 이 Set은 해당 `limit.map()` 호출이 완전히 settle(resolve/reject)될 때만
    비워지므로(§1 항목 4 참조), 진행 중인 lazy map이 있는 한 `onIdle()`은 안전하게 대기 상태를
    유지한다.
12. **`limit.map()` 조기 실패(mapper reject/iterator reject)**: `finalizeReject()`가
    `mapSchedulers.delete(schedule)` 직후 idle 재판정을 트리거한다(§1 항목 4). 이미 시작되어
    아직 완료되지 않은 다른 in-flight draw가 남아 있다면(reject 시점에도 그 draw들은 계속
    진행되어 완료까지 실행된다 — 결과만 버려짐), 그 draw들이 각자 `next()`를 통해 완료될 때까지
    idle이 아니다. 단 이 시점부터는 이미 `mapSchedulers`에서 제거된 뒤이므로 이후 판정은
    `activeCount`/`pendingCount`만으로 충분하다.
13. **여러 개의 동시 진행 async-iterable `map()`**: 같은 `limit` 인스턴스에서
    `limit.map(a, fn)`과 `limit.map(b, fn)`을 동시에 실행 중이면, 두 호출 모두 완전히
    settle되어 `mapSchedulers`에서 모두 제거되어야 idle로 판정된다(하나만 끝난 상태에서는
    `mapSchedulers.size > 0`이 유지되어 `onIdle()`이 resolve되지 않는다).
14. **detach된 map**: `const {map} = limit; map(...)`처럼 `limit` 인스턴스에서 분리해 호출해도
    내부적으로 동일한 클로저(`mapSchedulers`, `generator`)를 참조하므로 idle 판정에 동일하게
    반영된다(F68F701A7A-11 명세, test.js:264-282 `map works when detached from the limit` 패턴과
    동일한 전제).
15. **`limitFunction()` 위임**: `limitFunction(fn, options)`이 반환하는 함수의 `onIdle()`은
    내부 `limit.onIdle()`을 그대로 위임하므로, 위 1~9번 케이스가 `limitedFn.onIdle()`에도
    동일하게 적용된다(단, `limitFunction`은 `map`을 노출하지 않으므로 10~14번은 해당 없음 —
    `limitFunction`이 감싸는 내부 `limit`은 `map`을 호출할 경로가 없어 `mapSchedulers`가 항상
    비어 있다).

## 기존 코드 영향 범위 구분 (변경 vs 비변경)

- **변경(additive만)**: `next()` 끝, `clearQueue()`의 두 분기 끝, `settleResolve()`/
  `finalizeReject()`의 `mapSchedulers.delete(schedule)` 직후 — 이 4곳에 `notifyIdle()` 호출 1줄씩
  추가. `Object.defineProperties(generator, {...})`와
  `Object.defineProperties(limitedFunction, {...})`에 `onIdle` 필드 추가.
- **비변경(로직 그대로)**: `enqueue`/`run`/`resumeNext`/`drawOne`/`schedule`/`runTask`의 내부
  제어 흐름, `concurrency` setter의 `queueMicrotask` 승격 루프(Edge Case 8 참조),
  `validateConcurrency`, 기존 `activeCount`/`pendingCount`/`concurrency`/`clearQueue`/`map`의
  공개 동작·타이밍. `readme.md`의 기존 문구도 이번 명세로는 변경하지 않는다(문서 갱신은
  구현 PR에서 developer 소관).

## 타입 계약 (index.d.ts)

- `LimitFunction`(index.d.ts:1-59)과 `LimitedFunction<Arguments, ReturnType>`
  (index.d.ts:135-170) 각각에 다음 필드를 추가한다(둘 다 동일한 시그니처):

```ts
/**
Returns a promise that resolves when the limiter becomes idle — no promises are
currently running and none are waiting to run.

If the limiter is already idle when this is called, the returned promise
resolves immediately.
*/
onIdle: () => Promise<void>;
```

- 기존 `map`(`LimitFunction`에만 존재), `activeCount`, `pendingCount`, `concurrency`,
  `clearQueue`는 변경하지 않는다.
- `index.test-d.ts`에는 `expectType<Promise<void>>(limit.onIdle())`,
  `expectType<Promise<void>>(lf.onIdle())` 형태의 타입 회귀 케이스가 tester/developer에 의해
  추가될 것을 전제로 한다(파일 자체는 이번 명세의 owned 범위가 아니므로 직접 수정하지 않는다).

## Out of scope (본 작업에서 명세하지 않음)

- `onIdle()`에 대한 취소/timeout 지원(`AbortSignal` 연동 등) — 별도 Jira 티켓 대상.
- `rejectOnClear`/`onIdle` 조합 이상의 신규 옵션 추가.
- `readme.md` 문구 최종 확정 — 구현 확정 후 developer가 함께 갱신.
- 이미 idle인 상태에서 `onIdle()`을 반복 호출할 때의 미시적 성능 최적화(예: 이미 resolve된
  단일 Promise 인스턴스를 캐시해 재사용) — 매 호출 신규 Promise 생성이 기본 계약이며, 이 정도
  오버헤드 절감은 범위 밖이다.

## 마이그레이션 / additive 검증 체크리스트

- [ ] `onIdle()` 추가 후 기존 `test.js`의 모든 테스트(activeCount/pendingCount/clearQueue/
      concurrency/map/limitFunction 관련 전체)가 변경 없이 통과한다.
- [ ] `onIdle()`을 한 번도 호출하지 않는 기존 사용 패턴은 동작·타이밍이 100% 동일하다
      (`idleWaiters`가 비어 있으면 `notifyIdle()`은 항상 O(1) no-op).
- [ ] `index.d.ts` 변경이 기존 `limit`/`limitedFn` 사용처(구조적 타이핑상 필드 추가는
      기존 호출 표현식에 영향을 주지 않음)에 타입 에러를 유발하지 않는다.
- [ ] `limitFunction()`이 반환하는 함수의 `onIdle()`이 내부 `limit.onIdle()`과 동일한 시점에
      resolve된다(위임 검증).

## 회귀/신규 테스트 시나리오 (tester/developer 대상)

1. **즉시 resolve**: 새 `pLimit(n)` 생성 직후 `onIdle()` 호출 → 즉시(다음 microtask에) resolve.
2. **활성 작업 대기 후 resolve**: `concurrency: 2`로 5개 작업 투입 직후 `onIdle()` 호출 →
   `activeCount`/`pendingCount`가 모두 0으로 수렴하는 시점에만 resolve됨을 `t.false`/`t.true`
   플래그로 확인(조기 resolve 여부 검증).
3. **다중 waiter 동시 resolve**: 동일 busy 상태에서 `onIdle()`을 3회 호출 → 세 Promise가 모두
   동일한 idle 전이 tick에 resolve됨을 `Promise.all`+플래그로 확인.
4. **mapper reject 후에도 idle 도달**: `concurrency: 1`로 `limit.map([1,2,3], ...)` 중 하나가
   reject하도록 구성 → `limit.map()` 자체는 reject하지만, 이미 시작된 작업들이 모두 끝난 뒤
   `onIdle()`은 정상적으로 resolve됨을 확인.
5. **sync throw 후에도 idle 도달**: `limit(() => { throw new Error(); })` 호출 후 `onIdle()`이
   정상적으로 resolve됨을 확인(test.js:67-85 `continues after sync throw` 패턴 준용).
6. **`clearQueue()` (`rejectOnClear`: false)**: active 작업이 남아있는 상태에서 `clearQueue()`
   호출 → `onIdle()`은 즉시 resolve되지 않고, 남은 active 작업이 끝난 뒤에야 resolve됨을 확인.
7. **`clearQueue()` (`rejectOnClear`: true)**: 동일 시나리오에서 pending이 `AbortError`로
   reject되는 것과 무관하게 `onIdle()`의 resolve 시점이 6번과 동일함을 확인.
8. **동적 concurrency 변경**: 진행 중 `concurrency`를 늘리거나 줄여도 `onIdle()`의 최종 resolve
   자체는 발생하되, concurrency 변경 시점 자체가 조기 resolve를 유발하지 않음을 확인(변경 직후
   `onIdle()`이 아직 resolve되지 않은 상태로 남아있는지 단언).
9. **idle 후 재사용**: `onIdle()`이 resolve된 뒤 같은 `limit`에 새 작업을 투입하고, 그 이후
   호출한 새 `onIdle()`이 (재사용 작업이 끝날 때까지) 즉시 resolve되지 않음을 확인.
10. **[핵심 레이스 회귀] 비동기 iterable map 진행 중 조기 resolve 방지**: `concurrency: 1`,
    각 `yield` 사이에 지연을 갖는 `async function*` 소스로 `limit.map(source(), mapper)` 호출.
    한 draw의 task가 완료되어 `activeCount`가 0으로 떨어지는 시점(다음 draw가 아직 시작되기
    전)에 `onIdle()`을 호출 → `limit.map()` 전체가 settle되기 전까지는 **resolve되지 않아야
    한다**는 것을 카운터/플래그로 명시적으로 검증한다. 이 테스트가 없으면 Edge Case 11의 회귀를
    잡아낼 수 없다.
11. **동시 진행 map 2개**: `limit.map(asyncA, fn)`과 `limit.map(asyncB, fn)`을 동시에 실행 →
    하나만 끝난 시점에는 `onIdle()`이 resolve되지 않고, 둘 다 끝난 뒤에만 resolve됨을 확인.
12. **`limitFunction()` 위임 검증**: `limitFunction(fn, {concurrency})`로 여러 번 호출 후
    `limitedFn.onIdle()`이 내부 `pLimit`과 동일한 시점에 resolve됨을 확인(test.js:668-684
    `limitFunction() reports accurate activeCount and pendingCount` 스타일 준용).
