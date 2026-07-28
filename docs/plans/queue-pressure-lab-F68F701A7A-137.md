# 큐 압력 실험실 UI 실행 청사진 (Frozen Blueprint)

- Jira: F68F701A7A-137 (planning) / F68F701A7A-140 (blueprint 동결)
- 대상 저장소: skfive/p-limit
- 실행 프로파일: `implementation-strict`
- 권위(Authority): 본 문서는 [ROLE_WORK_PACKET_V2]의 `ui-contract@v1`(frozen blueprint)을 렌더링한 것이며, **파일 소유권·상태 계약·selector·token의 유일한 권위는 frozen blueprint**입니다. 본 문서는 이를 재정의하거나 새 파일/역할/요구사항을 추가하지 않습니다.

> 이 청사진은 designer(F68F701A7A-138)와 developer(F68F701A7A-139)가 **병렬로** 따르는 단일 실행 설계입니다. 두 페르소나는 아래 selector·token·상태 계약을 변경하거나 재정의하지 않습니다.

---

## 1. 목표와 범위

### 1.1 목표
- p-limit의 동시성 제어(`concurrency`)와 `activeCount`/`pendingCount` introspection을 **vanilla + static** 데모 인터페이스로 시각화하는 "큐 압력 실험실(queue pressure lab)"을 확정한다.
- 운영자가 동시성 한도와 작업 개수를 입력하고 실행하면, 활성/대기 카운트와 진행 상태를 실시간 텍스트로 확인할 수 있다.

### 1.2 범위 (In Scope)
- `demo/queue-pressure-lab/` 정적 데모 인터페이스 (HTML/CSS/JS) **추가(additive)**.
- 데모 전용 검증 테스트 추가(read-only 계약: `demo/queue-pressure-lab/queue-pressure-lab.test.js`).
- designer 산출물(설계 문서 + mockup) 추가.

### 1.3 비범위 (Out of Scope — 절대 변경 금지)
- `index.js` / `index.d.ts`의 **공개 API 변경 금지** (default export `pLimit`, named export `limitFunction`, `activeCount`/`pendingCount`/`concurrency`/`clearQueue`/`map` 시그니처 보존).
- 기존 `test.js` / `index.test-d.ts` / `readme.md` 계약 변경 금지 — **demo와 검증만 추가**한다.
- 새 파일·새 역할·계약 밖 요구사항 추가 금지. 빌드 스텝은 없다(순수 ESM/정적 자산).

---

## 2. 파일 소유권 (File Ownership — frozen)

| 파일 경로 | 소유자 | 정책 | 비고 |
| --- | --- | --- | --- |
| `demo/queue-pressure-lab/index.html` | developer | additive | 데모 마크업 |
| `demo/queue-pressure-lab/styles.css` | developer | additive | 데모 스타일/토큰 |
| `demo/queue-pressure-lab/app.js` | developer | additive | 데모 동작(ESM) |
| `docs/design/queue-pressure-lab-F68F701A7A-137.md` | designer | additive | 설계 문서 |
| `docs/design/queue-pressure-lab-mockup.html` | designer | additive | 정적 mockup |
| `docs/plans/queue-pressure-lab-F68F701A7A-137.md` | planner | — | 본 실행 청사진 |
| `demo/queue-pressure-lab/queue-pressure-lab.test.js` | tester(F68F701A7A-142) | read-only(본 문서 기준) | 데모 검증 |

- 각 페르소나는 **자신의 소유 경로만** 수정한다. selector/token/상태 계약은 소유권과 무관하게 공통 계약이므로 **누구도 변경·재정의하지 않는다**.

---

## 3. UI 인터페이스 계약 (frozen — 그대로 구현)

### 3.1 DOM ID (필수, 정확히 이 값)
| ID | 요소 성격 | 용도 |
| --- | --- | --- |
| `qpl-root` | 컨테이너 | 실험실 루트 |
| `qpl-concurrency-input` | number input | 동시성 한도 입력 |
| `qpl-task-count-input` | number input | 작업 개수 입력 |
| `qpl-run` | button | 주 실행 control |
| `qpl-reset` | button | 초기화/취소 control |
| `qpl-active-count` | 텍스트 출력 | `activeCount` 표시 |
| `qpl-pending-count` | 텍스트 출력 | `pendingCount` 표시 |
| `qpl-results` | 컨테이너 | 결과 목록/요약 |
| `qpl-status` | live region | 상태 텍스트 안내 |

