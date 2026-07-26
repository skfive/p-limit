# limitFunction 제어·관찰 API 기술 명세 (F68F701A7A-6)

## 배경 및 목표

`limitFunction()`이 반환하는 함수는 현재 순수 `(...arguments_) => Promise<ReturnType>` 형태로,
내부에서 생성된 `pLimit()` 인스턴스가 이미 가지고 있는 `activeCount` / `pendingCount` / `concurrency`
getter+setter / `clearQueue()`가 외부로 전혀 노출되지 않는다.

```js
// index.js (as-is)
export function limitFunction(function_, options) {
	const limit = pLimit(options);
	return (...arguments_) => limit(() => function_(...arguments_));
}
```

반면 `pLimit()`이 반환하는 `limit` 함수(generator)는 이미 `Object.defineProperties`로 이
4가지를 노출 중이다(index.js:70-112, `map`도 포함). 본 명세는 **동일한 4가지 control/observation
표면을 `limitFunction`의 반환 함수에도 additive하게 노출**하기 위한 계약을 정의한다. 기존
시그니처, FIFO 순서, `this`/`arguments` 처리 방식은 변경하지 않는다.

선례 참고: 이번 명세는 index.js 안에 이미 존재하는 `pLimit()`의 `Object.defineProperties(generator, {...})`
패턴(activeCount/pendingCount/clearQueue/concurrency) 하나만을 선례로 삼는다. 별도의 외부 모듈
탐색은 하지 않았다.

## 범위

- `index.js`: `limitFunction()` 반환 함수에 `activeCount` / `pendingCount` / `concurrency`
  getter+setter / `clearQueue()`를 추가 노출.
- `index.d.ts`: `limitFunction`의 반환 타입에 위 4개 필드 반영.
- 신규 런타임 의존성 추가 금지 — 기존 `yocto-queue` 및 `pLimit` 내부 로직만 재사용(위임/delegate).

## 목표 구현 계약 (to-be, additive)

`limitFunction(function_, options)`이 반환하는 함수를 `limitedFn`이라 할 때, 다음을 만족해야 한다.

### 1. 기존 시그니처·호출 계약 불변

- `limitedFn`은 여전히 `(...arguments_: Arguments) => Promise<ReturnType>`로 호출 가능해야 한다.
- 내부 실행 경로 `limit(() => function_(...arguments_))`는 유지되어야 한다(변경 시 FIFO/동시성
  보장이 깨질 위험이 있다).
- **`this` 바인딩**: 현재 구현은 화살표 함수 체인이므로 호출부의 `this`는 `function_` 실행에
  전달되지 않는다(기존에도 지원되지 않던 동작). 이번 변경은 이 동작을 **그대로 유지**한다 —
  `this` forwarding을 새로 추가하지 않는다(Out of scope 참조). `limitedFn.call(ctx, ...)` /
  `.apply(ctx, ...)`로 호출해도 `function_` 내부의 `this`가 `ctx`로 바뀌지 않는 현재 동작이
  회귀 테스트로 고정된다.
- **`arguments_` 보존**: rest parameter로 받은 인자는 그대로 spread되어 `function_`에 순서·개수가
  보존된 채 전달된다(변경 없음).

### 2. `activeCount` (읽기 전용 getter)

- Type: `number`
- `limitedFn.activeCount`는 내부 `limit.activeCount`를 그대로 위임한다.
- 정의: 현재 실행 중(= `function_` 호출 후 아직 완료되지 않은) 호출 개수.
- 엣지케이스:
  - 호출이 없으면 `0`.
  - 동시 호출이 `concurrency`보다 많아도 `activeCount`는 `concurrency`를 초과하지 않는다.
  - 동기적으로 예외를 던지는 `function_`도 내부 `run()`이 wrapping하므로 `activeCount`가
    정상적으로 감소한다(index.js:32-48 `run` 참조).

### 3. `pendingCount` (읽기 전용 getter)

- Type: `number`
- `limitedFn.pendingCount`는 내부 `limit.pendingCount`(= 내부 큐의 `queue.size`)를 그대로
  위임한다.
