# 프리셋 비교 UI 시각 명세 — Preset Lab (F68F701A7A-70)

> designer 산출물 — planner가 동결한 `ui-contract@v1` / `planning-contract@v1`을 **그대로 시각화**한다.
> 이 문서는 frozen selector·상태·token·접근성·반응형 계약을 **재정의하지 않고**, 값(색상/치수/문구)만 계약 범위 내에서 정의한다.
> 권위 출처: `docs/plans/implementation-plan.md` (planner frozen blueprint). 충돌 시 blueprint가 우선한다.
> 시각 참조: [`docs/design/preset-lab-mockup.html`](./preset-lab-mockup.html)
>
> tech-stack: `vanilla-static` — 외부 의존성 0건, system font, CSS 변수 자체 정의.

---

## 1. 시안 개요

### 변경 범위
`p-limit`의 동시성(concurrency) 효과를 눈으로 비교하는 데모 컴포넌트 **Preset Lab**의 시각 명세.
- 세 프리셋 — **느림(1) / 균형(2) / 빠름(4)** — 중 하나를 선택 → 실행 → `activeCount`/`pendingCount` 실시간 관찰 → 결과 표 확인.
- 라이브러리 코어 무변경. 시각 산출물은 `docs/design/**`에만 한정된다. 실제 구현(`demo/**`)은 developer(F68F701A7A-71) 소유.

### 사용자 경험 목표
- **UX-1 비교성**: 동일 배치를 서로 다른 한도로 돌렸을 때 pending이 쌓이는 차이를 한눈에 대비.
- **UX-2 상태 명료성**: idle/running/complete/error 4개 상태를 **색상이 아니라 화면 텍스트**로 항상 구분.
- **UX-3 접근성**: 키보드·스크린리더만으로도 프리셋 선택·실행·상태 인지 가능.
- **UX-4 반응형**: 320px 이상 overflow 없음, 480px 미만 세로 stack.

### frozen 계약 준수 요약 (재정의 금지)
- DOM ID 9개 / CSS class 7개 / 상태 4개 / design token 5개 — 이름은 **고정**, 아래에서 값만 정의.
- 상태 표시는 **색상 단독 금지**, 항상 상태명 텍스트 + 접근성 이름 동반.

---

## 2. 컬러 팔레트

> 모든 상태·선택은 색상 **외** 텍스트를 동반한다(§6 접근성). 색상은 보조 신호일 뿐이다.
> 명도 대비는 WCAG AA(본문 4.5:1, 큰 텍스트/UI 3:1) 이상을 목표로 한다.

### 2.1 기본 팔레트

| 역할 | HEX | 용도 |
| --- | --- | --- |
| primary (active) | `#2563eb` | 선택된 프리셋 강조 배경, 실행 버튼 |
| primary-text-on | `#ffffff` | primary 배경 위 텍스트 |
| secondary (idle) | `#e2e8f0` | 미선택 프리셋 배경 |
| secondary-text | `#334155` | 미선택 프리셋/보조 텍스트 |
| accent (metric) | `#0f172a` | 카운터 수치 강조 |
| background | `#f8fafc` | 페이지/카드 배경 |
| surface | `#ffffff` | 컴포넌트 카드 표면 |
| border | `#cbd5e1` | 카드·표 경계선 |
| text | `#0f172a` | 본문 기본 텍스트 |
| text-muted | `#64748b` | 캡션·라벨 보조 텍스트 |

### 2.2 상태 컬러 (보조 신호 — 항상 텍스트 동반)

| 상태 | 강조색 HEX | 배경 HEX | 화면 텍스트(예시) |
| --- | --- | --- | --- |
| `idle` | `#475569` | `#f1f5f9` | "대기 중 — 프리셋을 선택하고 실행하세요" |
| `running` | `#1d4ed8` | `#dbeafe` | "실행 중 — 태스크 처리 중입니다" |
| `complete` | `#15803d` | `#dcfce7` | "완료 — 모든 태스크가 처리되었습니다" |
| `error` | `#b91c1c` | `#fee2e2` | "오류 — 실행에 실패했습니다. 다시 시도하세요" |

- 상태 배지는 `● 상태명` 형태로 **점(아이콘) + 상태명 텍스트**를 함께 노출한다. 색맹 사용자도 텍스트로 구분(§8 E7).

### 2.3 → design token 매핑 (frozen 이름, designer 값)

