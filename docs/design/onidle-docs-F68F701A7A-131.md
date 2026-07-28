# limit.onIdle() — README 정보구조·문구 설계 (F68F701A7A-131)

- **작업**: F68F701A7A-131 · onIdle 문서 정보구조 설계
- **역할**: designer (정보 구조 + 확정 문구 제공, 코드 구현 없음)
- **consumer**: developer(F68F701A7A-132) — 이 명세를 `readme.md` 에 반영 / tester(F68F701A7A-135) 참조
- **근거 계약**: `planning-contract@v1` — `docs/plans/onidle-F68F701A7A-130.md` (frozen) + `index.d.ts`(`LimitFunction.onIdle` / `LimitedFunction.onIdle`)
- **성격**: 브라우저 UI 없음. README(문서) 텍스트 정보구조·확정 문구 설계.

> README 는 영어 OSS 문서이므로 **README 에 그대로 들어갈 확정 문구는 영어**로 제공하고, 설계 의도·판단 설명은 한국어로 병기한다. developer 는 영어 블록을 복사해 `readme.md` 에 반영한다.
>
> **선례 정합**: 자매 태스크 `docs/design/snapshot-status-F68F701A7A-124.md`(F68F701A7A-125, README 정보구조 설계)의 문서 구조·"확정 영어 블록 + 한국어 설계 주석" 방식을 그대로 따른다.

---

## 0. 현행 상태 진단 (as-is)

`readme.md` 에는 **이미 `### limit.onIdle()` 섹션이 존재**한다(현행 310~330행). 위치는 `limit.usePreset(name)` **직후**, `limit.isIdle` **직전**으로, idle 관련 3형제(`onIdle` → `isIdle` → `isSaturated`)가 붙어 있는 올바른 자리다.

현행 문구가 이미 다루는 것:

- 반환 promise 는 limiter 가 idle(실행 중·대기 중 작업 모두 없음)이 되면 resolve.
- 이미 idle 이면 즉시 resolve.
- event-driven(polling/timer 없음), `clearQueue()` 로 버려진 대기 작업과 진행 중 `limit.map()` 반영.
- for-loop + `await limit.onIdle()` 예시 1개.
- never-settle 작업 caveat 노트.

frozen 계약(F68F701A7A-130) 대비 **문서에서 아직 명시되지 않은 계약 항목**(= 본 설계가 additive 로 보강할 지점):

1. **onIdle 은 절대 reject 되지 않는다** — task 가 reject 되어 settle 돼도, `clearQueue`/`rejectOnClear` 로 대기 작업이 reject 돼도 `onIdle()` 은 resolve 된다. (계약 §3.4, §4.4, E5/E6/E9/E10)
2. **clearQueue 는 idle 도달의 한 경로** — "성공 종료"가 아니라 "실행/대기 작업 수 = 0"이 idle 의 정의. (계약 §3.5)
3. **매 호출마다 새 promise + 다중 동시 waiter** — 반복 호출/동시 await 안전, 하나의 idle 도달에 모두 1회 resolve. (계약 §3.3, §4.1, §4.2)
4. **paused 상태 동작** — 대기·실행 모두 없으면 paused 여도 즉시 resolve, 대기 작업이 있으면 drain/clear 까지 pending. (계약 §4.5, E11/E12)
5. **`limitFunction(...).onIdle()` 위임 동일성** — 내부 limiter 에 위임하여 동일 계약. (계약 §2.1, E14)
6. **lazy `filter`/`find` 도 map 과 동일하게 반영** — 현행 문구는 `map()` 만 언급. (계약 §2.2, §4.3, E13)

> **불변식(계약 §6, additive)**: 현행 섹션의 위치·기존 문장·예시·caveat 는 **보존**하고, 위 6개는 문장 보강으로만 추가한다. 새 idle 정의를 만들지 않으며 시그니처(`() => Promise<void>`)를 재정의하지 않는다.

