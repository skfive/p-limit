# onIdle API 실행 설계 (F68F701A7A-130)

- 작성 역할: planner (박기획)
- 대상 저장소: skfive/p-limit (ESM 전용, Node >= 20)
- 계약 유형: `planning-contract@v1` (frozen)
- consumer: designer (F68F701A7A-131), developer (F68F701A7A-132), tester (F68F701A7A-135)

> 본 문서는 `limit.onIdle()` public API의 **실행 계약**을 고정한다. designer/developer는
> 아래 시그니처와 resolve 조건을 **재정의하지 않고 그대로 따른다**. 기존 `pLimit` /
> `limitFunction` public API는 보존하며, `onIdle`은 **additive**로만 추가한다.

---

## 1. 목적 · 배경

`pLimit`으로 만든 limiter는 작업이 모두 끝났는지(=idle) 알 수 있는 read 표면은 있으나
(`isIdle` getter, `snapshot().status`), "idle이 될 때까지 기다리는" **await 표면**이 없다.
`onIdle()`은 이 공백을 채운다: 진행 중/대기 중 작업이 모두 사라지면 resolve되는 Promise를
반환하여, 소비자가 limiter 라이프사이클 종료 지점을 명시적으로 기다릴 수 있게 한다.

이 문서는 이미 존재하는 read 표면(`isIdle`)과 **동일한 idle 술어**를 재사용하는 것을
불변식으로 못박아, 두 표면이 서로 다른 "idle" 정의를 갖지 않도록 한다.

---

## 2. Public API 시그니처 (FROZEN)

### 2.1 반환 타입 · 호출 위치

```ts
onIdle: () => Promise<void>;
```

- **반환 타입**: `Promise<void>`. resolve 값은 없다(`undefined`). 절대 reject되지 않는다
  (아래 §4.4 참조 — onIdle 자체는 task 실패를 전파하지 않는다).
- **호출 위치 (2곳, 동일 계약)**:
  1. `pLimit(...)`이 반환한 `limit` 함수의 메서드 — `LimitFunction.onIdle`
  2. `limitFunction(fn, options)`이 반환한 함수의 메서드 — `LimitedFunction.onIdle`
     - 후자는 내부 limiter에 **위임(delegate)** 한다: `onIdle() { return limit.onIdle(); }`.
       독립 스케줄링/idle 판정 로직을 복제하지 않는다.
- **인자**: 없음. 옵션·타임아웃·시그널을 받지 않는다(범위 밖, additive 최소 표면).
- **호출 시점 제약 없음**: idle이든 busy든 paused든 언제든 호출 가능하다.

### 2.2 idle 술어 (single source of truth)

`onIdle()`이 기다리는 "idle" 상태는 다음 술어와 **정확히 동일**하며, `isIdle` getter와
`snapshot().status === 'idle'`이 참조하는 것과 같은 정의다(표면 일관성 불변식):

```
idle  ⇔  activeCount === 0  AND  pendingCount === 0  AND  진행 중인 lazy map/filter/find 드로우가 없음
```

- `activeCount === 0`: 실행 중(running) 작업 없음.
- `pendingCount === 0`(내부 `queue.size === 0`): 대기 큐 비어 있음.
- lazy 스케줄러 없음(내부 `mapSchedulers.size === 0`): `limit.map()` 등 lazy 소비가
  "한 draw settle → 다음 draw" 사이의 틈에서 **거짓 idle**로 오판되지 않도록 하는 가드.
  developer는 이 세 번째 조건을 idle 술어에서 제거하지 않는다.

> **주의(paused와 idle의 관계)**: idle 술어는 `paused` 상태를 보지 않는다.
> 그러나 대기 작업이 있는 paused limiter는 `pendingCount > 0`이므로 idle이 아니다.
> 대기 작업이 없고 실행 작업도 없으면 paused여도 idle이며 즉시 resolve된다
> (§4.5 검증 조건 참조).

---

## 3. resolve 조건 (검증 가능 조건, FROZEN)

각 시나리오는 tester가 그대로 테스트로 옮길 수 있도록 관찰 가능한 조건으로 정의한다.

