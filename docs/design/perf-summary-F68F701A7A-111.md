# 성능 요약 결과 카드 — 시각 명세 (F68F701A7A-111)

> 본 문서는 planner가 동결한 실행 설계(`docs/plans/perf-summary-F68F701A7A-111.md`)와 frozen blueprint(`planning-contract@v1`, `ui-contract@v1`)를 **재정의 없이 시각 명세로 렌더링**한 designer 산출물입니다.
> selector·design token·상태·접근성·반응형은 frozen blueprint가 유일한 권위이며, 본 문서는 그 계약을 그대로 시각적으로 표현할 뿐 새 selector/token/파일/상태를 만들지 않습니다.
> 런타임 HTML/CSS/JS는 생성하지 않습니다. developer가 `demo/concurrency-presets/`의 4개 파일에 additive로 구현합니다.
>
> **시각 mockup**: [`docs/design/mockups/perf-summary-F68F701A7A-111.html`](./mockups/perf-summary-F68F701A7A-111.html)

---

## 1. 시안 개요

### 변경 범위
- `demo/concurrency-presets` 동시성 프리셋 데모에 **성능 요약 결과 카드 UI를 additive로만 추가**한다.
- 기존 실행·초기화·타임라인 계약, p-limit 공개 API(`index.js`, `index.d.ts`)는 변경하지 않는다. 신규 의존성·네트워크 호출을 추가하지 않는다.
- 요약 region(`#perf-summary`) 하나에 상태 텍스트(`#perf-summary-status`)와 3개 결과 카드(`#perf-card-c1/-c2/-c4`)를 얹는다.

### 사용자 경험 목표
- 사용자가 동시성 1/2/4 프리셋을 실행하면, **각 동시성별 경과시간(ms)** 과 **동시성1 대비 배수(×)** 를 한눈에 비교할 수 있다.
- 상태(대기/실행 중/완료/초기화됨)를 **색상이 아니라 화면 텍스트**로 항상 명확히 인지한다.
- 스크린리더 사용자는 완료 시 `aria-live="polite"`로 요약을 자동 전달받고, 각 카드 값을 화면 텍스트로 읽는다.
- 좁은 화면(320px)에서는 세로 스택, 넓은 화면(480px↑)에서는 가로 정렬로 overflow 없이 본다.

---

## 2. 컬러 팔레트

frozen design token(계약 6절)을 **exact value 그대로** 사용한다. 값 재정의·override·신규 token 추가 금지.

| 역할 | token | HEX / value |
| --- | --- | --- |
| 카드 배경 (background) | `--perf-card-bg` | `#f8fafc` |
| 카드 텍스트 (text) | `--perf-card-text` | `#0f172a` |
| 강조 / accent (배수·focus) | `--perf-card-accent` | `#2563eb` |
| 카드 모서리 반경 | `--perf-card-radius` | `8px` |
| region/카드 간 간격 | `--perf-summary-gap` | `12px` |

- **primary/accent**: `#2563eb` — 배수(`perf-card__speedup`) 강조 및 focus outline에 사용.
- **background**: `#f8fafc` — 카드 표면.
- **text**: `#0f172a` — 라벨·시간·배수 기본 텍스트.
- 상태 구분은 **색상에 의존하지 않는다.** 상태별 색 강조를 쓰더라도 반드시 상태명 텍스트를 함께 노출한다(7절 참조). mockup에서 상태 강조가 필요하면 위 5개 token 범위 안에서만 사용하고, 새 색 token을 정의하지 않는다.

---

## 3. 타이포그래피

외부 폰트 의존 없이 system font stack을 사용한다(데모 계약과 동일). 아래는 시각 표현 권장값이며, developer가 기존 데모 타이포 스케일을 재사용해도 계약에 부합한다.

| 요소 | 대상 selector | font-family | size | weight | line-height |
| --- | --- | --- | --- | --- | --- |
| 상태 텍스트 (heading 역할) | `.perf-summary__status` | system sans | 0.9375rem (15px) | 700 | 1.4 |
| 동시성 라벨 | `.perf-card__label` | system sans | 0.8125rem (13px) | 600 | 1.3 |
| 경과시간 (수치 강조) | `.perf-card__time` | system mono | 1.375rem (22px) | 700 | 1.2 |
| 배수 (accent) | `.perf-card__speedup` | system mono | 1rem (16px) | 600 | 1.3 |

