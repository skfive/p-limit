# 대기열 압력 히스토리 패널 — 시안 & 상태/접근성 명세

- Jira: F68F701A7A-82 (designer)
- 대상 저장소: `skfive/p-limit` · primary_module: `demo`
- 상위 계약: `docs/plans/queue-pressure-history-plan.md` (planner, F68F701A7A-84)
- frozen_interfaces: `planning-contract@v1`, `ui-contract@v1`
- 계약 상태: **frozen** — 본 문서는 planner가 동결한 selector·상태·token·접근성·반응형 계약을 **시각 명세로 렌더링**할 뿐, 재정의하지 않는다.

> 범위 고지 (acceptance criteria §4): 본 작업의 시각 명세 범위는 **이 markdown 파일 한 개**다. 런타임 `HTML`/`CSS`/`JS`(예: `demo/index.html`, `demo/demo.css`, `demo/demo.js`)는 developer 소유이며 본 문서에서 생성하지 않는다. 아래 코드블록은 dev 구현 가이드용 **참조 예시**이지 산출 파일이 아니다.

---

## 1. 시안 개요

### 1.1 변경 범위 (additive)
p-limit 데모에 **대기열 압력 히스토리 패널**을 additive로 추가한다. limiter의 active/pending 압력 변화를 시간순 목록으로 기록·표시하고, 초기화 control을 제공한다. 기존 Inspector 데모·p-limit 공개 API는 보존한다.

### 1.2 사용자 경험 목표
- limiter의 대기열 압력이 시간에 따라 어떻게 변하는지 **한눈에 시간순으로** 파악한다.
- 각 항목의 active/pending 값을 **색상 + 텍스트**로 동시에 인지한다(색각 이상·스크린리더 포함).
- 새 항목 추가는 스크린리더에 자동으로 알려지고(`aria-live`), 초기화는 마우스·키보드 모두로 수행 가능하다.
- 초기화 후에는 항상 안내 문구가 복원되고 초기화 control이 다시 사용 가능해진다(불변식).

---

## 2. 컬러 팔레트 (frozen — 값 변경 금지)

CSS custom property로 정의하고 패널 범위(`.queue-pressure`)에서 소비한다. 색상은 **구분의 유일한 수단이 아니다** — 상태·값은 항상 텍스트로 함께 노출한다(§6).

| 역할 | token | 값 (HEX) | 용도 |
| --- | --- | --- | --- |
| accent (active) | `--qp-color-active` | `#2563eb` | active(실행 중) 압력 표시 색 |
| accent (pending) | `--qp-color-pending` | `#f59e0b` | pending(대기 중) 압력 표시 색 |
| background (panel) | *데모 기본 배경 상속* | — | 패널은 기존 데모 배경 위에 얹힌다(신규 배경 token 미정의) |
| text | *데모 기본 본문색 상속* | — | 히스토리 텍스트·상태 문구는 데모 기본 텍스트색 사용 |

간격·형태 token:

| token | 값 | 용도 |
| --- | --- | --- |
| `--qp-space-gap` | `8px` | 항목 간·요소 간 간격 |
| `--qp-radius` | `6px` | 패널·항목 모서리 반경 |
| `--qp-font-size` | `14px` | 히스토리 텍스트 기본 폰트 크기 |

> primary/secondary/background/text 중 신규로 동결된 색은 active·pending 2종뿐이다. 배경·본문색은 기존 데모 값을 상속하며, designer는 새 색 token을 추가로 정의하지 않는다(additive·비재정의 원칙).

---

## 3. 타이포그래피

신규 폰트 패밀리를 도입하지 않고 데모/시스템 기본 스택을 상속한다. 크기·굵기만 아래로 명세한다.

| 역할 | font-family | size | weight | line-height | 비고 |
| --- | --- | --- | --- | --- | --- |
| 패널 제목 | 상속(system stack) | 16px | 600 | 1.3 | 패널 헤더 라벨 |
| 상태 문구 (`#queue-pressure-status`) | 상속 | `--qp-font-size`(14px) | 500 | 1.4 | 현재 상태명을 화면 텍스트로 표시 |
| 히스토리 항목 (`.queue-pressure__item`) | 상속 | `--qp-font-size`(14px) | 400 | 1.4 | active/pending 값 텍스트 |
| 값 강조(active/pending 숫자) | 상속 | 14px | 600 | 1.4 | 색상 + 굵기로 이중 강조 |
| 캡션(타임스탬프 등 보조) | 상속 | 12px | 400 | 1.3 | 항목 부가 정보(선택) |

