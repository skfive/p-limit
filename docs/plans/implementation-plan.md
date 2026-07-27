# 이름 기반 concurrency preset API 실행 계약 동결 (F68F701A7A-108)

> planner 산출물 — developer(F68F701A7A-107)가 그대로 구현하고 tester(F68F701A7A-110)가 검증할 실행 설계 및 handoff 계약.
> 계약 인터페이스: `planning-contract@v1`.
> **이 문서가 공개 API 시그니처·오류 타입 이름·`index.d.ts` 타입 export·테스트/문서 인터페이스의 frozen 권위**다. developer는 아래 시그니처·오류 타입·타입 export를 **변경 없이** 구현한다.
> **Additive only, semver minor.** 기존 `pLimit`/`limitFunction`의 공개 API와 기본 동작은 보존한다(§6).

## 1. 목표 / 배경

`p-limit`에 **이름(문자열)으로 동시성 한도를 지정·전환**하는 preset 기능을 추가한다. 숫자 concurrency 값을 코드 곳곳에 반복하는 대신, 의미 있는 이름(예: `'fast'`)을 한 번 등록하고 그 이름으로 limiter를 생성·전환한다.

- **등록**: 이름 → concurrency 값 매핑을 module-global 레지스트리에 등록한다.
- **생성**: `pLimit(name)` / `pLimit({concurrency: name})`로 등록된 preset 이름으로 limiter를 만든다.
- **전환**: 살아 있는 limiter의 한도를 `limit.usePreset(name)`으로 preset 값으로 바꾼다.
- 기존 숫자 기반 사용법과 코어 스케줄링/타이밍 동작은 **일절 바뀌지 않는다**. 모든 변경은 순수 additive다.

### 설계 결정 (명시된 가정)

- **레지스트리는 비어 있는 상태로 시작한다 — built-in preset을 제공하지 않는다.** 구체적 preset 이름/값은 제품 결정 사항이며 PM 분해에 명시되지 않았으므로, planner가 임의 값을 동결하지 않는다. 사용자가 `definePreset`으로 직접 등록한다. (built-in preset 추가는 향후 별도 요구사항이며 본 계약의 non-goal — §13.)
- **레지스트리는 module-global(모듈당 하나)이다.** 같은 모듈에서 만든 모든 limiter가 동일 레지스트리를 공유한다. 이 전역성은 테스트 격리 규칙(§9)에 반영한다.
- preset 값의 유효성은 **코어 `validateConcurrency`와 동일 규칙**(양의 정수 또는 `Infinity`)을 재사용한다 — 새 검증 규칙을 만들지 않는다(additive 무결성).
- 문자열 인자는 **항상 preset 이름**으로 해석한다. `'4'` 같은 숫자형 문자열도 숫자로 파싱하지 않고 이름 `'4'`로 조회한다(등록 안 되어 있으면 `UnknownPresetError`).

## 2. 사용자 시나리오

- 시나리오 A (등록 후 생성): 앱 부트스트랩에서 `definePreset('fast', 8)`로 preset을 등록하고, 이후 `pLimit('fast')`로 동시성 8 limiter를 만든다.
- 시나리오 B (런타임 전환): 실행 중 외부 신호(레이트 리밋 완화 등)에 따라 `limit.usePreset('fast')`로 한도를 올리고, 부하가 커지면 `limit.usePreset('slow')`로 낮춘다. 대기 중 태스크는 숫자 setter와 동일하게 새 한도까지 승격된다.
- 시나리오 C (오타 방어): 등록되지 않은 이름으로 전환을 시도하면 `UnknownPresetError`가 던져지고, **기존 한도는 그대로 유지**되어 실행이 중단·왜곡되지 않는다.

## 3. 공개 API 계약 (frozen)

> 아래 함수명·인자·반환은 exact 값이다. developer는 이름·인자 순서·반환 타입을 바꾸지 않는다.

