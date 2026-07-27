# snapshot().status 실행 계약 동결 (F68F701A7A-127)

- **상태**: Interface Freeze (planner 확정)
- **producer 계약**: `planning-contract@v1`
- **consumer**: designer(F68F701A7A-125), developer(F68F701A7A-126), tester(F68F701A7A-129)
- **대상 저장소**: skfive/p-limit
- **변경 성격**: additive-only (기존 반환 필드·스케줄링·타이밍·Promise settlement 불변)

이 문서는 downstream producer 가 추측 없이 구현할 수 있도록 `snapshot().status` 파생 규칙과 회귀 불변식을 동결한다. designer/developer 는 이 승인된 실행 설계를 따른다.

---

## 1. 배경 (현재 사실)

현 `index.js` 에는 두 개의 관측 표면이 있다.

1. **`subscribe()` push 페이로드** — 내부 `snapshot` arrow(`index.js` 의 상태 파생 블록)가 매 전이마다 `{activeCount, pendingCount, concurrency, status}` 를 frozen 으로 전달한다. 여기 `status` 는 **이미** `paused > saturated > active > idle` 우선순위로 파생되고 있으며 타입은 `LimiterSnapshot` / `LimiterStatus` 이다.
2. **공개 `snapshot()` 메서드** — 동기·부수효과 없는 point-in-time read 로 `{activeCount, pendingCount, concurrency, isPaused}` 를 frozen 으로 반환한다. 타입은 `LimiterStateSnapshot`. **여기에는 `status` 필드가 없다.**

이번 작업의 대상은 **공개 `snapshot()` 반환 객체에 `status` 필드를 additive 하게 추가**하는 것이다. `subscribe()` 페이로드(`LimiterSnapshot`)와 그 `status` 파생 로직은 이미 존재하므로 **변경하지 않는다**. 두 표면은 동일한 status 어휘와 동일한 파생 규칙을 공유해야 한다.

---

## 2. 상태 어휘 및 파생 규칙 (동결)

상태 어휘는 정확히 4개다: `'idle' | 'active' | 'saturated' | 'paused'` (`LimiterStatus`).

파생 기준 변수: `activeCount`, `pendingCount`, `concurrency`, `isPaused`(내부 `paused` 플래그). 파생은 **고정된 우선순위 순서**로 첫 번째로 만족하는 분기를 채택한다.

| 우선순위 | status | 파생 조건 (앞 분기 미충족 전제) |
|---|---|---|
| 1 (최상) | `'paused'` | `isPaused === true` (즉 `pause()` 후 `resume()` 전) |
| 2 | `'saturated'` | `activeCount >= concurrency` |
| 3 | `'active'` | `activeCount > 0` |
| 4 (최하) | `'idle'` | 그 외 (`activeCount === 0`) |

동결 규칙:

- **우선순위는 `paused > saturated > active > idle` 로 고정한다.** 이 순서는 변경 불가.
- `pendingCount` 는 status 파생에 **직접 관여하지 않는다** (분기 조건에 등장하지 않음). 대기 태스크만 있고 실행이 없으면(`activeCount === 0`, 비paused) status 는 `'idle'` 이다. 단 이 경우 `pendingCount > 0` 일 수 있으므로 소비자는 "idle status" 를 "큐 빔" 으로 해석하면 안 된다. (`isIdle` 게터의 idle 판정과는 별개 의미임에 유의: `isIdle` 은 `activeCount===0 && pendingCount===0 && mapSchedulers 없음`. status `'idle'` 은 실행 슬롯 기준만 본다.)
- paused 상태에서는 `activeCount >= concurrency` 여도 status 는 `'paused'` 가 우선한다 (running 태스크는 계속 settle 되지만 promotion 만 중단되므로).

파생의 정규 참조 구현(이미 존재, 재사용 대상):

```js
let status;
if (paused) {
    status = 'paused';
} else if (activeCount >= concurrency) {
    status = 'saturated';
} else if (activeCount > 0) {
    status = 'active';
} else {
    status = 'idle';
}
```

