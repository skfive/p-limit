# `clearQueue(reason?)` 반환 계약 · 취소 정책 명세

- Jira: F68F701A7A-20
- 대상 저장소: `skfive/p-limit`
- 관련 형제 작업: F68F701A7A-21 (developer, 본 명세 구현)
- base: `9c903be4841524d7fd426b7ed1e88904266ef0ba`
- 근거 파일(읽기 전용 확인): `index.js`, `index.d.ts`, `readme.md`, `test.js`, `index.test-d.ts`

## 1. 목적 / 스코프

`clearQueue()`를 `clearQueue(reason?)`로 확장하고, 제거된 대기(pending) 항목 수(`number`)를 반환하도록 계약을 확정한다. 동시에 생성자 옵션 `rejectOnClear`(boolean)와 호출 시점 `reason` 인자의 조합에 따른 pending Promise 정산 규칙을 1:1로 정의하여, 개발 착수 전 모호함을 제거한다.

**Non-goal (본 명세 밖)**:
- 실행 중(active) 작업의 취소/중단 — 대상 아님 (계약상 명시적으로 불변)
- `AbortSignal`을 `pLimit()` 또는 개별 `limit(fn)` 호출에 연결하는 신규 기능
- 신규 npm 의존성 도입 — 금지 (기존 전역 `AbortSignal` Web API만 사용)
- `readme.md` / `index.d.ts` / `test.js` / `index.test-d.ts` 실제 수정 — 구현은 F68F701A7A-21(developer) 담당. 본 문서는 그 구현이 따라야 할 계약만 정의한다.

## 2. 함수 시그니처

```ts
// index.d.ts — LimitFunction / LimitedFunction 공통
clearQueue: (reason?: unknown) => number;
```

- `reason` 타입은 `unknown`으로 둔다. `Error` 인스턴스/문자열/일반 객체/`null`/기타 어떤 값이든 검증 없이 그대로 받아들여 reject 값으로 그대로 전달한다(타입 강제·래핑 로직 없음 → 신규 의존성·복잡도 없음).
- `reason` 인자를 **아예 전달하지 않는 것**(호출부에서 인자를 생략)과 **명시적으로 `undefined`를 전달하는 것**은 동일하게 "미지정"으로 취급한다. 즉 판별 기준은 `reason === undefined`이며 `arguments.length` 검사는 불필요하다.
- `reason === null`은 "미지정"이 **아니다** — 유효한 reason 값으로 취급되어 §4의 "reason 지정" 행을 따른다 (edge case 표 §6-8 참조).
- 반환 타입은 `void` → `number`로 변경된다. 이는 **breaking type change**이며, `index.d.ts`의 `expectType<void>(limit.clearQueue())` 단언과 `test.js`의 관련 검증은 F68F701A7A-21에서 함께 갱신되어야 한다(본 작업의 owned_paths 밖이므로 여기서는 수정하지 않음).

## 3. 반환값 계약

`clearQueue(reason?)`는 **대기열(pending)에서 제거된 항목 수**를 `number`로 반환한다.

- 카운트 대상: 호출 시점에 아직 실행이 시작되지 않은 항목만. 즉 `pendingCount`(내부 `queue.size`)에 해당하는 항목.
  - `limit(fn)`으로 큐잉된 일반 항목
  - `limit.map()` 내부에서 아직 draw되지 않았거나 draw되었지만 아직 실행 슬롯을 못 받은 항목(내부적으로 동일한 `queue`를 공유하므로 별도 계산 불필요)
- 카운트 제외 대상: `activeCount`에 해당하는 실행 중 항목(§5 참조). `clearQueue`는 이 값에 전혀 영향을 주지 않는다.
- 값 산정 시점: `clearQueue` 호출 시작 시점의 `queue.size` 스냅샷. `rejectOnClear`/`reason` 조합과 무관하게 동일한 방식으로 산정한다(정산 방식이 달라도 "몇 개를 치웠는가"는 항상 같은 의미).

## 4. `rejectOnClear` × `reason` 정산 규칙 (핵심 표)

두 가지 규칙으로 요약된다:

1. **`reason`이 지정되면(`!== undefined`), `rejectOnClear` 값과 무관하게** 모든 pending 항목을 해당 `reason` 값으로 `reject()`한다.
2. **`reason`이 미지정이면**, 기존 생성자 옵션 `rejectOnClear`를 그대로 따른다 — `true`면 `AbortError`로 reject, `false`면 정산하지 않고 버린다(discard, 영원히 settle 안 됨 — 기존 동작 100% 유지).