### 3.1 `definePreset(name, concurrency)` — 신규 named export (등록)

```js
import {definePreset} from 'p-limit';

definePreset(name, concurrency); // => undefined (void)
```

- `name` (`string`): 비어 있지 않은 문자열 preset 이름.
- `concurrency` (`number`): 양의 정수 또는 `Infinity`(코어 `validateConcurrency`와 동일 규칙).
- **반환**: `void`.
- **동작**: 레지스트리에 `name → concurrency`를 등록한다. 이미 존재하는 이름이면 **덮어쓴다**(override).
- **던지는 오류**(§4):
  - `name`이 비어 있지 않은 문자열이 아니면 → `TypeError`.
  - `concurrency`가 양의 정수/`Infinity`가 아니면 → `TypeError`(코어 메시지 재사용).
  - **오류 시 레지스트리는 변경되지 않는다** — 실패한 등록은 기존 값을 보존한다(§7 E2).

### 3.2 `pLimit`가 preset 이름 문자열을 수용 (생성)

기존:
```ts
pLimit(concurrency: number | Options): LimitFunction
```
동결(확장):
```ts
pLimit(concurrency: number | string | Options): LimitFunction
```

- `pLimit(name)` — `name`이 문자열이면 레지스트리에서 concurrency 값을 조회해 그 값으로 limiter를 생성한다.
- `pLimit({concurrency: name, rejectOnClear?})` — `Options.concurrency`도 `number | string`을 수용한다(§5). 문자열이면 동일하게 조회한다.
- **해석 순서(frozen)**: (1) 인자가 object면 `{concurrency, rejectOnClear}` 구조 분해 → (2) `concurrency`가 string이면 레지스트리 조회로 number로 치환 → (3) 코어 `validateConcurrency(concurrency)` 실행.
- 등록되지 않은 이름 → `UnknownPresetError`(§4). limiter는 생성되지 않는다.
- **숫자·object 인자 동작은 기존과 100% 동일**하다(문자열 분기만 추가되는 additive 변경).

### 3.3 `limit.usePreset(name)` / `limitedFunction.usePreset(name)` (전환)

`LimitFunction`(및 `limitFunction()` 반환 함수)에 신규 메서드 추가:

```ts
usePreset: (name: string) => void
```

- `name` (`string`): 등록된 preset 이름.
- **반환**: `void`.
- **동작**: `name`을 레지스트리에서 조회한 값을 **기존 `concurrency` setter 경로**(코어의 `validateConcurrency` + microtask drain + 대기 태스크 승격 + listener 통지)로 그대로 대입한다. 즉 `limit.usePreset(name)`은 `limit.concurrency = <preset 값>`과 동일한 스케줄링/타이밍 효과를 가진다.
- **던지는 오류**: 등록되지 않은 이름 → `UnknownPresetError`(§4).
- **기존 concurrency 보존(frozen invariant)**: 조회는 대입 **이전**에 일어나므로, 미등록 이름으로 실패하면 `concurrency`는 **변경되지 않는다**(§7 E1). 살아 있는 limiter의 스케줄링은 영향받지 않는다.
- `limitFunction()` 반환 함수의 `usePreset`은 다른 제어 메서드와 동일하게 **내부 limiter로 위임**한다(스케줄링 로직 중복 없음).

### 3.4 `UnknownPresetError` — 신규 named export (오류 타입)

```js
import {UnknownPresetError} from 'p-limit';

new UnknownPresetError(presetName); // presetName: string
```

- `class UnknownPresetError extends Error`.
- `error.name === 'UnknownPresetError'` (exact).
- `error.presetName` (`string`): 조회에 실패한 preset 이름.
- `error.message === 'Unknown preset: ' + '`' + presetName + '`'` — 예: `` Unknown preset: `fast` ``.
- `error instanceof UnknownPresetError === true`, `error instanceof Error === true`.

### 3.5 레지스트리 의미론 (frozen)

