# 대기열 압력 히스토리 패널 — 구현 설계 & UI 계약 동결

- Jira: F68F701A7A-84 (planner)
- 대상 저장소: `skfive/p-limit` · primary_module: `demo`
- 계약 상태: **frozen** — 아래 값은 planner가 동결한 UI 계약이며 designer/developer/reviewer/tester는 재정의 없이 그대로 따른다.
- frozen_interfaces: `planning-contract@v1`, `ui-contract@v1`

이 문서는 frozen blueprint의 파일·소유자·상태·후조건을 **설명**할 뿐 재정의하지 않는다.
새 파일·새 역할·계약 밖 요구사항을 추가하지 않는다. 파일 소유권과 상태 계약의 유일한 권위는 frozen blueprint이며, 본 문서는 이를 다운스트림 소비자(designer, developer)가 참조할 수 있게 렌더링한 것이다.

---

## 1. 목표 & 배경

p-limit 데모(`demo/`)에 **대기열 압력 히스토리 패널**을 additive로 추가한다.
limiter의 대기열 압력(active/pending) 변화를 시간순 히스토리 목록으로 기록·표시하고, 초기화 control을 제공한다.

- 기존 demo 동작(Inspector 등)과 p-limit 공개 API(`pLimit`, `limitFunction`, `activeCount`, `pendingCount`, `clearQueue`, `concurrency`, `map`)를 **보존**한다.
- 오직 **additive** 구현만 허용한다. 기존 selector·스타일·스크립트 동작을 변경하거나 재정의하지 않는다.

---

## 2. 파일 소유권 & additive 정책 (frozen)

`ui-contract@v1`가 유일한 권위. 모든 대상 파일은 **additive** policy.

| 파일 | 소유자(역할) | policy | preserve/additive 내용 |
| --- | --- | --- | --- |
| `docs/design/queue-pressure-history-panel.md` | designer | additive | 시각 시안·토큰 적용 근거 문서를 신규/추가 작성. 기존 design 문서 훼손 금지. |
| `demo/index.html` | developer | additive | 기존 `<main>` 구조·Inspector 섹션 보존. 히스토리 패널 마크업만 **추가**. |
| `demo/demo.css` | developer | additive | 히스토리 패널 스타일만 추가. 기존 데모 CSS(`inspector.css` 등) 규칙 변경 금지. |
| `demo/demo.js` | developer | additive | 히스토리 기록·렌더·초기화 로직만 추가. 기존 스크립트 동작·전역 부작용 변경 금지. |

정책 불변식(frozen):
- `artifact-policy:docs/design/queue-pressure-history-panel.md:additive`
- `artifact-policy:demo/index.html:additive`
- `artifact-policy:demo/demo.css:additive`
- `artifact-policy:demo/demo.js:additive`

> 참고(base SHA 관찰 사실): 현재 `demo/index.html`은 `inspector.css` / `inspector.js`를 로드하는 Inspector 데모다. 본 패널은 이 구조를 보존한 채 별도 섹션·별도 `demo.css`/`demo.js`로 additive 추가된다. developer는 신규 파일 생성 또는 기존 파일에 추가 형태로 구현하되, 기존 Inspector 로드/동작을 깨지 않는다.

---

## 3. DOM 계약 (frozen — selector 변경 금지)

### 3.1 DOM ID

| ID | 용도 |
| --- | --- |
| `queue-pressure-panel` | 패널 루트 컨테이너 |
| `queue-pressure-history-list` | 히스토리 항목 목록 컨테이너 (aria-live 영역) |
| `queue-pressure-status` | 현재 상태 문구를 화면 텍스트로 표시하는 영역 |
| `queue-pressure-reset` | 히스토리 초기화 버튼 |

### 3.2 CSS class

| class | 적용 대상 |
| --- | --- |
| `queue-pressure` | 패널 루트 (BEM block) |
| `queue-pressure__list` | 히스토리 목록 |
| `queue-pressure__item` | 히스토리 개별 항목 |
| `queue-pressure__reset` | 초기화 버튼 |

designer/developer는 위 ID·class를 그대로 사용한다. 이름을 바꾸거나 새 selector로 대체하지 않는다.

---

## 4. 디자인 토큰 (frozen — 값 변경 금지)

