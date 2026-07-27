# pause/resume 큐 제어 구현 설계 (F68F701A7A-60)

> planner 산출물 — developer(F68F701A7A-59)가 그대로 구현하고 tester(F68F701A7A-62)가 검증할 실행 계획 및 handoff 계약.
> 계약 인터페이스: `planning-contract@v1`. developer는 아래 public API 시그니처와 additive 무결성 규칙을 **재정의하지 않고 따른다**.

## 1. 목표 / 배경

`p-limit` 인스턴스(`limit`)에 실행 중인 큐를 **일시 정지(pause)** 하고 **재개(resume)** 하는 제어를 additive 로 추가한다.
- pause: 새 대기 항목의 시작을 막는다. 이미 실행 중인 promise 는 정상 완료된다.
- resume: 정지 시점 이후 멈춰 있던 대기 항목을 현재 `concurrency` 한도까지 다시 시작한다.

기존 소비자(pause 를 호출하지 않는 코드)의 동작·타이밍은 **바이트 단위로 동일**해야 한다(§6 additive 무결성).

## 2. 사용자 시나리오

- 시나리오 A (백프레셔): 외부 시스템이 rate-limit 을 신호하면 `limit.pause()` 로 신규 작업 투입을 멈추고, 여유가 생기면 `limit.resume()` 으로 재개한다. 실행 중이던 요청은 취소하지 않는다.
- 시나리오 B (수동 게이트): 사용자가 UI 에서 "일시정지" 를 누르면 큐에 쌓인 작업은 보존한 채 시작만 보류하고, "재개" 시 그대로 이어서 처리한다.
- 시나리오 C (정지 중 정리): pause 상태에서 `limit.clearQueue(reason)` 로 대기 항목만 버리고, resume 시 남은 항목(없으면 아무 것도)만 시작한다.

## 3. Public API 시그니처 (frozen)

`limit`(기본 export `pLimit` 반환값)과 `limitFunction` 반환값 **양쪽**에 아래 3개를 추가한다.

| 멤버 | 시그니처 | 의미 |
| --- | --- | --- |
| `pause` | `pause(): void` | 정지 상태로 전환. 멱등(이미 정지면 no-op). 실행 중 promise 는 건드리지 않음. |
| `resume` | `resume(): void` | 정지 해제 후 `concurrency` 한도까지 대기 항목 promotion. 멱등(이미 실행 중이면 no-op). |
| `isPaused` | `readonly isPaused: boolean` | 현재 정지 여부의 `O(1)` 동기 스냅샷. `isIdle`/`isSaturated` 와 동일한 introspection 패턴. |

> `isPaused` 추가 근거(Simplicity First 대비 정당화): 정지 상태는 pause/resume 의 유일한 관찰 가능한 부수효과이며, AVA·tsd 회귀 테스트가 상태 전이를 **동기적으로** 단정하려면 관찰 지점이 필요하다. 기존 `isIdle`/`isSaturated` getter 와 완전히 동형이라 추가 abstraction 을 만들지 않는다. developer 는 이 3개만 노출하고 그 이상(예: `pauseAll`, 이벤트 emitter 등)은 만들지 않는다.

`pause()`/`resume()` 는 값을 반환하지 않는다(`void`). 체이닝은 스펙에 포함하지 않는다(단순성 유지).

## 4. index.d.ts 타입 변경안

`LimitFunction` 타입과 `LimitedFunction<...>` 타입 **양쪽 멤버**에 아래를 추가한다(위치: `isSaturated` 뒤 권장).

```ts
/**
Pause the limiter.

Stops promoting pending tasks so no queued task starts until `resume()` is called.
Tasks that are already running are not affected and will settle normally.
Calling `pause()` while already paused is a no-op.
*/
pause: () => void;

/**
Resume a paused limiter.

Promotes pending tasks up to the current `concurrency` limit, restoring normal scheduling.
Calling `resume()` while not paused is a no-op.
*/
resume: () => void;

/**
Whether the limiter is currently paused — `true` after `pause()` and before `resume()`.

This is a read-only `O(1)` snapshot. While paused, running tasks still settle but no
pending task starts, so a paused limiter with pending tasks is never idle.
*/
readonly isPaused: boolean;
```