| # | `rejectOnClear` | `reason` 인자 | pending Promise 정산 결과 | 비고 |
|---|---|---|---|---|
| 1 | `false` | 미지정 | **정산 안 됨** (resolve도 reject도 하지 않음, 참조 해제만 됨) | 기존 기본 동작과 100% 동일 (하위 호환) |
| 2 | `false` | `Error` 인스턴스 | `reject(reason)` — 전달된 Error 그대로 | 명시적 reason은 `rejectOnClear`를 오버라이드 |
| 3 | `false` | 문자열 | `reject(reason)` — 문자열 값 그대로 (Error로 래핑하지 않음) | 동일 |
| 4 | `false` | 일반 객체 (plain object) | `reject(reason)` — 객체 그대로 | 동일 |
| 5 | `true` | 미지정 | `reject(AbortError)` — `AbortSignal.abort().reason`과 동일한 표준 `AbortError` | **기존 동작과 100% 동일 (§5 하위 호환 필수)** |
| 6 | `true` | `Error` 인스턴스 | `reject(reason)` — 지정된 Error로 대체 (AbortError 아님) | 명시적 reason이 기본 AbortError보다 우선 |
| 7 | `true` | 문자열 | `reject(reason)` — 문자열 값 그대로 | 동일 |
| 8 | `true` | 일반 객체 | `reject(reason)` — 객체 그대로 | 동일 |

**의사코드 (구현 힌트, 강제 아님 — 개발자가 세부 구현 자유):**

```js
clearQueue(reason) {
  const removedCount = queue.size;

  if (reason === undefined) {
    if (rejectOnClear) {
      const abortError = AbortSignal.abort().reason;
      while (queue.size > 0) {
        queue.dequeue().reject(abortError);
      }
    } else {
      queue.clear();
    }
  } else {
    while (queue.size > 0) {
      queue.dequeue().reject(reason);
    }
  }

  notifyIdle();
  return removedCount;
}
```

- `notifyIdle()` 호출은 정산 방식(행 1~8 어느 쪽이든)과 무관하게 **항상** 수행되어야 한다 — pending이 모두 사라지고 active/맵 스케줄러도 없다면 `onIdle()` 대기자들에게 통지되어야 한다 (기존 `onIdle()` 계약, F68F701A7A-17과 일관).

## 5. `AbortError` 하위 호환

- §4의 행 5 (`rejectOnClear: true`, `reason` 미지정)는 현재 구현(`AbortSignal.abort().reason`)이 만들어내는 값과 **완전히 동일한 값/타입**을 사용해야 한다.
- 구체적으로 `error.name === 'AbortError'`, `DOMException` 기반 표준 AbortError여야 하며, `test.js`의 기존 단언들(`{name: 'AbortError'}`, 예: `'clearQueue rejects pending promises when enabled'`, `'clearQueue rejects pending map tasks with AbortError and counts converge'`, 두 건의 `regression guard —` 테스트)을 **변경 없이 통과**해야 한다.
- 즉 이 조합에서는 새 `reason` 파라미터 도입으로 인한 동작 변화가 전혀 없어야 한다 — 순수 추가(additive) 변경.

## 6. `limitFunction` 위임 일치

- `limitFunction(fn, options)`이 반환하는 함수의 `.clearQueue(reason?)`는 내부 `limit.clearQueue(reason)`을 **그대로 호출하고 그 반환값을 그대로 반환**해야 한다. 별도 카운팅/재구현 금지 (기존 `activeCount`/`pendingCount`/`onIdle` getter들과 동일하게 위임만 수행).
- 계약:
  ```js
  clearQueue: {
    value(reason) {
      return limit.clearQueue(reason);
    },
  },
  ```
- `index.d.ts`의 `LimitedFunction['clearQueue']` 타입도 `LimitFunction['clearQueue']`와 동일하게 `(reason?: unknown) => number`.

## 7. 활성 작업(active) 불변

- `clearQueue(reason?)`는 **어떤 조합에서도** `activeCount`, 실행 중인 `run()`의 resolve/reject, 실행 중 함수 자체에 전혀 영향을 주지 않는다. 이는 §4의 8개 조합 전부에 예외 없이 적용되는 불변식이다.
- 실행 중 작업은 자기 자신의 정상적인 완료/실패 경로로만 정산된다. `clearQueue`가 개입하는 대상은 오직 `queue`(아직 실행되지 않은 pending 항목)뿐이다.

## 8. Edge case 표