CSS custom property로 정의하고 패널 범위에서 소비한다.

| token | 값 | 용도 |
| --- | --- | --- |
| `--qp-color-active` | `#2563eb` | active(실행 중) 압력 표시 색 |
| `--qp-color-pending` | `#f59e0b` | pending(대기 중) 압력 표시 색 |
| `--qp-space-gap` | `8px` | 항목 간·요소 간 간격 |
| `--qp-radius` | `6px` | 패널·항목 모서리 반경 |
| `--qp-font-size` | `14px` | 히스토리 텍스트 기본 폰트 크기 |

색상은 **구분 수단으로만 쓰지 않는다**(§6 접근성 참조). 상태명은 항상 화면 텍스트/접근성 이름으로 함께 노출한다.

---

## 5. 상태 모델 (frozen)

패널은 다음 4개 상태를 가진다. 상태명은 화면 텍스트와 접근성 이름으로 노출한다.

| 상태 | 의미 | 진입 조건 (Given/When/Then 요약) |
| --- | --- | --- |
| `empty` | 히스토리 없음(초기값) | 기록이 하나도 없거나 초기화 직후 |
| `recording` | 압력 변화 기록 중 | 작업이 진행되어 active/pending 값이 변동하며 항목이 쌓이는 중 |
| `updated` | 최신 항목 갱신됨 | 새 히스토리 항목이 목록에 추가되어 aria-live로 알려진 직후 |
| `reset` | 초기화 수행됨 | `queue-pressure-reset` 활성화로 히스토리를 비운 전이. 이후 `empty`로 안정화 |

상태 후조건 불변식(frozen):
> 초기화·취소·실패 뒤에는 상태와 진행 표시를 **초기값(empty)** 으로 되돌리고, 주 실행 control(`queue-pressure-reset` 및 기존 실행 control)을 다시 사용할 수 있어야 한다.

`queue-pressure-status`는 현재 상태 문구를 화면 텍스트로 항상 표시한다.

---

## 6. 접근성 계약 (frozen)

- `queue-pressure-history-list`는 `aria-live="polite"`로 새 항목을 스크린리더에 알린다.
- `queue-pressure-reset` 버튼은 `aria-label="히스토리 초기화"`를 가지며, 키보드 포커스 및 **Enter/Space**로 활성화된다.
- `queue-pressure-status`는 현재 상태 문구를 **화면 텍스트**로 표시한다.
- 모든 상태는 **색상만으로 구분하지 않으며**, 상태명을 화면 텍스트와 접근성 이름으로 노출한다.

---

## 7. 반응형 동작 (frozen)

- **320px 이상**에서 패널과 히스토리 목록에 content overflow가 발생하지 않는다.
- 좁은 폭에서 히스토리 항목은 **세로로 쌓여** 가로 스크롤 없이 표시된다.

---

## 8. 사용자 시나리오 (Given/When/Then)

### AC-1 · 최초 진입(empty)
- **Given** 데모 페이지를 처음 열었을 때
- **When** 아직 어떤 작업도 추가하지 않았다면
- **Then** `queue-pressure-panel`이 보이고 `queue-pressure-status`는 `empty` 상태 문구를 화면 텍스트로 표시하며 `queue-pressure-history-list`는 비어 있다.

### AC-2 · 압력 기록(recording → updated)
- **Given** limiter에 작업이 추가되어 active/pending 값이 변하는 상황에서
- **When** 대기열 압력이 변동하면
- **Then** `queue-pressure-history-list`에 `queue-pressure__item` 항목이 시간순으로 추가되고, `aria-live="polite"`로 스크린리더에 새 항목이 알려지며, 상태는 `recording`/`updated`로 노출된다. 각 항목은 active/pending 값을 색상(`--qp-color-active`/`--qp-color-pending`)과 **함께 텍스트**로 표시한다.

### AC-3 · 초기화(reset → empty)
- **Given** 히스토리에 항목이 하나 이상 있을 때
- **When** `queue-pressure-reset` 버튼을 클릭하거나 키보드 포커스 후 Enter/Space로 활성화하면
- **Then** 히스토리 목록이 비워지고 상태는 `reset`을 거쳐 `empty` 초기값으로 되돌아가며, 모든 control은 다시 사용 가능한 상태가 된다.

