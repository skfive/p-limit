# 배치 진행 데모 UI 시각 명세 (F68F701A7A-52)

> 본 명세는 planner가 동결한 `ui-contract@v1` / `planning-contract@v1`(`docs/plans/batch-progress-implementation-plan.md`)을
> **재정의하지 않고 그대로 시각화**한다. domId·cssClass·design token 이름·상태 모델·복원/접근성/반응형 규칙은
> frozen blueprint가 유일한 권위이며, 본 문서는 여기에 색상(HEX)·타이포·간격·레이아웃 시안만 얹는다.
>
> - designer 소유: 본 명세(`docs/design/batch-progress-ui.md`) + mockup HTML.
> - developer 소유: `demo/batch-progress.{html,css,js}` + `test/batch-progress.test.js` (본 명세에서 생성하지 않음).

---

## 1. 시안 개요

### 변경 범위
`p-limit`의 배치 처리 흐름(대기·실행·완료·취소·실패)을 시각화하는 단일 페이지 데모의 UI 시안.
루트 컨테이너 `#batch-progress-root` 안에 **① control 영역 → ② 상태 텍스트 → ③ 진행률 바 + 수치 → ④ task 목록**을 세로로 쌓는다.

### 사용자 경험 목표
- 사용자는 **시작 버튼** 하나로 배치를 실행하고, 각 task의 상태 전이와 전체 진행률을 실시간으로 본다.
- **초기화 버튼**으로 언제든 초기 상태(대기·0%)로 되돌리고 즉시 재실행할 수 있다.
- 상태는 **색상 + 한글 텍스트**를 함께 노출해 색각 이상 사용자도 구분 가능하다.
- 320px 폭에서도 control·상태 텍스트가 overflow 없이 읽힌다.

---

## 2. 컬러 팔레트

> 아래 HEX는 designer가 지정하며, developer는 frozen된 **token 이름**(`--color-status-*`)에 이 값을 그대로 매핑한다.
> 상태별 색상은 색상만 다른 게 아니라 명도 대비까지 벌려 색각 이상 상황에서도 구분되도록 선정했다(모두 흰 배경 위 텍스트/아이콘 대비 4.5:1 이상 확보 목적).

| 역할 | design token (동결) | HEX | 용도 |
| --- | --- | --- | --- |
| 대기(pending) | `--color-status-pending` | `#64748B` | 중립 슬레이트 — 아직 시작 안 됨 |
| 실행(running) | `--color-status-running` | `#2563EB` | 파랑 — 진행 중 강조 |
| 완료(done) | `--color-status-done` | `#16A34A` | 초록 — 성공 종료 |
| 취소(cancelled) | `--color-status-cancelled` | `#D97706` | 앰버 — 사용자/시스템 중단 |
| 실패(failed) | `--color-status-failed` | `#DC2626` | 빨강 — 오류 종료 |

### 보조 색 (비동결 — 시안 표현용, token 아님)
| 역할 | HEX | 용도 |
| --- | --- | --- |
| 배경(background) | `#FFFFFF` | 페이지/카드 배경 |
| 카드 배경(surface) | `#F8FAFC` | task 항목·바 트랙 배경 |
| 본문 텍스트(text) | `#0F172A` | 기본 글자색 |
| 보조 텍스트(muted) | `#475569` | 캡션·수치 보조 |
| 경계선(border) | `#E2E8F0` | 카드·항목 구분선 |
| primary(accent) | `#2563EB` | 시작 버튼 배경 (실행색과 동일 계열) |

> 상태색은 텍스트/좌측 status bar/배지에 사용하되, **배경 fill만으로 상태를 전달하지 않는다.** 항상 한글 상태명 배지를 병기한다.

---

## 3. 타이포그래피

외부 폰트 의존 없이 **system font stack**을 사용한다(데모 경량화).

```
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Noto Sans KR", "Malgun Gothic", sans-serif;
```

| 스타일 | 요소 | size | weight | line-height |
| --- | --- | --- | --- | --- |
| heading | 데모 제목 | 20px | 700 | 1.3 |
| body | 상태 텍스트 `#batch-progress-status`, task 이름 | 15px | 500 | 1.5 |
| numeric | 진행률 수치 `#batch-progress-percent` | 15px | 700 | 1.4 |
| caption | task 상태 배지 라벨 | 13px | 600 | 1.4 |

- 진행률 수치는 자릿수 흔들림 방지를 위해 `font-variant-numeric: tabular-nums` 권장.
- 상태 텍스트는 굵기 500 이상으로 두어 색상 외 가독성을 보강한다.

---

## 4. 레이아웃

### 4.1 섹션 구조 (`#batch-progress-root` 내부, 세로 스택)