### 3.2 CSS class (필수, 정확히 이 값)
`qpl`, `qpl__panel`, `qpl__control`, `qpl__run`, `qpl__reset`, `qpl__metric`, `qpl__results`, `qpl__status`

- BEM 관례: 블록 `qpl`, 요소 `qpl__*`. class는 스타일 훅 전용이며 상태 토글은 상태 계약(3.3)에 따른다.

### 3.3 상태 모델 (states — 정확히 4개)
`idle` · `running` · `completed` · `error`

| 상태 | 진입 조건 | 화면/접근성 노출 | control 가용성 |
| --- | --- | --- | --- |
| `idle` | 초기 로드, reset 후, 실행 완료/실패 후 복귀 | `qpl-status`에 "대기(idle)" 상태명 텍스트 노출; 카운트 0 | `qpl-run` 사용 가능 |
| `running` | `qpl-run` 실행 중 | `qpl-status`에 "실행 중(running)" 노출; `qpl-active-count`/`qpl-pending-count` 실시간 갱신 | `qpl-run` 비활성, `qpl-reset`으로 취소 가능 |
| `completed` | 모든 작업 정상 종료 | `qpl-status`에 "완료(completed)" + 결과 요약 `qpl-results` | 이후 `idle`로 복귀하여 `qpl-run` 재사용 가능 |
| `error` | 실행 중 실패 발생 | `qpl-status`에 "오류(error)" + 실패 텍스트 | 이후 `idle`로 복귀하여 `qpl-run` 재사용 가능 |

- **후조건 불변식**: 초기화(`qpl-reset`)·취소·실패 뒤에는 상태와 진행 표시(active/pending 카운트, results)를 **초기값으로 되돌리고** 주 실행 control(`qpl-run`)을 **다시 사용 가능**하게 한다.
- 상태는 **색상만으로 구분하지 않는다**. 상태명을 화면 텍스트와 접근성 이름 양쪽에 노출한다.

### 3.4 디자인 토큰 (design tokens — CSS 변수, 정확히 이 값)
| 변수 | 값 | 용도 |
| --- | --- | --- |
| `--qpl-color-action-primary` | `#2563eb` | 주 실행 control 강조 |
| `--qpl-color-success` | `#15803d` | `completed` 상태 강조 |
| `--qpl-color-error` | `#b91c1c` | `error` 상태 강조 |
| `--qpl-space-control-gap` | `12px` | control 간 간격 |
| `--qpl-max-width` | `720px` | 패널 최대 너비 |

- 토큰은 위 값으로 **정의**하며, designer/developer는 이 selector와 token을 **변경하거나 재정의하지 않는다**.

---

## 4. 접근성 계약 (Accessibility — 필수)
1. `qpl-run`, `qpl-reset` control은 각각 **명시적 `aria-label`**을 가진다.
2. `qpl-concurrency-input`, `qpl-task-count-input`은 **연결된 `<label>` 요소**를 가진다(`for`/`id` 연결).
3. `qpl-status`는 `aria-live="polite"` region으로 상태를 **텍스트로** 안내하며, **모든 control을 키보드로 조작**할 수 있다(탭 순서·포커스 가시성 보장).
4. 모든 상태는 **색상만으로 구분하지 않고** 상태명을 화면 텍스트와 접근성 이름으로 노출한다.

---

## 5. 반응형 계약 (Responsive — 필수)
1. **320px 이상**에서 content overflow가 발생하지 않는다.
2. 패널은 `--qpl-max-width`(720px) 이내에서 **세로로 재배치**되어 **가로 스크롤이 없어야** 한다.

---

## 6. p-limit 공개 API 보존 계약
- 데모는 기존 공개 API만 **소비(consume)**한다:
  - 기본 `pLimit(concurrency)` → `limit(fn)` 호출, `limit.activeCount` / `limit.pendingCount` 조회, `limit.clearQueue()`(취소 시), 필요 시 `limit.concurrency` 조정.
- `index.js` / `index.d.ts`의 시그니처·동작을 **변경하지 않는다**. 데모는 라이브러리를 ESM import로 사용한다.
- 기존 테스트(`test.js`)·타입 테스트(`index.test-d.ts`)·`readme.md` 계약을 **보존**한다.

---

## 7. 사용자 시나리오 (Given / When / Then)