### AC-4 · 접근성
- **Given** 스크린리더/키보드 사용자
- **When** 패널을 탐색하면
- **Then** 초기화 버튼은 `aria-label="히스토리 초기화"`로 읽히고 Tab 포커스·Enter/Space로 동작하며, 상태와 항목 값은 색상 외에 텍스트로도 인지된다.

### AC-5 · 반응형
- **Given** 뷰포트 폭이 320px일 때
- **When** 히스토리 항목이 여러 개 있으면
- **Then** 가로 스크롤·overflow 없이 항목이 세로로 쌓여 표시된다.

---

## 9. Edge / 실패 케이스

| 케이스 | 기대 동작 |
| --- | --- |
| 항목이 0개인 상태에서 초기화 클릭 | `empty` 유지, 오류 없음. 상태 문구·control 사용 가능 유지 |
| 작업 취소(clearQueue)로 pending 급감 | 압력 변화가 히스토리에 기록되고, 취소 후 상태·진행 표시는 초기값 규칙(§5 불변식)을 따른다 |
| 실패/오류 발생 후 | 상태와 진행 표시를 초기값(empty)으로 되돌리고 주 실행 control을 다시 사용 가능하게 한다 |
| 히스토리가 매우 길어질 때 | 세로 스택 + 목록 컨테이너 내부에서 처리하여 320px에서 패널 밖 overflow가 발생하지 않는다 |
| 색각 이상 사용자 | 색상만으로 상태를 구분하지 않으므로 텍스트로 판별 가능 |

### p-limit 공개 API 보존 (실패 방지 계약)
- `pLimit`, `limitFunction`, `activeCount`, `pendingCount`, `clearQueue`, `concurrency`, `map`의 시그니처·동작을 변경하지 않는다.
- 히스토리 패널은 위 API를 **읽기(관찰)** 용도로만 소비한다. 데모 스크립트가 라이브러리 코어 동작을 재정의하지 않는다.

---

## 10. 역할별 검증 명령

focused test scope(`primary_module: demo`) 기준. 다른 module 회귀는 CI가 별도 검증한다.

| 역할 | 검증 명령 / 방법 |
| --- | --- |
| designer | `docs/design/queue-pressure-history-panel.md`에 §3~§7의 selector·token·상태·접근성·반응형이 시안에 반영됐는지 대조. 시각 검토는 브라우저에서 `demo/index.html`을 열어 패널·상태·색상+텍스트 표기를 눈으로 확인. |
| developer | `node --test tests/demo-*.test.js` (현 module만). 브라우저에서 `demo/index.html` 실행 후 AC-1~AC-5 수동 확인. 기존 Inspector 데모가 깨지지 않는지 함께 확인. |
| reviewer | additive 정책 준수(기존 selector/스타일/스크립트 미변경) diff 검토. `node --test tests/demo-*.test.js` 결과 확인. DOM ID·class·token 값이 §3·§4와 정확히 일치하는지 대조. |
| tester | `node --test tests/demo-*.test.js` (또는 `test/demo-history-panel.test.js`). AC-1~AC-5와 §9 edge 케이스를 E2E/수동으로 검증. `BRIX_TEST_SCOPE=focused` 환경에서 demo module 한정 검증. |

> 참고: 전체 저장소 명령(`npm test` = `xo && ava && tsd`)은 라이브러리 코어 회귀용이며, 본 작업의 focused scope에서는 위 demo 한정 명령을 우선한다. 라이브러리 코어 파일(`index.js`/`index.d.ts`)은 본 작업 범위 밖이다.

---

## 11. Handoff 계약 요약 (planning-contract@v1)

- designer는 `docs/design/queue-pressure-history-panel.md`를 이 계약(§3~§7)에 맞춰 작성한다. selector·token·상태·접근성·반응형을 재정의하지 않는다.
- developer는 `demo/index.html`·`demo/demo.css`·`demo/demo.js`를 additive로 구현하며, DOM ID/class(§3)·token 값(§4)·상태 모델(§5)·접근성(§6)·반응형(§7)을 그대로 따른다.
- 두 역할 모두 기존 demo 동작과 p-limit 공개 API를 보존하는 additive 구현만 수행한다.
- 파일 소유권 경계(§2)를 넘지 않는다.
