# 동시성 프리셋 비교 UI 실행 계약 동결 (F68F701A7A-72)

> planner 산출물 — designer(F68F701A7A-70)와 developer(F68F701A7A-71)가 그대로 구현하고 tester(F68F701A7A-74)가 검증할 실행 계획 및 handoff 계약.
> 계약 인터페이스: `planning-contract@v1`, `ui-contract@v1`.
> **frozen blueprint가 유일한 권위**이며 이 문서는 그 파일·소유자·상태·후조건을 **재정의하지 않고 그대로 설명**한다. 새 파일·새 역할·계약 밖 요구사항을 추가하지 않는다.

## 1. 목표 / 배경

`p-limit` 라이브러리의 동시성(concurrency) 효과를 눈으로 비교하는 데모 UI를 `demo/` 하위에 **additive**로 추가한다.

- 세 가지 프리셋 — **느림(concurrency=1) / 균형(concurrency=2) / 빠름(concurrency=4)** — 중 하나를 선택하고 실행하면, 동일한 작업 배치를 선택한 한도로 처리한다.
- 실행 중 `p-limit` 인스턴스의 `activeCount`(실행 중)와 `pendingCount`(대기 중)를 실시간 표시하여 한도 차이가 처리 흐름에 미치는 영향을 관찰한다.
- 라이브러리 코어(`index.js`/`index.d.ts`)와 루트 패키지 파일은 **일절 변경하지 않는다**. 모든 변경은 `demo/`와 `docs/design/` 하위에 국한된다.

## 2. 사용자 시나리오

- 시나리오 A (프리셋 비교): 사용자가 "느림/균형/빠름" 중 하나를 클릭해 선택하고 실행 버튼을 누른다. 실행 중 active/pending 카운터와 결과 표가 갱신되어 한도가 낮을수록 pending이 오래 쌓이는 것을 확인한다.
- 시나리오 B (반복 비교): 실행 완료 후 다른 프리셋을 선택해 다시 실행하고, 두 결과를 비교한다. 재실행 전 상태는 초기값으로 되돌아가 있어야 한다.
- 시나리오 C (접근성 사용): 키보드만 쓰는 사용자가 Tab으로 프리셋 control을 순회하고 Enter로 선택·실행한다. 스크린리더는 카운터·상태 변화를 aria-live로 통지받는다.

## 3. 프리셋 정의 (frozen)

| 프리셋 | control DOM ID | concurrency 값 | 화면 라벨(예시) |
| --- | --- | --- | --- |
| 느림 | `#preset-slow` | 1 | "느림 (동시 1)" |
| 균형 | `#preset-balanced` | 2 | "균형 (동시 2)" |
| 빠름 | `#preset-fast` | 4 | "빠름 (동시 4)" |

- 프리셋 값 **1 / 2 / 4는 고정**이며 designer/developer는 이 값을 변경하지 않는다(`planning-contract@v1` invariant).
- 각 프리셋 control은 선택 시 `.preset-lab__preset--active` class와 `aria-pressed="true"`를 가진다. 동시에 하나만 active다.
- 화면 라벨 텍스트의 정확한 문구는 designer 재량이나, **색상만이 아니라 프리셋 값을 나타내는 텍스트를 반드시 화면에 노출**한다(색상 외 텍스트 동반 invariant).

## 4. p-limit 실행 연결 방식 (frozen)

- 실행 control(`#preset-run`)을 누르면, 선택된 프리셋의 concurrency 값으로 `pLimit(concurrency)` 인스턴스를 생성한다.
- 고정 크기의 작업 배치(예: 인위적 지연을 가진 async 태스크 N개)를 `limit(task)`로 스케줄한다. 배치 크기·지연 구현 세부는 developer 재량이나, 프리셋 간 **동일 배치**로 비교 가능해야 한다.
- 실행 중 주기적으로 `limit.activeCount` → `#active-count`, `limit.pendingCount` → `#pending-count`에 반영한다.
- 각 태스크 완료 시 `#result-table`(`.preset-lab__result`)에 행을 추가한다(완료 순서·소요 등).
- **라이브러리 코어 API를 변경하지 않고** 공개 표면(`pLimit`, `limit(...)`, `activeCount`, `pendingCount`)만 소비한다. `demo/`는 이 라이브러리를 import해 사용하는 additive 소비자다.

## 5. UI 계약 — DOM / 상태 / token (frozen, `ui-contract@v1`)

> 아래 selector·상태명·token은 **frozen blueprint가 권위**다. designer와 developer는 **변경·재정의하지 않고 그대로** 구현한다.

### 5.1 DOM ID (exact)

