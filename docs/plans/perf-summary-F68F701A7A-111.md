# 성능 요약 UI 실행 설계 (F68F701A7A-111)

> 본 문서는 `demo/concurrency-presets` 성능 요약 UI의 **frozen 실행 계약**을 designer/developer가 그대로 따르도록 렌더링한 계획서입니다.
> 여기에 적힌 파일·소유자·selector·token·상태·후조건은 frozen blueprint(ui-contract@v1)를 재서술한 것이며, 새 파일·새 역할·계약 밖 요구사항을 추가하지 않습니다.
> 계약과 본 문서가 충돌하면 **frozen blueprint가 유일한 권위**입니다.

---

## 1. 목적 및 원칙

- `demo/concurrency-presets`의 동시성 프리셋 실행 데모에 **성능 요약 UI를 additive로만 추가**한다.
- 기존 실행·초기화·타임라인 계약을 변경하지 않는다. 요약 UI는 기존 흐름 위에 얹히는 부가 표시일 뿐이다.
- **p-limit 공개 API(`index.js`, `index.d.ts`)를 변경하지 않는다.**
- **신규 의존성·네트워크 호출·외부 fetch를 추가하지 않는다.** 모든 metric은 브라우저 내 실행에서 계측한다.
- 모든 산출물은 **additive** 정책을 따른다(기존 selector/token 재정의 금지, 기존 코드 삭제 금지).

---

## 2. 파일 및 소유 경계 (File Ownership)

| 파일 | 소유자 | 정책 | 역할 |
| --- | --- | --- | --- |
| `demo/concurrency-presets/index.html` | developer | additive | 요약 region DOM 마크업 추가 |
| `demo/concurrency-presets/summary.css` | developer | additive | 요약 UI 스타일·token 정의 |
| `demo/concurrency-presets/summary.js` | developer | additive | 상태 렌더링·DOM 갱신 로직 |
| `demo/concurrency-presets/summary.metrics.js` | developer | additive | metric 계측·데이터 구조 산출 |
| `docs/design/perf-summary-F68F701A7A-111.md` | designer | additive | 시각 시안·레이아웃·상태별 표현 명세 |
| `docs/plans/perf-summary-F68F701A7A-111.md` | planner | — | 본 실행 설계 문서 |

- designer는 `docs/design/perf-summary-F68F701A7A-111.md`만 소유한다.
- developer는 `demo/concurrency-presets/`의 네 파일을 소유한다.
- **어느 역할도 selector·token을 변경·재정의하지 않는다.** frozen blueprint가 selector/token의 유일한 권위다.

---

## 3. 파일명 계약 (동결)

- HTML 엔트리: `demo/concurrency-presets/index.html`
- 스타일시트: `demo/concurrency-presets/summary.css`
- 렌더링 스크립트: `demo/concurrency-presets/summary.js`
- metric 스크립트: `demo/concurrency-presets/summary.metrics.js`

파일명은 위 4개로 동결한다. 새 파일을 추가하거나 이름을 변경하지 않는다.

---

## 4. DOM 구조 계약 (ID / class 동결)

### 4.1 DOM ID (동결)

| ID | 용도 |
| --- | --- |
| `perf-summary` | 요약 UI 최상위 region |
| `perf-summary-status` | 현재 상태 텍스트 표시 영역 |
| `perf-summary-cards` | 카드 컨테이너 |
| `perf-card-c1` | 동시성 1 카드 |
| `perf-card-c2` | 동시성 2 카드 |
| `perf-card-c4` | 동시성 4 카드 |

### 4.2 CSS class (동결)

| class | 용도 |
| --- | --- |
| `perf-summary` | 최상위 region 스타일 |
| `perf-summary__status` | 상태 텍스트 스타일 |
| `perf-summary__cards` | 카드 컨테이너 레이아웃 |
| `perf-card` | 개별 카드 |
| `perf-card__label` | 동시성 라벨(예: "동시성 1") |
| `perf-card__time` | 경과시간(ms) 표시 |
| `perf-card__speedup` | 동시성1 대비 배수 표시 |

### 4.3 마크업 골격 (developer 구현 참조)

```html
<section id="perf-summary" class="perf-summary" aria-live="polite">
  <p id="perf-summary-status" class="perf-summary__status"><!-- 상태명 텍스트 --></p>
  <div id="perf-summary-cards" class="perf-summary__cards">
    <article id="perf-card-c1" class="perf-card">
      <span class="perf-card__label">동시성 1</span>
      <span class="perf-card__time"><!-- ms --></span>
      <span class="perf-card__speedup"><!-- ×배수 --></span>
    </article>
    <article id="perf-card-c2" class="perf-card"> … </article>
    <article id="perf-card-c4" class="perf-card"> … </article>
  </div>
</section>
```

