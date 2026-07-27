# limit.filter README/API 문서 정보 구조 설계 — F68F701A7A-95

> 산출물 성격: **문서 정보 구조(IA) 설계 명세**
> consumer: developer (F68F701A7A-96) — `readme.md` / `index.d.ts` 문서 반영
> 준수 계약: planning-contract@v1 (`docs/plans/limit-filter-plan-F68F701A7A-94.md`, interface_checksum `sha256:f96b395f3e72a87d12ab2f6ca01cf55ccb5504055f6e8cb7fdc099e6044eaa44`)

이 문서는 `limit.filter(iterable, predicateFunction)`의 **README 배치(정보 구조)**, **API 섹션 문안**,
그리고 **사용 예시 코드**를 developer가 그대로 옮겨 붙일 수 있는 형태로 명세한다. 코드 구현은
developer 담당이며, 본 문서는 문서 산출물의 구조·문안·예시만 동결한다.

> **산출물 범위 주의**: 본 task packet은 "HTML/CSS/이미지 산출물 금지, docs/design 아래 markdown
> 명세뿐"으로 동결되어 있다. 따라서 designer의 통상 mockup HTML은 **의도적으로 생성하지 않는다**.
> 이는 문서 IA 설계 task이며 렌더링 UI 시안이 아니다. (AC 3 충족)

---

## 1. 시안 개요

### 1.1 변경 범위
- `readme.md`: 기존 `limit.map` / `limit.mapSettled` 문서 흐름에 이어 `### limit.filter(...)` 섹션 **추가(additive)**.
- `index.d.ts`: `filter` 타입에 붙는 TSDoc 주석 문안 가이드 제공(코드는 developer 작성).
- 기존 API 섹션(map/mapSettled/clearQueue/pause 등)의 문안·순서는 **변경하지 않는다**.

### 1.2 사용자(문서 독자) 경험 목표
- `map` → `mapSettled` → `filter`가 **한 묶음(iterable 배치 처리 3형제)** 으로 연속 배치되어,
  독자가 "결과 변환(map) / 전부 settle(mapSettled) / 걸러내기(filter)"를 한 자리에서 비교하게 한다.
- 각 예시는 **복사해서 바로 실행 가능**한 최소 예제로, 계약의 4대 시나리오(sync·async·순서 보존·predicate rejection)를 커버한다.
- 독자가 `filter`의 실패 시맨틱을 `map`과 동일(fail-fast)하게, `mapSettled`와 다르게 즉시 인지하도록 한 문장으로 대비한다.

---

## 2. README 정보 구조 (배치 명세)

### 2.1 삽입 위치 (동결)
`readme.md`의 `## API` 하위, **`### limit.mapSettled(...)` 섹션 바로 뒤 / `### limit.activeCount` 바로 앞**에
`### limit.filter(iterable, predicateFunction)` 섹션을 삽입한다.

현행 순서와 목표 순서:

| 순번 | 현행 `readme.md` | 목표(삽입 후) |
| --- | --- | --- |
| … | `### limit.map(iterable, mapperFunction)` | `### limit.map(iterable, mapperFunction)` |
| … | `### limit.mapSettled(iterable, mapperFunction)` | `### limit.mapSettled(iterable, mapperFunction)` |
| **신규** | — | **`### limit.filter(iterable, predicateFunction)`** ← 삽입 |
| … | `### limit.activeCount` | `### limit.activeCount` |

**근거**: map/mapSettled/filter는 계약 §5.7대로 동일 lazy 소비 엔진을 공유하고 aggregation만 다르다
(`map`=Promise.all, `mapSettled`=Promise.allSettled, `filter`=truthy compact). 문서에서도 세 메서드를
인접 배치해 aggregation 차이만 대비시키는 것이 정보 구조상 가장 낮은 인지 비용이다. introspection
프로퍼티(`activeCount` 이하)와 섞지 않는다.

