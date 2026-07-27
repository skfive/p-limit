# 상태 구독 API · 실시간 Inspector demo — 동결 실행 설계 (F68F701A7A-78)

> 본 문서는 **planner 산출물**입니다. designer(F68F701A7A-76)와 developer(F68F701A7A-77)가
> 병렬로 따를 수 있도록 상태 변경 구독 API와 실시간 Inspector demo의 실행 설계를 **동결**합니다.
>
> **권위 원칙**: 아래 `frozen blueprint`의 파일·소유자·상태·후조건이 유일한 권위입니다.
> 본 planner 문서는 blueprint를 **재정의하지 않고 그대로 렌더링**하며, 새 파일·새 역할·계약 밖 요구를 추가하지 않습니다.
> designer/developer는 동결된 snapshot shape·callback 발화 순서·DOM selector·design token·상태 텍스트를
> 재정의하거나 재해석하지 않습니다.

---

## 1. 목표와 범위

### 1.1 목표
상태 변경 **구독 API**와 이를 소비하는 실시간 **Inspector demo**를 설계하여, 실행 중인 limiter의
활성/대기/동시성/상태를 실시간으로 관찰할 수 있게 한다.

### 1.2 In scope
- limiter 상태 변경을 구독하는 공개 API 추가 (`index.js` 런타임 + `index.d.ts` 타입)
- readonly snapshot shape 동결
- callback 발화 시점·예외 격리·재진입·unsubscribe 계약 동결
- 실시간 Inspector demo (DOM / CSS / JS / 시각 명세) 계약 동결

### 1.3 Out of scope (Non-goals)
- 기존 공개 API의 timing 또는 Promise 정산 의미 변경
- 새 runtime dependency 추가
- Inspector 이외의 신규 UI 화면
- 본 문서에서 정의하지 않은 파일 신설 또는 소유권 재배정

---

## 2. 파일 소유권 (동결 — frozen blueprint 그대로)

| 파일 | 소유자 | 역할 |
| --- | --- | --- |
| `index.js` | **developer** | 구독 API 런타임 구현 |
| `index.d.ts` | **developer** | 구독 API 타입 선언 |
| `demo/index.html` | **developer** | Inspector demo DOM 구조 |
| `demo/inspector.css` | **developer** | Inspector demo 스타일 (design token 소비) |
| `demo/inspector.js` | **developer** | Inspector demo 동작 (구독 API 소비) |
| `docs/design/inspector-contract.md` | **designer** | Inspector 시각 명세 (색상·타이포·레이아웃 시안) |
| `readme.md` | **canonical work packet owner** | 공개 API 문서화 |

> 소유권과 상태 계약은 frozen blueprint가 유일한 권위이며, 본 planner 문서는 이를 재정의하지 않습니다.
> designer는 `docs/design/inspector-contract.md`의 **시각 명세**만 소유하고, demo 구현 파일(`demo/**`)은 developer가 소유합니다.

---

## 3. 상태 구독 API 계약 (frozen: planning-contract@v1)

### 3.1 공개 표면

새 메서드를 `pLimit()` 인스턴스와 `limitFunction()` 반환 함수 양쪽에 노출한다
(기존 introspection 표면 `activeCount`/`pendingCount`/`concurrency`/`isIdle`/`isSaturated`/`isPaused`와 동일하게
`limitFunction`은 내부 limiter에 위임한다).

```
subscribe(listener: (snapshot: Readonly<LimiterSnapshot>) => void): () => void
```

- 반환값: **unsubscribe 함수**. 호출하면 해당 listener는 이후 알림 대상에서 제거된다.
- 여러 listener를 등록할 수 있으며, 등록 순서대로 통지된다.

### 3.2 Snapshot shape (동결 — 필드·타입 고정)

```
type LimiterSnapshot = {
  readonly activeCount: number;    // 현재 실행 중인 task 수
  readonly pendingCount: number;   // 대기 큐에 있는 task 수 (아직 시작되지 않음)
  readonly concurrency: number;    // 현재 동시성 한도 (Infinity 가능)
  readonly status: LimiterStatus;  // 파생 상태 문자열 (아래 3.3)
};

type LimiterStatus = 'idle' | 'active' | 'saturated' | 'paused';
```

- snapshot은 **readonly**이며, listener는 이를 변형해서는 안 된다(계약상 불변).
- designer와 developer는 이 4개 필드(`activeCount`, `pendingCount`, `concurrency`, `status`)를 변경하지 않는다.

### 3.3 `status` 파생 규칙 (우선순위 고정)

아래 순서로 **위에서부터 처음 만족하는** 값을 채택한다:

1. `isPaused === true` → **`'paused'`**
2. `activeCount >= concurrency` (saturated) → **`'saturated'`**
   - `concurrency === Infinity`인 경우는 절대 saturated가 아니다.
