# limit.mapSettled — README/API 문서 정보 구조 명세 (F68F701A7A-89)

> 본 문서는 planning-contract@v1 (`sha256:9d14c7ed3148e4066f6e599647324efd4c18c00fda81b6c895acac139f0f187b`)
> 의 runtime-artifact(`docs/plans/mapSettled-implementation-plan.md`)를 소비하는 **문서 정보 구조 설계**
> 산출물입니다. developer(F68F701A7A-90)가 `readme.md`에 `limit.mapSettled` API 절을 추가할 때 그대로
> 따라 넣을 수 있는 **섹션 구조·제목 위계·배치 위치·문서용 코드 예시**를 정의합니다.
>
> **산출물 범위**: markdown 문서 명세 1건(`docs/design/mapSettled-api-docs.md`)에 한정합니다.
> 이 task는 브라우저 UI·HTML/CSS·이미지·mockup 산출물을 만들지 않습니다(work packet non-goal).
> 공개 API 시그니처·결과 형식·동작은 planning-contract에서 이미 **동결**되었으므로 본 문서는 이를
> 변경하지 않고 문서화 방식만 설계합니다.

---

## 0. 목적과 소비자

- **소비자**: developer(F68F701A7A-90) — 본 문서의 §3 섹션 골격과 §4 코드 예시를 `readme.md`에 옮겨
  넣는다. planning-contract §5.1은 "`### limit.map(...)` 섹션 바로 뒤에 `### limit.mapSettled(...)`
  섹션 추가"를 이미 수정 지침으로 고정했다. 본 문서는 그 섹션의 **내부 구조와 문구·예시**를 확정한다.
- **불변 준수**: 아래 모든 코드 예시의 시그니처·결과 형식은 planning-contract §2·§3의 동결 인터페이스와
  1:1 일치한다. developer는 예시의 결과 주석(`{status:'fulfilled', value}` 등)을 그대로 사용한다.

---

## 1. 배치 위치 (README 내 문서 정보 구조)

기존 `readme.md`의 API 섹션 순서(현재 상태 기준)와 신규 절의 삽입 지점:

```
## API
├── ### pLimit(concurrency)            (default export)
├── ### limit(fn, ...args)
├── ### limit.map(iterable, mapperFunction)
│   └── ★ 여기 바로 뒤에 신규 절 삽입 ★
├── ### limit.mapSettled(iterable, mapperFunction)   ← 신규 (본 명세 §3)
├── ### limit.activeCount
├── ### limit.pendingCount
├── ### limit.clearQueue(reason?)
├── ### limit.concurrency
├── ### limit.onIdle()
├── ...
```

**배치 근거**:
- `mapSettled`는 `map`의 자매(sister) 메서드다 — 동일 인자 형태(`(iterable, mapperFunction)`),
  동일 순서 보존, 동일 lazy 소비를 공유하고 실패 처리만 다르다. 두 절을 인접 배치하면 독자가
  "`map` vs `mapSettled` 선택"을 한 화면에서 비교할 수 있다.
- 제목 위계는 `map`과 동일한 `###`(h3, `## API` 하위)를 사용한다. 새로운 위계(h2/h4)를 만들지 않는다.
- README 목차·상단 링크가 별도로 없으므로(현재 `readme.md`는 자동 목차 없음) 목차 갱신 항목은 없다.

---

## 2. limit.map 대비 차이 서술 전략

독자가 가장 빨리 이해해야 하는 것은 **"map과 무엇이 같고 무엇이 다른가"**이다. 문서는 다음 3단 구조로
차이를 전달한다.

1. **첫 문장에서 map을 앵커로 명시**: "Like `limit.map`, but …" 형태로 시작해 이미 map을 읽은 독자가
   델타만 흡수하게 한다.
2. **핵심 차이 1문단**: 개별 mapper 실패가 전체 호출을 reject하지 않고 `PromiseSettledResult`로
   기록된다 → `Promise.allSettled`와 동일한 결과 형태. (planning-contract §0·§2.2)
3. **공통점 재확인 1문단**: 입력(draw) 순서 보존, async iterable lazy 소비(최대 `concurrency` in-flight),
   동기 iterable eager 소비는 `map`과 동일하다. (planning-contract §3.1·§3.2)