- 레지스트리는 `index.js` module-scope에 **하나**(예: `Map<string, number>`)로 존재하며, 그 모듈에서 만든 모든 limiter가 공유한다.
- `definePreset`은 등록/덮어쓰기만 한다. **레지스트리 조회/삭제/열거용 공개 API는 이 계약에 포함하지 않는다**(§13 non-goal).
- preset 이름과 concurrency 값은 등록 시점에 캡처된다. 이후 `definePreset`으로 같은 이름을 덮어써도 **이미 생성된 limiter의 concurrency는 소급 변경되지 않는다**(생성 시점 값 유지).

## 4. 오류 계약 (exact 타입·메시지)

| 상황 | 오류 타입 (exact) | 메시지 (exact) |
| --- | --- | --- |
| 미등록 이름 조회 (`pLimit(name)` / `usePreset(name)`) | **`UnknownPresetError`** (신규 export) | `` Unknown preset: `<name>` `` |
| `definePreset`의 `name`이 비어 있지 않은 문자열 아님 | `TypeError` | `` Expected `name` to be a non-empty string `` |
| `definePreset`의 `concurrency`가 양의 정수/`Infinity` 아님 | `TypeError` | `` Expected `concurrency` to be a number from 1 and up `` (코어 재사용) |
| `pLimit({concurrency})`/`pLimit(number)`의 값이 유효하지 않음 | `TypeError` | `` Expected `concurrency` to be a number from 1 and up `` (기존 동작 불변) |

- 신규로 도입하는 **명시적 오류 타입은 `UnknownPresetError` 하나**다. 나머지 값 검증 오류는 코어의 기존 `TypeError`를 그대로 재사용해 additive 무결성을 지킨다.

## 5. `index.d.ts` 타입 계약 (frozen, exact)

developer는 아래 타입 export를 **정확히** 추가/수정한다.

### 5.1 신규 export

```ts
// preset 등록
export function definePreset(name: string, concurrency: number): void;

// 미등록 preset 조회 오류
export class UnknownPresetError extends Error {
	constructor(presetName: string);
	readonly name: 'UnknownPresetError';
	readonly presetName: string;
}
```

### 5.2 기존 타입 확장 (widening — additive)

```ts
// default export: 문자열 preset 이름 수용
export default function pLimit(concurrency: number | string | Options): LimitFunction;

// Options.concurrency: 문자열 preset 이름 수용
export type Options = {
	readonly concurrency: number | string;
	readonly rejectOnClear?: boolean;
};
```

### 5.3 `LimitFunction` / `LimitedFunction`에 메서드 추가

두 타입 모두에 동일 시그니처 추가:

```ts
/**
Switch the limiter's concurrency to a registered preset.
*/
usePreset: (name: string) => void;
```

- `LimitedFunction<Arguments, ReturnType>`에도 동일하게 추가한다.
- 입력 타입 확장(`number` → `number | string`)은 기존 `number` 인자를 그대로 허용하므로 **하위 호환**이다.

## 6. 하위 호환 / semver 영향 (frozen)

- **모두 additive**: 신규 named export(`definePreset`, `UnknownPresetError`), 신규 메서드(`usePreset`), 입력 타입 확장(`number | string`). 기존 export·메서드·시그니처는 **삭제·축소·의미 변경 없음**.
- **기본 동작 보존**: 레지스트리는 기본으로 비어 있고, 문자열을 넘기지 않는 한 어떤 코드 경로도 바뀌지 않는다. 기존 숫자/`Options` 사용법의 스케줄링·타이밍·settlement은 불변.
- **semver: minor** (기능 추가, breaking 없음).
- **판정 기준**: 기존 `test.js`·`index.test-d.ts`가 **무수정으로 green** 유지 + `test-preset-regression.js` green(§9).

## 7. Edge / 실패 케이스 (기존 concurrency 보존 규칙 포함)