- 기존 타입 멤버의 시그니처는 변경하지 않는다(추가만).
- `Options` 타입에는 아무 것도 추가하지 않는다(생성자 옵션으로 초기 pause 상태를 받지 않는다 — 범위 밖).

## 5. index.js 구현 통합 지점 (developer 지침)

다음 통합 지점만 손대면 되며, 인접 스케줄 로직(§Surgical Changes)은 재작성하지 않는다.

1. **상태 선언**: `let activeCount = 0;` 근처에 `let paused = false;` 추가.

2. **promotion 게이트(`resumeNext`)**: 유일한 대기→실행 승격 함수이므로 여기에 게이트를 추가한다.
   ```js
   const resumeNext = () => {
       if (!paused && activeCount < concurrency && queue.size > 0) {
           activeCount++;
           queue.dequeue().run();
       }
   };
   ```
   이 한 줄로 `enqueue()`(신규 투입)·`next()`(완료 후 승격) 경로가 모두 정지 상태를 존중한다.

3. **⚠️ `concurrency` setter 의 drain 루프(무한 루프 함정)**: setter 는 `resumeNext` 를 쓰지 않고 직접 `while` 로 drain 한다. `resumeNext` 에만 게이트를 넣으면, setter 는 `resumeNext()` 가 아니라 자체 루프를 돌므로 게이트가 적용되지 않는다. 더 위험한 것은 setter 가 `resumeNext()` 를 호출하도록 바꾸면 정지 중 `activeCount`/`queue.size` 가 변하지 않아 **무한 루프**가 된다. 따라서 setter 의 drain 조건에도 `!paused` 를 명시한다.
   ```js
   queueMicrotask(() => {
       // eslint-disable-next-line no-unmodified-loop-condition
       while (!paused && activeCount < concurrency && queue.size > 0) {
           resumeNext();
       }
       for (const schedule of mapSchedulers) {
           schedule();
       }
   });
   ```
   즉 정지 중 `concurrency` 변경은 값만 반영되고 drain 은 보류된다(§7 규칙 D).

4. **`map` lazy scheduler(`schedule`) 게이트**: `mapAsyncIterable` 의 `schedule()` 도 정지를 존중해야 신규 draw 가 큐에 쌓이지 않는다.
   ```js
   function schedule() {
       if (settled || drawing || iteratorDone || paused) {
           return;
       }
       if (inFlight < concurrency) {
           drawOne();
       }
   }
   ```
   `paused` 는 `pLimit` 클로저 변수이고 `schedule` 은 그 안쪽 클로저이므로 접근 가능하다. resume 시 `mapSchedulers` 를 다시 깨우는 처리는 5-6 에서 함께 한다.

5. **`pause`/`resume`/`isPaused` 정의**: `Object.defineProperties(generator, {...})` 블록에 추가한다.
   ```js
   pause: {
       value() {
           paused = true;
       },
   },
   resume: {
       value() {
           if (!paused) {
               return;
           }
           paused = false;
           // concurrency setter 의 drain 과 동일한 패턴으로 승격한다.
           while (activeCount < concurrency && queue.size > 0) {
               resumeNext();
           }
           for (const schedule of mapSchedulers) {
               schedule();
           }
       },
   },
   isPaused: {
       get: () => paused,
   },
   ```
   - `resume()` 의 drain 은 동기 `while` 로 하되, `resumeNext()` 는 실제 실행을 `run()`(→ `Promise.then`)으로 비동기 예약하므로 실행 컨텍스트/타이밍은 기존 승격 경로와 동일하게 유지된다.
   - drain 이후 `mapSchedulers` 재기동으로 정지 중 멈췄던 lazy map draw 를 재개한다.

6. **`limitFunction` 위임**: `limitedFunction` 의 `Object.defineProperties` 에 동일 3개를 내부 `limit` 로 위임한다(스케줄 로직 중복 금지).
   ```js
   pause: {
       value() {
           limit.pause();
       },
   },
   resume: {
       value() {
           limit.resume();
       },
   },
   isPaused: {
       get: () => limit.isPaused,
   },
   ```

## 6. Additive 무결성 조건 (MUST)

pause 미호출 소비자의 기존 동작이 **완전히 동일**함을 다음으로 보장한다.