---

## 1. 시안 개요

### 변경 범위
README 의 기존 `### limit.onIdle()` 섹션을 frozen 계약과 1:1 정합하도록 **문장 보강(additive)** 한다. 산출물은 세 덩어리다.

1. **onIdle 설명 문단(prose)** — 시그니처 의미 + resolve 조건 + never-reject + clearQueue idle 경로 + 다중 waiter + paused, 를 README 문체(간결·backtick·"Returns a promise that…")로 서술.
2. **API 예시** — 기존 for-loop 예시 **보존** + `limitFunction` 위임 동일성 예시 additive.
3. **배치·caveat** — API 목록 내 위치(usePreset↔isIdle 사이) 고정, never-settle caveat 보존.

### 사용자 경험 목표
- README 독자가 onIdle 절만 읽고 **"언제 resolve 되는가 / 언제 reject 되는가(=안 된다) / 반복·동시 await 해도 되는가"** 를 오해 없이 판단.
- "idle = 큐가 비고 실행이 없음"이 **성공/실패와 무관**함을 못박아, `onIdle` 을 try/catch 로 감싸는 오사용을 차단.
- 색·시각 요소에 의존하지 않음(README 는 텍스트 문서). 정보는 산문·인라인 코드·예시 주석으로만 전달.

---

## 2. 컬러 팔레트

> 이 작업은 문서(README) 텍스트 설계이므로 제품 UI 컬러 토큰이 아니라 **mockup(문서 미리보기) 렌더링용 팔레트**만 정의한다. 실제 README 는 GitHub 마크다운 렌더러가 스타일링하며, **정보 전달은 색에 의존하지 않는다**. (자매 선례 §2 와 동일 팔레트)

| 역할 | 토큰 | HEX | 용도 (mockup 한정) |
|---|---|---|---|
| background | `--bg` | `#ffffff` | 문서 배경 |
| surface | `--surface` | `#f6f8fa` | 코드블록·인용 배경 |
| border | `--border` | `#d0d7de` | 코드블록·표 경계선 |
| text | `--text` | `#1f2328` | 본문 텍스트 |
| text-muted | `--text-muted` | `#59636e` | 캡션·설계 주석 |
| accent | `--accent` | `#0969da` | 링크·인라인 코드 강조 |
| resolve | `--ok` | `#1a7f37` | mockup 타임라인의 "resolve" 마커(보조; 텍스트 라벨이 주) |
| reject | `--warn` | `#9a6700` | mockup 타임라인의 "task rejects (separate)" 마커(보조) |

- onIdle 은 상태값이 아니라 **전이(busy→idle)** 를 다루므로, mockup 은 색 배지 대신 **타임라인 + 텍스트 라벨**로 "언제 resolve 되는지"를 표현한다. 색은 보조이며 라벨 문자열만으로 완전히 구분 가능해야 한다.

---

## 3. 타이포그래피

> mockup 렌더링 기준. system font stack 사용, 외부 폰트 의존 0건. (자매 선례 §3 과 동일)

| 요소 | font-family | size | weight | line-height |
|---|---|---|---|---|
| heading (h1/h2) | system-ui, -apple-system, Segoe UI, sans-serif | 28 / 20 px | 600 | 1.25 |
| body | system-ui, -apple-system, Segoe UI, sans-serif | 16 px | 400 | 1.6 |
| caption | system-ui, sans-serif | 13 px | 400 | 1.5 |
| code / API 식별자 | ui-monospace, SFMono-Regular, Menlo, monospace | 14 px | 400 | 1.45 |

- README 의 API 식별자(`onIdle()`, `clearQueue()`, `activeCount`, `'idle'` 등)는 항상 **인라인 코드(monospace)** 로 표기해 산문과 구분한다.

---

## 4. 레이아웃 (문서 섹션 구조)

README 의 API 목록 내 배치와 `onIdle` 절 내부 순서를 고정한다.