3. `activeCount > 0` → **`'active'`**
4. 그 외 (activeCount 0 && pending 0 포함) → **`'idle'`**

> 상태 문자열은 UI 계약(§4.4)의 화면 텍스트 라벨과 1:1 대응한다:
> `idle`→"Idle", `active`→"Running", `saturated`→"Saturated", `paused`→"Paused".

### 3.4 Callback 발화 시점 (동결 — 아래 이벤트에서 통지)

listener는 **다음 상태 전이 시점**에 최신 snapshot과 함께 발화된다:

| 이벤트 | 발화 위치(개념) | 비고 |
| --- | --- | --- |
| **enqueue** | task가 큐에 추가될 때 | `limit(fn)` 호출로 pending 증가 |
| **start** | 큐의 task가 실행으로 승격될 때 | `resumeNext()`가 active 증가시킬 때 |
| **settle** | 실행 중 task가 정산(성공/실패)될 때 | `next()`에서 active 감소 후 |
| **pause** | `pause()` 호출로 실제 상태가 바뀔 때 | 이미 paused면 no-op → **미발화** |
| **resume** | `resume()` 호출로 실제 상태가 바뀔 때 | paused 아니면 no-op → **미발화** |
| **clearQueue** | `clearQueue()`로 pending이 제거될 때 | 제거 대상이 0이어도 호출 시 1회 발화 허용(구현 재량이나, 상태 무변화 시 미발화 권장) |
| **concurrency 변경** | `concurrency` setter로 값이 바뀔 때 | 값이 동일하면 미발화. 승격 drain에 따른 후속 start 발화는 별도로 발생 가능 |

발화 계약 세부:
- **발화 순서**: 위 이벤트가 유발하는 상태 전이 순서대로 통지한다. 하나의 공개 호출이 복수 전이를
  유발하면(예: `resume()`가 여러 task를 승격) 각 전이마다 통지되거나, 최소한 최종 안정 snapshot이 통지되어야 한다.
  designer/developer는 이 **발화 순서를 변경하지 않는다**.
- **동기/비동기**: 기존 scheduling은 microtask 기반이다. 구독 통지는 기존 timing을 **보존**해야 하며,
  통지를 위해 기존 task의 실행 시점/정산 시점을 앞당기거나 늦추지 않는다.
- **초기 스냅샷**: `subscribe()` 호출 자체는 즉시 통지하지 않는 것을 기본으로 한다(전이 기반 통지).
  demo는 구독 직후 현재 introspection 값(`activeCount` 등)을 직접 읽어 초기 렌더한다(§4.5).

### 3.5 예외 격리 (동결)

- listener가 예외를 던져도 **스케줄러 동작과 다른 listener 통지는 영향받지 않는다.**
- 각 listener 호출은 개별적으로 보호되며(개념상 try/catch), 던져진 예외는 삼켜지거나
  unhandled로 새어나가 스케줄링 경로를 중단시키지 않는다.
- listener 예외가 task의 Promise 정산 의미를 바꾸지 않는다.

### 3.6 재진입 (동결)

- listener 안에서 `subscribe()` / unsubscribe() 호출은 안전해야 한다.
- 통지 도중 등록/해제로 인해 **현재 진행 중인 통지 순회가 깨지지 않는다**(순회 대상 스냅샷 또는 안전 복사).
- 통지 중 새로 등록된 listener는 **현재 진행 중인 통지에서 호출되지 않을 수 있다**(다음 전이부터 통지). 구현 재량이나 재진입 안전이 우선.

### 3.7 unsubscribe 의미 (동결)

- unsubscribe 함수를 호출하면 해당 listener는 **이후 어떤 전이에서도 통지되지 않는다.**
- 같은 unsubscribe를 두 번 호출해도 안전하다(idempotent, no-op).
- listener 자신을 자신 안에서 unsubscribe해도 안전하다(재진입 계약과 결합).

### 3.8 불변식 (planning-contract@v1 invariants)

- **INV-1**: designer와 developer는 동결된 snapshot shape(`activeCount`, `pendingCount`, `concurrency`, `status`)와
  callback 발화 순서를 변경하지 않는다.
- **INV-2**: 기존 pLimit scheduling path와 공개 API의 timing 및 Promise 정산 의미를 보존한다.
  (`pause`가 `false`로 시작하듯, 구독 미사용 소비자는 이전과 완전히 동일한 스케줄링/타이밍을 얻는다.)
- **INV-3**: 새 runtime dependency를 추가하지 않는다. (기존 `yocto-queue`만 사용)

---

## 4. Inspector UI 계약 (frozen: ui-contract@v1)

> 아래 값은 frozen blueprint에서 **그대로 렌더링**한 것입니다. designer/developer는
> `domId`, `cssClass`, `design token`, 상태 텍스트를 **재정의하거나 재해석하지 않습니다.**