- 정의: 아직 실행이 시작되지 않고 대기 중인 호출 개수.
- 엣지케이스: `clearQueue()` 호출 직후 `0`으로 즉시 수렴해야 한다.

### 4. `concurrency` (getter/setter)

- Type: `number` (getter 반환값, setter 입력값)
- getter: 현재 concurrency 한도를 반환(내부 `limit.concurrency` 위임).
- setter: 내부 `limit.concurrency = value`로 위임. 내부 `validateConcurrency`가 재사용되어
  정수 또는 `Number.POSITIVE_INFINITY`이고 `> 0`이 아니면 `TypeError`.
- 동적 변경 동작(index.js:94-104, 변경 없음): 설정 직후 `queueMicrotask`에서
  `activeCount < concurrency && pendingCount > 0`인 동안 `resumeNext()`를 반복 호출 →
  대기 작업이 새 한도까지 즉시 승격된다.
- 엣지케이스: 잘못된 값으로 setter 호출 시 `TypeError`가 던져지고 기존 `concurrency` 값은
  유지된다(대입 이전에 `validateConcurrency`가 검증하므로 안전).

### 5. `clearQueue()` (메서드)

- Type: `() => void`
- `limitedFn.clearQueue()`는 내부 `limit.clearQueue()`를 위임 호출한다.
- `rejectOnClear` 옵션 값에 따른 분기(index.js:77-90, 변경 없음):
  - `rejectOnClear`가 `false`(기본값) 또는 미지정: 대기 중인 항목을 조용히 버린다
    (`queue.clear()`), `pendingCount`는 즉시 `0`.
  - `rejectOnClear`가 `true`: 대기 중인 각 항목을 `AbortSignal.abort().reason`(AbortError)으로
    순서대로 reject하며 dequeue한다. 이미 `activeCount`에 포함된(실행 중인) 작업에는 영향 없음.
- `rejectOnClear`는 `limitFunction(function_, options)`의 `options.rejectOnClear`로 전달되어야
  한다 — `options`는 그대로 `pLimit(options)`에 위임되는 기존 구조이므로 별도 파싱 로직은
  필요 없다.
- 엣지케이스:
  - 큐가 비어 있을 때 호출 → no-op, 예외 없음.
  - 연속 호출 → 두 번째 호출도 no-op.
  - `clearQueue()` 이후에도 `limitedFn`은 새 호출을 계속 받아 정상 동작해야 한다(수렴 후
    재사용 가능 — 기존 pLimit 회귀 가드와 동일 계약, test.js:437-441 / 444-478 패턴 참고).

## FIFO 보장 (변경 없음, 명시적 회귀 대상)

- `limitFunction`으로 생성된 개별 `limitedFn` 호출은 호출된 순서대로 큐잉되고, concurrency
  여유가 생기는 순서대로 실행되어야 한다(내부적으로 동일한 `pLimit` 인스턴스의 큐를 사용하므로
  `yocto-queue`의 FIFO 특성을 그대로 상속).
- `activeCount` / `pendingCount` / `concurrency` / `clearQueue` 노출 추가가 큐잉 순서 자체에
  영향을 주어서는 안 된다 — 순수 관찰/제어 API이며 스케줄링 로직에는 비침습적이어야 한다.

## 타입 계약 (index.d.ts)

- `limitFunction`의 반환 타입은 기존 `(...arguments_: Arguments) => Promise<ReturnType>`에서,
  위 4개 속성을 추가로 갖는 타입으로 확장되어야 한다.
- 구현 방식은 developer 소관이며, 본 명세는 계약만 정의한다. 다음 필드가 반드시 포함되어야 한다:
  - `readonly activeCount: number`
  - `readonly pendingCount: number`
  - `concurrency: number` (getter+setter)
  - `clearQueue: () => void`
- 기존 `limitFunction` 시그니처의 파라미터(`function_`, `options`)는 변경하지 않는다(additive).
- 참고: 기존 `LimitFunction` 타입(index.d.ts:1-57)이 이미 동일한 4개 필드 형태를 가지고 있어
  타입 재사용/추출 후보가 될 수 있으나, 재사용 여부(제네릭화 vs 신규 타입 정의)는 구현 결정
  사항으로 developer에게 위임한다.