- `paused` 초기값은 `false`. 어떤 생성 경로에서도 자동으로 `true` 가 되지 않는다.
- pause 를 호출하지 않으면 `resumeNext`/`concurrency` setter/`map schedule` 의 `!paused`·`paused` 게이트는 항상 통과 조건이 되어 로직·타이밍이 변경 전과 동일하다.
- 기존 public 멤버(`activeCount`, `pendingCount`, `clearQueue`, `concurrency`, `map`, `onIdle`, `isIdle`, `isSaturated`, `limit(...)`)의 시그니처·반환·의미는 변경하지 않는다(추가만).
- `Options`(생성자 옵션)는 변경하지 않는다.
- 검증: 기존 `test.js`·`test-scheduler-state-machine.js`·`index.test-d.ts` 전체가 무수정으로 green 이어야 한다(회귀 없음이 additive 의 판정 기준).

## 7. 상호작용 / 상태 의미 보존 규칙

| ID | 상황 | 규칙 |
| --- | --- | --- |
| A | pause 시 실행 중 promise | 취소·중단하지 않고 정상 완료. 완료 시 `next()` 는 `activeCount--` 하되 `resumeNext` 게이트로 다음 항목을 시작하지 않는다. |
| B | pause 시 대기 항목 | 큐에 **보존**(제거·거부하지 않음). 시작만 보류. |
| C | resume 시 | `paused=false` 후 `concurrency` 한도까지 대기 항목 promotion. 남은 큐가 없으면 no-op. |
| D | pause 중 `concurrency` 변경 | 값은 즉시 반영되나 drain 은 보류(setter 의 `!paused` 게이트). resume 시 **새 한도** 기준으로 promotion. 낮춘 경우도 실행 중 초과분을 강제 종료하지 않음(기존 setter 동작과 동일). |
| E | pause 중 `clearQueue(reason)` | pause 와 독립적으로 동작. 대기 항목을 제거/거부하고 제거 개수 반환. resume 해도 이미 비워진 큐는 아무 것도 시작하지 않음. |
| F | `activeCount` 의미 | 항상 "현재 실행 중 개수". pause 는 실행 중 promise 를 건드리지 않으므로, pause 직후 값은 유지되고 실행 완료에 따라 자연 감소. pause 자체가 값을 조작하지 않음. |
| G | `pendingCount`(= `queue.size`) 의미 | pause 중에도 대기 항목이 보존되므로 값 유지. resume 으로 promotion 되면 감소. |
| H | `isIdle`/`onIdle` | idle 판정식(`activeCount===0 && queue.size===0 && mapSchedulers.size===0`)은 불변. **정지 + 대기 항목 존재 → `isIdle===false`, `onIdle()` 미해결**(대기 항목이 시작될 수 없으므로 의도된 동작). 정지 + 큐 비어있고 실행 없음 → 여전히 idle. |
| I | `isSaturated`(= `activeCount >= concurrency`) | pause 와 무관하게 `activeCount` 기준 유지. |
| J | `map()` 상호작용 | 진행 중 draw 는 A 규칙대로 완료. 정지 중 신규 draw 는 §5-4 게이트로 보류되고 resume 시 §5-5 의 `mapSchedulers` 재기동으로 이어짐. `map()` 결과 순서·값은 불변. |
| K | 멱등성 | 이미 정지 상태에서 `pause()` 재호출 = no-op. 비정지 상태에서 `resume()` = no-op. |

## 8. Edge / 실패 케이스

- E1: 큐가 빈 상태에서 `pause()` → `resume()` : 순수 no-op, 관찰 가능한 상태 변화 없음(단 `isPaused` 는 true→false 로 전이).
- E2: `pause()` 직후 새 `limit(fn)` 호출 : 즉시 시작하지 않고 큐에 대기(`pendingCount` 증가). resume 시 시작.
- E3: `pause()` 중 `concurrency` 를 낮춤 후 `resume()` : 새(낮은) 한도까지만 promotion.
- E4: `pause()` 중 `concurrency` 를 무한대(`Infinity`)로 올린 뒤 `resume()` : 전체 대기 항목 promotion.
- E5: 정지 상태에서 실행 중이던 마지막 promise 가 완료 : 대기 항목이 있으면 `isIdle===false` 유지(시작되지 않음), 없으면 idle.
- E6: `pause()`/`resume()` 에 인자 전달 : 무시(추가 파라미터 없음). 잘못된 사용이지만 throw 하지 않음(기존 `void` 메서드 관례).
- E7: `resume()` 를 pause 없이 호출 : no-op(§7-K), throw 하지 않음.
- 참고: `pause()` 는 이미 실행 중 promise 를 취소하지 않는다(공식 non-goal). 취소가 필요하면 `clearQueue(reason)` 는 **대기** 항목만 대상이라는 기존 계약을 문서로 재확인한다.

