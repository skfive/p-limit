# 배치 진행 데모 — 구현 설계 및 UI 계약 (F68F701A7A-54)

> 본 문서는 **frozen blueprint**(`ui-contract@v1`, `planning-contract@v1`)를 실행 가능한 계획으로 렌더링한 것입니다.
> 파일 소유권·selector·상태 모델은 frozen blueprint가 유일한 권위이며, 본 문서는 이를 재정의하지 않고 그대로 설명합니다.
> designer·developer는 여기 명시된 계약을 그대로 구현하며, 새 파일·새 역할·계약 밖 요구사항을 추가하지 않습니다.

---

## 1. 목적 (Objective)

`p-limit`의 배치 처리(대기·실행·완료·취소·실패) 흐름을 시각적으로 보여주는 데모를 구현한다.
사용자는 "시작" 버튼으로 배치를 실행하고, 각 task의 상태 전이와 전체 진행률을 실시간으로 확인하며, "초기화"로 언제든 초기 상태로 되돌릴 수 있다.

---

## 2. 파일 소유권 (File Ownership)

frozen blueprint가 정의한 소유권을 그대로 따른다. **소유자 외 페르소나는 해당 파일을 생성·수정하지 않는다.**

| 파일 | 소유자 | 역할 |
| --- | --- | --- |
| `docs/design/batch-progress-ui.md` | **designer** | UI 명세 (레이아웃/시각 상태/색상·텍스트 매핑/반응형 시안) |
| `demo/batch-progress.html` | **developer** | 데모 DOM 구조 (계약된 id/class 마크업) |
| `demo/batch-progress.css` | **developer** | 스타일 (계약된 design token/CSS 변수 적용) |
| `demo/batch-progress.js` | **developer** | 런타임 로직 (상태 전이·진행률·초기화/취소/실패 복원) |
| `test/batch-progress.test.js` | **developer** | focused test (상태·접근성·복원 규칙 검증) |

- **designer 경계**: `docs/design/**` 명세만 소유한다. demo 런타임 코드·테스트를 작성하지 않는다.
- **developer 경계**: demo 런타임(`demo/batch-progress.*`)과 focused test만 소유한다. 디자인 명세를 재작성하지 않는다.
- **planner(본 문서)**: `docs/plans/batch-progress-implementation-plan.md`만 소유하며, 위 소유권과 계약을 재정의하지 않는다.

---

## 3. DOM Selector 계약 (동결 — 변경 금지)

developer는 아래 `id`/`class` 이름을 **그대로** 사용하며, designer는 명세에서 동일 이름을 참조한다.

### 3.1 DOM ID

| id | 대상 | 설명 |
| --- | --- | --- |
| `batch-progress-root` | 루트 컨테이너 | 데모 전체 wrapper |
| `batch-progress-start` | 시작 버튼 | 배치 실행 트리거 |
| `batch-progress-reset` | 초기화 버튼 | 초기 상태 복원 트리거 |
| `batch-progress-status` | 상태 텍스트 영역 | 현재 상태를 한글 텍스트로 표시 (aria-live) |
| `batch-progress-bar` | 진행률 바 | `role=progressbar` |
| `batch-progress-percent` | 진행률 수치 | 퍼센트 텍스트 |
| `batch-task-list` | task 목록 | 개별 task 상태 항목 컨테이너 |

### 3.2 CSS Class

| class | 용도 |
| --- | --- |
| `batch-progress` | 컴포넌트 블록 루트 |
| `batch-progress__controls` | control(버튼) 묶음 영역 |
| `batch-progress__status` | 상태 텍스트 영역 스타일 |
| `batch-progress__bar` | 진행률 바 스타일 |
| `batch-task--pending` | task = 대기 |
| `batch-task--running` | task = 실행 |
| `batch-task--done` | task = 완료 |
| `batch-task--cancelled` | task = 취소 |
| `batch-task--failed` | task = 실패 |

---

## 4. 상태 모델 (State Model)

배치 및 개별 task는 아래 5개 상태를 가진다. **상태 표시는 색상만으로 구분하지 않고, 반드시 한글 상태명 텍스트를 함께 노출한다.**

| 상태 | 한글 텍스트 | task class | design token(색상) |
| --- | --- | --- | --- |
| pending | `대기` | `batch-task--pending` | `--color-status-pending` |
| running | `실행` | `batch-task--running` | `--color-status-running` |
| done | `완료` | `batch-task--done` | `--color-status-done` |
| cancelled | `취소` | `batch-task--cancelled` | `--color-status-cancelled` |
| failed | `실패` | `batch-task--failed` | `--color-status-failed` |

### 4.1 상태 전이

