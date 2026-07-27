# 동시성 프리셋 비교 패널 — 구현 설계 및 UI 계약 (F68F701A7A-48)

## 0. 문서 지위 (frozen contract)

이 문서는 **동결된(frozen) 실행 설계이자 UI 계약**이다. designer(F68F701A7A-46)와
developer(F68F701A7A-47)는 이 계약을 **병렬로 소비**하며, 아래 라우트·파일 경로·
DOM id/class·상태 모델·design token·접근성 이름·반응형 breakpoint를 **재정의하지
않고 그대로** 구현한다. tester(F68F701A7A-50)는 이 계약을 검증 기준으로 삼는다.

- `planning-contract@v1` — 실행 설계 문서(본 문서 전체).
- `ui-contract@v1` — 아래 4~9절의 exact UI 계약(designer/developer가 그대로 구현).

계약 변경이 필요하면 임의로 바꾸지 말고 Jira 코멘트로 planner와 조율한 뒤 본 문서를
먼저 갱신한다. 코드가 문서를 앞서지 않는다.

## 1. 목적

`p-limit`(동시 실행 개수를 제한하는 promise 유틸리티)에서 **동시성 값이 실행 타임라인에
주는 영향**을 나란히 비교할 수 있는 정적 브라우저 데모를 추가한다. 동일한 작업 집합을
동시성 **1 · 2 · 4** 세 프리셋으로 각각 실행하고, 세 타임라인을 한 화면에서 비교한다.

라우트 `/demo/concurrency-presets`로 접근하며, 사용자는 "실행" 버튼으로 세 프리셋을
동시에 재생하고 "초기화"로 되돌린다. 각 항목은 `대기 → 실행 → 완료`로 전이한다.

## 2. 구현 범위

### 포함 (in scope)
- `p-limit` 공개 API만 소비하는 순수 브라우저(ESM) 정적 데모 1개.
- 동시성 1·2·4 세 프리셋 패널을 가로/세로로 비교 렌더.
- **결정론적 로컬 fixture**(고정 작업 목록·고정 지연)로 세 프리셋에서 동일 입력을 실행.
- 항목 상태(대기/실행/완료) 시각화 + 패널 전체 상태(idle/running/complete).
- 실행/초기화 컨트롤과 상태 변화 접근성 안내(aria-live).

### 제외 (out of scope, non-goals)
- **외부 API·네트워크 요청·DB 금지** — 작업은 `setTimeout` 기반 인위적 지연으로만
  시뮬레이션한다. 오프라인에서도 결정론적으로 동일하게 동작해야 한다.
- **신규 런타임 의존성 추가 금지** — 저장소 루트 `package.json`의
  `dependencies`/`devDependencies`/`exports`를 변경하지 않는다(module_type: esm,
  package_manager: none).
- **`index.js` 공개 API 변경 금지** — 데모는 기존 공개 API(`pLimit(concurrency)`,
  반환된 `limit()` 함수, `limit.activeCount`, `limit.pendingCount`,
  `limit.concurrency`)만 소비한다.
- **기존 테스트·README 의미 변경 금지** — 신규 데모 파일만 추가한다(3절 보존 영역).
- 빌드 도구(번들러/트랜스파일러) 도입 금지 — 브라우저 네이티브
  `<script type="module">`로 동작하며 루트 `index.js`를 상대 경로로 import한다.
- 디자인 시안(구체 색상 값·타이포·애니메이션 디테일) — designer 담당. 본 문서는
  구조·id/class·design token 이름·상태 계약만 동결한다.

## 3. 보존 영역 (preservation zone — 절대 변경 금지)

신규 데모 파일만 **추가**하고, 아래는 의미·시그니처를 변경하지 않는다.

| 대상 | 규칙 |
|---|---|
| `index.js` (p-limit 코어 공개 API) | 변경 금지. 데모는 소비만 한다. |
| 기존 테스트 파일 | 변경 금지. 신규 데모용 테스트만 별도 추가 가능. |
| `readme.md`(루트 README) | 의미 변경 금지. |
| 루트 `package.json` | `dependencies`/`devDependencies`/`exports`/`scripts` 의미 변경 금지. |

## 4. 라우트 · 파일 경로 계약 (frozen)

- **라우트**: `/demo/concurrency-presets`
- **데모 디렉터리**: `demo/concurrency-presets/`

```
demo/concurrency-presets/
├── index.html     # DOM 구조 (developer, 6절 계약 준수) — ui-contract 아티팩트
├── main.js         # 로직: p-limit 소비, 상태 관리, DOM 갱신 (developer)
├── styles.css      # 시각 스타일 · design token 정의 (designer, 7절)
└── readme.md       # 실행 방법(정적 서버로 열기, 빌드 불필요)
```

- `main.js`는 루트 `index.js`를 상대 경로(`../../index.js`)로 ESM import한다.
- **계약 아티팩트(frozen)**: `demo/concurrency-presets/index.html`(developer),
  `docs/design/concurrency-presets-contract.md`(designer가 본 계약의 시각 매핑을 기록).
- 위 표에 없는 파일 추가가 필요하면 본 문서를 갱신하고 Jira로 조율한다.