- 히스토리 본문 폰트 크기는 반드시 `--qp-font-size` token을 소비한다(하드코딩 금지).
- 색상으로만 강조하지 않도록, active/pending 값은 굵기(600)로도 구분한다.

---

## 4. 레이아웃

### 4.1 섹션 구조
패널은 기존 데모 `<main>` 흐름에 **별도 섹션**으로 additive 삽입된다(기존 Inspector 섹션 보존).

```
#queue-pressure-panel  (.queue-pressure)          ← 패널 루트
├─ 패널 헤더
│  ├─ 제목 "대기열 압력 히스토리"
│  └─ #queue-pressure-reset (.queue-pressure__reset)  ← 초기화 버튼 (aria-label="히스토리 초기화")
├─ #queue-pressure-status                          ← 현재 상태 문구(화면 텍스트)
└─ #queue-pressure-history-list (.queue-pressure__list)  ← aria-live="polite" 목록
   ├─ .queue-pressure__item  ← 항목 1 (active/pending 값 + 텍스트)
   ├─ .queue-pressure__item  ← 항목 2
   └─ …                       (세로 스택, 시간순)
```

### 4.2 spacing
- 패널 내부 요소 간격 = `--qp-space-gap`(8px).
- 항목 간 세로 간격 = `--qp-space-gap`(8px).
- 패널·항목 모서리 = `--qp-radius`(6px).

### 4.3 와이어프레임 (넓은 폭 · ≥ 480px)

```
┌────────────────────────────────────────────────────────────┐
│  대기열 압력 히스토리                        [ 히스토리 초기화 ]│  ← 헤더 + reset
│                                                              │
│  상태: 기록 중 (recording)                                    │  ← #queue-pressure-status
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ● active 3   ● pending 5    · 12:00:01               │   │  ← .queue-pressure__item
│  │ ● active 2   ● pending 6    · 12:00:02               │   │
│  │ ● active 4   ● pending 2    · 12:00:03               │   │
│  └──────────────────────────────────────────────────────┘   │  ← .queue-pressure__list
└────────────────────────────────────────────────────────────┘
  ● = --qp-color-active(#2563eb) / --qp-color-pending(#f59e0b)
     (색 옆에 "active"/"pending" 라벨 텍스트 항상 병기)
```

### 4.4 breakpoint 별 동작 (frozen §7)

| 뷰포트 | 동작 |
| --- | --- |
| **≥ 320px (필수 하한)** | 패널·목록에 content overflow 없음. 가로 스크롤 발생 금지 |
| 좁은 폭 (~320px) | 히스토리 항목 내부 요소(active·pending·타임스탬프)가 **세로로 쌓임**. 헤더의 제목·reset 버튼도 필요 시 세로 배치 |
| 넓은 폭 (≥ 480px) | 항목 내부 요소를 한 줄 가로 배치 가능(위 와이어프레임) |

### 4.5 와이어프레임 (좁은 폭 · 320px)

```
┌────────────────────────────────┐
│  대기열 압력 히스토리            │
│  [ 히스토리 초기화 ]             │  ← 좁으면 reset이 제목 아래로 내려감
│                                │
│  상태: 기록 중 (recording)      │
│  ┌──────────────────────────┐  │
│  │ ● active 3               │  │  ← 항목 내부 값이 세로로 쌓임
│  │ ● pending 5              │  │
│  │ · 12:00:01               │  │
│  ├──────────────────────────┤  │
│  │ ● active 2               │  │
│  │ ● pending 6              │  │
│  │ · 12:00:02               │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
   가로 스크롤 없음 · overflow 없음
```

---

## 5. 컴포넌트 & 상태 명세

### 5.1 DOM 계약 (frozen — selector 변경 금지)

| DOM ID | 용도 |
| --- | --- |
| `queue-pressure-panel` | 패널 루트 컨테이너 |
| `queue-pressure-history-list` | 히스토리 항목 목록 컨테이너 (aria-live 영역) |
| `queue-pressure-status` | 현재 상태 문구를 화면 텍스트로 표시 |
| `queue-pressure-reset` | 히스토리 초기화 버튼 |

| CSS class | 적용 대상 |
| --- | --- |
| `queue-pressure` | 패널 루트 (BEM block) |
| `queue-pressure__list` | 히스토리 목록 |
| `queue-pressure__item` | 히스토리 개별 항목 |
| `queue-pressure__reset` | 초기화 버튼 |