### 2.2 앵커 / 상호 참조 규칙
- 자동 생성 앵커: `#limitfilteriterable-predicatefunction` (GitHub 규칙 — 소문자화, 괄호·쉼표 제거, 공백→`-`).
- `filter` 섹션 본문의 도입부는 `mapSettled`가 `map`을 참조한 방식과 동일하게
  [`limit.map()`](#limitmapiterable-mapperfunction) 로 링크한다.
- 기존 문서에 `filter`를 향한 역참조는 추가하지 않는다(비목표 — 기존 섹션 문안 불변).

---

## 3. `### limit.filter(...)` 섹션 문안 명세 (developer가 readme.md에 반영)

아래 블록을 `readme.md`의 §2.1 위치에 그대로 삽입한다. 문장은 기존 `map`/`mapSettled` 섹션의 어투·시제를 mirror 한다.

> ---
> ### limit.filter(iterable, predicateFunction)
>
> Filter an iterable or async iterable of inputs with limited concurrency, keeping only the items whose predicate resolves to a truthy value.
>
> The predicate function receives the item value and its index. It may be synchronous or return a promise; at most `concurrency` predicates run at a time.
>
> Returns a promise that resolves to the kept **input items** (not the boolean results) in input (draw) order, regardless of the order in which the predicates complete. Like [`limit.map()`](#limitmapiterable-mapperfunction), a predicate rejection is **fail-fast**: the first rejection rejects the returned promise with that reason, and no further items are drawn.
>
> Async iterables are consumed lazily: the next value is only pulled once a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables without pre-loading them into memory. Sync iterables keep the existing eager behavior.
>
> ```js
> import pLimit from 'p-limit';
>
> const limit = pLimit(2);
>
> // Keep only the even numbers; at most two predicates run at a time.
> const evens = await limit.filter([1, 2, 3, 4], async n => n % 2 === 0);
> //=> [2, 4]
> ```
>
> The result preserves **input order**, not completion order: even if the predicate for a later item settles first, kept items keep their original relative order.
>
> ```js
> import pLimit from 'p-limit';
>
> const limit = pLimit(2);
>
> // The predicate for `3` resolves before the predicate for `1`,
> // but the kept items stay in input order.
> const kept = await limit.filter([1, 2, 3], async n => {
> 	await delay(n === 3 ? 0 : 50);
> 	return n !== 2;
> });
> //=> [1, 3]
> ```
>
> Async iterables are pulled lazily, so you can filter a streaming source without loading it all into memory:
>
> ```js
> import pLimit from 'p-limit';
>
> const limit = pLimit(2);
>
> async function * pages() {
> 	let cursor;
> 	do {
> 		const page = await fetchPage(cursor);
> 		cursor = page.nextCursor;
> 		yield page.url;
> 	} while (cursor);
> }
>
> // Only two URLs are probed at a time; the generator is pulled lazily
> // as slots free up. Only the reachable URLs are returned, in input order.
> const liveUrls = await limit.filter(pages(), async url => (await fetch(url, {method: 'HEAD'})).ok);
> ```
>
> A predicate rejection rejects the returned promise with that reason (fail-fast), unlike [`limit.mapSettled()`](#limitmapsettlediterable-mapperfunction) which settles every element. When the input is an async iterable, its `return()` is called once for cleanup:
>
> ```js
> import pLimit from 'p-limit';
>
> const limit = pLimit(2);
>
> try {
> 	await limit.filter([1, 2, 3], async n => {
> 		if (n === 2) {
> 			throw new Error('boom');
> 		}
>
> 		return n > 1;
> 	});
> } catch (error) {
> 	console.log(error.message);
> 	//=> 'boom'
> }
> ```
>
> This is a convenience function for keeping a subset of inputs that arrive in batches. For more complex use cases, see [p-filter](https://github.com/sindresorhus/p-filter).
> ---

### 3.1 문안 검증 포인트 (계약 대조)
- "keeping only the items whose predicate resolves to a **truthy** value" — 계약 §3의 `Boolean(result)` truthy 판정 반영.
- "kept **input items** (not the boolean results)" — 계약 §1.2 반환 `Promise<Input[]>`(원본 항목) 반영.
- "**fail-fast** … first rejection rejects" — 계약 §4 (map과 동일, mapSettled와 대비) 반영.
- lazy 소비 문단은 계약 §2를 `map`/`mapSettled` 문서와 동일 문장으로 mirror.
- rejection 예시의 `return()` cleanup 언급 — 계약 §4의 `iterator.return()` 1회 cleanup 반영.

> **주의(앵커 가드)**: 위 rejection 문단의 mapSettled 링크 앵커는 GitHub slug 규칙(소문자화,
> 마침표·괄호·쉼표 제거, 공백→하이픈)에 따라 `### limit.mapSettled(iterable, mapperFunction)`
> 제목에서 `#limitmapsettlediterable-mapperfunction`로 계산된다(현행 README가 `limit.map(...)`을
> `#limitmapiterable-mapperfunction`로 참조하는 것과 동일 규칙). developer는 삽입 후 GitHub 미리보기로
> 이 앵커가 실제로 mapSettled 섹션으로 이동하는지 반드시 실측한 뒤 확정한다.

---

## 4. 예시 시나리오 ↔ AC 매핑

| AC | 시나리오 | §3 예시 블록 | 계약 근거 |
| --- | --- | --- | --- |
| AC1 | sync iterable 필터링, 순서 보존 | 예시 1 (`[1,2,3,4]` → `[2,4]`) | §2 sync eager, §3 순서 보존 |
| AC1 | 완료 순서 ≠ 입력 순서에도 입력 순서 보존 | 예시 2 (`[1,2,3]` → `[1,3]`) | §3 순서 보존 규칙 |
| AC1 | async iterable 지연 소비 | 예시 3 (`pages()` async generator) | §2 async lazy 소비 |
| AC1 | predicate rejection fail-fast + cleanup | 예시 4 (`throw 'boom'`) | §4 rejection 전파 |
| AC2 | README 내 배치·map/mapSettled 대비 위치 | §2 배치 명세 표 | §5.7 세 메서드 aggregation 대비 |
| AC3 | markdown 명세뿐, HTML/CSS/이미지 없음 | 본 문서 단일 markdown | packet 산출물 범위 |

---

## 5. 컴포넌트(문서 단위) 명세

문서 IA task이므로 "컴포넌트"는 README/타입 문서의 구성 단위를 뜻한다.

| 문서 단위 | 위치 | 내용/상태 | developer 반영 |
| --- | --- | --- | --- |
| README `### limit.filter` 섹션 | `readme.md` (mapSettled 뒤) | §3 문안 전체 | 그대로 삽입, 앵커 실측 |
| 도입 문단 | 섹션 최상단 | 요약 + map 링크 + fail-fast 한 문장 | mirror map/mapSettled 어투 |
| 예시 1~4 코드블록 | 섹션 본문 | sync/순서/async/rejection | 그대로 사용(placeholder 함수 `delay`/`fetchPage`는 기존 문서와 동일 관례) |
| 관련 링크 | 섹션 말미 | p-filter 참조 | `map`이 p-map을, `filter`는 p-filter를 참조 |
| TSDoc 문안 | `index.d.ts` `filter` | §6 문안 | LimitFunction/LimitedFunction 양쪽 |

---

## 6. dev 구현 가이드 (developer가 따라할 단계)

`docs/plans/limit-filter-plan-F68F701A7A-94.md` §1·§6을 기준 계약으로 하고, 문서 반영은 아래 순서로 한다.

1. **README 섹션 삽입** — `readme.md`에서 `### limit.mapSettled(...)` 섹션 끝(현행 line 136 `code fence` 종료 직후)과
   `### limit.activeCount`(현행 line 138) 사이에 §3 블록을 삽입한다. 위·아래 섹션 문안은 손대지 않는다.
2. **placeholder 관례 유지** — 예시의 `delay(...)`, `fetchPage(...)`, `fetch(...)`는 기존 README 예시가
   미정의 헬퍼(`fetchSomething`, `doSomething`, `fetchPage`)를 그대로 쓰는 관례를 따른다. 새 import 추가 불필요.
3. **앵커 링크 실측** — 삽입 후 GitHub/미리보기 렌더로 `#limitmapiterable-mapperfunction` 및 mapSettled 앵커가
   동작하는지 확인한다(§2.2, §3 주의).
4. **TSDoc 문안 반영** — `index.d.ts`의 `LimitFunction`·`LimitedFunction` 양쪽에 추가되는 `filter` 시그니처
   (계약 §1.2)에 아래 문안을 TSDoc으로 붙인다. `map`/`mapSettled` TSDoc 어투를 mirror 한다:

   > Filter an iterable or async iterable of inputs with limited concurrency, keeping only the items whose predicate resolves to a truthy value.
   >
   > The predicate receives the item value and its index and may be sync or async. Like {@link LimitFunction.map}, a predicate rejection is fail-fast: the first rejection rejects the returned promise.
   >
   > Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. Sync iterables retain the eager behavior.
   >
   > @param iterable - An iterable or async iterable of inputs.
   > @param predicateFunction - Predicate returning a boolean or a promise for a boolean; only truthy items are kept.
   > @returns A promise resolving to the kept input items in input (draw) order, regardless of completion order.

5. **비목표 준수** — `filterSettled` 류 신규 API, 기존 섹션 재배치, mockup/이미지 산출물은 만들지 않는다(계약 §8).

### 6.1 기존 요소 보존 체크
- `## API` 하위 섹션 순서는 filter 삽입 지점 외에는 불변.
- `map`/`mapSettled`/`clearQueue`/`pause`/`subscribe` 문안 및 예시 그대로.
- README 상단 Usage, Install, FAQ, Related, Inspector demo 섹션 불변.

---

## 7. 산출물 범위 확인 (mockup 참조 대체)

- 본 task는 packet 계약상 **HTML mockup/이미지 산출물이 금지**된다. 따라서
  `docs/design/mockups/*.html`는 생성하지 않으며, 이는 누락이 아니라 계약 준수다(AC3).
- 시각 산출물이 아니라 **문서 문안/구조**가 dev 소비 대상이므로, §3의 문안 블록이 곧 "시안"에 해당한다.

---

## 8. Self-critique

1. **AC 매핑** — AC1(sync/async/순서/rejection 4시나리오)은 §3 예시 1~4 + §4 매핑표로 전부 커버.
   AC2(배치·대비 위치)는 §2 표로 명시. AC3(markdown 전용)은 §7로 확인. ✅
2. **dev 구현 가이드** — §6에 삽입 지점(현행 line 136↔138 사이), placeholder 관례, 앵커 실측, TSDoc 문안까지 단계화. ✅
3. **기존 요소 보존** — §6.1로 map/mapSettled/기타 섹션 불변 명시, additive 삽입만 지시. ✅
4. **컴포넌트 매핑** — §5로 README 섹션·도입 문단·예시·링크·TSDoc를 문서 단위로 분해해 dev 반영 지점 매핑. ✅
5. **모호함 flag** — ⚠️ mapSettled 앵커 문자열은 GitHub 렌더 규칙에 의존하므로 §2.2·§3(주의 블록)·§6(3단계)에서
   "developer가 미리보기로 실측" 하도록 flag 처리한다. 문서에서는 계산된 값 `#limitmapsettlediterable-mapperfunction`을
   제시하되 확정은 렌더 실측에 위임한다. 그 외 계약(§1~§8)과 충돌·모호 지점 없음.