developer 는 공개 `snapshot()` 에서 **동일한 파생 규칙**으로 `status` 를 계산해야 한다. 두 지점에 로직을 중복하기보다, 단일 파생 함수/헬퍼를 공유해 두 표면(`subscribe` 페이로드, `snapshot()` 반환)이 항상 동일한 결과를 내도록 하는 것을 권장한다. (설계 판단은 developer 재량이나, 결과 동일성은 계약이다.)

---

## 3. Infinity(무한 concurrency) 경계 처리 (동결)

- `concurrency` 는 양의 정수 또는 `Number.POSITIVE_INFINITY` 다 (`validateConcurrency`).
- `concurrency === Infinity` 인 경우 **`saturated` 로 판정하지 않는다.** 근거: `activeCount` 는 항상 유한하므로 `activeCount >= Infinity` 는 항상 `false` 다. 별도 특수 분기 없이 위 표준 파생식이 자연히 이 규칙을 만족한다.
- 따라서 무한 concurrency 리미터의 status 는 `paused`(paused 시) / `active`(running ≥ 1) / `idle`(running 0) 중 하나이며 **결코 `saturated` 가 아니다.**
- 이는 기존 `isSaturated` 게터(`activeCount >= concurrency`)와 정확히 일치한다 (무한 limit 은 never saturated).

---

## 4. 공통 인터페이스: pLimit 과 limitFunction (동결)

- `pLimit()` 이 반환하는 `limit` 과 `limitFunction()` 이 반환하는 함수는 **동일한 status 계약과 타입을 공유한다.**
- `limitFunction` 의 `snapshot()` 은 이미 내부 `limit.snapshot()` 에 **위임(delegate)** 하고 있다(`index.js` 의 `limitFunction` 정의). 따라서 공개 `snapshot()` 에 `status` 를 추가하면 `limitFunction` 쪽은 위임을 통해 **자동으로** 동일한 `status` 를 노출한다. `limitFunction` 에 별도 파생 로직을 추가하지 말 것 (중복 금지, 위임 유지).
- 타입 정의(`index.d.ts`)에서는 `LimiterStateSnapshot` 에 `status` 를 추가하고, `LimitFunction.snapshot` / `LimitedFunction.snapshot` 은 계속 동일한 `LimiterStateSnapshot` 를 반환하도록 유지한다. 두 표면의 타입 일치가 계약이다.

---

## 5. 변경 대상 파일 및 역할

| 파일 | 변경 내용 | 소유(후속) |
|---|---|---|
| `index.js` | 공개 `snapshot()` 반환 객체에 `status` 필드 additive 추가 (§2 파생식 재사용). `limitFunction` 은 위임 유지, 수정 최소화. | developer(F68F701A7A-126) |
| `index.d.ts` | `LimiterStateSnapshot` 에 `readonly status: LimiterStatus` 추가 및 JSDoc 갱신. `LimiterStatus` 어휘는 그대로 재사용. | developer |
| `readme.md` | `snapshot()` 문서에 `status` 필드·어휘·우선순위·Infinity 경계 설명 추가. | developer |
| `test.js` | 공개 `snapshot().status` 의 각 상태·우선순위·Infinity 경계·`limitFunction` 위임 동일성 검증 (focused). | developer / tester |
| `index.test-d.ts` | `snapshot()` 반환 타입에 `status: LimiterStatus` 존재 및 리터럴 유니온 타입 어서션. | developer / tester |

> 이 계획 문서(`docs/plans/snapshot-status-plan-F68F701A7A-124.md`)는 planner 소유이며, 위 소스 파일들은 planner 가 수정하지 않는다. developer 가 이 계약대로 구현한다.

---

## 6. 회귀 불변식 (동결 — 마이그레이션 무결·롤백 가능)

developer 구현이 반드시 보존해야 하는 불변식:

- **INV-1 additive-only**: 공개 `snapshot()` 의 기존 필드 `activeCount`, `pendingCount`, `concurrency`, `isPaused` 는 이름·의미·값이 변경되지 않는다. `status` 만 새로 추가된다. 반환 객체는 계속 `Object.freeze` 된 fresh 객체다.
- **INV-2 스케줄링/타이밍 불변**: `snapshot()` 호출은 부수효과가 없으며 스케줄링·실행 순서·Promise settlement·타이밍에 영향을 주지 않는다 (기존 O(1) point-in-time read 유지).
- **INV-3 파생 우선순위 고정**: status 파생은 `paused > saturated > active > idle` 순서를 따른다 (§2).
- **INV-4 Infinity never saturated**: `concurrency === Infinity` 이면 `status !== 'saturated'` (§3).
- **INV-5 표면 일관성**: 동일 시점의 상태에서 `snapshot().status` 와 `subscribe()` 페이로드의 `status` 는 동일 값을 낸다. `subscribe()`/`LimiterSnapshot` 페이로드 자체는 변경하지 않는다.
- **INV-6 공통 인터페이스**: `pLimit` 인스턴스와 `limitFunction` 결과물은 동일 status 계약·타입을 공유하며, `limitFunction.snapshot()` 은 위임으로 동일 값을 낸다 (§4).
- **INV-7 롤백 가능**: 변경이 순수 additive 이므로 `status` 추가를 되돌려도 기존 소비자 계약은 그대로다 (rollback-safe).

---

## 7. focused 테스트 범위

`BRIX_TEST_SCOPE=focused`. 이 작업이 검증할 대상만 실행한다.

포함 (검증 필수):

- `snapshot().status` 각 어휘 파생:
  - `idle`: 생성 직후, 실행·pause 없음 → `'idle'`.
  - `active`: concurrency 여유 상태에서 최소 1개 running → `'active'`.
  - `saturated`: `activeCount >= concurrency` (유한) → `'saturated'`.
  - `paused`: `pause()` 후 → `'paused'` (running 유무·saturated 여부와 무관하게 우선).
- 우선순위 경계: saturated 상태에서 `pause()` → `'paused'` 로 전환됨을 확인 (우선순위 검증).
- Infinity 경계: `pLimit(Infinity)` 에서 running ≥ 1 → `'active'`, running 0 → `'idle'`, 결코 `'saturated'` 아님.
- pending-only 케이스: `activeCount === 0 && pendingCount > 0` (비paused) → `'idle'` (pendingCount 는 status 에 관여 안 함).
- `limitFunction` 위임 동일성: `limitFunction(...).snapshot().status` 가 대응 상태에서 `pLimit` 과 동일.
- 타입 어서션(`index.test-d.ts`): `snapshot()` 반환에 `status: LimiterStatus`('idle'|'active'|'saturated'|'paused') 존재.

제외 (이번 작업에서 실행하지 않음):

- 다른 SPA/모듈 회귀 가드 및 `snapshot().status` 와 무관한 기존 스위트 전체(preset, map/mapSettled/filter/find, clearQueue, dynamic concurrency 등)는 focused 범위상 이번 변경의 회귀 검증에 직접 필요한 경우가 아니면 skip.

단, `status` 파생이 기존 `subscribe()` 페이로드 파생과 로직을 공유(공통 유틸)한다면, 그 공유 지점에 대한 최소 회귀 가드는 developer/tester 가 직접 확인한다 (INV-5 표면 일관성).

---

## 8. 수용 기준 매핑

- 상태 어휘 4종의 파생 조건(activeCount/pendingCount/concurrency/isPaused 기준) → §2.
- 우선순위 `paused > saturated > active > idle` + `concurrency=Infinity` 경계 → §2, §3.
- pLimit/limitFunction 공통 status 계약 + focused 테스트 범위 → §4, §7.
- 기존 반환 필드·스케줄링·타이밍 불변(마이그레이션 무결·롤백 가능) → §6.