### 3.1 빈 limiter — 즉시 resolve

- **Given** 방금 생성했거나 모든 작업이 끝난 limiter (`activeCount === 0 && pendingCount === 0 && lazy 드로우 없음`)
- **When** `limit.onIdle()`을 호출하면
- **Then** 반환 Promise는 **즉시 resolve**된다(`Promise.resolve()` 경로).
  - 검증: `await limit.onIdle()`이 추가 작업 없이 곧바로 완료된다.
  - 검증: idle 상태에서 여러 번 호출해도 매번 즉시 resolve되는 **새 Promise**를 반환한다.

### 3.2 진행 중 작업 있음 — 마지막 settle 후 resolve

- **Given** `activeCount > 0` 또는 `pendingCount > 0` 인 limiter
- **When** `limit.onIdle()`을 호출하면
- **Then** 반환 Promise는 **pending 상태**를 유지하다가, 마지막 남은 작업이 settle되어
  limiter가 idle 술어를 만족하는 순간 resolve된다.
  - 검증: `activeCount + pendingCount > 0` 동안 Promise는 resolve되지 않는다.
  - 검증: 마지막 작업 완료 직후(내부 `next()`의 settle 처리 시점) resolve된다.
  - 검증: 큐에 여러 작업이 있으면 **전부** 소진된 뒤에야 resolve된다(중간 idle 오판 없음).

### 3.3 다중 동시 waiter — 하나의 idle 도달에 모두 resolve

- **Given** busy 상태에서 `onIdle()`을 **여러 번** 호출해 얻은 여러 Promise (w1, w2, w3)
- **When** limiter가 idle에 도달하면
- **Then** 등록된 모든 waiter가 **같은 idle 도달 시점**에 각각 resolve된다.
  - 검증: `Promise.all([w1, w2, w3])`가 완료된다.
  - 검증: 각 resolve는 **정확히 1회**만 발생한다(내부 waiter 집합을 idle 도달 시 clear).
  - 검증: 이후 다시 busy→idle 사이클이 와도 이전 waiter가 **재발화(double-fire)** 하지 않는다.

### 3.4 task reject 후 settle — 여전히 resolve (reject 아님)

- **Given** 일부/전부의 작업이 **reject**되는 limiter에서 `onIdle()`을 호출
- **When** 실패 작업이 settle(rejected)되어 마지막 작업까지 소진되면
- **Then** `onIdle()` Promise는 **resolve**된다. task의 rejection은 `onIdle()`로 전파되지 않는다.
  - 근거: idle은 "실행/대기 작업 수 = 0" 상태이며, 성공/실패 구분과 무관하다.
    내부적으로 task 실패는 삼켜져(caught) `next()`가 정상적으로 count를 감소시킨 뒤 idle을 알린다.
  - 검증: 모든 task가 reject되어도 `await limit.onIdle()`은 throw 없이 완료된다.
  - 검증: 원래 task Promise의 rejection은 호출자에게 그대로 보존된다(onIdle이 이를 가로채거나 삼키지 않는다 — 별개 Promise).

### 3.5 clearQueue / rejectOnClear 경계 동작

`clearQueue(reason?)`은 대기(pending) 작업을 큐에서 제거하므로 idle 도달에 직접 영향을 준다.
세 경우로 나눠 고정한다.

- **(a) `clearQueue()`로 대기 작업이 모두 제거되고 실행 작업도 없을 때**
  - **Given** `activeCount === 0`, `pendingCount > 0`, waiter 등록됨
  - **When** `clearQueue()`(또는 `clearQueue(reason)`)를 호출하면 큐가 비워진다
  - **Then** limiter가 idle 술어를 만족하므로 등록된 waiter가 resolve된다.
    - 검증: `clearQueue()` 직후 `await limit.onIdle()`(호출 전 등록분 포함)이 완료된다.