- 권장 stack (mockup 사용):
  - sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`
  - mono: `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
- 경과시간·배수는 mono로 정렬성을 확보해 카드 간 수치 비교가 쉽도록 한다.

---

## 4. 레이아웃

### 4.1 구조

```
#perf-summary  (.perf-summary, aria-live="polite")
├─ #perf-summary-status  (.perf-summary__status)   ← 상태명 텍스트
└─ #perf-summary-cards   (.perf-summary__cards)     ← 카드 컨테이너
   ├─ #perf-card-c1  (.perf-card)  → 라벨 "동시성 1" · 시간 · 배수
   ├─ #perf-card-c2  (.perf-card)  → 라벨 "동시성 2" · 시간 · 배수
   └─ #perf-card-c4  (.perf-card)  → 라벨 "동시성 4" · 시간 · 배수
```

각 카드 내부 수직 스택: `perf-card__label` → `perf-card__time` → `perf-card__speedup`.

### 4.2 Spacing
- region 내 상태 텍스트와 카드 컨테이너 사이, 카드 사이 간격은 모두 `--perf-summary-gap`(`12px`) 기준.
- 카드 내부 패딩은 `12px`~`16px` 권장(token gap과 조화). 카드 모서리 반경은 `--perf-card-radius`(`8px`).

### 4.3 Breakpoint별 동작 (계약 8절 동결)

| breakpoint | `#perf-summary-cards` 배치 | 비고 |
| --- | --- | --- |
| `320px` 이상 | **세로 스택** (`flex-direction: column`) | overflow 없음. 카드 full-width |
| `480px` 이상 | **가로 정렬** (`flex-direction: row`, 카드 균등 분배) | content overflow 없음 |

- 두 breakpoint 사이/이상 어느 폭에서도 텍스트·수치가 잘리거나 넘치지 않아야 한다.
- 가로 정렬 시 3카드는 `flex: 1 1 0`로 균등 폭, 긴 수치도 `min-width: 0` + 줄바꿈 허용으로 overflow 방지.

---

## 5. 컴포넌트 명세

### 5.1 `perf-summary` (요약 region)
- **selector**: `#perf-summary` / `.perf-summary`
- **role/attr**: `aria-live="polite"` region — `complete` 진입 시 요약을 스크린리더에 알림.
- **자식**: `perf-summary-status`, `perf-summary-cards`.
- **상태 데이터**: 아래 4개 상태(6절)에 따라 하위 표시가 달라짐.

### 5.2 `perf-summary-status` (상태 텍스트)
- **selector**: `#perf-summary-status` / `.perf-summary__status`
- **내용**: 현재 상태명을 **화면 텍스트**로 노출. 색상만으로 상태를 구분하지 않는다.
- **상태별 텍스트**: `idle` → "대기", `running` → "실행 중", `complete` → "완료", `cleared` → "초기화됨".
- **인터랙션**: 없음(표시 전용). 상태 전이 시 텍스트 갱신, 이전 상태 텍스트가 잔류하지 않음.

### 5.3 `perf-card` (결과 카드) ×3
- **selector**: `#perf-card-c1` / `#perf-card-c2` / `#perf-card-c4`, class `.perf-card`
- **자식 3요소 (모두 화면 텍스트, 색상 비의존)**:
  | 자식 | selector | 내용 | 상태별 값 |
  | --- | --- | --- | --- |
  | 동시성 라벨 | `.perf-card__label` | "동시성 1" / "동시성 2" / "동시성 4" | 항상 표시(고정) |
  | 경과시간 | `.perf-card__time` | 경과시간(ms). 예: `128 ms` | `idle`/`cleared`: placeholder(예: `— ms`) · `complete`: 실제값 |
  | 배수 | `.perf-card__speedup` | 동시성1 대비 배수 `×`. 예: `1.00×`, `1.87×` | `idle`/`cleared`: placeholder(예: `—×`) · `complete`: 실제값 |