```
┌─ #batch-progress-root ────────────────────────────┐
│  배치 진행 데모                          (heading) │
│                                                     │
│  ┌ .batch-progress__controls ─────────────────┐    │
│  │ [ 시작 #batch-progress-start ] [ 초기화 #batch-progress-reset ] │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  .batch-progress__status  #batch-progress-status    │
│    → "대기" / "실행 중…" / "완료" / "취소됨" / "실패"│
│                                                     │
│  ┌ .batch-progress__bar  #batch-progress-bar ──┐    │
│  │ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  40% #batch-progress-percent
│  └───────────────────────────────────────────┘    │
│                                                     │
│  ┌ #batch-task-list ───────────────────────────┐   │
│  │ • 작업 1   [완료]   (batch-task--done)       │   │
│  │ • 작업 2   [실행]   (batch-task--running)    │   │
│  │ • 작업 3   [대기]   (batch-task--pending)    │   │
│  │ • 작업 4   [실패]   (batch-task--failed)     │   │
│  │ • 작업 5   [취소]   (batch-task--cancelled)  │   │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 4.2 Spacing
- 루트 카드 padding: `24px`.
- 섹션 간 세로 간격: `16px`.
- control 버튼 간 간격: **`--space-control-gap`(동결 token) = `12px`**. wrap 시에도 이 값이 행·열 gap으로 유지된다.
- task 항목 간 세로 간격: `8px`, 항목 내부 padding: `10px 12px`.

### 4.3 Breakpoint 별 동작
| 폭 | 동작 |
| --- | --- |
| ≥ 640px | 루트 카드 최대폭 `520px`, 중앙 정렬. controls 가로 한 줄. |
| 320px ~ 639px | 카드 폭 `100%`(좌우 여백 16px). controls는 `flex-wrap: wrap`으로 `--space-control-gap` 간격 유지하며 줄바꿈. 상태 텍스트·task 이름은 `word-break`로 overflow 방지. |
| 최소 320px | 모든 control·텍스트가 overflow 없이 노출(가로 스크롤 없음). |

- task 항목은 좌측 상태 컬러 바(4px) + 이름 + 우측 상태 배지의 3영역. 좁은 폭에서 배지는 이름 아래로 wrap 가능.

---

## 5. 컴포넌트 명세

### 5.1 시작 버튼 — `#batch-progress-start` / `.batch-progress__controls` 내부
- **역할**: 배치 실행 트리거.
- **상태**:
  - 기본(활성): primary 배경 `#2563EB`, 흰 텍스트, 라벨 "시작".
  - 실행 중(`disabled`): 배경 `#94A3B8`, 커서 `not-allowed`.
- **접근성**: 명시적 한글 `aria-label="배치 시작"`.
- **인터랙션**: `:hover` 시 배경 `#1D4ED8`, `:focus-visible` 시 2px outline(`#2563EB`).
- **복원 후**: `disabled` 속성 제거 → 즉시 재클릭 가능(§6 참조).

### 5.2 초기화 버튼 — `#batch-progress-reset`
- **역할**: 초기 상태 복원 트리거.
- **상태**: 보조(secondary) 스타일 — 배경 투명/경계선 `#E2E8F0`, 텍스트 `#0F172A`, 라벨 "초기화".
- **접근성**: 명시적 한글 `aria-label="배치 초기화"`.
- **인터랙션**: `:hover` 배경 `#F1F5F9`, `:focus-visible` outline.

### 5.3 상태 텍스트 — `#batch-progress-status` / `.batch-progress__status`
- **역할**: 배치 전체 현재 상태를 한글 텍스트로 표시.
- **표시 문구(예시)**: 대기 → `대기`, 실행 → `실행 중…`, 완료 → `완료`, 취소 → `취소됨`, 실패 → `실패`.
- **접근성**: `aria-live="polite"` — 상태 변경을 스크린리더에 알림.
- **시각**: 현재 상태색을 텍스트 색 또는 좌측 점 배지에 반영하되, 문구 자체로도 상태 식별 가능.

### 5.4 진행률 바 — `#batch-progress-bar` / `.batch-progress__bar` + 수치 `#batch-progress-percent`
- **역할**: 전체 진행률(0~100%)을 fill 폭 + 수치로 표시.
- **트랙**: 배경 `#F1F5F9`, 높이 `10px`, `border-radius: 999px`.
- **fill**: 실행 색 `#2563EB`(`--color-status-running`), 완료 100% 도달 시 완료 색 `#16A34A`(`--color-status-done`)로 전환 권장.
- **접근성(동결)**: `role="progressbar"` + `aria-valuenow`(현재%) / `aria-valuemin="0"` / `aria-valuemax="100"`.
- **수치**: `#batch-progress-percent`에 `40%`처럼 텍스트로 병기(색상만으로 진행 전달 금지).

### 5.5 task 목록 — `#batch-task-list` + 항목 상태 class
- **역할**: 개별 task의 상태를 목록으로 표시.
- **항목 구조**: 좌측 4px 상태 컬러 바 + task 이름 + 우측 한글 상태 배지.
- **상태 class ↔ 색 ↔ 한글 배지 매핑(동결 이름)**:

| task class (동결) | design token (동결) | HEX | 배지 한글 텍스트 |
| --- | --- | --- | --- |
| `batch-task--pending` | `--color-status-pending` | `#64748B` | `대기` |
| `batch-task--running` | `--color-status-running` | `#2563EB` | `실행` |
| `batch-task--done` | `--color-status-done` | `#16A34A` | `완료` |
| `batch-task--cancelled` | `--color-status-cancelled` | `#D97706` | `취소` |
| `batch-task--failed` | `--color-status-failed` | `#DC2626` | `실패` |