### 5.2 컴포넌트별 명세

#### (a) 패널 루트 — `#queue-pressure-panel.queue-pressure`
- 상태: 없음(정적 컨테이너). 하위 요소의 상태를 감싼다.
- 인터랙션: 없음.

#### (b) 상태 표시 — `#queue-pressure-status`
- 역할: 현재 상태명을 **화면 텍스트**로 항상 표시(§6).
- 상태 입력(props 개념): 현재 상태값 ∈ { `empty`, `recording`, `updated`, `reset` }.
- 인터랙션: 없음(읽기 전용 표시).

#### (c) 히스토리 목록 — `#queue-pressure-history-list.queue-pressure__list`
- 역할: `.queue-pressure__item`을 시간순으로 담는 컨테이너.
- 접근성: `aria-live="polite"` — 새 항목 추가 시 스크린리더에 알림.
- 인터랙션: 없음(항목은 클릭 대상 아님).

#### (d) 히스토리 항목 — `.queue-pressure__item`
- 역할: 한 시점의 active/pending 압력을 표기.
- 표시 데이터(props 개념): `activeCount`(number), `pendingCount`(number), 시각(선택).
- 표기 규칙: active 값은 `--qp-color-active`, pending 값은 `--qp-color-pending`로 강조하되 **"active"/"pending" 라벨 텍스트를 항상 병기**(색상 단독 금지, §6).
- 인터랙션: 없음(정적 로그 항목).

#### (e) 초기화 버튼 — `#queue-pressure-reset.queue-pressure__reset`
- 역할: 히스토리 목록을 비우고 상태를 `reset` → `empty`로 되돌린다.
- 접근성: `aria-label="히스토리 초기화"`, 키보드 포커스 가능, **Enter/Space**로 활성화.
- 상태:
  - 기본(활성) — 항상 클릭·키보드 활성 가능.
  - hover/focus — 포커스 링 가시(브라우저 기본 유지 또는 명시 스타일). 색상만이 아닌 아웃라인/굵기로도 포커스 식별.
- 인터랙션: click / keydown(Enter, Space) → 초기화 수행.

### 5.3 상태별 화면 텍스트 & 시각 표현 (frozen 상태 모델 §5)

| 상태 | 진입 조건 | `#queue-pressure-status` 화면 텍스트(예시) | 목록·시각 표현 | reset 버튼 |
| --- | --- | --- | --- | --- |
| `empty` | 기록 없음(초기값) 또는 초기화 직후 안정화 | `상태: 항목 없음 (empty)` + 안내 문구 `아직 기록된 대기열 압력이 없습니다.` | `.queue-pressure__list` 비어 있음(안내 문구만 노출) | 활성(누를 항목 없어도 오류 없음) |
| `recording` | 작업 진행으로 active/pending 변동, 항목 누적 중 | `상태: 기록 중 (recording)` | 항목이 시간순으로 쌓임. 최신 항목이 목록에 반영 | 활성 |
| `updated` | 새 항목이 목록에 추가되어 aria-live로 알려진 직후 | `상태: 갱신됨 (updated)` (직후 `recording`으로 자연 복귀 가능) | 새 `.queue-pressure__item`이 목록에 나타남 → `aria-live="polite"`가 스크린리더에 알림 | 활성 |
| `reset` | `#queue-pressure-reset` 활성화로 히스토리를 비운 전이 | `상태: 초기화됨 (reset)` → 이후 `empty` 문구로 복원 | 목록이 비워짐 → `empty` 안내 문구 복원 | 활성(초기화 후에도 재사용 가능) |

**상태 후조건 불변식 (frozen §5):**
> 초기화·취소·실패 뒤에는 상태와 진행 표시를 **초기값(empty)** 으로 되돌리고, 주 실행 control(`#queue-pressure-reset` 및 기존 실행 control)을 다시 사용할 수 있어야 한다.

- **초기화 후 안내 텍스트 복원**: `reset` 전이 직후 `#queue-pressure-status`는 `empty` 안내 문구(`아직 기록된 대기열 압력이 없습니다.`)로 되돌아간다.
- **초기화 버튼 재활성화**: `#queue-pressure-reset`은 초기화를 수행한 뒤에도 계속 활성(disabled로 잠기지 않음) 상태를 유지해, 반복 초기화가 가능하다.

### 5.4 상태 전이도