- **데이터 매핑** (Metric 데이터 구조, 계약 9절):
  | 카드 | metric key | 필드 |
  | --- | --- | --- |
  | `perf-card-c1` | `c1` | `{ concurrency: 1, elapsedMs, speedup: 1 }` |
  | `perf-card-c2` | `c2` | `{ concurrency: 2, elapsedMs, speedup }` |
  | `perf-card-c4` | `c4` | `{ concurrency: 4, elapsedMs, speedup }` |
  - `perf-card__time` = `elapsedMs` → `"<n> ms"` 형식.
  - `perf-card__speedup` = `speedup` → `"<n.nn>×"` 형식(소수 2자리). 동시성1은 항상 `1.00×`.
  - `speedup = elapsedMs_c1 / elapsedMs`. 동시성1 경과시간이 0에 수렴하면 산출 로직이 0 나눗셈을 방어하되 표시는 `×` 형식을 유지한다(계약 12절).
- **상태/인터랙션**:
  - hover/focus 시 accent(`--perf-card-accent`) 경계 강조 가능(선택적 시각 표현). 단 정보 전달은 텍스트가 담당하며 색상은 보조.
  - 카드 자체는 비인터랙티브(표시 전용). 실행/초기화는 기존 데모의 주 control이 담당.

### 5.4 상태별 카드 표현 요약

| 상태 | status 텍스트 | 카드 time | 카드 speedup |
| --- | --- | --- | --- |
| `idle` | "대기" | placeholder `— ms` | placeholder `—×` |
| `running` | "실행 중" | 진행 표시(placeholder 유지 또는 "계측 중…") | placeholder 유지 |
| `complete` | "완료" | 실제 `<n> ms` | 실제 `<n.nn>×` |
| `cleared` | "초기화됨" | placeholder로 복귀 | placeholder로 복귀 |

---

## 6. 상태 모델 (frozen — 계약 5절 재서술)

요약 UI는 **4개 상태만** 가진다. 모든 상태는 **색상만으로 구분하지 않고** `perf-summary-status` 화면 텍스트·접근성 이름으로 상태명을 노출한다.

| 상태 | 진입 조건 | 표시 |
| --- | --- | --- |
| `idle` | 초기 로드 / 실행 전 | "대기", 카드 placeholder |
| `running` | 실행 시작 후 완료 전 | "실행 중", 진행 표시 |
| `complete` | 모든 프리셋 실행 완료 | "완료", 카드에 최종 metric |
| `cleared` | 초기화/취소/실패 후 | "초기화됨", 카드·진행 표시 초기값 복귀 |

**후조건(동결)**: 초기화·취소·실패 뒤에는 상태·진행 표시를 초기값으로 되돌리고 **주 실행 control을 다시 사용할 수 있어야 한다.** 상태 전이는 additive 로직으로 처리하고 기존 실행/초기화 흐름을 변경하지 않는다.

---

## 7. 접근성 (frozen — 계약 7절)

- `#perf-summary`는 **`aria-live="polite"` region** — `complete` 시 요약을 스크린리더에 알린다.
- 각 `perf-card`는 **동시성 라벨·경과시간·동시성1 대비 배수를 화면 텍스트**로 제공하며 **색상에만 의존하지 않는다.**
- **모든 상태는 색상만으로 구분하지 않고** 상태명을 화면 텍스트와 접근성 이름으로 노출한다.
- 실행·초기화 control(기존 데모)은 **키보드로 접근 가능**하고 **focus 순서가 논리적**이다. 요약 region은 control 이후 논리적 순서에 배치.
- focus 표시는 accent(`--perf-card-accent`) outline로 명확히 하되, 정보 전달은 텍스트가 담당한다.
- 배수/시간 수치는 단위(`ms`, `×`)를 화면 텍스트에 포함해 문맥 없이도 의미가 전달되게 한다.

---

## 8. dev 구현 가이드