| ID | 역할 |
| --- | --- |
| `#preset-lab` | 컴포넌트 루트 컨테이너 |
| `#preset-slow` | 느림 프리셋 선택 control |
| `#preset-balanced` | 균형 프리셋 선택 control |
| `#preset-fast` | 빠름 프리셋 선택 control |
| `#preset-run` | 실행(run) control |
| `#active-count` | `activeCount` 표시 영역 |
| `#pending-count` | `pendingCount` 표시 영역 |
| `#result-table` | 태스크 결과 표 |
| `#status-message` | 상태 메시지 표시 영역 |

### 5.2 CSS class (exact, BEM)

| class | 역할 |
| --- | --- |
| `.preset-lab` | 루트 블록 |
| `.preset-lab__controls` | 프리셋 control 그룹 |
| `.preset-lab__preset` | 개별 프리셋 control |
| `.preset-lab__preset--active` | 선택된 프리셋 modifier |
| `.preset-lab__run` | 실행 control |
| `.preset-lab__metrics` | active/pending 카운터 영역 |
| `.preset-lab__result` | 결과 표 영역 |

### 5.3 상태 모델 (exact)

상태는 정확히 4개: **`idle` / `running` / `complete` / `error`**.

| 상태 | 진입 조건 | UI 표현 (요약) |
| --- | --- | --- |
| `idle` | 초기 로드, 또는 초기화/취소/실패 이후 복귀 | 카운터 초기값(0/0), `#preset-run` 사용 가능, `#status-message`에 대기 텍스트 |
| `running` | `#preset-run` 실행 시작 후 완료 전 | active/pending 실시간 갱신, `#status-message`에 실행 중 텍스트 |
| `complete` | 배치 전체 완료 | 최종 카운터(0/0), 결과 표 채워짐, `#status-message`에 완료 텍스트 |
| `error` | 실행 중 오류 발생 | `#status-message`에 오류 텍스트, `#preset-run` 재사용 가능 |

- **후조건 (frozen invariant)**: 초기화·취소·실패 뒤에는 상태와 진행 표시(active/pending)를 **초기값으로 되돌리고** 주 실행 control(`#preset-run`)을 **다시 사용할 수 있어야** 한다.
- **상태 표시는 색상만으로 구분하지 않는다**. 모든 상태는 상태명을 나타내는 **화면 텍스트와 접근성 이름(accessible name)**으로 노출한다.

### 5.4 Design token (exact)

| token | 용도 |
| --- | --- |
| `--color-preset-active` | 선택된 프리셋 강조색 |
| `--color-preset-idle` | 미선택 프리셋 색 |
| `--color-metric-value` | 카운터 수치 색 |
| `--space-preset-gap` | 프리셋 control 간 간격 |
| `--font-metric-size` | 카운터 수치 글꼴 크기 |

- 이 CSS 변수명은 고정이며 designer/developer는 이름을 변경하거나 재정의하지 않는다. 값(구체 색상/치수)은 계약 범위 내에서 designer가 정의한다.

### 5.5 접근성 (exact)

- 각 프리셋 control은 `aria-pressed`로 선택 상태를 노출하고, **명시적 텍스트 라벨**을 가진다.
- 실행 control(`#preset-run`)은 **명시적 `aria-label`**을 가진다.
- `#active-count`, `#pending-count`, `#status-message`는 **`aria-live="polite"`** 영역으로 카운터·상태 변화를 스크린리더에 통지한다.
- 키보드 **Tab/Enter**로 프리셋 선택과 실행이 가능하다.
- 모든 상태는 색상만으로 구분하지 않고 상태명을 **화면 텍스트와 접근성 이름**으로 노출한다.

### 5.6 반응형 (exact)

- **320px 이상**에서 content overflow가 발생하지 않는다.
- **480px 미만**에서 프리셋 controls(`.preset-lab__controls`)가 **세로로 stack**된다.

## 6. 파일 소유권 (frozen — 경계 겹침 금지)

> `ui-contract@v1`의 `file_owner`를 그대로 옮긴다. 각 페르소나는 **자기 소유 파일만** 생성/수정한다. 소유 경계는 재배정하지 않는다.

| 파일 | 소유자 | 비고 |
| --- | --- | --- |
| `demo/index.html` | **developer** (F68F701A7A-71) | 데모 마크업 — §5 DOM ID/class 적용 |
| `demo/preset-lab.css` | **developer** | 스타일 — §5.4 token·§5.6 반응형 적용 |
| `demo/preset-lab.js` | **developer** | 실행 로직 — §4 p-limit 연결·§5.3 상태 전이 |
| `docs/design/preset-lab-contract.md` | **designer** (F68F701A7A-70) | UI 계약 설계 문서 |
| `docs/design/preset-lab-mockup.html` | **designer** | 정적 mockup |

- designer(`docs/design/**`)와 developer(`demo/**`)의 파일 소유 경계는 **겹치지 않는다**. designer는 `demo/`를, developer는 `docs/design/`을 수정하지 않는다.
- planner(본 문서, `docs/plans/implementation-plan.md`)는 위 소유 파일을 직접 생성하지 않으며, 계약을 렌더링만 한다.