## Out of scope (본 작업에서 명세하지 않음)

- `limitedFn.map(...)` 노출 — `pLimit`의 `limit.map`과 달리 `limitFunction`은 단일 `function_`에
  고정되어 map 시맨틱이 자연스럽지 않으므로 이번 명세에 포함하지 않는다. 필요 시 별도 Jira
  티켓으로 분리한다.
- `this` 바인딩 개선(`call`/`apply`로 `function_`의 `this`를 실제로 바꾸는 기능) — 기존에도
  지원되지 않던 기능이며, breaking 여부 검토가 필요해 별도 논의 대상으로 남긴다.

## 마이그레이션 / additive 검증 항목 (기존 동작 무변경 체크리스트)

- [ ] `limitFunction(fn, {concurrency})`로 만든 `limitedFn(...)` 호출 결과/타이밍이 변경 전과
      동일하다(concurrency: 1/4/5 케이스, test.js:10-43 스타일 유지).
- [ ] `limitedFn` 호출 시 `fn`에 전달되는 인자 개수/순서/값이 100% 보존된다(rest+spread 그대로).
- [ ] `limitedFn.call(ctx, ...)` / `.apply(ctx, ...)` 호출 시 `fn` 내부 `this`는 (기존과 동일하게)
      `ctx`로 바뀌지 않는다 — 회귀 없음을 확인하는 네거티브 테스트.
- [ ] 신규 getter/setter/method 추가 후에도 test.js의 `limitFunction()` 기존 테스트
      (test.js:480-494)가 그대로 통과한다.
- [ ] `index.d.ts` 변경이 기존 사용처(`(...arguments_: Arguments) => Promise<ReturnType>`로만
      호출하는 코드)에 타입 에러를 유발하지 않는다(구조적 타이핑상 필드 추가는 호출 표현식에
      영향을 주지 않는다).

## 회귀 테스트 시나리오 (tester/developer 대상)

1. **실행 2 · 대기 3 카운트**: `limitFunction(fn, {concurrency: 2})`로 5개 호출 →
   `activeCount === 2`, `pendingCount === 3` 확인(즉시 호출 직후, 완료 이전 시점). 이후 순차
   완료에 따라 두 값이 `0`으로 수렴.
2. **동적 concurrency**: 실행 중 `limitedFn.concurrency = N`(N > 기존값)으로 증가시키면, 대기
   중이던 작업이 즉시(microtask 내) 추가로 승격되어 `activeCount`가 새 한도까지 오른다. 감소
   시에는 이미 실행 중인 작업을 강제 중단하지 않고, 새로 시작되는 작업 수만 줄어든다
   (test.js:365-401 `change concurrency` 케이스와 동일 패턴).
3. **clearQueue (`rejectOnClear`: false/미지정)**: `pendingCount > 0` 상태에서 `clearQueue()`
   호출 → `pendingCount`가 즉시 `0`, 대기 중이던 프라미스들은 settle되지 않고 계속 pending
   상태로 남는다(readme.md의 기존 경고와 동일하게 `Promise.all` 등으로 대기 시 행잉 위험 문서화
   유지).
4. **clearQueue (`rejectOnClear`: true)**: 동일 상황에서 대기 중이던 프라미스가 모두
   `AbortError`로 reject되고, 이미 실행 중이던 프라미스는 영향받지 않는다. `clearQueue()` 이후
   재호출로 정상 동작이 재개됨을 확인(수렴 검증, test.js:403-478 회귀 가드 패턴 참고).
5. **FIFO 순서**: 여러 `limitedFn(...)` 호출을 짧은 지연 차등으로 실행 후, 완료 순서가 아닌
   "실행 시작 순서"가 호출 순서와 일치함을 확인(activeCount/pendingCount 전이 로그로 검증).
6. **this/arguments 보존**: 여러 인자 + 임의 `this` 컨텍스트로 호출 → `fn`에 전달된 인자값·개수가
   정확히 일치하고, `this` 관련 동작(전달되지 않음)은 변경 전과 동일함을 확인.