- selector 이름은 위 표 그대로 사용한다. **접두/접미 변형·재정의 금지.**

---

## 5. 상태 모델 (동결)

요약 UI는 다음 4개 상태만 갖는다. 각 상태는 **색상만으로 구분하지 않고** `perf-summary-status`의 화면 텍스트·접근성 이름으로 상태명을 노출한다.

| 상태 | 진입 조건 | 표시 |
| --- | --- | --- |
| `idle` | 초기 로드 시 / 실행 전 | 상태명 "대기", 카드 값 비어 있거나 placeholder |
| `running` | 실행 시작 후 완료 전 | 상태명 "실행 중", 진행 표시 |
| `complete` | 모든 프리셋 실행 완료 | 상태명 "완료", 카드에 최종 metric 채움 |
| `cleared` | 초기화/취소/실패 후 | 상태명 "초기화됨", 카드 값·진행 표시를 초기값으로 되돌림 |

### 후조건 (동결)

- **초기화·취소·실패 뒤에는** 상태와 진행 표시를 초기값(`idle`/`cleared`의 기본 표시)으로 되돌리고 **주 실행 control을 다시 사용할 수 있어야 한다.**
- 상태 전이는 additive 로직으로 처리하며 기존 실행/초기화 흐름을 변경하지 않는다.

---

## 6. Design Token (동결 · exact value)

`summary.css`에 아래 token을 exact value로 정의한다. **값 재정의·override 금지.**

| token | value | 용도 |
| --- | --- | --- |
| `--perf-summary-gap` | `12px` | region/카드 간 간격 |
| `--perf-card-bg` | `#f8fafc` | 카드 배경 |
| `--perf-card-accent` | `#2563eb` | 강조 색(배수/포커스 등) |
| `--perf-card-radius` | `8px` | 카드 모서리 반경 |
| `--perf-card-text` | `#0f172a` | 카드 텍스트 색 |

---

## 7. 접근성 요구 (동결)

- `perf-summary`는 **`aria-live="polite"` region**으로, 완료 시 요약을 스크린리더에 알린다.
- 각 `perf-card`는 **동시성 라벨·경과시간·동시성1 대비 배수를 화면 텍스트**로 제공하며, **색상에만 의존하지 않는다.**
- 실행·초기화 control은 **키보드로 접근 가능**하고 **focus 순서가 논리적**이다.
- **모든 상태는 색상만으로 구분하지 않고** 상태명을 화면 텍스트와 접근성 이름으로 노출한다.

---

## 8. 반응형 요구 (동결)

| breakpoint | 동작 |
| --- | --- |
| `320px` 이상 | `perf-summary-cards`가 **overflow 없이 세로 스택**으로 배치 |
| `480px` 이상 | `perf-card`가 **가로 정렬**되며 content overflow 없음 |

- 두 breakpoint 사이/이상 어느 폭에서도 content overflow가 발생하지 않아야 한다.

---

## 9. Metric 데이터 구조 (planning-contract@v1 · 동결)

`summary.metrics.js`는 각 프리셋 실행을 계측하여 아래 구조를 산출한다.

- **경과시간**: 해당 동시성 프리셋 실행 소요 시간(**ms 단위**).
- **동시성1 대비 배수**: `동시성1_경과시간 / 해당_동시성_경과시간` (동시성1 자신은 배수 `1`(=`1.00×`)).

각 카드(`perf-card-c1` / `perf-card-c2` / `perf-card-c4`)는 아래 필드를 갖는 metric 항목에 대응한다.

```js
// summary.metrics.js 산출 형태(참조 계약)
// concurrency: 동시성 값(1 | 2 | 4)
// elapsedMs:   경과시간 (ms)
// speedup:     동시성1 대비 배수 (elapsedMs_c1 / elapsedMs) — 동시성1은 1
{
  c1: { concurrency: 1, elapsedMs: <number>, speedup: 1 },
  c2: { concurrency: 2, elapsedMs: <number>, speedup: <number> },
  c4: { concurrency: 4, elapsedMs: <number>, speedup: <number> }
}
```

- 화면 표기: `perf-card__time`은 경과시간을 ms로, `perf-card__speedup`은 배수를 `×` 형식(예: `1.00×`, `1.87×`)으로 표시한다.
- metric 계측은 브라우저 내 실행 시간만 사용하며 **외부 호출·신규 의존성을 추가하지 않는다.**

---

## 10. handoff 계약 요약