```
대기 ──(시작)──▶ 실행 ──(성공)──▶ 완료
                  │
                  ├──(취소)──▶ 취소
                  └──(오류)──▶ 실패
```

- 초기 로드 시 모든 task는 `대기`, 진행률 0%, 시작 버튼 활성.
- `시작` 클릭 시 task가 순차/동시(p-limit 동시성) 로 `실행` → `완료`로 전이하며 진행률이 증가한다.
- 실행 도중 `취소` 또는 오류 발생 시 해당 흐름은 `취소`/`실패` 상태로 전이한다.

---

## 5. 초기화 · 취소 · 실패 후 복원 계약 (동결)

frozen invariant: **실행 중 초기화·취소·실패 후 상태 텍스트와 진행률은 초기 상태로 복원되고, 시작 버튼(주 실행 control)이 즉시 재활성화된다.**

| 트리거 | 상태 텍스트 | 진행률 | task 항목 | 시작 버튼 |
| --- | --- | --- | --- | --- |
| 초기 로드 | `대기` | 0% (`aria-valuenow=0`) | 전부 `대기` | 활성 |
| `초기화` 클릭 | `대기`로 복원 | 0%로 복원 | 전부 `대기`로 복원 | **즉시 재활성화** |
| 취소 발생 | 취소 반영 후 초기값 복원 | 0%로 복원 | `대기`로 복원 | **즉시 재활성화** |
| 실패 발생 | 실패 반영 후 초기값 복원 | 0%로 복원 | `대기`로 복원 | **즉시 재활성화** |

- 복원 시 `batch-progress-bar`의 `aria-valuenow`도 0으로 되돌린다.
- 복원 후 시작 버튼은 `disabled` 속성이 제거되어 곧바로 재실행 가능해야 한다.

---

## 6. Design Token / CSS 변수 계약 (동결)

developer는 아래 CSS 변수명을 그대로 정의·사용하고, designer는 명세에서 동일 이름으로 색상을 지정한다.

| token | 용도 |
| --- | --- |
| `--color-status-pending` | 대기 상태 색상 |
| `--color-status-running` | 실행 상태 색상 |
| `--color-status-done` | 완료 상태 색상 |
| `--color-status-cancelled` | 취소 상태 색상 |
| `--color-status-failed` | 실패 상태 색상 |
| `--space-control-gap` | control 간 간격 (wrap 시에도 적용) |

---

## 7. 접근성 계약 (동결)

| 요소 | 요구사항 |
| --- | --- |
| `batch-progress-start` | 명시적 한글 `aria-label` (예: "배치 시작") |
| `batch-progress-reset` | 명시적 한글 `aria-label` (예: "배치 초기화") |
| `batch-progress-bar` | `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` |
| `batch-progress-status` | `aria-live="polite"` — 상태 텍스트 변경을 스크린리더에 알림 |
| 모든 상태 | 색상만으로 구분 금지 — 상태명을 **화면 텍스트**와 **접근성 이름** 양쪽에 노출 |

---

## 8. 반응형 계약 (동결)

| 항목 | 요구사항 |
| --- | --- |
| 최소 뷰포트 | **320px 이상**에서 control·상태 텍스트에 content overflow 없음 |
| controls wrap | 좁은 폭에서 `--space-control-gap` 간격을 유지하며 wrap |

---

## 9. Handoff 순서

1. **planner (완료)** — 본 문서로 파일 소유권·selector·상태·token·접근성·반응형 UI 계약 동결.
2. **designer (F68F701A7A-52)** — `docs/design/batch-progress-ui.md`에 위 계약 이름을 그대로 참조하는 UI 명세 작성.
3. **developer (F68F701A7A-53)** — `demo/batch-progress.{html,css,js}` + `test/batch-progress.test.js`를 계약대로 구현.
4. **tester (F68F701A7A-56)** — focused test로 상태·접근성·복원 규칙 검증.

> 후속 페르소나는 `domId`, `cssClass`, `designToken` 이름을 변경·재정의하지 않는다.

---

## 10. Acceptance Criteria (검증 종료 조건)

- [ ] 파일명·DOM id/class·상태 모델(대기/실행/완료/취소/실패)·design token/CSS 변수·접근성 이름·키보드/aria 요구·breakpoint/overflow 동작이 본 계약에 exact하게 명시됨.
- [ ] 파일 소유권이 designer=`docs/design` 명세, developer=demo 런타임+focused test로 명시됨.
- [ ] 초기화·취소·실패 후 상태 텍스트·진행률 복원 + 시작 버튼 즉시 재활성화 규칙이 계약에 포함됨.
- [ ] 본 문서는 frozen blueprint의 파일·소유자·상태·후조건을 그대로 설명하며 새 파일·역할·요구를 추가하지 않음.
