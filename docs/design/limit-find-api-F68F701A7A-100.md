# limit.find README·API 문서 정보구조 명세 — F68F701A7A-100

작성: designer (이디자인) · task F68F701A7A-101
소비 계약: `planning-contract@v1` (`docs/plans/limit-find-F68F701A7A-100.md`, FROZEN)
소비자: developer(F68F701A7A-102 — `readme.md` 반영), reviewer(F68F701A7A 검토)

> 본 문서는 **문서 정보구조(IA)·API 예시 배치 명세**다. 브라우저 UI 시안이 아니며,
> HTML/CSS/이미지 산출물을 포함하지 않는다(task description·AC #3 준수).
> planning-contract 의 §1 공개 API·§2 동작 불변식은 **재정의하지 않고 그대로 인용**한다.
> developer 는 이 명세를 참조하여 `readme.md` 의 `limit.find` 섹션을 작성한다.

---

## 1. 시안 개요

### 1.1 변경 범위

- `readme.md` 에 `### limit.find(iterable, predicateFunction)` API 섹션을 **1개 추가**한다(additive).
- 기존 `map`/`mapSettled`/`filter`/`clearQueue` 등 다른 섹션 문구는 변경하지 않는다.
- 문서 산출물은 markdown 뿐이며 코드(`index.js`/`index.d.ts`)·시각 산출물은 이 task 범위 밖이다.

### 1.2 문서 UX 목표

- README 독자가 `map`/`filter` 를 이미 아는 상태에서 `find` 를 **"조기 종료하는 filter 의 단건 버전"** 으로 즉시 이해한다.
- `find` 만의 핵심 가치(입력 순서 첫 일치 + 조기 종료)를 섹션 첫 문단에서 전달한다.
- 세 API(`map`/`filter`/`find`)의 소비 정책 차이(전량 소비 vs 조기 종료)를 한눈에 비교할 수 있게 한다.
- 문구·예제 톤을 기존 `filter` 섹션과 **일관**되게 맞춰 문서 전체 정합성을 유지한다.

---

## 2. 문서 정보구조 (README 섹션 배치)

### 2.1 삽입 위치 (규범)

`readme.md` 의 API 섹션 순서에서 **`### limit.filter(...)` 섹션 바로 뒤, `### limit.activeCount` 섹션 앞**에 `### limit.find(...)` 를 삽입한다.

```
### limit.map(iterable, mapperFunction)
### limit.mapSettled(iterable, mapperFunction)
### limit.filter(iterable, predicateFunction)
### limit.find(iterable, predicateFunction)   ← 신규 (여기)
### limit.activeCount
### limit.pendingCount
...
```

근거:
- `find` 는 `filter` 와 동일한 `(iterable, predicateFunction)` 시그니처를 공유하는 **가장 가까운 형제**다. 인접 배치가 독자의 비교·전이 학습을 돕는다.
- `map` → `mapSettled` → `filter` → `find` 는 "전량 수집 → 전량 settle 수집 → 조건 통과분 수집 → 첫 일치 조기 종료" 로 **소비 정책이 점진적으로 좁아지는** 자연스러운 서사 순서를 이룬다.

### 2.2 섹션 내부 문단 구조 (규범)

`### limit.find(iterable, predicateFunction)` 섹션은 아래 문단을 **이 순서로** 배치한다.

| 순번 | 문단 | 목적 | 대응 AC/불변식 |
| --- | --- | --- | --- |
| P1 | 한 줄 요약 — 입력 순서상 첫 일치 1건에서 조기 종료 | 핵심 가치 전달 | AC1, INV-1·INV-2 |
| P2 | predicate 시그니처·truthiness 판정(`Array.prototype.find` 준거) | 시그니처 표기 | AC1, INV-9 |
| P3 | 반환값 규칙 — 원본 입력값(boolean 아님) + 최소 index 승리 + 완료 순서 무관 | 반환 의미 | AC1, INV-1 |
| P4 | 조기 종료·정리 — 확정 후 신규 draw 중단, in-flight predicate 완주·swallow, async `return()` 1회 | 조기 종료·cleanup | AC1·AC2, INV-2·INV-3 |
| P5 | predicate rejection 은 fatal(`map`/`filter` 와 동일, `mapSettled` 와 반대) | rejection 전파 | AC1, INV-5 |
| P6 | lazy 소비 문구 — sync/async 모두 최대 `concurrency` 개만 draw | 소비 정책 | INV-4·INV-6 |
| P7 | `undefined` 반환 — 일치 없음/빈 iterable | undefined 설명 | AC1, INV-9 |
| P8 | 코드 예시 — async iterable(조기 종료) + sync iterable(early-exit) | sync/async 사용 예시 | AC1 |
| P9 | 관련 링크 — `filter`/`map` 대비 한 줄 + `Array.prototype.find` MDN | API 관계 정리 | AC2 |

> P6 주의: `find` 는 planning-contract INV-4 에 따라 **sync iterable 도 lazy bounded 소비**한다.
> 기존 `map`/`filter` README 의 "Sync iterables keep the existing eager behavior" 문구를
> `find` 섹션에 **복사하지 말 것**. `find` 는 sync/async 를 단일 lazy 경로로 통일한다(§4.6 참조).

---

## 3. API 시그니처·문구 명세 (planning-contract 인용)

### 3.1 시그니처 표기 (동결 · AC1)

```
limit.find(iterable, predicateFunction) => Promise<Input | undefined>
```

- `iterable`: `Iterable<Input> | AsyncIterable<Input>`
- `predicateFunction`: `(input: Input, index: number) => PromiseLike<boolean> | boolean`
- 반환: 입력 순서상 **첫 일치 항목의 원본 값**(`Input`). 일치 항목이 없으면 `undefined`.

README 문서상 헤딩은 `### limit.find(iterable, predicateFunction)` 로 표기한다(기존 `filter` 헤딩 표기와 동일 관례).

### 3.2 P1 — 한 줄 요약 문구 (권장 표현)

> Process an iterable or async iterable of inputs with limited concurrency, resolving to the
> **first** input item (in input/draw order) whose predicate resolves truthy. Once that
> first-matching item is confirmed, no further items are drawn — `find` short-circuits.

### 3.3 P2 — predicate·truthiness 문구 (권장 표현)

> The predicate function receives the item value and its index, and may be synchronous or
> asynchronous. An item matches when the predicate's return value (awaited if it is a promise)
> is truthy, matching [`Array.prototype.find()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find).

- INV-9: 런타임 판정은 JS truthiness 다(타입은 `boolean` 을 요구하지만 truthy 면 일치로 간주). 문서는 `Array.prototype.find` 준거로만 표현하고 truthiness 뉘앙스를 유지한다.

### 3.4 P3 — 반환값 규칙 문구 (권장 표현)

> The resolved value is the original input item (not the predicate's boolean), chosen by the
> **lowest input index** — independent of the order in which predicates complete.

- INV-1: 완료 순서 무관, 최소 index 승리를 명시한다.

### 3.5 P4 — 조기 종료·정리 문구 (권장 표현)

> Once the first-matching index is confirmed, no further items are drawn from the iterable and
> predicates that have not started are never started. Predicates already in flight are allowed
> to settle so they never surface as unhandled rejections; for an async iterable the iterator's
> `return()` is called once for cleanup.

- INV-2(신규 draw 중단)·INV-3(in-flight 완주·swallow·`return()` 1회)를 함께 전달한다.

### 3.6 P5 — predicate rejection 문구 (권장 표현 · AC1)

> Like [`limit.map()`](#limitmapiterable-mapperfunction) and
> [`limit.filter()`](#limitfilteriterable-predicatefunction) (and unlike
> [`limit.mapSettled()`](#limitmapsettlediterable-mapperfunction)), a predicate rejection is
> fatal before the call settles: it rejects the returned promise with that reason and stops
> drawing new items. For an async iterable, the iterator's `return()` is called once for cleanup.

- INV-5 를 인용한다. `map`/`filter` 는 동일, `mapSettled` 는 반대임을 대조로 명시하여 세 API 관계(AC2)를 문서에서 강화한다.

### 3.7 P6 — lazy 소비 문구 (권장 표현)

> Both sync and async iterables are consumed lazily: the next value is only pulled once a
> concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any
> time. This makes it safe to pass infinite or streaming iterables, and lets `find` stop early
> without materializing the rest of the input.

- INV-4·INV-6. **기존 map/filter 의 "Sync iterables keep the existing eager behavior" 문구를 쓰지 않는다** — `find` 는 sync 도 lazy bounded.

### 3.8 P7 — undefined 반환 문구 (권장 표현 · AC1)

> Resolves to `undefined` when no item matches — including when the iterable is empty or every
> predicate resolves falsy (after all items have been consumed).

- INV-9: 빈 iterable, 전부 falsy 두 경우 모두 `undefined`.

---

## 4. find / filter / map 관계·차이 정보구조 (AC2)

문서 독자가 세 API의 관계를 한눈에 파악하도록, README 의 `find` 섹션 및 리뷰 참조용으로 아래 비교 정보구조를 정의한다.
아래 표는 **명세용 정리**이며, developer 가 README 에 그대로 표를 옮길 의무는 없다(P9 의 한 줄 대비 문구로 축약 가능). 단, "전량 소비 vs 조기 종료" 대비는 반드시 문서에 드러나야 한다.

### 4.1 소비 정책·반환 비교표

| API | 반환 타입 | 입력 소비 범위 | rejection 정책 | 결과 순서 기준 |
| --- | --- | --- | --- | --- |
| `limit.map` | `Promise<ReturnType[]>` | **전량 소비** (모든 항목 mapper 실행) | fatal (첫 reject 로 전체 reject) | 입력(draw) 순서 |
| `limit.mapSettled` | `Promise<PromiseSettledResult[]>` | **전량 소비** (모든 항목 settle) | 비-fatal (각 항목 `{status, ...}` 로 수집) | 입력(draw) 순서 |
| `limit.filter` | `Promise<Input[]>` | **전량 소비** (모든 predicate 평가) | fatal | 입력(draw) 순서 |
| `limit.find` | `Promise<Input \| undefined>` | **조기 종료** (첫 일치 확정 시 draw 중단) | fatal | 최소 일치 index 1건 |

### 4.2 핵심 대비 — 전량 소비 vs 조기 종료

- `map`/`mapSettled`/`filter`: 결과가 확정되려면 **모든** 항목의 mapper/predicate 결과가 필요하다 → iterable 을 끝까지 소비한다.
- `find`: **입력 순서상 가장 앞선 일치 index 가 확정되는 즉시** 결과가 결정되고, 그 이후 항목은 draw 하지 않는다 → 무한/스트리밍 iterable 에서도 조기 종료로 안전하게 종료한다.

### 4.3 `filter` → `find` 전이 요약 (P9 권장 한 줄)

> Use [`limit.filter()`](#limitfilteriterable-predicatefunction) to collect **every** matching
> item; use `limit.find()` when you only need the **first** match and want to stop as soon as
> it is found.

### 4.4 공통점(문서에서 혼동 방지용 명시 권장)

- `filter` 와 `find` 는 동일한 predicate 시그니처 `(input, index) => PromiseLike<boolean> | boolean` 를 공유한다.
- 두 API 모두 반환값은 predicate 의 boolean 이 아니라 **원본 입력 항목**이다.
- 두 API 모두 predicate rejection 은 fatal 이다(= `map` 과 동일, `mapSettled` 와 반대).

### 4.5 차이점 요약 (한 줄)

- `filter` = 통과분 **배열**, 전량 소비 / `find` = 첫 일치 **단건**(또는 `undefined`), 조기 종료.

### 4.6 문서상 주의 — sync 소비 정책 차이

- `map`/`mapSettled`/`filter` README: "Sync iterables keep the existing eager behavior."
- `find` README: sync/async 모두 lazy bounded 소비(INV-4). → **eager 문구 재사용 금지**. `find` 섹션은 §3.7 문구를 사용한다.

---

## 5. 코드 예시 명세 (P8 · AC1: sync/async 사용 예시)

README `find` 섹션에는 아래 2개 예시를 포함한다. import·`pLimit(...)` 초기화 패턴은 기존 `filter`/`map` 예시와 동일한 톤을 유지한다.

### 5.1 async iterable 예시 (조기 종료·streaming) — 필수

```js
import pLimit from 'p-limit';

const limit = pLimit(3);

async function * pages() {
	let cursor;
	do {
		const page = await fetchPage(cursor);
		cursor = page.nextCursor;
		yield page;
	} while (cursor);
}

// Stops fetching as soon as the first page with a match is confirmed;
// at most three pages are in flight at any time.
const firstHit = await limit.find(pages(), async page => (await scan(page)).hasMatch);
//=> the first matching page, or `undefined` if no page matched
```

의도: async iterable 의 lazy 소비 + 조기 종료(INV-2·INV-4·INV-6) + `undefined` 반환(INV-9)을 한 예시로 전달.

### 5.2 sync iterable 예시 (early-exit) — 필수

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

// Returns the first user whose async permission check passes, in input order.
// Later users are not checked once the first match is confirmed.
const admin = await limit.find(users, async user => hasRole(user, 'admin'));
```

의도: sync iterable 도 조기 종료(INV-4)됨을 예시로 명시. 주석으로 "Later users are not checked" 를 넣어 lazy bounded 소비를 전달한다.

### 5.3 예시 작성 규칙

- placeholder 함수명(`fetchPage`/`scan`/`hasRole`)은 기존 README 관례(`fetchSomething`/`doSomething`)와 동일한 톤을 유지한다.
- 반환값이 `undefined` 일 수 있음을 예시 주석 또는 P7 문단으로 최소 1회 명시한다(AC1).
- 예시에서 `map`/`filter` 와 달리 결과가 **단건**임을 변수명(`firstHit`/`admin`)으로 드러낸다.

---

## 6. developer 구현 가이드 (readme.md 반영 단계)

developer(F68F701A7A-102)는 아래 단계로 `readme.md` 를 수정한다. **`readme.md` 외 문서 파일은 이 명세 대상이 아니다.**

1. **삽입 위치**: `### limit.filter(iterable, predicateFunction)` 섹션의 마지막 줄(“For more complex use cases, see [p-filter]…”) 바로 다음, `### limit.activeCount` 헤딩 직전에 새 섹션을 삽입한다(§2.1).
2. **헤딩**: `### limit.find(iterable, predicateFunction)` (§3.1 표기).
3. **문단 순서**: §2.2 표의 P1→P9 순서로 문단을 작성하고, 각 문단 문구는 §3 권장 표현을 기준으로 하되 기존 `filter` 섹션 톤에 맞게 다듬는다.
4. **rejection 대조 문구**(P5): `map`/`filter` 는 동일, `mapSettled` 는 반대임을 링크와 함께 명시한다(§3.6). 앵커: `#limitmapiterable-mapperfunction`, `#limitmapsettlediterable-mapperfunction`, `#limitfilteriterable-predicatefunction`.
5. **lazy 문구**(P6): §3.7 문구를 사용하고, **"Sync iterables keep the existing eager behavior" 문구를 넣지 않는다**(§4.6 — `find` 는 sync 도 lazy).
6. **코드 예시**(P8): §5.1(async) + §5.2(sync) 두 블록을 모두 포함한다.
7. **관계 문구**(P9): §4.3 의 `filter`↔`find` 한 줄 대비를 섹션 말미에 넣어 세 API 관계(AC2)를 문서에 드러낸다. p-map/p-filter 처럼 별도 외부 패키지 링크가 필요하면 `Array.prototype.find` MDN 링크로 충분하다(별도 npm 패키지 링크 강제 아님).
8. **무회귀**: 기존 다른 섹션 문구·앵커를 수정하지 않는다(planning-contract §3 additive 원칙).

권장 문구/블록 명명(README 관례):
- 헤딩 앵커: `#limitfinditerable-predicatefunction`
- 코드 펜스: ` ```js `

> 주의: 이 task 는 문서 IA 설계다. developer 의 `index.js`/`index.d.ts`/`test.js`/`index.test-d.ts`
> 수정은 planning-contract §1.2·§3 를 직접 따르며 본 명세의 대상이 아니다.

---

## 7. 산출물·비산출물 확인 (AC3)

- ✅ 산출물: 본 markdown 명세 1건 (`docs/design/limit-find-api-F68F701A7A-100.md`).
- ❌ 비산출물(의도적 제외): HTML/CSS/이미지/mockup. 본 task 는 브라우저 UI 시안이 아니라 **문서 정보구조 설계**이며, task description·AC3 이 시각 산출물 미생성을 요구한다.
- 소유 경로(`docs/design/**`) 밖 파일은 수정하지 않았다. `readme.md` 실제 반영은 developer(F68F701A7A-102) 담당.

---

## 8. Self-critique

- **AC 매핑**: AC1(섹션 위치·시그니처·sync/async 예시·undefined·rejection) → §2.1/§3.1/§5/§3.8/§3.6 각각 매핑 완료. AC2(세 API 관계·전량 소비 vs 조기 종료) → §4 전용 섹션. AC3(markdown only) → §7 확인. ✅
- **dev 구현 가이드**: §6 에 삽입 위치·문단 순서·앵커·무회귀까지 단계별 지침 제공. ✅
- **기존 요소 보존**: additive 원칙 명시(§2.1, §6-8). 기존 섹션 문구 변경 금지 명시. ✅
- **컴포넌트(문서 문단) 매핑**: §2.2 표가 P1~P9 문단을 AC/불변식에 1:1 매핑. ✅
- **모호함 flag**:
  - (해소) `find` 의 sync 소비가 기존 `map`/`filter` 의 eager 와 다름 → §3.7·§4.6·§6-5 에서 eager 문구 재사용 금지를 반복 강조하여 developer 혼동 방지.
  - (판단) mockup HTML 미생성은 일반 designer 규약과 상충하나, task packet(AC3·description)이 우선하므로 의도적 제외로 §7 에 근거 기록.
  - (경계) p-map/p-filter 류 외부 패키지 링크 필요 여부는 강제하지 않음(§6-7) — README 관례상 필수 아님으로 판단, reviewer 재량.

<!-- bf:pr-summary -->
## 시안 요약

`limit.find` 의 **README·API 문서 정보구조(IA)** 를 설계했습니다. 브라우저 UI 시안이 아닌 문서 명세 task 로, HTML/CSS/이미지 없이 markdown 1건만 산출합니다(AC3).

### 산출물
- `docs/design/limit-find-api-F68F701A7A-100.md` — README 섹션 배치·문단 구조·API 문구·find/filter/map 관계 정리·developer 구현 가이드

### 핵심 결정
- **섹션 위치**: `limit.filter` 바로 뒤, `limit.activeCount` 앞에 삽입 (동일 시그니처 형제 인접 배치)
- **문단 구조 P1~P9**: 요약→시그니처→반환규칙→조기종료→rejection→lazy소비→undefined→예시→관계, 각각 AC/불변식에 매핑
- **find/filter/map 관계**: 전량 소비(map/filter/mapSettled) vs 조기 종료(find) 대비표 + `filter`↔`find` 전이 문구
- **sync 소비 주의**: `find` 는 sync 도 lazy bounded — 기존 map/filter 의 "eager" 문구 재사용 금지 명시

### AC → 명세 매핑
| AC | 위치 |
| --- | --- |
| AC1 섹션위치·시그니처·sync/async예시·undefined·rejection | §2.1·§3.1·§5·§3.8·§3.6 |
| AC2 find/filter/map 관계·전량소비 vs 조기종료 | §4 |
| AC3 markdown only, 시각 산출물 없음 | §7 |
<!-- /bf:pr-summary -->