## 7. Additive 무결성 조건 (MUST, `planning-contract@v1`)

- 기존 라이브러리 API(`index.js`, `index.d.ts`)의 시그니처·동작을 **변경하지 않는다**(공개 표면만 소비).
- 루트 `package.json` 등 루트 패키지 파일을 **변경하지 않는다**.
- 모든 신규/변경 파일은 `demo/`와 `docs/design/`(및 본 planner 문서) 하위에 **additive**로 한정된다.
- 검증: 기존 `test.js`·`index.test-d.ts` 등 라이브러리 회귀 테스트가 무수정으로 green 유지되어야 한다(라이브러리 무변경의 판정 기준).

## 8. Edge / 실패 케이스

- E1: 프리셋 미선택 상태에서 `#preset-run` 클릭 → 실행하지 않거나 기본 프리셋을 적용(developer 정의). 어느 쪽이든 `error` 상태로 빠지지 않고 사용자에게 화면 텍스트로 안내한다.
- E2: `running` 중 `#preset-run` 재클릭 → 중복 실행 방지(control 비활성 또는 무시). 완료/실패 후 다시 사용 가능(§5.3 후조건).
- E3: 실행 중 태스크가 reject → `error` 상태 진입, `#status-message`에 오류 텍스트 노출, 카운터 초기화 및 `#preset-run` 재사용 가능(§5.3 후조건).
- E4: 배치 완료 → `complete` 상태, active/pending은 0/0으로 수렴, 결과 표는 완료 행으로 채워짐.
- E5: 320px 뷰포트 → 가로 overflow 없음(§5.6). 480px 미만 → 프리셋 controls 세로 stack.
- E6: 스크린리더 사용 → 카운터/상태 변화가 aria-live로 통지되고, 프리셋 선택 상태가 aria-pressed로 노출됨(§5.5).
- E7: 색상 대비를 구분 못하는 사용자 → 상태·선택이 텍스트로도 구분됨(색상 단독 금지 invariant).

## 9. 테스트 계약 (tester handoff, F68F701A7A-74)

- 테스트 파일: **`test/demo-preset-lab.test.js`** (read-only 계약 경로 — planner/designer/developer는 수정하지 않는다).
- 검증 대상(계약 기준):
  1. §5.1 DOM ID 9개가 모두 존재.
  2. §5.2 CSS class 및 `.preset-lab__preset--active` 선택 modifier 동작.
  3. 프리셋 값 1/2/4가 각 control에 매핑되고 선택 시 `aria-pressed` 전이(§3, §5.5).
  4. 실행 시 `#active-count`/`#pending-count`가 `activeCount`/`pendingCount`를 반영(§4).
  5. 상태 전이 `idle → running → complete`/`error` 및 후조건(초기화 후 `#preset-run` 재사용·카운터 초기값)(§5.3).
  6. 접근성: aria-pressed / `#preset-run` aria-label / aria-live 3영역 / 키보드 Tab·Enter(§5.5).
  7. 반응형: 320px overflow 없음, 480px 미만 세로 stack(§5.6).
  8. 라이브러리 코어·루트 패키지 무변경(§7).
- 실행 범위: focused. 정적 검증·단위 테스트는 전체 실행하며, `demo/`가 라이브러리 공개 표면을 소비하므로 라이브러리 회귀 가드(`test.js` 등)도 함께 green인지 확인한다.

## 10. 완료 조건 (검증 가능한 종료 조건)

- [ ] designer: `docs/design/preset-lab-contract.md`, `docs/design/preset-lab-mockup.html`이 §5 UI 계약(DOM/class/상태/token/접근성/반응형)을 그대로 반영.
- [ ] developer: `demo/index.html`, `demo/preset-lab.css`, `demo/preset-lab.js`이 §3 프리셋·§4 p-limit 연결·§5 selector/상태/token·§5.6 반응형을 구현.
- [ ] 상태 표시는 색상 외 화면 텍스트를 항상 동반(§5.3, §5.5 invariant).
- [ ] 초기화·취소·실패 후 상태·진행 표시 초기값 복귀 및 `#preset-run` 재사용 가능(§5.3 후조건).
- [ ] `index.js`/`index.d.ts`/루트 패키지 파일 무변경, 변경은 `demo/`·`docs/design/` 하위 additive 한정(§7).
- [ ] `test/demo-preset-lab.test.js` 및 라이브러리 회귀 테스트 green.

## 11. 다른 페르소나를 위한 non-goals

- 프리셋 값(1/2/4) 변경 또는 프리셋 개수 증감.
- selector·상태명·design token 이름 변경/재정의(frozen).
- 라이브러리 코어(`index.js`/`index.d.ts`) 또는 루트 패키지 파일 수정.
- 파일 소유 경계 재배정(designer↔developer 파일 교차 수정).
- 계약 밖 새 파일·새 요구사항·새 역할 추가.