- **(b) 실행 중 작업이 남아 있는 상태에서 `clearQueue()` 호출**
  - **Given** `activeCount > 0`, `pendingCount > 0`
  - **When** `clearQueue()`로 대기분만 제거하면 `pendingCount === 0`이나 `activeCount > 0`
  - **Then** 아직 idle이 아니므로 waiter는 pending 유지. 실행 중 작업이 모두 settle된 뒤 resolve된다.
    - 검증: `clearQueue()` 직후에는 resolve되지 않고, running 작업 완료 후 resolve된다.

- **(c) `rejectOnClear` / `reason`과 waiter의 관계**
  - `rejectOnClear: true` 또는 `clearQueue(reason)`은 **제거된 대기 작업의 Promise**를
    (AbortError 또는 지정 reason으로) reject한다. 이는 **각 task Promise**에 대한 것이며,
    `onIdle()` Promise와는 별개다.
  - **Then** waiter의 `onIdle()`은 그 reject와 무관하게, 큐가 비고 실행 작업이 없어지면 **resolve**된다.
    - 검증: `pLimit({rejectOnClear: true})`에서 대기 작업을 clear해도, 등록된 `onIdle()`은
      resolve되고(reject 아님), 제거된 task Promise들은 AbortError로 reject된다(두 표면 독립).
  - **경계 정리**: `onIdle()`은 "작업이 성공적으로 끝났음"이 아니라 "더 이상 실행/대기 작업이 없음"을
    의미한다. clearQueue로 인한 강제 비움도 idle 도달의 한 경로다.

---

## 4. 동작 원칙 · 세부 계약

### 4.1 매 호출마다 새 Promise

`onIdle()`은 호출 시점의 상태에 따라 즉시 resolve된 새 Promise 또는 새 pending Promise를
반환한다. 반환 Promise를 캐싱/재사용하지 않으며, 소비자는 반환값을 그때그때 await한다.

### 4.2 waiter 등록/해제 수명

- busy 상태 호출 시 resolve 콜백을 내부 waiter 집합에 등록한다.
- idle 도달 시 집합의 모든 resolve를 호출한 뒤 **집합을 비운다**(1회 발화 보장, 누수 방지).
- limiter는 재사용 가능하다: idle→busy→idle 사이클마다 새로 등록된 waiter만 그 사이클의
  idle 도달에 반응한다.

### 4.3 idle 알림 트리거 지점 (developer 참고 — 재정의 금지 아님, 위치 명시)

idle 도달을 알리는 내부 훅은 최소 다음 전이 지점에서 호출되어야 한다:
- 일반 task settle 후(`next()`),
- `clearQueue()`로 큐가 비워진 후,
- lazy `map`/`mapSettled`/`filter`/`find`의 마지막 draw가 settle/정리된 후.

각 지점은 "waiter가 있고 && idle 술어를 만족할 때"만 실제 resolve를 발화한다.

### 4.4 onIdle은 reject되지 않는다

- 반환 타입은 `Promise<void>`이며, 정상 흐름에서 reject 경로가 없다.
- task 실패, clearQueue reject, pause 등 어떤 상태 전이도 `onIdle()`을 reject시키지 않는다.
- 소비자는 `await limit.onIdle()`을 try/catch로 감쌀 필요가 없다.

### 4.5 paused 상태에서의 호출

- **대기 작업 없음 + 실행 작업 없음**: paused여도 idle이므로 즉시 resolve(§3.1과 동일).
- **대기 작업 있음**: `pendingCount > 0`이므로 idle이 아니다. resume되어 작업이 소진되거나
  clearQueue로 비워질 때까지 pending 유지.
  - 검증: paused + pending 상태에서 `onIdle()`은 resolve되지 않는다. resume 후 모든 작업
    settle 시 resolve된다.

---

## 5. 타입 계약 (index.d.ts) — 추가 지점 (FROZEN)

`onIdle`은 **두 타입 표면**에 동일 시그니처로 존재한다. 위치를 명시한다:

1. `LimitFunction` 타입 멤버:
   ```ts
   /**
   Returns a promise that resolves when the limiter becomes idle — no promises are
   currently running and none are waiting to run.

   If the limiter is already idle when this is called, the returned promise resolves immediately.
   */
   onIdle: () => Promise<void>;
   ```