developer(`demo/concurrency-presets/` 4파일 소유)가 additive로 따라갈 지침. **selector/token 이름은 아래 그대로 사용하고 재정의하지 않는다.**

### 8.1 `index.html` (additive DOM)
- 계약 4.3 마크업 골격을 그대로 삽입:
  ```html
  <section id="perf-summary" class="perf-summary" aria-live="polite">
    <p id="perf-summary-status" class="perf-summary__status">대기</p>
    <div id="perf-summary-cards" class="perf-summary__cards">
      <article id="perf-card-c1" class="perf-card">
        <span class="perf-card__label">동시성 1</span>
        <span class="perf-card__time">— ms</span>
        <span class="perf-card__speedup">—×</span>
      </article>
      <article id="perf-card-c2" class="perf-card">
        <span class="perf-card__label">동시성 2</span>
        <span class="perf-card__time">— ms</span>
        <span class="perf-card__speedup">—×</span>
      </article>
      <article id="perf-card-c4" class="perf-card">
        <span class="perf-card__label">동시성 4</span>
        <span class="perf-card__time">— ms</span>
        <span class="perf-card__speedup">—×</span>
      </article>
    </div>
  </section>
  ```
- 기존 실행·초기화·타임라인 마크업은 삭제/이동하지 않는다. 요약 region은 논리적 focus 순서(주 control 이후)에 추가.

### 8.2 `summary.css` (additive 스타일 + token 정의)
- `:root`(또는 데모 스코프)에 frozen token을 exact value로 정의:
  ```css
  :root {
    --perf-summary-gap: 12px;
    --perf-card-bg: #f8fafc;
    --perf-card-accent: #2563eb;
    --perf-card-radius: 8px;
    --perf-card-text: #0f172a;
  }
  ```
- 권장 규칙:
  - `.perf-summary { display: flex; flex-direction: column; gap: var(--perf-summary-gap); }`
  - `.perf-summary__cards { display: flex; flex-direction: column; gap: var(--perf-summary-gap); }`
  - `@media (min-width: 480px) { .perf-summary__cards { flex-direction: row; } }`
  - `.perf-card { flex: 1 1 0; min-width: 0; background: var(--perf-card-bg); color: var(--perf-card-text); border-radius: var(--perf-card-radius); padding: 12px; display: flex; flex-direction: column; gap: 4px; }`
  - `.perf-card__speedup { color: var(--perf-card-accent); }`
  - `.perf-card:focus-within, .perf-card:hover { outline: 2px solid var(--perf-card-accent); }` (선택적)
- 기존 selector/token 재정의·삭제 금지.

### 8.3 `summary.metrics.js` (additive · 계측)
- 계약 9절 데이터 구조를 산출:
  ```js
  { c1: { concurrency: 1, elapsedMs, speedup: 1 },
    c2: { concurrency: 2, elapsedMs, speedup },
    c4: { concurrency: 4, elapsedMs, speedup } }
  ```
- 경과시간은 브라우저 내 실행 시간(ms)만 사용. 외부 호출·신규 의존성 없음.
- `speedup = elapsedMs_c1 / elapsedMs`, 동시성1은 `1`. 0 나눗셈 방어.

### 8.4 `summary.js` (additive · 렌더링)
- 상태(`idle`/`running`/`complete`/`cleared`)에 따라 `#perf-summary-status` 텍스트와 각 카드 `perf-card__time`/`perf-card__speedup`를 갱신.
- `complete`: `time` = `` `${elapsedMs} ms` ``, `speedup` = `` `${speedup.toFixed(2)}×` ``.
- `cleared`/`idle`: placeholder(`— ms`, `—×`)로 복귀, 이전 텍스트 잔류 없음.
- 재실행 시 이전 카드 값이 새 실행 값으로 갱신되도록 idempotent 갱신.

---

## 9. mockup 참조