### 시나리오 A — 정상 실행 (idle → running → completed)
- **Given** 운영자가 `demo/queue-pressure-lab/`를 정적으로 연 초기 상태(`idle`, 카운트 0),
- **When** `qpl-concurrency-input=2`, `qpl-task-count-input=6`을 입력하고 `qpl-run`을 누르면,
- **Then** 상태가 `running`으로 바뀌고 `qpl-active-count`는 최대 2, `qpl-pending-count`는 남은 작업 수로 실시간 갱신되며, 모든 작업 종료 후 상태가 `completed`가 되고 `qpl-results`에 요약이 표시된 뒤 `idle`로 복귀해 `qpl-run`을 재사용할 수 있다.

### 시나리오 B — 취소/초기화 (running → idle)
- **Given** 실행이 `running` 상태이고 대기 작업이 남아 있을 때,
- **When** `qpl-reset`을 누르면,
- **Then** 대기 작업이 정리(`clearQueue`)되고 카운트·results가 초기값으로 되돌아가며 상태가 `idle`, `qpl-run`이 다시 사용 가능하다.

### 시나리오 C — 실패 (running → error → idle)
- **Given** 실행 중 한 작업이 reject될 때,
- **When** 실패가 감지되면,
- **Then** 상태가 `error`가 되고 `qpl-status`에 상태명 "오류(error)"와 실패 텍스트가 노출되며, 이후 `idle`로 복귀해 진행 표시가 초기화되고 `qpl-run`을 재사용할 수 있다.

### 시나리오 D — 키보드 전용 조작
- **Given** 마우스 없이 키보드만 사용하는 운영자,
- **When** Tab으로 input들과 `qpl-run`/`qpl-reset`을 순차 포커스하고 Enter/Space로 조작하면,
- **Then** 모든 control이 조작 가능하고 포커스가 시각적으로 드러나며, 상태 변화는 `qpl-status`의 `aria-live="polite"`로 음성/텍스트 안내된다.

---

## 8. Edge case · 실패 케이스
| 케이스 | 기대 동작 |
| --- | --- |
| 동시성 입력이 0/음수/빈 값 | 실행을 시작하지 않고 `qpl-status`에 입력 오류 텍스트 안내(상태는 `idle` 유지). p-limit `concurrency`에 유효하지 않은 값 전달 금지. |
| 작업 개수 0 | 즉시 `completed`(빈 결과) 후 `idle` 복귀, 또는 실행을 시작하지 않고 안내. 진행 표시는 초기값. |
| 매우 큰 작업 개수 | 레이아웃이 320px에서 overflow 없이 유지, `qpl-results`는 스크롤 없이 세로 재배치. |
| 실행 중 재클릭(`qpl-run`) | `running` 상태에서 `qpl-run`은 비활성이므로 중복 실행 불가. |
| reset을 idle에서 누름 | 부작용 없이 초기값 유지(idempotent). |
| 실행 중 실패 후 reset | `error`/복귀 후에도 카운트·results 초기화 및 `qpl-run` 재사용 보장(후조건 불변식). |

---

## 9. Handoff 계약 (planning-contract@v1)
- **designer(F68F701A7A-138)**: `docs/design/queue-pressure-lab-F68F701A7A-137.md`(설계 문서)와 `docs/design/queue-pressure-lab-mockup.html`(정적 mockup)을 작성한다. 위 selector/token/상태/접근성/반응형 계약을 그대로 반영하며 값을 변경하지 않는다.
- **developer(F68F701A7A-139)**: `demo/queue-pressure-lab/index.html`·`styles.css`·`app.js`를 additive로 구현한다. DOM ID·class·상태·토큰·접근성·반응형 계약을 그대로 구현하고, p-limit 공개 API를 소비만 하며 변경하지 않는다.
- **tester(F68F701A7A-142)**: `demo/queue-pressure-lab/queue-pressure-lab.test.js`로 상태 전이(idle/running/completed/error)와 후조건(초기화 복귀), 접근성 이름/live region, selector 존재를 검증한다(본 문서 기준 read-only).
- **불변식**: designer와 developer는 승인된 실행 설계를 따르고, `index.js`/`index.d.ts`의 기존 공개 API를 변경하지 않으며, selector와 token을 변경·재정의하지 않는다.

---

## 10. 완료 조건 (Definition of Done)
- [ ] 파일명·DOM ID/class·상태(idle/running/completed/error)·token/CSS 변수·접근성 이름/키보드 요구·320px 반응형·산출물 경로가 본 문서에 exact하게 명시됨.
- [ ] `index.js`/`index.d.ts` 공개 API와 기존 테스트·README 계약 보존 명시(데모·검증만 추가).
- [ ] 새 파일·새 역할·계약 밖 요구 없음(frozen blueprint를 재정의하지 않음).