2. `LimitedFunction<Arguments, ReturnType>` 타입 멤버: **동일 시그니처·동일 JSDoc**.

- 두 곳 모두 기존 멤버(`activeCount`, `pendingCount`, `concurrency`, `clearQueue`, `map`,
  `snapshot`, `subscribe`, ...)를 **변경하지 않고** `onIdle` 멤버만 추가한다.
- 타입 테스트(`index.test-d.ts`)는 `limit.onIdle()`과 `limitFunction(...).onIdle()`의
  반환 타입이 `Promise<void>`임을 컴파일 타임에 검증한다(tester/developer 참조).

---

## 6. Additive 무변경 원칙 (FROZEN 불변식)

- 기존 `pLimit(concurrency)` / `limitFunction(fn, options)`의 시그니처·반환·기존 메서드
  동작·스케줄링/settlement 타이밍은 **보존**한다.
- `onIdle`은 **순수 additive**: waiter가 하나도 등록되지 않은 경우 기존 스케줄링 경로는
  전혀 영향받지 않아야 한다(기존 타이밍·순서 불변).
- idle 술어는 기존 `isIdle`/`snapshot().status`와 **동일 정의를 공유**한다. 새 idle 정의를
  만들지 않는다.
- designer/developer는 위 시그니처(`() => Promise<void>`)와 §3 resolve 조건을 재정의하지 않는다.

---

## 7. edge case · 실패 케이스 요약표

| # | 상황 | 기대 동작 |
|---|------|-----------|
| E1 | 빈 limiter에서 호출 | 즉시 resolve (새 Promise) |
| E2 | idle 상태 다회 호출 | 매번 즉시 resolve되는 별개 Promise |
| E3 | busy 중 호출 | 마지막 작업 settle까지 pending 후 resolve |
| E4 | 다중 waiter | 하나의 idle 도달에 전부 1회 resolve, 재발화 없음 |
| E5 | 모든 task reject | throw 없이 resolve (idle은 성공/실패 무관) |
| E6 | 실행 중 task reject, 이후 마지막 settle | resolve, 원래 rejection은 호출자에 보존 |
| E7 | `clearQueue()`로 대기 전부 제거 + 실행 없음 | idle 도달 → resolve |
| E8 | 실행 남은 채 `clearQueue()` | pending 유지, 실행 소진 후 resolve |
| E9 | `rejectOnClear:true` + clearQueue | onIdle resolve, 제거 task는 AbortError reject (독립) |
| E10 | `clearQueue(reason)` | onIdle resolve, 제거 task는 reason으로 reject (독립) |
| E11 | paused + pending | pending 유지, resume/clear로 idle 도달 시 resolve |
| E12 | paused + 대기·실행 모두 없음 | 즉시 resolve |
| E13 | lazy map/filter/find 진행 중 | draw 사이 틈에서 거짓 idle 없음, 전부 settle 후 resolve |
| E14 | `limitFunction(...).onIdle()` | 내부 limiter에 위임, 위 전 조건 동일 |

---

## 8. downstream handoff

- **designer (F68F701A7A-131)**: 위 시그니처/resolve 조건을 UI·API 문서(readme 등) 서술에
  반영하되 계약을 변경하지 않는다. onIdle 사용 예시는 §3의 조건 위에서만 구성한다.
- **developer (F68F701A7A-132)**: idle 술어를 `isIdle`과 공유하고, waiter 집합 1회 발화·clear,
  §4.3 트리거 지점, additive 무변경을 지킨다. `index.d.ts` 두 타입 표면에 §5 시그니처를 추가한다.
- **tester (F68F701A7A-135)**: §3·§7 표의 E1~E14를 검증 케이스로 사용한다. `onIdle`은 절대
  reject되지 않음(E5/E6/E9/E10)을 명시적으로 확인한다.

## 9. acceptance 매핑

- AC1(반환 타입·호출 위치) → §2.1, §5
- AC2(빈/진행중/다중waiter/reject후/clearQueue·rejectOnClear 검증 조건) → §3.1~§3.5, §7
- AC3(additive 무변경·index.d.ts 추가 지점) → §5, §6