| token (frozen) | 지정 값 | 근거 |
| --- | --- | --- |
| `--color-preset-active` | `#2563eb` | primary — 선택 프리셋 강조 |
| `--color-preset-idle` | `#e2e8f0` | secondary — 미선택 프리셋 배경 |
| `--color-metric-value` | `#0f172a` | accent — 카운터 수치 |
| `--space-preset-gap` | `0.75rem` | §4 참조 |
| `--font-metric-size` | `2.25rem` | §3 참조 |

---

## 3. 타이포그래피

> system font stack (외부 폰트 CDN 사용 안 함 — `vanilla-static`).
> `font-family` 전역: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans KR", sans-serif`

| 역할 | size | weight | line-height | 비고 |
| --- | --- | --- | --- | --- |
| heading (컴포넌트 제목) | `1.5rem` (24px) | 700 | 1.3 | "동시성 프리셋 비교" |
| subheading (섹션 라벨) | `1rem` (16px) | 600 | 1.4 | "프리셋", "메트릭", "결과" |
| body (본문/버튼) | `0.9375rem` (15px) | 500 | 1.5 | 프리셋 라벨·버튼 텍스트 |
| metric-value (카운터 수치) | **`var(--font-metric-size)` = 2.25rem (36px)** | 700 | 1.1 | `--color-metric-value` 적용 |
| metric-label (카운터 라벨) | `0.8125rem` (13px) | 600 | 1.3 | "실행 중(active)", "대기 중(pending)" |
| caption (표 헤더/보조) | `0.8125rem` (13px) | 500 | 1.4 | `text-muted` |
| status (상태 메시지) | `0.9375rem` (15px) | 600 | 1.4 | 상태 배지 텍스트 |

- 카운터 수치는 `font-variant-numeric: tabular-nums`로 자릿수 흔들림 방지.

---

## 4. 레이아웃

### 4.1 섹션 구조 (`#preset-lab` 루트 내부, 위→아래)

```
┌─ #preset-lab (.preset-lab) ──────────────────────────┐
│  [heading] 동시성 프리셋 비교                          │
│                                                       │
│  [subheading] 프리셋                                   │
│  .preset-lab__controls ─────────────────────────────  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│   │#preset-  │ │#preset-  │ │#preset-  │  (gap:       │
│   │ slow     │ │ balanced │ │ fast     │   --space-   │
│   │ 느림 1   │ │ 균형 2   │ │ 빠름 4   │   preset-gap)│
│   └──────────┘ └──────────┘ └──────────┘             │
│                                                       │
│   [ #preset-run · .preset-lab__run ]  실행            │
│                                                       │
│  #status-message  ● 상태명 + 안내 텍스트 (aria-live)   │
│                                                       │
│  [subheading] 메트릭                                   │
│  .preset-lab__metrics ──────────────────────────────  │
│   ┌ 실행 중(active) ┐   ┌ 대기 중(pending) ┐          │
│   │ #active-count   │   │ #pending-count   │ (aria-   │
│   │      2          │   │       6          │  live)   │
│   └─────────────────┘   └──────────────────┘          │
│                                                       │
│  [subheading] 결과                                     │
│  #result-table (.preset-lab__result) ───────────────  │
│   | # | 태스크 | 상태 | 소요(ms) |                     │
│   | 1 | task-1 | 완료 |   312    |  ...               │
└───────────────────────────────────────────────────────┘
```

### 4.2 Spacing

| 위치 | 값 |
| --- | --- |
| 카드 외부 padding | `1.5rem` (모바일 `1rem`) |
| 섹션 간 수직 간격 | `1.25rem` |
| 프리셋 control 간 간격 | **`var(--space-preset-gap)` = 0.75rem** |
| 메트릭 카드 간 간격 | `1rem` |
| 표 셀 padding | `0.5rem 0.75rem` |
| 카드 radius | `12px`, 버튼/배지 radius `8px` |

### 4.3 Breakpoint 별 동작 (frozen §5.6)

| 뷰포트 | `.preset-lab__controls` | `.preset-lab__metrics` | 비고 |
| --- | --- | --- | --- |
| **≥ 480px** | 가로 배치 (flex row, `flex:1` 균등) | 가로 2열 | 기본 |
| **< 480px** | **세로 stack** (flex column, 각 100% 너비) | 세로 stack | frozen 요구 |
| **≥ 320px 전 범위** | content overflow 없음 | overflow 없음 | frozen 요구 |