4. **경계 조건 1문장**: 입력 iterator 자체(`next()`)의 실패는 예외 — 이때만 전체가 reject되며
   `iterator.return()`을 best-effort 1회 호출한다. (planning-contract §3.2 / E5)

아래 표는 문서 본문에는 넣지 않는 **설계 근거용 요약**이다(README에는 산문+예시로 표현). planning-contract
§3.2 표를 문서 소비자 관점으로 압축했다.

| 관점 | `limit.map` | `limit.mapSettled` |
| --- | --- | --- |
| 반환 타입 | `Promise<ReturnType[]>` | `Promise<Array<PromiseSettledResult<ReturnType>>>` |
| mapper 성공 항목 | `value` | `{status: 'fulfilled', value}` |
| mapper 실패 시 | 전체 promise reject (fail-fast) | 해당 인덱스만 `{status: 'rejected', reason}`, 나머지 계속 |
| 입력 iterator 실패 시 | 전체 reject + `iterator.return()` | 전체 reject + `iterator.return()` (동일) |
| 순서 보존 | draw 순서 | draw 순서 (동일) |
| async iterable lazy 소비 | 예 (최대 `concurrency` in-flight) | 예 (동일) |
| 유사 표준 API | `Promise.all` | `Promise.allSettled` |

---

## 3. README 신규 절 골격 (developer가 readme.md에 삽입할 구조)

developer는 아래 헤딩·문단 순서를 그대로 사용한다. 산문 문구는 아래 영문 초안을 기준으로 하되, README
전반의 어조에 맞춰 다듬어도 된다(결과 형식·시그니처 표현은 변경 금지).

### 3.1 절 골격 (헤딩 및 문단 순서)

```
### limit.mapSettled(iterable, mapperFunction)
  [문단 1] map 앵커 + 핵심 차이 (개별 실패가 전체를 reject하지 않음, Promise.allSettled 호환)
  [문단 2] mapper 인자 설명 (item value + index) — map과 동일
  [문단 3] 반환값: PromiseSettledResult 배열, 입력(draw) 순서 보존
  [문단 4] async iterable lazy 소비 = map과 동일 (최대 concurrency in-flight)
  [문단 5] 경계: 입력 iterator 자체의 실패만 전체 reject (+ iterator.return() 1회)
  [코드예시 A] 동기 iterable — 부분 실패 (§4.1)
  [코드예시 B] async iterable — 스트리밍 + 부분 실패 (§4.2)
  [문단 6] 결과 집계 관용구 안내 (status로 분기) + p-map 참조 링크
```

### 3.2 영문 문구 초안 (README 삽입용)