### 4-A. API 목록 내 배치 (변경 없음 — 고정)

```
… ### limit.usePreset(name)
   ### limit.onIdle()      ← 여기 (현행 위치 유지)
   ### limit.isIdle
   ### limit.isSaturated …
```

- **근거**: idle 상태를 **await 하는** 표면(`onIdle`)과 **동기 스냅샷** 표면(`isIdle`)을 인접 배치해, 두 표면이 같은 idle 상태를 공유함(계약 §2.2)을 자연스럽게 연결. `isIdle` 절이 이미 "the same idle state that `onIdle()` waits for" 라고 역참조하므로 **onIdle 이 isIdle 바로 앞**이어야 한다.
- developer 는 이 절을 **이동하지 않는다**.

### 4-B. `onIdle` 절 내부 순서

```
### limit.onIdle()  (기존 섹션, additive 보강)
├─ 리드 문단: 반환·resolve 조건(activeCount/pendingCount)  §5-A
├─ event-driven·범위(clearQueue·map/filter/find·isIdle 공유)  §5-B
├─ [+] never-reject + clearQueue idle 경로  ............ §5-C
├─ [+] 매 호출 새 promise·다중 동시 waiter  ........... §5-D
├─ Example: for-loop + await (기존, 보존)  ............ §6-A
├─ [+] paused 동작 한 줄  ............................. §5-E
├─ Note: never-settle caveat (기존, 보존)  ........... §6-C
└─ [+] Example: limitFunction 위임 동일성  ............ §6-B
```

- **spacing**: 각 문단/코드블록 사이 1 빈 줄(마크다운 문단 구분).
- **breakpoint**: README 는 반응형 아님 — GitHub 렌더 폭에 맡긴다. 표를 도입하지 않고 산문+예시로만 구성해 좁은 폭에서도 가로 스크롤 없음.

---

## 5. 컴포넌트 명세 — onIdle 정보 블록 (확정 영어 문구)

> 아래 영어 블록이 **정본**이다. developer 는 현행 섹션을 이 블록으로 교체(기존 문장 보존 + additive 문장 삽입)한다. 각 블록 뒤 한국어는 설계 의도(복사 대상 아님).

### 5-A. 리드 문단 (README 확정 문구, 영어)

```md
Returns a promise that resolves when the limiter becomes idle — no promises
are currently running (`activeCount === 0`) and none are waiting to run
(`pendingCount === 0`).

If the limiter is already idle when this is called, the returned promise
resolves immediately.
```

- 설계 의도: 첫 문장에서 idle 의 **관찰 가능한 정의**(`activeCount === 0 && pendingCount === 0`)를 괄호로 못박아 계약 §2.2 와 문자 정합. 두 번째 문장은 즉시-resolve 분기(계약 §3.1)로 기존 문구 보존.

### 5-B. event-driven·범위 문단 (README 확정 문구, 영어)

```md
This is event-driven (no polling or timers). It waits for the exact same idle
state that `limit.isIdle` reports, so it also accounts for pending tasks
discarded by `clearQueue()` and for in-progress `limit.map()`, `limit.filter()`,
and `limit.find()` calls.
```

- 설계 의도: 현행 문구가 `map()` 만 언급하던 것을 계약 §2.2·§4.3 의 lazy 술어에 맞춰 `filter`/`find` 까지 확장(보강 항목 6). "same idle state that `limit.isIdle` reports" 로 **두 표면의 단일 idle 술어 공유**(계약 §6 불변식)를 명시 → `isIdle` 절의 역참조와 상호 정합.

### 5-C. never-reject + clearQueue idle 경로 (README 확정 문구, 영어) — **핵심 보강**

```md
The returned promise never rejects. "Idle" means *no task is running or
queued* — not that every task succeeded. If a task rejects, it still settles
the limiter toward idle and its rejection is delivered to that task's own
promise, never to `onIdle()`. Clearing the queue counts as reaching idle too:
after `clearQueue()` (even with `rejectOnClear`), `onIdle()` resolves while the
discarded tasks reject on their own promises. You never need to wrap
`await limit.onIdle()` in try/catch.
```