- 320px 대응: 카드/표에 `max-width:100%`, `box-sizing:border-box`, 표는 `overflow-x` 없이 셀 wrap 또는 축약. 긴 수치는 `tabular-nums`로 폭 안정화.
- 컨테이너 `max-width: 640px`, 좌우 auto 여백으로 넓은 화면 중앙 정렬.

---

## 5. 컴포넌트 명세

> DOM ID / class / 상태명 / token 이름은 **frozen(변경 금지)**. 아래는 각 요소의 역할·props·상태·인터랙션 정의.

### 5.1 프리셋 control (3개) — `.preset-lab__preset`

| 항목 | 값 |
| --- | --- |
| DOM ID | `#preset-slow` / `#preset-balanced` / `#preset-fast` |
| 요소 | `<button type="button">` (키보드 Tab/Enter 기본 지원) |
| 화면 라벨(예시) | "느림 (동시 1)" / "균형 (동시 2)" / "빠름 (동시 4)" |
| concurrency (frozen) | 1 / 2 / 4 — **변경 금지** |
| 미선택 상태 | class `preset-lab__preset`, `aria-pressed="false"`, 배경 `--color-preset-idle` |
| 선택 상태 | class 추가 `preset-lab__preset--active`, `aria-pressed="true"`, 배경 `--color-preset-active` + 흰 텍스트 |
| 상호배타 | 동시에 하나만 active |
| 부가 텍스트 | 라벨 안에 concurrency 값을 **텍스트로** 노출(색상 단독 금지) |
| :focus-visible | 2px outline (`#2563eb`, offset 2px) — 키보드 초점 가시화 |

**상태/인터랙션**: `idle`/`complete` 상태에서 선택 변경 가능. `running` 중에는 비활성(중복 실행 방지, §8 E2) 권장.

### 5.2 실행 control — `#preset-run` (`.preset-lab__run`)

| 항목 | 값 |
| --- | --- |
| 요소 | `<button type="button">` |
| 화면 텍스트 | "실행" (running 중 "실행 중…") |
| `aria-label` (frozen 요구) | 예: `"선택한 프리셋으로 동시성 비교 실행"` — 명시적 aria-label 필수 |
| 기본 상태 | 배경 `--color-preset-active`, 흰 텍스트 |
| disabled | `running` 중 `disabled` 또는 무시(§8 E2) — 시각적으로 흐리게 + "실행 중…" 텍스트 |
| 재사용 (frozen 후조건) | complete/error/취소 후 다시 enabled |

### 5.3 메트릭 카운터 — `.preset-lab__metrics`

| 항목 | `#active-count` | `#pending-count` |
| --- | --- | --- |
| 라벨 텍스트 | "실행 중 (active)" | "대기 중 (pending)" |
| 수치 스타일 | `--font-metric-size`, `--color-metric-value`, tabular-nums | 동일 |
| 초기값 | `0` | `0` |
| `aria-live` (frozen) | `polite` | `polite` |
| 갱신 | running 중 실시간, complete 시 0/0 수렴 | 동일 |

### 5.4 상태 메시지 — `#status-message`

| 항목 | 값 |
| --- | --- |
| 요소 | 상태 배지 (`● 상태명` + 안내 문구) |
| `aria-live` (frozen) | `polite` |
| 4개 상태 텍스트 | §2.2 표의 화면 텍스트 사용 |
| 색상 규칙 | 상태색은 **보조**, 상태명 텍스트가 주 신호 (frozen invariant) |

### 5.5 결과 표 — `#result-table` (`.preset-lab__result`)

| 항목 | 값 |
| --- | --- |
| 요소 | `<table>` (헤더 `<th scope="col">`) |
| 컬럼(예시) | `#` / `태스크` / `상태` / `소요(ms)` |
| 행 추가 | 각 태스크 완료 시 append (완료 순서) |
| 빈 상태 | idle에서 "아직 결과가 없습니다" caption |
| 320px | overflow 없이 셀 wrap / 축약 |

### 5.6 상태 모델 (frozen 4개) — 컴포넌트 종합 표현

| 상태 | 진입 | `#preset-run` | 카운터 | `#status-message` |
| --- | --- | --- | --- | --- |
| `idle` | 초기/초기화·취소·실패 복귀 | 사용 가능 | 0 / 0 | "대기 중…" |
| `running` | 실행 시작~완료 전 | 비활성/무시 | 실시간 | "실행 중…" |
| `complete` | 배치 전체 완료 | 사용 가능 | 0 / 0, 표 채워짐 | "완료" |
| `error` | 실행 중 오류 | 사용 가능 | 초기값 복귀 | "오류…" |