### 4.1 대상 파일

| 파일 | 소유자 | 내용 |
| --- | --- | --- |
| `demo/index.html` | developer | Inspector DOM 골격 |
| `demo/inspector.css` | developer | design token · 반응형 스타일 |
| `demo/inspector.js` | developer | 구독 API 소비 · 상태 렌더 |
| `docs/design/inspector-contract.md` | designer | 시각 명세(색상·타이포·레이아웃 시안) |

### 4.2 DOM ID (동결)

| DOM ID | 용도 |
| --- | --- |
| `inspector-root` | Inspector 루트 컨테이너 |
| `inspector-status-badge` | 상태 배지 (aria-live 영역) |
| `inspector-active-count` | 활성 task 수 표시 |
| `inspector-pending-count` | 대기 task 수 표시 |
| `inspector-concurrency-value` | 현재 동시성 값 표시 |
| `inspector-enqueue` | task 추가 control |
| `inspector-clear` | 대기 큐 비우기 control |
| `inspector-pause` | 일시정지 control |
| `inspector-resume` | 재개 control |

### 4.3 CSS class (동결)

| CSS class | 용도 |
| --- | --- |
| `inspector` | 루트 블록 |
| `inspector__badge` | 상태 배지 |
| `inspector__metric` | 지표(active/pending/concurrency) 표시 요소 |
| `inspector__controls` | control 그룹 컨테이너 |
| `inspector__control` | 개별 control 버튼 |

### 4.4 상태 텍스트 모델 (동결 — 색상 외 항상 화면 텍스트 라벨 포함)

| status (API §3.3) | 화면 텍스트 | design token (색상) |
| --- | --- | --- |
| `idle` | **`Idle`** | `--inspector-color-idle` |
| `active` | **`Running`** | `--inspector-color-active` |
| `saturated` | **`Saturated`** | `--inspector-color-saturated` |
| `paused` | **`Paused`** | `--inspector-color-paused` |

> **INV**: 상태 표시는 **색상만으로 구분하지 않고**, 항상 명시적 화면 텍스트 라벨과 접근성 이름으로 상태명을 노출한다.

### 4.5 Design token / CSS 변수 (동결)

| 토큰 | 용도 |
| --- | --- |
| `--inspector-color-idle` | idle 상태 색 |
| `--inspector-color-active` | active(Running) 상태 색 |
| `--inspector-color-saturated` | saturated 상태 색 |
| `--inspector-color-paused` | paused 상태 색 |
| `--inspector-space-gap` | metric/control 영역 간격 |

> 구체 색상값·타이포·시각 톤은 **designer**가 `docs/design/inspector-contract.md`에서 정의한다.
> developer는 위 토큰 이름을 그대로 CSS 변수로 선언·소비하며 토큰 이름을 재정의하지 않는다.

### 4.6 접근성 요구 (동결)

- `inspector-status-badge`는 **`aria-live="polite"`** 영역으로, 상태 텍스트 변화를 스크린리더에 알린다.
- `inspector-enqueue`, `inspector-clear`, `inspector-pause`, `inspector-resume` control은 각각 **명시적 `aria-label`** 을 가진다.
- 모든 control은 **키보드 Tab 순서**로 접근 가능하다.
- 모든 상태는 색상만으로 구분하지 않고, 상태명을 화면 텍스트와 접근성 이름으로 노출한다.

### 4.7 반응형 / overflow 동작 (동결)

- **≥ 320px**: metric과 control 영역에 content overflow가 발생하지 않는다.
- **< 480px**: `inspector__controls`가 **세로로 스택**된다.

### 4.8 후조건 (동결 — 초기화/취소/실패 후 복구)

- 초기화·취소(`clearQueue`)·실패 뒤에는 **상태와 진행 표시를 초기값으로 되돌리고**,
  주 실행 control(enqueue 등)을 **다시 사용할 수 있어야** 한다.
- 즉, 어떤 흐름을 거쳐도 최종적으로 limiter가 idle이 되면 UI는 `Idle` 상태 + 지표 0 + control 활성으로 수렴한다.

---

## 5. Given / When / Then 수용 시나리오

### AC-1 구독 등록과 통지
- **Given** `pLimit(2)`로 생성한 limiter에 `subscribe(listener)`를 등록했을 때
- **When** `limit(fn)`을 3회 호출하면
- **Then** enqueue/start/settle 전이마다 listener가 최신 snapshot과 함께 호출되고,
  각 snapshot의 `activeCount`는 항상 `concurrency` 이하이며 `status`는 §3.3 규칙을 따른다.