- 시각 mockup: **[`docs/design/mockups/perf-summary-F68F701A7A-111.html`](./mockups/perf-summary-F68F701A7A-111.html)**
- mockup은 본 명세의 컬러/타이포/레이아웃/상태를 시각적으로 시뮬레이션한 self-contained HTML(외부 의존성 0건)이다.
- mockup에는 4개 상태(idle/running/complete/cleared)와 320px·480px 반응형 예시를 `<section>`으로 구분해 그려 두었다.
- **mockup은 dev의 실제 산출물이 아니다.** developer는 이를 참조 가이드로만 사용하며 픽셀 단위 일치 의무는 없다. 계약 권위는 planner 문서와 frozen blueprint다.

---

## 10. Self-critique

1. **AC 매핑**: 계약 11절 AC-1~AC-7을 §5(상태별 표현)·§6(상태 모델)·§7(접근성)·§4.3(반응형)·§1(비침습성)에 각각 매핑. AC-3 metric 표기는 §5.3 데이터 매핑에서 형식(`ms`, `×`)까지 명시. ✅
2. **dev 구현 가이드**: §8에서 4개 파일별 additive 지침·selector·token·CSS 스니펫·metric 형식을 단계별로 제공. ✅
3. **기존 요소 보존**: 요약 UI는 additive-only. 기존 실행/초기화/타임라인 마크업·selector·token 삭제/재정의 금지를 §1·§8에 명시. p-limit 공개 API·의존성 불변. ✅
4. **컴포넌트 매핑**: 3개 카드 ↔ metric `c1/c2/c4` ↔ frozen DOM id/class를 §5.3 표로 1:1 매핑. ✅
5. **모호함 flag**:
   - `running` 상태의 진행 표시 구체 형태(스피너 vs "계측 중…" 텍스트)는 계약이 지정하지 않음 → developer 재량. 단 **색상 비의존·상태명 텍스트 노출** 원칙은 준수해야 함(권장: 텍스트 표기).
   - placeholder 문자열(`— ms`, `—×`)은 UX 제안값이며 계약 강제값 아님. dev가 데모 톤에 맞춰 조정 가능하되 "값 없음"이 화면 텍스트로 드러나야 함.
   - 이 두 항목 외 selector/token/상태/접근성/반응형은 frozen이며 재정의 대상 아님.

<!-- bf:pr-summary -->
## 시안 요약

`demo/concurrency-presets` 성능 요약 결과 카드 UI의 **시각 명세 + mockup**. planner frozen 계약(selector·token·상태·접근성·반응형)을 재정의 없이 시각화. 런타임 코드는 미생성(designer 산출물은 `docs/design/**`만).

**산출물**
- `docs/design/perf-summary-F68F701A7A-111.md` — 시각 명세(컬러/타이포/레이아웃/컴포넌트/상태/접근성/dev 가이드)
- `docs/design/mockups/perf-summary-F68F701A7A-111.html` — 4개 상태 + 320/480px 반응형 시각 mockup

**Design Token 매핑 (frozen · exact value)**

| token | value | 용도 |
| --- | --- | --- |
| `--perf-summary-gap` | `12px` | region/카드 간 간격 |
| `--perf-card-bg` | `#f8fafc` | 카드 배경 |
| `--perf-card-accent` | `#2563eb` | 배수/focus 강조 |
| `--perf-card-radius` | `8px` | 카드 모서리 |
| `--perf-card-text` | `#0f172a` | 카드 텍스트 |

**핵심 계약 준수**
- 결과 카드는 동시성 라벨·경과시간(ms)·동시성1 대비 배수(×)를 **화면 텍스트**로 표기 — 색상 비의존
- `#perf-summary` `aria-live="polite"`, 4개 상태(대기/실행 중/완료/초기화됨) 텍스트 노출
- 320px 세로 스택 · 480px↑ 가로 정렬, overflow 없음

## Self-critique
- AC-1~7 → 명세 각 절 매핑 완료(§4.3/§5/§6/§7)
- dev 4파일 additive 구현 가이드·CSS 스니펫 제공(§8)
- 기존 요소/공개 API 비침습(additive-only) 명시
- 모호함 flag: `running` 진행 표시 형태·placeholder 문자열은 dev 재량(색상 비의존·상태 텍스트 노출 원칙은 준수)
<!-- /bf:pr-summary -->