- **후조건(frozen)**: 초기화·취소·실패 뒤 상태·진행 표시(active/pending) 초기값 복귀 + `#preset-run` 재사용 가능.

---

## 6. 접근성 (frozen §5.5 — 그대로 반영)

- **프리셋 control**: `aria-pressed`로 선택 상태 노출 + 명시적 텍스트 라벨. active 하나만 `true`.
- **실행 control**: `#preset-run`에 명시적 `aria-label`.
- **aria-live=polite 3영역**: `#active-count`, `#pending-count`, `#status-message` — 카운터·상태 변화를 스크린리더에 통지.
- **키보드**: 프리셋·실행 모두 네이티브 `<button>` → Tab 순회 + Enter/Space 작동. 논리적 Tab 순서(프리셋 slow→balanced→fast→run).
- **색상 단독 금지**: 모든 상태·선택을 화면 텍스트 + 접근성 이름으로 노출. 상태 배지는 `●` + 상태명 텍스트.
- **focus-visible**: 모든 인터랙티브 요소에 2px outline로 초점 가시화.
- 대비: primary/상태색 모두 배경 대비 AA 이상 확인.

---

## 7. dev 구현 가이드 (F68F701A7A-71 handoff)

> developer는 `demo/index.html` / `demo/preset-lab.css` / `demo/preset-lab.js`를 소유. 아래 CSS 변수명·클래스명·구조는 **권장 가이드**이며, frozen selector/token 이름은 **그대로** 사용한다. mockup과 픽셀 단위 일치 의무는 없다.

### 7.1 CSS 변수 정의 (`:root` 또는 `.preset-lab`)
```css
.preset-lab {
  --color-preset-active: #2563eb;
  --color-preset-idle:   #e2e8f0;
  --color-metric-value:  #0f172a;
  --space-preset-gap:    0.75rem;
  --font-metric-size:    2.25rem;
}
```
- 위 5개 토큰 **이름은 frozen** — 변경/추가 재정의 금지. 값만 위와 같이 지정.

### 7.2 DOM 골격 (권장 — frozen ID/class 적용)
```html
<section id="preset-lab" class="preset-lab" aria-labelledby="preset-lab-title">
  <h2 id="preset-lab-title">동시성 프리셋 비교</h2>

  <div class="preset-lab__controls" role="group" aria-label="프리셋 선택">
    <button type="button" id="preset-slow"     class="preset-lab__preset" aria-pressed="false">느림 (동시 1)</button>
    <button type="button" id="preset-balanced" class="preset-lab__preset" aria-pressed="false">균형 (동시 2)</button>
    <button type="button" id="preset-fast"     class="preset-lab__preset" aria-pressed="false">빠름 (동시 4)</button>
  </div>

  <button type="button" id="preset-run" class="preset-lab__run"
          aria-label="선택한 프리셋으로 동시성 비교 실행">실행</button>

  <p id="status-message" aria-live="polite">● 대기 중 — 프리셋을 선택하고 실행하세요</p>

  <div class="preset-lab__metrics">
    <div><span class="preset-lab__metric-label">실행 중 (active)</span>
         <span id="active-count" aria-live="polite">0</span></div>
    <div><span class="preset-lab__metric-label">대기 중 (pending)</span>
         <span id="pending-count" aria-live="polite">0</span></div>
  </div>

  <table id="result-table" class="preset-lab__result">
    <thead><tr><th scope="col">#</th><th scope="col">태스크</th><th scope="col">상태</th><th scope="col">소요(ms)</th></tr></thead>
    <tbody><!-- 완료 순서로 행 append --></tbody>
  </table>
</section>
```