### AC-2 saturated / active / idle 전이
- **Given** `pLimit(1)`에 구독이 걸려 있을 때
- **When** 2개 task를 넣어 1개가 실행되고 1개가 대기하면
- **Then** 실행 중 snapshot은 `status === 'saturated'`(active 1 == concurrency 1), 모두 정산되면 `status === 'idle'`.

### AC-3 pause / resume
- **Given** 대기 task가 있는 limiter에 구독이 걸려 있을 때
- **When** `pause()`를 호출하면 `status === 'paused'` snapshot이 통지되고, 이미 paused 상태에서 다시 `pause()`하면 통지되지 않는다(no-op)
- **Then** `resume()` 호출 시 승격 전이에 따라 `paused`→(승격)`active`/`saturated` snapshot이 통지된다.

### AC-4 clearQueue 후 복구
- **Given** 대기 큐에 task가 쌓인 limiter
- **When** `clearQueue()`를 호출하면
- **Then** `pendingCount`가 0으로 반영된 snapshot이 통지되고, 실행 중 task가 모두 정산되면 UI는 `Idle` + 지표 0 + control 활성으로 수렴한다(§4.8).

### AC-5 concurrency 변경
- **Given** `pLimit(1)`에 대기 task가 있고 구독이 걸려 있을 때
- **When** `limit.concurrency = 3`으로 올리면
- **Then** 변경 snapshot 통지 후, drain 승격에 따른 start 전이가 각각 통지되며 timing은 기존 microtask 의미를 보존한다(INV-2).

### AC-6 listener 예외 격리
- **Given** 던지는 listener A와 정상 listener B가 모두 등록된 상태
- **When** 상태 전이가 발생하면
- **Then** A의 예외는 스케줄러와 B의 통지를 방해하지 않고, task Promise 정산 의미도 바뀌지 않는다.

### AC-7 unsubscribe
- **Given** 등록된 listener의 unsubscribe 함수
- **When** unsubscribe를 호출한 뒤 새 전이가 발생하면
- **Then** 해당 listener는 더 이상 호출되지 않으며, unsubscribe 재호출은 안전하다(idempotent).

### AC-8 재진입
- **Given** 통지 도중 자신을 unsubscribe하거나 새 listener를 subscribe하는 listener
- **When** 전이가 발생하면
- **Then** 현재 통지 순회가 깨지지 않고 예외 없이 완료된다.

### AC-9 접근성 · 반응형
- **Given** 렌더된 Inspector demo
- **When** 320px~480px 폭에서 확인하면
- **Then** overflow 없이, <480px에서 controls가 세로 스택되며, status 배지는 aria-live로 텍스트 라벨을 노출하고 모든 control은 aria-label과 Tab 접근을 갖춘다.

---

## 6. Edge case / 실패 케이스

| # | 케이스 | 기대 동작 |
| --- | --- | --- |
| E1 | `concurrency === Infinity` | 절대 `saturated` 아님. active>0이면 `active`, 아니면 `idle`. |
| E2 | 통지 중 listener가 `pause()`/`resume()` 등 공개 API 재호출 | 재진입 안전. 새 전이는 순차 통지(무한 재귀 방지 — 상태 무변화 시 미발화). |
| E3 | `clearQueue`가 제거할 대기 task 0개 | 상태 무변화 시 미발화 권장. 발화하더라도 snapshot은 일관성 유지. |
| E4 | 동일 값으로 `concurrency` 재설정 | 값 무변화 → 미발화. |
| E5 | `subscribe` 없이 사용하는 기존 소비자 | 이전과 100% 동일한 스케줄링/timing (INV-2). |
| E6 | `limitFunction`으로 감싼 함수의 구독 | 내부 limiter에 위임하여 동일 계약 제공(기존 introspection 위임 패턴과 일치). |
| E7 | 매우 빠른 연속 전이 | UI는 최종 안정 snapshot으로 수렴; 각 전이 통지 순서 보존. |

---

## 7. Handoff 요약 (designer / developer)

- **developer (F68F701A7A-77)**: `index.js`에 §3 구독 API 구현(snapshot shape·발화 시점·예외 격리·재진입·unsubscribe),
  `index.d.ts`에 타입 선언, `demo/**`에 Inspector demo(DOM ID/class·상태 텍스트·design token 소비·접근성·반응형)를 구현한다.
  기존 timing/정산 의미 보존, 새 runtime dependency 금지.
- **designer (F68F701A7A-76)**: `docs/design/inspector-contract.md`에 Inspector 시각 명세(§4.5 토큰의 구체 색상,
  타이포, 레이아웃 시안)를 작성한다. domId/cssClass/상태 텍스트/토큰 이름은 재정의하지 않는다.
- **tester (F68F701A7A-80)**: §5 AC와 §6 edge case를 검증한다.

> 본 문서는 frozen blueprint를 렌더링한 handoff 계약이며, 파일·소유자·상태·후조건을 재정의하지 않는다.