## 5. 상태 모델 (frozen)

### 5.1 패널 전체 상태 (overall panel state)
값: **`idle` · `running` · `complete`** (다른 값 금지)

| 상태 | 진입 조건 |
|---|---|
| `idle` | 초기/초기화 직후. 실행 전. |
| `running` | "실행" 이후 하나 이상의 프리셋에 대기·실행 중 항목이 남아 있음. |
| `complete` | 세 프리셋의 모든 항목이 `완료`로 전이됨. |

### 5.2 개별 항목 상태 (per-item state)
값: **`대기(waiting) · 실행(running) · 완료(complete)`** — CSS class로 표현(6~7절).

전이: `waiting → running → complete` (역방향·에러 상태 없음, 결정론적 fixture).
- `waiting`: 항목 생성 직후, `limit()` 콜백 실행 전.
- `running`: `limit(() => trackedWork(item))` 콜백이 실행에 진입한 시점.
- `complete`: 해당 프라미스 resolve 시점.

세 프리셋(동시성 1·2·4)은 **동일한 결정론적 fixture**(동일 항목 수·동일 지연 배열)를
소비하되, `pLimit(1)` / `pLimit(2)` / `pLimit(4)`로 각각 실행해 동시 실행 개수에 따른
타임라인 차이를 비교한다.

상태 전이는 순수 함수(리듀서)로 분리해 DOM 없이 단위 테스트 가능하게 한다
(예: `applyTransition(items, id, nextState) → items`).

## 6. DOM 계약 (frozen — developer가 그대로 구현)

### 6.1 DOM id (정확히 이 이름만 사용)

| id | 요소 · 역할 |
|---|---|
| `concurrency-presets-root` | 데모 전체 루트 컨테이너. 패널 상태(5.1)를 이 요소 기준으로 노출. |
| `preset-run` | "실행" 컨트롤(`<button>`). 세 프리셋을 재생. |
| `preset-reset` | "초기화" 컨트롤(`<button>`). idle로 되돌림. |
| `timeline-preset-1` | 동시성 1 프리셋의 타임라인 컨테이너. |
| `timeline-preset-2` | 동시성 2 프리셋의 타임라인 컨테이너. |
| `timeline-preset-4` | 동시성 4 프리셋의 타임라인 컨테이너. |

### 6.2 CSS class (정확히 이 이름만 사용, BEM)

| class | 역할 |
|---|---|
| `concurrency-presets` | 데모 블록 루트 class(`#concurrency-presets-root`에 부여). |
| `concurrency-presets__panel` | 프리셋 3개를 감싸는 비교 영역(반응형 레이아웃 훅, 8절). |
| `concurrency-presets__preset` | 개별 프리셋 패널(1/2/4 각각). `timeline-preset-*`를 포함. |
| `concurrency-presets__item--waiting` | 항목 상태 = 대기. |
| `concurrency-presets__item--running` | 항목 상태 = 실행. |
| `concurrency-presets__item--complete` | 항목 상태 = 완료. |

- 개별 항목 요소는 base class(예: `concurrency-presets__item`)에 위 상태 modifier
  중 하나를 조합해 부여한다. developer는 상태 전이 시 modifier만 교체한다.
- developer는 위 id/class 이름을 **변경·재정의하지 않는다**. 추가 wrapper 요소는
  가능하나 위 계약 이름은 고정이다.

## 7. Design token · CSS 변수 계약 (frozen — designer가 값 정의)

designer는 아래 CSS 변수 **이름을 그대로** 사용해 값을 정의하고, developer는 상태
class가 이 토큰을 참조하도록 스타일을 연결한다(값 자체는 designer 소관).

| CSS 변수 | 용도 |
|---|---|
| `--color-status-waiting` | `대기` 항목 색상. `concurrency-presets__item--waiting`가 참조. |
| `--color-status-running` | `실행` 항목 색상. `concurrency-presets__item--running`가 참조. |
| `--color-status-complete` | `완료` 항목 색상. `concurrency-presets__item--complete`가 참조. |
| `--space-panel-gap` | 프리셋 패널 사이 간격. `concurrency-presets__panel` 레이아웃이 참조. |

- 토큰 이름은 고정이다. 구체 색상/간격 값은 designer가
  `docs/design/concurrency-presets-contract.md`에 기록한다.

## 8. 접근성 · 반응형 계약 (frozen)

### 8.1 접근성
- 실행 컨트롤 `#preset-run`은 명시적 `aria-label="프리셋 실행"`을 가진다.
- 항목 상태 변화(대기→실행→완료)는 `aria-live="polite"` region으로 안내한다
  (스크린리더가 상태 진행을 순차 낭독). 이 region은 상태 변화만 전달하고 시각
  타임라인과 중복 낭독되지 않도록 텍스트로 요약한다.

### 8.2 반응형
- **≥ 320px**: 프리셋 패널이 **세로 스택**으로 content overflow 없이 렌더된다.
- **≥ 720px**: 3개 프리셋 패널이 **가로로 정렬**된다.
- 레이아웃 전환은 `concurrency-presets__panel`에서 media query로 처리하고,
  간격은 `--space-panel-gap`을 사용한다.