```
        (첫 압력 변동)
 empty ───────────────▶ recording
   ▲                       │  (새 항목 추가)
   │                       ▼
   │                    updated
   │                       │  (aria-live 알림 후 자연 복귀)
   │                       ▼
   │                    recording …
   │                       │
   │   (reset 버튼 활성화)   ▼
   └───── empty ◀──────── reset
     안내 문구 복원 · reset 버튼 재활성
```

---

## 6. 접근성 명세 (frozen §6 — 계약 그대로)

| 항목 | 계약 |
| --- | --- |
| aria-live | `#queue-pressure-history-list`는 `aria-live="polite"`로 새 항목을 스크린리더에 알린다. |
| aria-label | `#queue-pressure-reset`은 `aria-label="히스토리 초기화"`를 가진다. |
| 키보드 | reset 버튼은 Tab으로 포커스 가능하고 **Enter/Space**로 활성화된다. 포커스 표시는 색상 외 아웃라인으로도 인지 가능. |
| 상태 텍스트 | `#queue-pressure-status`는 현재 상태 문구를 **화면 텍스트**로 표시한다. |
| 색상 비의존 | 모든 상태·값은 **색상만으로 구분하지 않는다**. 상태명은 화면 텍스트 + 접근성 이름으로, active/pending 값은 라벨 텍스트로 함께 노출한다. |

- 시맨틱 마크업 권장: 히스토리 목록은 목록 시맨틱(`<ul>`/`<li>` 또는 role), reset은 `<button>` 사용을 권장(dev 재량, selector 계약 준수 전제).

---

## 7. 반응형 명세 (frozen §7 — 계약 그대로)

- **320px 이상**에서 패널·히스토리 목록에 content overflow가 발생하지 않는다.
- 좁은 폭에서 히스토리 항목은 **세로로 쌓여** 가로 스크롤 없이 표시된다(§4.5 와이어프레임).
- 긴 텍스트·많은 항목: 목록 컨테이너 내부에서 세로 스택으로 처리하여 320px에서 패널 밖 overflow 미발생(§9 edge).

---

## 8. dev 구현 가이드 (developer 참조용 · 산출 파일 아님)

> 아래는 developer가 `demo/index.html`·`demo/demo.css`·`demo/demo.js`를 additive로 구현할 때의 **참조 지침**이다. 픽셀 단위 일치 의무는 없으며, DOM ID/class(§5.1)·token 값(§2)·상태 모델(§5.3)·접근성(§6)·반응형(§7)만은 그대로 따른다.

### 8.1 마크업 골격 (참조 예시)
```html
<!-- demo/index.html 에 additive 삽입 (기존 Inspector 섹션 보존) -->
<section id="queue-pressure-panel" class="queue-pressure" aria-labelledby="queue-pressure-title">
  <header class="queue-pressure__header">
    <h2 id="queue-pressure-title">대기열 압력 히스토리</h2>
    <button id="queue-pressure-reset" class="queue-pressure__reset" type="button"
            aria-label="히스토리 초기화">히스토리 초기화</button>
  </header>
  <p id="queue-pressure-status">상태: 항목 없음 (empty) — 아직 기록된 대기열 압력이 없습니다.</p>
  <ul id="queue-pressure-history-list" class="queue-pressure__list" aria-live="polite">
    <!-- .queue-pressure__item 이 시간순으로 append -->
  </ul>
</section>
```

### 8.2 항목 마크업 (참조 예시 · 색상 + 텍스트 병기)
```html
<li class="queue-pressure__item">
  <span class="queue-pressure__active">active <strong>3</strong></span>
  <span class="queue-pressure__pending">pending <strong>5</strong></span>
  <span class="queue-pressure__time">12:00:01</span>
</li>
```

### 8.3 token 정의 (참조 예시 · 값 변경 금지)
```css
/* demo/demo.css 에 additive. 기존 규칙 변경 금지 */
.queue-pressure {
  --qp-color-active: #2563eb;
  --qp-color-pending: #f59e0b;
  --qp-space-gap: 8px;
  --qp-radius: 6px;
  --qp-font-size: 14px;

  border-radius: var(--qp-radius);
  display: flex;
  flex-direction: column;
  gap: var(--qp-space-gap);
}
.queue-pressure__list { display: flex; flex-direction: column; gap: var(--qp-space-gap); }
.queue-pressure__item {
  display: flex; flex-wrap: wrap; gap: var(--qp-space-gap);
  border-radius: var(--qp-radius); font-size: var(--qp-font-size);
}
.queue-pressure__active strong { color: var(--qp-color-active); }
.queue-pressure__pending strong { color: var(--qp-color-pending); }

/* 320px 반응형: 좁은 폭에서 항목 내부 세로 스택 + 가로 스크롤 방지 */
@media (max-width: 360px) {
  .queue-pressure__item { flex-direction: column; }
  .queue-pressure__header { flex-direction: column; align-items: flex-start; }
}
```