| # | 상황 | `clearQueue(reason?)` 반환값 | Promise 정산 결과 |
|---|---|---|---|
| 1 | 빈 queue (`pendingCount === 0`), active 유무 무관 | `0` | 정산할 대상 없음 — 어떤 조합이든 예외 없이 안전한 no-op |
| 2 | 활성 작업만 존재 (`activeCount > 0`, `pendingCount === 0`) | `0` | active 작업은 §7에 따라 완전히 불변 — 자기 완료 경로로만 정산 |
| 3 | 여러 pending 항목 존재 (`pendingCount > 1`) | 제거된 개수 (예: `3`) | §4 표의 해당 행 규칙을 **모든 pending 항목에 동일하게** 적용 (FIFO 순서로 dequeue) |
| 4 | 반복 호출 (`clearQueue()` 연속 2회) | 1회차: 실제 제거 수 / 2회차: `0` (1회차가 이미 비웠으므로) | 2회차는 항상 안전한 no-op — 이미 정산된 항목을 재정산하지 않음 |
| 5 | `onIdle()` 대기자가 동시에 존재하는 상태에서 호출 | 해당 없음 (반환값은 위 규칙 그대로) | pending 제거로 idle 조건(active=0, pending=0, mapScheduler=0)이 충족되면 `notifyIdle()`로 즉시 통지. active가 남아있으면 idle 대기는 유지됨 (기존 `onIdle()` 계약과 동일, F68F701A7A-17) |
| 6 | `limit.map()` 내부 대기 항목만 존재 (사용자가 직접 `limit(fn)`을 호출하지 않음) | 제거된 map 내부 pending 수 | 동일한 내부 `queue`를 공유하므로 §4 규칙이 그대로 적용됨. reject 시 `map()`이 반환한 최상위 Promise는 해당 reason으로 reject됨 (iterator `return()` best-effort 정리 로직은 기존 그대로 유지) |
| 7 | `reason`으로 `null` 명시 전달 | 제거된 개수 | `reason === undefined`가 아니므로 §4의 "reason 지정" 행 적용 — `reject(null)`로 정산됨 (미지정과 다르게 취급) |
| 8 | `reason`으로 falsy 값(`''`, `0`, `false`) 명시 전달 | 제거된 개수 | `undefined`가 아닌 이상 falsy 여부와 무관하게 "reason 지정"으로 취급 — `reject(reason)`으로 그 값 그대로 정산 (`===undefined` 판별만 사용, truthy 체크 금지) |
| 9 | `concurrency` 변경 직후 큐가 아직 promote되지 않은 상태에서 호출 (`queueMicrotask` 대기 중) | 그 시점의 `queue.size` | 기존 concurrency 변경 로직과 독립적 — `clearQueue`는 호출 시점 스냅샷만 다룸. 이후 `queueMicrotask` 콜백은 빈 큐를 보고 안전하게 종료 |

## 9. 하위 호환 / Breaking change 노트

- **Breaking**: `clearQueue()`의 반환 타입이 `void` → `number`로 바뀐다. 기존에 반환값을 사용하지 않던 호출부는 영향 없음. TypeScript 사용자 중 `expectType<void>` 같은 엄격한 타입 단언을 쓰던 코드가 있다면 깨질 수 있음 — semver상 최소 minor(신규 기능/시그니처 확장)로 표기 권장, 필요 시 major 여부는 PM/개발자 판단.
- **Additive**: `reason` 인자는 optional이며, 미지정 시 기존 `rejectOnClear` 동작이 완전히 보존된다(§1, §5) — 기존 호출부(`clearQueue()`, 인자 없이)는 동작 변화 없음.
- **신규 의존성 없음**: 구현은 기존에 이미 사용 중인 전역 `AbortSignal` Web API(`AbortSignal.abort().reason`)와 순수 JS만으로 가능 (§4 의사코드 참조). `yocto-queue`의 기존 `.dequeue()`/`.clear()`/`.size` 인터페이스로 충분.

## 10. 개발자(F68F701A7A-21) 체크리스트

- [ ] `index.js`: `clearQueue` 구현을 §4 의사코드에 맞게 확장, `limitFunction`의 위임(§6) 반영
- [ ] `index.d.ts`: `LimitFunction['clearQueue']`, `LimitedFunction['clearQueue']` 타입을 `(reason?: unknown) => number`로 갱신
- [ ] `readme.md`: `limit.clearQueue()` 섹션에 `reason` 파라미터, 반환값(number), §4 정산 규칙 요약 반영
- [ ] `test.js`: 기존 `AbortError` 단언 유지 확인(§5) + §4 표 8개 조합 중 최소 reason 지정 케이스(문자열/Error/객체) 커버 + §8 edge case(특히 #1/#2/#4/#7/#8) 커버 + 반환값(`number`) 단언 추가
- [ ] `index.test-d.ts`: `expectType<void>(limit.clearQueue())` → `expectType<number>(limit.clearQueue())`로 갱신, `reason` 인자 타입 테스트 추가

## 11. 미해결 사항

없음 — 본 명세로 개발 착수 가능한 수준까지 확정함.