- **planning-contract@v1** (producer: planner → consumer: designer, developer)
  - 본 문서(`docs/plans/perf-summary-F68F701A7A-111.md`)가 실행 설계·metric 데이터 구조의 권위.
  - 불변식: designer/developer는 승인된 실행 설계와 metric 데이터 구조를 따른다.
  - 불변식: p-limit 공개 API 비변경 · 신규 의존성/네트워크 호출 금지.
- **ui-contract@v1** (producer: planner → consumer: designer, developer)
  - blueprint-frozen. selector·token·상태·접근성·반응형·파일 소유권의 권위는 **frozen blueprint**.
  - 불변식: selector/token 변경·재정의 금지, 요약 UI는 additive로만 추가, 초기화·취소·실패 후 상태·control 복구.

### designer가 할 일

- `docs/design/perf-summary-F68F701A7A-111.md`에서 위 selector/token/상태를 사용해 시각 시안·레이아웃·상태별 표현을 명세한다.
- 새 selector/token/파일을 만들지 않는다.

### developer가 할 일

- `demo/concurrency-presets/`의 4개 파일에 위 DOM/상태/token/metric 계약을 additive로 구현한다.
- 기존 실행·초기화·타임라인 계약을 유지한다.

---

## 11. Acceptance Criteria (Given/When/Then)

### AC-1 · 요약 UI 노출 (idle)
- **Given** 데모 페이지를 로드하고 아직 실행하지 않았을 때
- **When** `#perf-summary` region이 렌더된다
- **Then** 상태명은 "대기"(`idle`)이며, `#perf-card-c1/-c2/-c4`가 placeholder 상태로 표시된다.

### AC-2 · 실행 중 (running)
- **Given** 주 실행 control을 눌러 프리셋 실행을 시작했을 때
- **When** 실행이 진행 중이면
- **Then** `#perf-summary-status`가 "실행 중"(`running`)을 화면 텍스트로 노출한다.

### AC-3 · 완료 및 metric (complete)
- **Given** 동시성 1/2/4 프리셋 실행이 모두 끝났을 때
- **When** `complete` 상태로 전이되면
- **Then** 각 카드가 경과시간(ms)과 동시성1 대비 배수(`×`)를 화면 텍스트로 표시하고, `aria-live="polite"`로 요약이 스크린리더에 전달된다.

### AC-4 · 초기화/취소/실패 후 복구 (cleared)
- **Given** 실행 후 초기화하거나, 실행이 취소/실패했을 때
- **When** `cleared` 상태로 전이되면
- **Then** 상태와 진행 표시가 초기값으로 되돌아가고 주 실행 control을 다시 사용할 수 있다.

### AC-5 · 접근성
- **Given** 스크린리더/키보드 사용자
- **When** 상태 전이·실행·초기화가 일어날 때
- **Then** 상태명·카드 데이터가 색상만이 아니라 화면 텍스트·접근성 이름으로 제공되고, 실행·초기화 control이 키보드로 논리적 focus 순서로 접근 가능하다.

### AC-6 · 반응형
- **Given** 뷰포트 폭이 320px일 때
- **When** 카드가 배치되면
- **Then** overflow 없이 세로 스택으로 표시된다. **그리고** 480px 이상에서는 가로 정렬되며 content overflow가 없다.

### AC-7 · 비침습성
- **Given** 본 작업 전체
- **When** 산출물이 병합되면
- **Then** p-limit 공개 API(`index.js`, `index.d.ts`)는 변경되지 않고, 신규 의존성/네트워크 호출이 추가되지 않으며, 기존 실행/초기화/타임라인 계약이 유지된다(additive-only).

---

## 12. Edge Case · 실패 케이스

- **실행 도중 취소**: 진행 중 취소 시 `cleared`로 전이하고 부분 metric을 초기값으로 되돌린다(부분 결과를 `complete`로 표시하지 않는다).
- **실행 실패(예외)**: 프리셋 실행 중 예외 발생 시 `cleared`로 전이하고 실행 control을 재활성화한다.
- **동시성1 경과시간이 0에 수렴**: 배수 계산에서 0 나눗셈을 피하기 위해 산출 로직이 이를 방어한다(표시는 계약된 `×` 형식 유지).
- **재실행**: `complete`/`cleared` 이후 다시 실행하면 이전 카드 값이 새 실행 값으로 갱신되고, 이전 상태 텍스트가 남지 않는다.
- **좁은 뷰포트(<320px는 계약 범위 밖)**: 320px를 하한 계약으로 두고, 그 이상에서 overflow가 없도록 세로 스택을 보장한다.