- 설계 의도: 계약 §3.4/§4.4(E5/E6) + §3.5(E7~E10)를 문서 독자용으로 1:1 매핑. **onIdle promise 와 task promise 의 독립성**을 반복 강조("its own promise", "on their own promises")해 두 표면 혼동 차단. 마지막 문장은 소비자 실무 지침(try/catch 불필요, 계약 §4.4).

### 5-D. 매 호출 새 promise·다중 waiter (README 확정 문구, 영어)

```md
Each call returns a fresh promise for the *next* time the limiter reaches idle,
so calling it repeatedly is safe and cheap. Multiple concurrent awaiters all
resolve together at the same idle moment, and a promise resolved for one
idle cycle is never re-fired by a later one.
```

- 설계 의도: 계약 §4.1(매 호출 새 promise) + §3.3(다중 waiter 1회 발화·재발화 없음, E4). 소비자가 반복/동시 await 를 안전하게 쓰도록 보장 문구화.

### 5-E. paused 동작 (README 확정 문구, 영어)

```md
Pausing does not by itself keep the promise pending: a paused limiter with
nothing running and nothing queued is idle, so `onIdle()` resolves right away.
If tasks are still queued, it stays pending until they drain after `resume()`
or are removed by `clearQueue()`.
```

- 설계 의도: 계약 §4.5(E11/E12). idle 술어가 paused 를 보지 않음 → "대기 작업 유무"가 판정 기준임을 명확화. `resume()`/`clearQueue()` 두 drain 경로를 모두 제시.

---

## 6. API 예시 정보 구조

### 6-A. 기본 예시 (기존 유지 — 확정 문구, 영어)

````md
```js
import pLimit from 'p-limit';

const limit = pLimit(2);

for (const url of urls) {
	limit(() => fetch(url));
}

// Resolves once every queued and running task has settled.
await limit.onIdle();
console.log('All done');
```
````

- 설계 의도: 현행 예시를 **그대로 보존**(계약 §6 additive 불변식). "batch 를 큐에 넣고 전부 끝나길 기다리는" 대표 용례로 충분.

### 6-B. limitFunction 위임 동일성 (README 확정 문구, 영어) — additive

````md
`limitFunction` delegates `onIdle()` to its underlying limiter, so it exposes
the exact same behavior:

```js
import {limitFunction} from 'p-limit';

const run = limitFunction(async url => fetch(url), {concurrency: 2});

for (const url of urls) {
	run(url);
}

await run.onIdle();
console.log('All done');
```
````

- 설계 의도: 계약 §2.1(위임)·E14 를 예시로 못박음. 자매 선례 §6-B(snapshot 위임) 와 동일한 "위임으로 동일 계약" 패턴. 삽입 위치는 onIdle 절 말미 또는 `limitFunction(fn, options)` 절 — developer 판단(§7-6).

### 6-C. never-settle caveat (기존 유지 — 확정 문구, 영어)

```md
Note: If a running task never settles, the limiter never becomes idle and the
returned promise never resolves — the same caveat as awaiting the task promises
directly.
```

- 설계 의도: 현행 caveat **보존**. §5-C(never-reject)와 상보적 — "reject 로는 안 걸리지만, **영영 settle 안 되는** 작업엔 걸린다"는 유일한 non-resolve 경로를 정직하게 남긴다.

---

## 7. dev 구현 가이드 (developer F68F701A7A-132 용)

> designer 는 코드를 구현하지 않는다. 아래는 developer 가 `readme.md` 에 반영할 **문서 편집 단계**만 안내한다. 소스(`index.js`/`index.d.ts`) 구현·타입은 F68F701A7A-132 packet + 계약 §5 를 따른다.