- **E1 (미등록 전환 — 보존)**: `pLimit(2)`로 만든 limiter에 `limit.usePreset('nope')` → `UnknownPresetError` 던짐. **`limit.concurrency`는 여전히 2**, 실행 중/대기 중 태스크는 영향 없음(조회가 대입보다 먼저 실패하므로).
- **E2 (잘못된 등록 값 — 보존)**: `definePreset('x', 4)` 후 `definePreset('x', 0)`(또는 `-1`, `1.5`, `NaN`, 문자열) → `TypeError`. **레지스트리의 `'x'`는 여전히 4**로 남는다. 신규 이름을 잘못된 값으로 등록 시도해도 그 이름은 등록되지 않는다.
- **E3 (미등록 생성)**: `pLimit('unknown')` → `UnknownPresetError`, limiter 생성 안 됨.
- **E4 (덮어쓰기)**: `definePreset('fast', 8)` 후 `definePreset('fast', 16)` → 이후 `pLimit('fast').concurrency === 16`. 단, 덮어쓰기 이전에 만든 limiter의 concurrency는 소급 변경되지 않음(§3.5).
- **E5 (`Infinity` preset)**: `definePreset('unbounded', Infinity)` 허용 → `pLimit('unbounded').concurrency === Infinity`, 코어 규칙대로 `isSaturated`는 항상 `false`.
- **E6 (빈/비문자열 이름)**: `definePreset('', 4)` / `definePreset(4, 4)` / `definePreset(null, 4)` → `TypeError('Expected \`name\` to be a non-empty string')`.
- **E7 (숫자형 문자열)**: `pLimit('4')` → 이름 `'4'` 조회. 등록 안 되어 있으면 `UnknownPresetError`(숫자 4로 파싱하지 않음).
- **E8 (전환 후 drain)**: 대기 태스크가 있는 상태에서 낮은 preset → 높은 preset으로 `usePreset` → 숫자 setter와 동일하게 대기 태스크가 새 한도까지 승격되고 listener에 concurrency-change transition이 통지됨.

## 8. Acceptance Criteria (Given/When/Then)

- **AC1 (등록·생성)**
  - Given 레지스트리에 preset이 없음, When `definePreset('fast', 8)` 후 `pLimit('fast')`, Then 반환 limiter의 `concurrency === 8`이고 동시 실행이 8로 제한된다.
- **AC2 (object 형태 생성)**
  - Given `definePreset('slow', 1)`, When `pLimit({concurrency: 'slow', rejectOnClear: true})`, Then `concurrency === 1`이고 `rejectOnClear` 동작이 기존과 동일하다.
- **AC3 (전환)**
  - Given `pLimit(1)` limiter와 `definePreset('fast', 4)`, When `limit.usePreset('fast')`, Then `limit.concurrency === 4`이고 대기 태스크가 4까지 승격된다(숫자 setter와 동일).
- **AC4 (미등록 전환 시 보존)**
  - Given `pLimit(2)` limiter, When `limit.usePreset('nope')`, Then `UnknownPresetError`가 던져지고 `limit.concurrency`는 **2로 유지**되며 스케줄링이 영향받지 않는다.
- **AC5 (잘못된 값 거부 시 레지스트리 보존)**
  - Given `definePreset('x', 4)`, When `definePreset('x', 0)`, Then `TypeError`가 던져지고 `pLimit('x').concurrency`는 **여전히 4**다.
- **AC6 (오류 타입 계약)**
  - Given 미등록 이름, When `pLimit('unknown')`, Then `error instanceof UnknownPresetError` 이고 `error.name === 'UnknownPresetError'`, `error.presetName === 'unknown'`.
- **AC7 (하위 호환)**
  - Given 문자열을 쓰지 않는 기존 코드, When `pLimit(2)` / `limitFunction(fn, {concurrency: 2})`, Then 동작·타입이 기존과 완전히 동일하고 기존 회귀 테스트가 무수정 green이다.