- **접근성**: 상태는 배지의 화면 텍스트로 노출되어 색상만으로 구분하지 않는다. 각 항목의 접근성 이름에 "작업 N, {상태}"가 포함되도록 상태명을 텍스트로 둔다.

---

## 6. 초기화 · 취소 · 실패 후 복원 시각 표현 (동결 계약)

frozen invariant: **실행 중 초기화·취소·실패 후 상태 텍스트·진행률은 초기 상태로 복원되고, 시작 버튼이 즉시 재활성화된다.**
아래는 그 복원의 **시각 표현**을 명세한 것이다(규칙 자체는 planner 계약 §5가 권위).

| 트리거 | `#batch-progress-status` 텍스트 | `#batch-progress-bar` | task 항목 | `#batch-progress-start` |
| --- | --- | --- | --- | --- |
| 초기 로드 | `대기` | 0% (`aria-valuenow=0`), fill 폭 0 | 전부 `batch-task--pending` / 배지 "대기" | 활성(파랑) |
| `초기화` 클릭 | `대기`로 복원 | 0%로 복원, fill 폭 0 | 전부 "대기"로 복원 | **즉시 재활성화**(disabled 제거) |
| 취소 발생 | 잠깐 `취소됨` 반영 후 초기값(`대기`)으로 복원 | 0%로 복원 | "대기"로 복원 | **즉시 재활성화** |
| 실패 발생 | 잠깐 `실패` 반영 후 초기값(`대기`)으로 복원 | 0%로 복원 | "대기"로 복원 | **즉시 재활성화** |

- 복원 시각 신호: 진행률 바 fill 폭 `0`, 수치 `0%`, 모든 task 배지 "대기" 색(`#64748B`)으로 회귀, 상태 텍스트 "대기".
- 시작 버튼은 복원 즉시 primary 활성 스타일로 돌아가 재클릭 가능함을 시각적으로 드러낸다.
- mockup HTML §"상태 스냅샷"에 초기/실행중/취소/실패/복원 후 스냅샷을 나란히 그려 복원 전후 대비를 확인할 수 있게 했다.

---

## 7. dev 구현 가이드

developer(`demo/batch-progress.{html,css,js}`)가 그대로 따르는 지침. **id/class/token 이름은 아래 그대로 사용(재정의 금지).**

### 7.1 마크업 (developer 소유 — 참조용 구조)
- 루트 `#batch-progress-root.batch-progress`.
- controls: `<div class="batch-progress__controls">` 안에
  `<button id="batch-progress-start" aria-label="배치 시작">시작</button>`,
  `<button id="batch-progress-reset" aria-label="배치 초기화">초기화</button>`.
- 상태: `<p id="batch-progress-status" class="batch-progress__status" aria-live="polite">대기</p>`.
- 진행률: `<div id="batch-progress-bar" class="batch-progress__bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">` + `<span id="batch-progress-percent">0%</span>`.
- task 목록: `<ul id="batch-task-list">` 안에 `<li class="batch-task--pending">` … 상태 전이 시 class 교체.

### 7.2 CSS 변수 (developer가 `:root`에 정의)
```css
:root {
  --color-status-pending:   #64748B;
  --color-status-running:   #2563EB;
  --color-status-done:      #16A34A;
  --color-status-cancelled: #D97706;
  --color-status-failed:    #DC2626;
  --space-control-gap:      12px;
}
```
- task 상태 색은 각 `batch-task--*` class에서 대응 token 참조
  (예: `.batch-task--running { border-left-color: var(--color-status-running); }`).
- controls: `display: flex; flex-wrap: wrap; gap: var(--space-control-gap);`.

### 7.3 상태 전이 시 class·텍스트·aria 동기화 (developer JS)
- 상태 바뀔 때 task `<li>`의 `batch-task--*` class 교체 **+ 배지 한글 텍스트 교체**(색만 바꾸지 말 것).
- 진행률 변경 시 `#batch-progress-bar`의 `aria-valuenow`와 `#batch-progress-percent` 텍스트를 함께 갱신.
- 초기화/취소/실패: §6 표대로 상태 텍스트·진행률·task class를 초기값으로 되돌리고 `#batch-progress-start`의 `disabled` 제거.

### 7.4 반응형
- 카드 `max-width: 520px`, 640px 미만에서 `width: 100%`.
- 최소 320px에서 overflow 없음: 긴 텍스트 `overflow-wrap: anywhere` 권장, controls는 wrap.

---

## 8. mockup 참조

같이 작성한 시각 mockup HTML:

- **`docs/design/mockups/batch-progress-F68F701A7A-52.html`**

단일 self-contained HTML(외부 의존성 0건)로, 본 명세의 컬러 token·타이포·레이아웃·5개 상태·복원 스냅샷을 그대로 시각화한다.
이 mockup은 시안 시뮬레이션용이며 developer의 실제 산출물이 아니다. developer는 이를 참조 가이드로 삼되 픽셀 단위 일치 의무는 없다.
</content>
</invoke>