> ### limit.mapSettled(iterable, mapperFunction)
>
> Like `limit.map`, but a rejection from an individual mapper never rejects the returned promise.
> Each input is reported as a [`PromiseSettledResult`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled),
> so the result mirrors `Promise.allSettled` while preserving input (draw) order.
>
> The mapper function receives the item value and its index, exactly like `limit.map`.
>
> Returns a promise that resolves to one settled result per input — `{status: 'fulfilled', value}`
> for a successful mapper and `{status: 'rejected', reason}` for a failed one — in input (draw)
> order, regardless of the order in which they complete. A failing mapper does not stop the others;
> the remaining inputs keep being processed.
>
> Async iterables are consumed lazily, just like `limit.map`: the next value is only pulled once a
> concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any
> time. Sync iterables keep the eager behavior.
>
> Note: only a failure of the input iterable itself (its `next()` throwing or rejecting) rejects the
> returned promise; in that case the iterator's `return()` is called once, the same as `limit.map`.
> Individual mapper failures are always captured as `{status: 'rejected', reason}`.
>
> [코드예시 A — §4.1]
>
> [코드예시 B — §4.2]
>
> Iterate the returned array and branch on `status` to separate successes from failures. This is a
> convenience function for partial-failure batch processing; for more complex use cases, see
> [p-map](https://github.com/sindresorhus/p-map).

---

## 4. 문서용 코드 예시 (planning-contract 일치)

아래 예시는 planning-contract §3.1·§3.2의 동결 예시를 README 문서 형식으로 옮긴 것이다. 결과 주석은
동결 계약과 **verbatim 일치**해야 하며 developer는 값을 임의로 바꾸지 않는다.

### 4.1 예시 A — 동기 iterable, 부분 실패 (Promise.allSettled 호환)

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

const results = await limit.mapSettled([1, 2, 3], async n => {
	if (n === 2) {
		throw new Error('boom');
	}

	return n * 10;
});

console.log(results);
//=> [
//   {status: 'fulfilled', value: 10},
//   {status: 'rejected',  reason: Error('boom')},
//   {status: 'fulfilled', value: 30},
// ]
```

- **문서화 포인트**: `n === 2`가 throw해도 전체가 reject되지 않고, 인덱스 1만 `rejected`로 기록되며
  인덱스 0·2는 정상 `fulfilled`다. 순서는 입력 `[1, 2, 3]`을 그대로 보존한다. (planning-contract S2·S4)

### 4.2 예시 B — async iterable, 스트리밍 + 부분 실패 (lazy 소비)

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

async function * source() {
	yield 'a';
	yield 'b'; // fails
	yield 'c';
}

// The async generator is pulled lazily; a failing item does not stop the rest.
const results = await limit.mapSettled(source(), async value => {
	if (value === 'b') {
		throw new Error('bad');
	}

	return value.toUpperCase();
});

console.log(results);
//=> [
//   {status: 'fulfilled', value: 'A'},
//   {status: 'rejected',  reason: Error('bad')},
//   {status: 'fulfilled', value: 'C'},
// ]
```

- **문서화 포인트**: async generator의 `'b'`가 실패해도 소비가 멈추지 않고 `'c'`까지 계속 draw된다.
  최대 `concurrency`(=2)개만 동시에 in-flight이며 결과는 draw 순서를 보존한다. (planning-contract A2·A3)

### 4.3 예시 C — 결과 집계 관용구 (선택 삽입 가능)

§3.1 [문단 6]을 코드로 보강하고 싶을 때 developer가 선택적으로 넣을 수 있는 소비 패턴이다. 새 API 동작을
도입하지 않고 표준 `PromiseSettledResult` 순회만 보여준다.

```js
const succeeded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
const failed = results.filter(result => result.status === 'rejected').map(result => result.reason);

console.log(`${succeeded.length} succeeded, ${failed.length} failed`);
```

- **문서화 포인트**: `status`가 표준 `Promise.allSettled` 결과와 동일하므로 기존 지식을 재사용할 수
  있음을 강조한다. 이 예시는 필수는 아니며 §3.2의 마지막 문단(산문 안내)만으로도 AC를 충족한다.

---

## 5. dev 구현 가이드 (readme.md 반영 단계)

developer(F68F701A7A-90)가 `readme.md`를 수정할 때의 단계별 지침이다. planning-contract §5.1의 파일
수정 지침과 정합한다.

1. `readme.md`에서 `### limit.map(iterable, mapperFunction)` 절의 끝(현재 "…see [p-map](…)." 문단과
   그 위 예시 블록까지가 map 절)을 찾는다. 그 **바로 다음 줄**부터 §3.2 골격을 삽입한다
   (다음 절인 `### limit.activeCount` 앞).
2. 헤딩은 정확히 `### limit.mapSettled(iterable, mapperFunction)`로 쓴다(map 절과 위계·표기 대칭).
3. §3.2 영문 초안을 문단 순서(§3.1) 그대로 넣는다. README 어조에 맞춰 문구는 다듬어도 되나 아래는 변경
   금지:
   - 반환 형식 표현: `{status: 'fulfilled', value}` / `{status: 'rejected', reason}`
   - "individual mapper 실패가 전체를 reject하지 않는다"는 핵심 서술
   - "입력 iterator 자체의 실패만 전체 reject + `iterator.return()` 1회"라는 경계 서술
4. §4.1·§4.2 코드 예시를 삽입하고, **결과 주석은 planning-contract와 verbatim 일치**시킨다(값·순서·
   `status` 키를 임의로 바꾸지 않는다). §4.3은 선택 삽입.
5. 링크: `PromiseSettledResult`는 MDN `Promise.allSettled` 페이지로, `p-map`은 기존 map 절과 동일한
   `https://github.com/sindresorhus/p-map`로 건다(기존 링크 표기 재사용).
6. 코드 포매팅은 기존 README 컨벤션(탭 인덴트, `import pLimit from 'p-limit';` 시작)을 따른다 — 현재
   README의 map/limitFunction 예시와 동일한 스타일.
7. **README 외 파일(`index.js` 등) 수정은 본 문서 범위 밖**이다. developer는 별도 planning-contract
   §5.1 지침에 따라 구현 파일을 다룬다. 본 문서는 `readme.md` 문서 절에만 대응한다.

---

## 6. Acceptance Criteria 매핑

| work packet AC | 충족 위치 |
| --- | --- |
| README 섹션 구조(제목 위계·배치 위치·map 대비 차이 설명) 정의 | §1(배치·위계), §2(차이 서술 전략), §3(절 골격) |
| 동기·비동기 iterable + Promise.allSettled 호환 결과 코드 예시가 planning-contract와 일치 | §4.1(동기), §4.2(async), 결과 주석이 contract §3.1·§3.2와 verbatim 일치 |
| HTML/CSS/이미지 등 UI 산출물 없음, 산출물이 docs/design 경로 한정 | 본 문서 단일 markdown, `docs/design/mapSettled-api-docs.md` 1건, mockup/HTML 미생성 |

---

## 7. 모호함 / 미해결 사항 flag (developer 확인 요망)

- **§4.3 예시 C 삽입 여부**: 결과 집계 예시는 선택 사항으로 남겼다. README를 간결하게 유지하려면
  §3.2의 산문 안내만으로 충분하며, 실사용 관용구를 보여주고 싶으면 §4.3을 추가한다 — developer 재량.
- **MDN 링크 표기**: 현재 README에는 외부 MDN 링크 선례가 없다. `PromiseSettledResult`를 링크로 걸지
  일반 인라인 코드(``` `PromiseSettledResult` ```)로만 둘지는 README 링크 정책을 따른다 — 링크 부담이
  크면 인라인 코드로만 표기해도 AC에는 영향 없다.
- 위 두 항목 모두 **동결된 API 계약과 무관한 문서 표현 선택**이며, 어느 쪽을 택해도 acceptance
  criteria를 만족한다.

<!-- bf:pr-summary -->
## 시안 요약 — limit.mapSettled README/API 문서 정보 구조

`limit.mapSettled`의 README API 절 **문서 정보 구조**를 설계했습니다. (UI/HTML mockup 없음 — 문서 명세 task)

**산출물**: `docs/design/mapSettled-api-docs.md` (markdown 1건, `docs/design/**` 한정)

**핵심 설계**:
- **배치**: `### limit.map(...)` 절 **바로 뒤**에 `### limit.mapSettled(...)` (h3 위계, map과 대칭)
- **map 대비 차이 서술**: "Like `limit.map`, but 개별 mapper 실패가 전체를 reject하지 않음" → `Promise.allSettled` 호환 결과
- **문서용 코드 예시 2종**(+선택 1종): 동기 iterable 부분 실패 / async iterable 스트리밍 부분 실패 — 결과 주석을 planning-contract §3.1·§3.2와 **verbatim 일치**
- **dev 구현 가이드**: readme.md 삽입 단계·변경 금지 문구·링크 표기까지 명시

| 문서 요소 | planning-contract 근거 |
| --- | --- |
| 반환 형식 `{status:'fulfilled',value}` / `{status:'rejected',reason}` | §2.2, §3 |
| 입력 순서 보존 + async lazy 소비 | §3.1, §3.2 |
| 입력 iterator 실패만 전체 reject (+`iterator.return()` 1회) | §3.2 / E5 |

## Self-critique
- **AC 매핑**: §6 표로 3개 AC를 문서 위치에 1:1 매핑 — 모두 충족.
- **dev 구현 가이드**: §5에 readme.md 삽입 지점·헤딩 표기·변경 금지 문구·링크·포매팅 단계 명시.
- **기존 요소 보존**: README 기존 절 순서·h3 위계·map 절을 건드리지 않고 신규 절만 인접 삽입하도록 설계.
- **컴포넌트(문서 요소) 매핑**: 코드 예시 결과 주석을 planning-contract와 verbatim 일치시켜 dev가 값 추측 불필요.
- **모호함 flag**: §7에 예시 C 삽입 여부·MDN 링크 표기 2건을 developer 재량으로 flag (둘 다 AC 무관).
<!-- /bf:pr-summary -->