- **AC8 (타입 export)**
  - Given TypeScript 소비자, When `definePreset`/`UnknownPresetError`/`usePreset`/`pLimit(string)`를 사용, Then `index.test-d.ts`의 tsd 단언이 통과한다(§9.2).

## 9. 테스트 계약 (tester handoff, F68F701A7A-110)

> 테스트 파일은 planner에게 read-only다. 아래는 developer/tester가 채울 케이스 목록·구조 계약이다. **레지스트리가 module-global이므로 각 테스트는 고유한 preset 이름을 사용**해 교차 오염을 피한다(예: 테스트별 접두사).

### 9.1 `test.js` (AVA) 런타임 케이스 (필수 목록)

1. `definePreset(unique, 8)` 후 `pLimit(unique).concurrency === 8`.
2. `pLimit({concurrency: unique})` object 형태가 preset을 해석하고 `rejectOnClear`가 함께 동작.
3. `limit.usePreset(unique)`가 살아 있는 limiter의 `concurrency`를 preset 값으로 전환(대입 확인).
4. `usePreset`로 한도를 올리면 대기 태스크가 새 한도까지 승격됨(기존 concurrency-raise 테스트와 동일 패턴으로 검증).
5. `definePreset` 덮어쓰기: 같은 이름 재등록 후 `pLimit(name)`이 새 값을 사용(E4).
6. `pLimit('__missing__')` → `t.throws(..., {instanceOf: UnknownPresetError})`, `error.name`/`error.presetName` 단언(AC6).
7. `limit.usePreset('__missing__')` → `UnknownPresetError` 던지고 **`limit.concurrency` 불변** + 이후 스케줄링 정상(AC4/E1).
8. `definePreset(name, 0)`/`-1`/`1.5`/`NaN`/`'x'` → `TypeError`, 사전 등록 값 보존(AC5/E2).
9. `definePreset('', 4)`/`definePreset(4, 4)` → `TypeError('Expected \`name\` to be a non-empty string')`(E6).
10. `definePreset(name, Infinity)` → `pLimit(name).concurrency === Infinity`, `isSaturated === false`(E5).
11. `limitFunction(fn, {concurrency: unique})`가 preset 해석 + `limitedFunction.usePreset(other)` 위임 전환(§3.3).
12. 하위 호환 스모크: `pLimit(2)` 숫자 사용이 기존과 동일(AC7).

### 9.2 `index.test-d.ts` (tsd) 타입 케이스 (필수 목록)

1. `expectType<void>(definePreset('fast', 4))`.
2. `expectType<LimitFunction>(pLimit('fast'))`.
3. `pLimit({concurrency: 'fast'})`가 타입 오류 없이 `LimitFunction` 반환.
4. `expectType<void>(limit.usePreset('fast'))`.
5. `const e = new UnknownPresetError('fast'); expectType<string>(e.presetName);` 및 `expectType<'UnknownPresetError'>(e.name);`.
6. `limitFunction(async (_n: number) => _n, {concurrency: 'fast'})`가 유효하고 `expectType<void>(lf.usePreset('fast'))`.
7. `expectError(definePreset(123, 4))` — 비문자열 이름은 타입 오류.
8. `expectType<LimitFunction>(pLimit(2))` — 숫자 인자 하위 호환 유지.

### 9.3 회귀 가드

- `test-preset-regression.js`(tester 소유, read-only): 기존 `pLimit`/`limitFunction` 공개 표면과 기본 동작 보존을 가드.
- 실행 범위: focused. 정적 검증·단위 테스트(`npm test` = `xo && ava && tsd`)를 전체 실행하고, 라이브러리 회귀 가드(`test.js`, `test-preset-regression.js`)도 green인지 확인한다.

## 10. README 예제 구조 (developer handoff, `readme.md`)

developer가 `readme.md`에 아래 **구조**로 섹션을 추가한다(정확한 산문은 developer 재량, 시그니처·오류 이름은 §3~§4 고정):