### 8.4 상태/로직 지침 (참조)
- 상태값 4종(`empty`/`recording`/`updated`/`reset`)을 `#queue-pressure-status` 텍스트에 반영.
- 새 항목 append 시 `updated` 문구 노출 후 `recording`으로 복귀. `aria-live="polite"`가 자동 알림하므로 별도 focus 이동은 하지 않는다.
- reset 핸들러: click + keydown(Enter/Space) 모두 처리(단, `<button>`이면 Enter/Space는 브라우저 기본 처리로 충분).
- reset 후: 목록 비우기 → `#queue-pressure-status`를 `empty` 안내 문구로 복원 → reset 버튼은 계속 활성 유지(§5.3 불변식).
- p-limit 공개 API(`activeCount`·`pendingCount`·`clearQueue` 등)는 **읽기(관찰)** 용도로만 소비한다.

---

## 9. Edge / 실패 케이스 (계약 §9 반영)

| 케이스 | 기대 시각/상태 동작 |
| --- | --- |
| 항목 0개에서 초기화 클릭 | `empty` 유지, 오류 없음. 상태 문구·reset 버튼 사용 가능 유지 |
| 취소(clearQueue)로 pending 급감 | 압력 변화가 항목으로 기록되고, 취소 후 상태·진행 표시는 §5.3 초기값 규칙을 따른다 |
| 실패/오류 발생 후 | 상태·진행 표시를 초기값(empty)으로 되돌리고 reset·주 실행 control을 재사용 가능하게 한다 |
| 히스토리가 매우 길 때 | 세로 스택 + 목록 컨테이너 내부 처리로 320px에서 패널 밖 overflow 미발생 |
| 색각 이상 사용자 | 색상 단독 구분 없음 — active/pending 라벨 텍스트와 상태 문구로 판별 가능 |

---

## 10. 시각 mockup 참조

본 작업의 acceptance criteria §4에 따라 **시각 명세 범위는 이 markdown 파일 한 개**이며, 별도 mockup `HTML` 파일은 생성하지 않는다(런타임 HTML/CSS/JS 미생성 원칙). 시각 시뮬레이션은 §4.3·§4.5 와이어프레임과 §5.4 상태 전이도, §8 참조 코드블록으로 문서 내부에 담았다. developer는 이 문서를 참조 가이드로 사용하되 픽셀 단위 일치 의무는 없다.

---

## 11. Self-critique

PR commit 직전 자기 점검 (5개 항목):

1. **AC 매핑** — AC-1(empty)~AC-5(320px 반응형)이 §5.3 상태표·§6 접근성·§7 반응형·§9 edge에 모두 매핑됨. 초기화 후 안내 텍스트 복원·reset 재활성화(AC 핵심)는 §5.3 불변식과 §8.4에 명시. ✅
2. **dev 구현 가이드** — §8에 마크업 골격·token CSS·상태 로직·반응형 미디어쿼리를 단계별 참조 예시로 제공. selector/token 값은 frozen 그대로. ✅
3. **기존 요소 보존** — additive 원칙 명시(§1.1, §4.1, §8.1 주석). 기존 Inspector 섹션·데모 CSS/JS·p-limit 공개 API 미변경 지침 반복. ✅
4. **컴포넌트 매핑** — 5개 DOM ID + 4개 class를 §5.1~§5.2에서 컴포넌트별 역할·상태·인터랙션·접근성으로 1:1 매핑. ✅
5. **모호함 flag** — (a) `updated`→`recording` 복귀 타이밍, (b) 좁은 폭 breakpoint 수치(예시 360px)는 "320px 이상 overflow 없음" 계약을 만족하는 선에서 dev 재량. (c) 타임스탬프 표기는 선택 요소로 표시. 이 3건은 계약 값 재정의가 아닌 구현 재량 범위임을 §4.4·§8에 명시했다.

> 계약 재정의 없음 확인: selector·token 값·상태명·접근성·반응형 계약은 planner frozen 값을 그대로 인용했고, 신규 색 token·신규 selector·신규 파일을 추가하지 않았다.