## 9. 회귀 / 신규 테스트 항목 (developer + tester handoff)

### 9.1 AVA 단위 테스트
신규 pause/resume 케이스는 저장소 관례(별도 파일 `test-scheduler-state-machine.js` 존재)에 따라 **`test-pause-resume.js`** 에 작성한다. 기존 `test.js` 는 무수정으로 green 유지(회귀 가드).

작성할 케이스(최소):
1. pause 후 신규 `limit(fn)` 이 시작되지 않음(`activeCount` 불변, `pendingCount` 증가).
2. pause 시 실행 중 promise 는 정상 완료됨.
3. resume 후 `concurrency` 한도까지 대기 항목이 시작됨(순서 보존).
4. pause 중 `concurrency` 상향 → resume 시 새 한도로 promotion(규칙 D, E3/E4).
5. pause 중 `concurrency` 하향 → 실행 중 초과분 강제 종료 안 됨.
6. pause 중 `clearQueue(reason)` → 대기 항목 거부/제거, resume 시 시작할 것 없음(규칙 E).
7. 정지 + 대기 항목 존재 시 `isIdle===false` 및 `onIdle()` 미해결, resume 후 해결(규칙 H).
8. `pause()`/`resume()` 멱등성(규칙 K), `isPaused` 전이 스냅샷.
9. `map()` 진행 중 pause → 신규 draw 보류, resume 후 완료·결과 순서 불변(규칙 J).
10. `limitFunction` 반환값의 `pause`/`resume`/`isPaused` 위임 동작(§5-6).

### 9.2 tsd 타입 테스트 (`index.test-d.ts`)
아래 단정을 추가한다(기존 단정은 변경 금지):
```ts
expectType<void>(limit.pause());
expectType<void>(limit.resume());
expectType<boolean>(limit.isPaused);

expectType<void>(lf.pause());
expectType<void>(lf.resume());
expectType<boolean>(lf.isPaused);
```

### 9.3 readme.md 갱신 항목
- `### limit.pause()` 섹션 추가(정지 의미, 실행 중 promise 미취소, 멱등).
- `### limit.resume()` 섹션 추가(정지 해제 + `concurrency` 한도 promotion, 멱등).
- `### limit.isPaused` 섹션 추가(`O(1)` 스냅샷, `isIdle`/`isSaturated` 옆).
- `limitFunction` 하단 "control and observation surface" 나열 문장에 `.pause()`, `.resume()`, `.isPaused` 추가.
- (선택) FAQ 의 p-queue 비교 문장에서 "ability to pause the queue" 차별점 완화 문구 조정 — 필수는 아님, developer 재량.

## 10. 완료 조건 (검증 가능한 종료 조건)

- [ ] `index.js` 에 §5 통합 지점(1~6)이 반영됨.
- [ ] `index.d.ts` 의 `LimitFunction`·`LimitedFunction` 양쪽에 §4 타입 추가됨.
- [ ] `index.test-d.ts` 에 §9.2 단정 추가, `readme.md` 에 §9.3 섹션 추가.
- [ ] `test-pause-resume.js` 에 §9.1 케이스 작성.
- [ ] `npm test`(xo + ava + tsd) 전체 green, 기존 `test.js`·`test-scheduler-state-machine.js` 회귀 없음.
- [ ] pause 미호출 소비자 동작이 변경 전과 동일(§6 additive 무결성).

## 11. developer 를 위한 non-goals

- 실행 중 promise 취소/중단(pause 는 **시작만** 막음).
- 생성자 옵션(`Options`)으로 초기 pause 상태 받기.
- pause 타임아웃·자동 resume·이벤트 emitter 등 부가 기능.
- `pause()`/`resume()` 체이닝 반환.
- 스케줄 코어(`run`/`enqueue`/`next`/`mapAsyncIterable`) 재작성 — §5 게이트 삽입 외 구조 변경 금지.