- `### pLimit(concurrency)`의 `#### concurrency`에 **"등록된 preset 이름 문자열도 수용한다"** 한 줄 추가.
- 신규 `### definePreset(name, concurrency)` <sup>named export</sup> — `#### name`, `#### concurrency`, 덮어쓰기 의미, 던지는 오류(§4), 코드 예제(`definePreset('fast', 8)`).
- 신규 `### limit.usePreset(name)` — `limit.concurrency` 근처에 배치. 살아 있는 limiter 전환, `UnknownPresetError` 던짐, **실패 시 기존 concurrency 보존** 명시, 예제(`limit.usePreset('slow')`).
- 신규 `### UnknownPresetError` <sup>named export</sup> — `.name`/`.presetName` 문서화.
- `### limitFunction(fn, options)`의 `#### concurrency`에 preset 이름 수용 + 노출 표면 목록에 `.usePreset()` 추가.
- 통합 예제 블록: `definePreset` → `pLimit('fast')` → `limit.usePreset('slow')` 흐름.

## 11. 파일 소유권 / handoff (frozen — 경계 겹침 금지)

| 파일 | 소유자 | 비고 |
| --- | --- | --- |
| `docs/plans/implementation-plan.md` | **planner** (F68F701A7A-108, 본 문서) | 실행 계약. 코드 파일 직접 생성 안 함 |
| `index.js` | **developer** (F68F701A7A-107) | 레지스트리·`definePreset`·`UnknownPresetError`·`pLimit` 문자열 분기·`usePreset`(+`limitFunction` 위임) |
| `index.d.ts` | **developer** | §5 타입 export/확장 |
| `index.test-d.ts` | **developer** | §9.2 tsd 케이스 |
| `test.js` | **developer** | §9.1 AVA 케이스 |
| `readme.md` | **developer** | §10 문서 섹션 |
| `test-preset-regression.js` | **tester** (F68F701A7A-110) | §9.3 회귀 가드 |

- developer는 §3~§5의 공개 API 시그니처·오류 타입 이름·`index.d.ts` 타입 export를 **변경 없이** 구현한다(`planning-contract@v1` invariant).
- 기존 `pLimit`/`limitFunction` 공개 API와 기본 동작은 보존한다(additive only, semver minor).

## 12. 완료 조건 (검증 가능한 종료 조건)

- [ ] `index.js`: `definePreset`·`UnknownPresetError`·module-global 레지스트리·`pLimit` 문자열 분기·`usePreset`(+`limitFunction` 위임) 구현(§3).
- [ ] `index.d.ts`: §5의 신규 export·타입 확장·`usePreset` 추가.
- [ ] 미등록 이름 → `UnknownPresetError`(exact `name`/`presetName`/message), 잘못된 값 → `TypeError`(코어 메시지 재사용)(§4).
- [ ] 미등록 전환/잘못된 등록 시 **기존 concurrency·레지스트리 값 보존**(§7 E1/E2, AC4/AC5).
- [ ] `readme.md`에 §10 섹션 추가.
- [ ] `test.js`·`index.test-d.ts`에 §9.1/§9.2 케이스 추가, 기존 회귀 테스트 무수정 green, `test-preset-regression.js` green.
- [ ] 기존 숫자/`Options` 사용법·타이밍·settlement 불변(§6, AC7).

## 13. 다른 페르소나를 위한 non-goals

- built-in preset 이름/값 제공(레지스트리는 비어 시작). 구체 preset 값은 별도 제품 요구사항.
- 레지스트리 조회/삭제/열거 공개 API(`getPreset`/`hasPreset`/`clearPresets` 등) 추가.
- `Options.concurrency` 이외의 옵션 확장, per-limiter 로컬 레지스트리.
- 기존 `pLimit`/`limitFunction` 시그니처·동작·타이밍 변경(additive 무결성 위반).
- 문자열의 숫자 파싱(`'4'` → 4). 문자열은 항상 preset 이름이다.