## 9. 실행 흐름 (developer 참고)

1. 페이지 로드/초기화 시 결정론적 fixture로 세 프리셋 각각에 동일한 항목 목록을
   `waiting`으로 생성한다. 패널 상태 = `idle`.
2. `#preset-run` 클릭 시 각 프리셋마다 `pLimit(n)`(n=1·2·4)을 만들고, 항목마다
   `limit(() => trackedWork(item))`를 호출한다. `trackedWork`는 진입 시 `running`으로
   전이·렌더, 고정 지연(fixture) 후 resolve 시 `complete`로 전이·렌더한다.
   패널 상태 = `running`.
3. 렌더는 이벤트 기반(상태 변화 시에만 호출, 폴링 금지). 데모 규모(프리셋당 항목
   수십 개 이하)에서 배칭 없이 직접 호출로 충분하다(단순성 우선).
4. 세 프리셋의 모든 항목이 `complete`가 되면 패널 상태 = `complete`.
5. `#preset-reset` 클릭 시 목록을 다시 `waiting`으로 되돌리고 패널 상태 = `idle`.
   p-limit은 진행 중 task 취소를 제공하지 않으므로, 초기화는 다음 실행 기준을
   재설정하는 의미이며 이미 실행 중인 프라미스를 강제 중단하지 않는다.

## 10. Edge case / 실패 케이스

| 케이스 | 기대 동작 |
|---|---|
| 실행 전(초기) 상태 | 패널 = `idle`, 모든 항목 = `waiting`, aria-live region은 비거나 준비 안내. |
| 실행 중 재클릭(`#preset-run` 연타) | 진행 중이면 무시(중복 실행 방지) 또는 현재 재생 유지 — 새 병렬 실행을 중첩하지 않는다. |
| fixture 항목 0개(빈 목록) | 실행 즉시 패널 = `complete`, 오류 없이 정상 처리. |
| 동시성 1 프리셋 | 항상 한 번에 항목 1개만 `running` — 가장 긴 직렬 타임라인으로 대비 확인. |
| 동시성 4가 항목 수보다 큰 경우 | 동시 실행이 항목 수로 제한됨(초과 슬롯은 놀지 않고 즉시 소진). |
| `<script type="module">` 미지원 환경 | 지원 범위 밖. `readme.md`에 "최신 브라우저 필요" 명시. |

## 11. 검증 기준 (acceptance criteria, Given/When/Then)

- **Given** `/demo/concurrency-presets`(=`demo/concurrency-presets/index.html`)를 열면
  **When** 페이지가 로드되면 **Then** `#concurrency-presets-root`(class
  `concurrency-presets`) 아래 `timeline-preset-1/2/4` 세 패널이 표시되고 모든 항목이
  `concurrency-presets__item--waiting`이며 패널 상태 = `idle`이다.
- **Given** idle 상태에서 **When** `#preset-run`(`aria-label="프리셋 실행"`)을 클릭하면
  **Then** 항목이 `--waiting → --running → --complete`로 전이하고 각 프리셋에서 동시
  `--running` 항목 수가 해당 동시성(1·2·4)을 넘지 않으며 변화가 `aria-live="polite"`로
  안내된다.
- **Given** 실행이 끝나면 **When** 세 프리셋의 모든 항목이 `--complete`가 되면
  **Then** 패널 상태 = `complete`가 된다.
- **Given** `#preset-reset`을 클릭하면 **When** 초기화되면 **Then** 모든 항목이
  `--waiting`으로, 패널 상태가 `idle`로 되돌아간다.
- **Given** ≥320px 화면 **When** 렌더되면 **Then** 프리셋 패널이 세로 스택으로 overflow
  없이 표시되고, **≥720px**에서는 3개 패널이 가로로 정렬된다.
- 상태 전이 리듀서가 DOM 없이 단위 테스트로 `waiting → running → complete`를 검증한다
  (테스트 대상: `test/demo-concurrency-presets.test.js`).
- 루트 `package.json`(`dependencies`/`devDependencies`/`exports`)과 `index.js` 공개
  API, 기존 테스트·README는 변경되지 않는다. 신규 데모 파일만 추가된다.

## 12. designer / developer 를 위한 열린 확인 사항 (planner가 대신 결정하지 않음)

- 루트 `package.json`의 `scripts.test`가 저장소 전체를 lint/test 대상으로 삼는지,
  `demo/` 하위 신규 파일이 여기 포함되는지는 developer/tester가 실제 실행으로 확인한다
  (planner는 파일을 실행하지 않는다). 포함되어 lint 충돌이 나면 예외 처리 여부는
  developer 판단.
- fixture의 구체 항목 수·지연 배열 값은 developer 재량이나, **결정론적**(고정 값)이어야
  하며 세 프리셋에 동일 입력을 주어야 한다(5.2 계약).
- 색상/간격의 구체 값과 `docs/design/concurrency-presets-contract.md` 시각 매핑 세부는
  designer 소관이며, 7절 토큰 이름을 그대로 사용한다.