1. **위치 확인**: `readme.md` 의 `### limit.onIdle()` 절을 찾는다(현행 `usePreset` 직후, `isIdle` 직전). **절을 이동하지 않는다**(§4-A).
2. **리드 교체**: 현행 리드 문단을 **§5-A** 로 교체(기존 의미 보존 + `activeCount/pendingCount` 괄호 명시 추가).
3. **범위 문단 교체**: 현행 "event-driven … `clearQueue()` and in-progress `limit.map()` calls." 문단을 **§5-B** 로 교체(`filter`/`find` 추가, `isIdle` 공유 명시).
4. **§5-C 삽입**: never-reject + clearQueue idle 경로 문단을 §5-B 아래에 추가.
5. **§5-D 삽입**: 매 호출 새 promise·다중 waiter 문단을 §5-C 아래에 추가.
6. **예시**: **§6-A**(기존) 보존. 그 아래 **§5-E**(paused 한 줄) → **§6-C**(기존 caveat, 보존) → **§6-B**(limitFunction 위임 예시) 순으로 배치. §6-B 는 지면 판단에 따라 `limitFunction(fn, options)` 절로 옮겨도 됨.
7. **표기 규칙**: API 식별자·상태 문자열은 항상 인라인 코드(`` `onIdle()` ``, `` `'idle'` ``). 조건식은 `index.js` 실제 식(`activeCount === 0` 등)과 문자 일치.
8. **금지(계약 §6 additive)**: 시그니처를 `() => Promise<void>` 외로 바꾸지 말 것. `isIdle`/`snapshot().status` 등 기존 idle 표면 문구를 재작성하지 말 것. onIdle 이 옵션/타임아웃/시그널을 받는 것처럼 쓰지 말 것(범위 밖, 계약 §2.1).

- 권장 클래스/변수명(mockup 참고): 실제 README 는 CSS 클래스가 없으므로 해당 없음. mockup 의 타임라인 마커는 `.marker[data-kind="resolve|reject"]` 로 표기(색은 보조, 텍스트 라벨이 주).

---

## 8. mockup 참조

- 시각 mockup HTML: **`docs/design/mockups/onidle-docs-F68F701A7A-131.html`**
- 내용: 본 명세 §5(onIdle 산문 블록) + §6(API 예시)를 GitHub README 느낌으로 렌더한 단일 self-contained HTML. 추가로 busy→idle 전이 타임라인 1개를 텍스트 라벨 중심(색 보조)으로 표시해 "언제 resolve/reject 되는지"를 시각 확인.
- 용도: reviewer/운영자/developer 가 문단 순서·예시·never-reject 경계를 **한눈에 시각 확인**. dev 의 실제 산출물 아님(README 문구는 §5·§6 영어 블록이 정본).
- 색상 의존 없음 확인용: 타임라인 마커는 라벨 문자열(`resolve` / `task rejects (separate)`)로 구분되며 색은 보조 표기임을 시각적으로 보인다.

---

## 9. AC 매핑 (self-check)

| Acceptance Criteria | 충족 위치 |
|---|---|
| onIdle 설명 문단 **위치** 가 기존 README 스타일과 일치하도록 명세 | §4-A(API 목록 배치: usePreset↔isIdle 사이 고정), §4-B(절 내부 순서), §7-1 |
| **예제 코드 형태** 가 기존 README 스타일과 일치 | §6-A(기존 for-loop 예시 보존), §6-B(위임 예시 — 자매 선례 §6-B 패턴), §6-C(caveat 보존) |
| **API 목록 내 배치** 가 기존 스타일과 일치 | §4-A(idle 3형제 인접·isIdle 역참조 정합) |
| frozen 계약(F68F701A7A-130) 과 **1:1 정합**(재정의 금지·additive) | §0(as-is 진단), §5-A~§5-E(계약 §2~§4 문장 매핑), §7-8(금지 목록 = 계약 §6 불변식) |