### 7.3 단계별 구현 지침
1. **마크업**: 위 골격의 frozen ID 9개 / class 7개를 그대로 배치. 프리셋 라벨에 concurrency 값 텍스트 포함.
2. **토큰**: §7.1 5개 CSS 변수를 `.preset-lab`에 선언. hardcode 대신 `var(--…)` 참조.
3. **프리셋 선택 로직**: 클릭/Enter 시 대상에 `preset-lab__preset--active` + `aria-pressed="true"`, 나머지는 제거/`false`(상호배타).
4. **실행 연결(§4)**: 선택 concurrency로 `pLimit(n)` 생성 → 고정 배치를 `limit(task)` → 주기적으로 `activeCount`→`#active-count`, `pendingCount`→`#pending-count` 반영 → 완료마다 `#result-table` 행 append. 라이브러리 코어 무변경, 공개 표면만 소비.
5. **상태 전이(§5.6)**: idle→running→complete/error. `#status-message` 텍스트를 §2.2대로 교체(색상은 class 토글로 보조). running 중 `#preset-run` disabled.
6. **후조건**: complete/error/취소 시 카운터 0/0 복귀, `#preset-run` 재-enable.
7. **접근성(§6)**: aria-pressed, `#preset-run` aria-label, 3영역 aria-live=polite, focus-visible outline.
8. **반응형(§4.3)**: `@media (max-width:480px)`에서 `.preset-lab__controls`·`.preset-lab__metrics` `flex-direction:column`. 전 요소 `box-sizing:border-box` + `max-width:100%`로 320px overflow 방지.

### 7.4 권장 CSS class (frozen 외 보조 — dev 재량)
- `.preset-lab__metric-label`, `.preset-lab__status--{idle,running,complete,error}`(상태색 보조) 등은 frozen 목록 밖 보조 class로 dev가 자유 추가 가능. **frozen 7개 class 이름은 변경 금지**.

---

## 8. Edge / 상태 처리 참조 (frozen §8 반영)

| ID | 케이스 | 시각/텍스트 처리 |
| --- | --- | --- |
| E1 | 프리셋 미선택 실행 | error로 빠지지 말고 "프리셋을 먼저 선택하세요" 안내 텍스트(또는 기본 프리셋) |
| E2 | running 중 재클릭 | `#preset-run` 비활성/무시. 완료·실패 후 재사용 |
| E3 | 태스크 reject | `error` 배지 + 오류 텍스트, 카운터 초기화, `#preset-run` 재사용 |
| E4 | 배치 완료 | `complete` 배지, 카운터 0/0, 결과 표 채움 |
| E5 | 320px / <480px | overflow 없음 / controls 세로 stack |
| E6 | 스크린리더 | aria-live 통지 + aria-pressed 선택 노출 |
| E7 | 색맹 | 상태·선택을 `●`+텍스트로 구분(색상 단독 금지) |

---

## 9. mockup 참조

- 시각 mockup: [`docs/design/preset-lab-mockup.html`](./preset-lab-mockup.html)
- 단일 self-contained HTML(외부 의존성 0). 본 명세의 컬러/타이포/레이아웃/상태를 시각화한다.
- 포함 시연:
  1. 기본 컴포넌트 (frozen ID/class 적용, `running` 스냅샷)
  2. 상태 갤러리 (idle / running / complete / error 4종 — 색상 외 텍스트 동반 시연)
  3. 반응형 노트 (480px 미만 세로 stack, 320px overflow 없음)
- mockup은 **시각 시뮬레이션**이며 dev의 실제 산출물이 아니다. dev는 참조 가이드로 사용하되 픽셀 일치 의무는 없다.

---

## 10. Self-critique

| 체크 항목 | 결과 |
| --- | --- |
| **AC 매핑** | AC1(frozen 반영·재정의 없음)→§1·§5·§7.1 토큰 이름 고정 / AC2(프리셋·상태 색상 외 텍스트)→§2.2·§5.1·§6 / AC3(320px overflow 없음·480px 세로 stack)→§4.3·§7.3-8 / AC4(런타임 HTML/CSS/JS 미생성, 명세+mockup만)→산출물 2개 한정. 모두 매핑됨. |
| **dev 구현 가이드** | §7에 CSS 변수·DOM 골격·8단계 지침·frozen 이름 경계 제공. dev가 그대로 따라 구현 가능. |
| **기존 요소 보존** | 라이브러리 코어·루트 패키지·기존 `docs/design/*` 무변경. 신규 2파일만 additive 추가. frozen selector/token/상태 이름 재정의 없음. |
| **컴포넌트 매핑** | frozen DOM ID 9 / class 7 / 상태 4 / token 5 전부 §5·§7에 1:1 매핑, 소유 경계(designer=docs, developer=demo) 준수. |
| **모호함 flag** | ① 프리셋 라벨 정확 문구·② 배치 크기/지연·③ 결과 표 컬럼 구성은 계약상 dev 재량 → 본 명세는 예시로 제시하고 강제하지 않음(픽셀 일치 의무 없음 명시). frozen 값(1/2/4·selector·token 이름)은 강제. 미해결 blocker 없음. |
