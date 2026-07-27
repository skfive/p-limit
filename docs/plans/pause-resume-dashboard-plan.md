# pause/resume 대시보드 — 구현 설계 및 동결된 UI 계약 (F68F701A7A-66)

## 0. 이 문서의 위상 (권위 관계)

- 이 문서는 **planner가 동결한 실행 설계**로, designer(F68F701A7A-64)와
  developer(F68F701A7A-65)가 병렬로 작업하기 위한 단일 참조 계약이다.
- 파일 소유권·상태 계약·DOM 계약의 **유일한 권위는 frozen blueprint**(ROLE_WORK_PACKET_V2
  의 `ui-contract@v1` / `planning-contract@v1`)이며, 이 문서는 그 계약을 **재정의하지 않고
  그대로 설명(render)** 한다. 이 문서와 blueprint가 충돌하면 blueprint가 우선한다.
- 이 문서는 blueprint에 없는 **새 파일·새 역할·새 요구사항을 추가하지 않는다.**

## 1. 목적

`p-limit`(동시 실행 개수를 제한하는 promise 유틸리티)의 동작을 브라우저에서
"일시정지(pause) → 재개(resume)"라는 실행 제어 관점으로 관찰할 수 있는 정적
데모 대시보드를 `demo/` 하위에 additive로 추가한다.

사용자는 작업을 추가하고, 실행 중인 작업 흐름을 **일시정지**하여 신규 작업 시작을
막고, 다시 **재개**하여 concurrency 한도 안에서 대기 작업을 이어서 실행시키는
과정을, 상태 배지와 카운터로 실시간 확인할 수 있다.

## 2. 구현 범위

### 포함 (in scope)
- `p-limit`의 공개 API만 사용하는 순수 브라우저(ESM) 정적 데모 대시보드 1개
- 작업 추가 / 일시정지 / 재개 control
- pause 중 신규 작업 미시작, resume 후 concurrency 한도 내 재개
- 집계 카운터(active / pending)와 상태 배지(idle / running / draining / paused) 표시

### 제외 (out of scope, non-goals)
- **`index.js` / `index.d.ts`(p-limit 코어) 및 저장소 루트 `package.json` 변경 금지.**
  pause/resume는 p-limit 코어 API가 아니므로 **demo 코드 내부의 게이트 래퍼**로만
  구현한다(아래 4절). 기존 API·패키지 파일은 건드리지 않는다.
- **외부 CDN·프레임워크·신규 npm 의존성 추가 금지.** 브라우저 네이티브 ESM
  (`<script type="module">`)으로 동작하며 `demo/app.js`가 저장소 루트 `index.js`를
  상대 경로로 import한다.
- 디자인 시안(색상값·타이포·애니메이션 디테일) 결정 — designer 담당. 이 문서와
  developer는 아래 동결된 domId/cssClass/상태 텍스트/token 계약만 소비한다.
- 실제 네트워크 요청 — 데모 작업은 `setTimeout` 기반 인위적 지연으로 시뮬레이션한다.

## 3. 파일 소유권 (동결 — blueprint가 권위)

frozen blueprint의 소유권을 그대로 고정한다. **각 역할은 자신 소유 파일만 생성/수정**하며,
타 역할 소유 파일의 domId/cssClass/상태 텍스트/token을 변경하거나 재정의하지 않는다.

| 파일 | 소유자 | 성격 |
|---|---|---|
| `demo/index.html` | **developer** | demo 런타임 산출물 (DOM 구조, 아래 5절 계약 준수) |
| `demo/app.js` | **developer** | demo 런타임 산출물 (로직: p-limit 소비, pause 게이트, 렌더) |
| `demo/styles.css` | **developer** | demo 런타임 산출물 (동결된 token/class를 CSS로 구현) |
| `docs/design/pause-resume-dashboard.md` | **designer** | 시각 명세 문서 |
| `docs/design/pause-resume-mockup.html` | **designer** | 시각 목업 |

- designer는 **`docs/design/` 시각 명세만** 소유한다. demo 런타임 파일(`demo/**`)을
  생성/수정하지 않는다.
- developer는 **demo 런타임 산출물만** 소유한다. `docs/design/**`를 생성/수정하지 않는다.
- 파일 구조 자체를 바꿔야 하는 필요가 생기면 임의 변경하지 말고 Jira 코멘트로 조율한다
  (이 문서·blueprint를 우회한 임의 변경 금지).

## 4. 실행 모델 — pause/resume 게이트 (demo 레이어)

p-limit은 pause/resume·작업 취소 API를 제공하지 않는다. 따라서 demo 코드가 아래
**게이트**로 신규 작업 투입 시점을 제어한다(코어 API 변경 없음).

- **작업 추가(task-add)**: 클릭 시 게이트가 열려 있으면(`running`/`idle`) 즉시
  `limit(() => simulatedWork())`로 투입한다. 게이트가 닫혀 있으면(`paused`) 투입을
  보류하고, 재개 시 순차 투입한다.
- **일시정지(task-pause)**: 게이트를 닫는다. **이미 `limit()`에 들어가 실행 중인
  작업은 강제 취소하지 않고 끝까지 실행**(draining)되며, **신규 작업만 시작을 막는다.**
- **재개(task-resume)**: 게이트를 다시 열어 보류된/신규 작업을 concurrency 한도 안에서
  이어서 실행한다.
- 집계 수치는 개별 계산으로 드리프트를 만들지 않기 위해 **항상 `limit.activeCount` /
  `limit.pendingCount`를 단일 진실 소스로** 읽어 렌더한다.
- 렌더는 이벤트 기반(작업 상태가 바뀔 때 호출)으로 충분하다(단순성 우선, 추측성
  최적화·폴링 금지).

## 5. 동결된 UI 계약 (designer ↔ developer handoff, 변경 금지)

아래 값은 frozen blueprint(`ui-contract@v1`)의 값을 그대로 옮긴 것이다. designer와
developer는 이 domId·cssClass·상태 텍스트·designToken을 **변경하거나 재정의하지 않는다.**

### 5.1 DOM id 계약

| domId | 요소 역할 |
|---|---|
| `dashboard-root` | 대시보드 최상위 컨테이너 |
| `task-add` | 작업 추가 control(버튼) |
| `task-pause` | 일시정지 control(버튼) |
| `task-resume` | 재개 control(버튼) |
| `active-count` | 실행 중 작업 수 텍스트(`limit.activeCount`) |
| `pending-count` | 대기 작업 수 텍스트(`limit.pendingCount`) |
| `status-badge` | 상태 배지(텍스트로 상태 표기, `aria-live="polite"`) |
| `task-list` | 개별 작업 목록 컨테이너(부모 요소) |

### 5.2 CSS class 계약

| cssClass | 용도 |
|---|---|
| `dashboard` | 대시보드 루트 스타일 훅 |
| `dashboard__controls` | control 묶음(add/pause/resume) 래퍼 |
| `dashboard__counter` | 카운터(active/pending) 표시 영역 |
| `status-badge` | 상태 배지 기본 스타일 |
| `status-badge--running` | 실행 중 상태 변형 |
| `status-badge--paused` | 일시정지 상태 변형 |
| `status-badge--idle` | 대기 상태 변형 |
| `task-item` | 개별 작업 항목 |

> `draining` 상태는 별도 배지 변형 class가 blueprint에 정의되어 있지 않다. 새 class를
> 추가하지 말고, draining 구간은 배지 **텍스트**('정리 중 (실행 작업 마무리)')로 표기한다
> (아래 5.3). 시각 표현은 designer가 기존 class 범위에서 정한다.

### 5.3 상태 계약 (배지 텍스트 · control 활성/비활성)

배지는 **색상뿐 아니라 화면 텍스트로도 상태를 표기**한다(접근성 이름에도 노출).

| 상태 | 배지 텍스트 | control 활성 규칙 | 진입 조건 |
|---|---|---|---|
| `idle` | `대기 중` | pause **비활성**, add·resume **활성** | 실행·대기 작업이 모두 0 |
| `running` | `실행 중` | pause **활성** | 게이트 열림 + 실행/대기 작업 존재 |
| `draining` | `정리 중 (실행 작업 마무리)` | pause 직후 **신규 작업 미시작** | pause 직후 실행 중 작업이 남아 있음 |
| `paused` | `일시정지됨` | resume **활성** | 게이트 닫힘 + 실행 중 작업 없음(정리 완료) |

- pause를 누르면 게이트가 닫히고, 실행 중 작업이 남아 있으면 `draining`(신규 미시작),
  실행 중 작업이 모두 끝나면 `paused`로 전이한다.
- **초기화·취소·실패(작업 reject) 뒤에는 상태와 진행 표시를 초기값(`idle`)으로 되돌리고,
  주 실행 control(작업 추가)을 다시 사용할 수 있어야 한다.**

### 5.4 design token 계약

| token | 용도 |
|---|---|
| `--color-status-running` | running 상태 색상 |
| `--color-status-paused` | paused 상태 색상 |
| `--color-status-idle` | idle 상태 색상 |
| `--space-control-gap` | control 간 간격 |
| `--font-size-counter` | 카운터 글자 크기 |

- 색상 hex/HSL 등 **실제 값은 designer가** `docs/design/`에서 정의하고, developer는
  `demo/styles.css`에서 **위 token 이름을 그대로** 선언·사용한다. 양측 모두 token 이름을
  바꾸지 않는다.

### 5.5 접근성 계약 (동결)

- `task-pause`, `task-resume` 버튼은 **명시적 `aria-label`** 을 가진다.
- `status-badge`는 **`aria-live="polite"`** 로 상태 변경을 안내한다.
- 모든 control은 **키보드 포커스** 가능하며 **Enter/Space** 로 실행된다.
- 모든 상태는 **색상만으로 구분하지 않고**, 상태명을 **화면 텍스트와 접근성 이름**으로 노출한다.

### 5.6 반응형 계약 (동결)

- **320px 이상**에서 content overflow가 발생하지 않는다.
- controls는 좁은 화면에서 **wrap** 되어 가로 스크롤이 생기지 않는다.

## 6. 검증 시나리오 (acceptance criteria — Given/When/Then)

### 6.1 pause 중 신규 작업 미시작
- **Given** `running` 상태로 작업이 실행 중일 때
- **When** `task-pause`(id=`task-pause`)를 클릭하면
- **Then** 배지 텍스트가 `정리 중 (실행 작업 마무리)`(실행 작업 잔존) 또는 `일시정지됨`
  (정리 완료)로 바뀌고, **새 작업이 `limit()`에 새로 투입되지 않는다**(이미 실행 중인
  작업만 마무리됨).

### 6.2 resume 후 concurrency 한도 재개
- **Given** `paused` 또는 `draining` 상태에서 대기/보류 작업이 있을 때
- **When** `task-resume`(id=`task-resume`)를 클릭하면
- **Then** 배지 텍스트가 `실행 중`으로 바뀌고, 보류/대기 작업이 재개되되 동시에
  실행되는 작업 수가 **`limit.concurrency` 한도를 넘지 않는다.**

### 6.3 카운터 갱신
- **Given** 작업이 추가·시작·완료되는 매 전이에서
- **When** 상태가 바뀔 때마다
- **Then** `active-count`는 `limit.activeCount`, `pending-count`는 `limit.pendingCount`
  값과 항상 일치한다(demo가 별도로 계산한 값이 아니라 인스턴스 값 그대로).

### 6.4 초기값 복귀 (초기화/취소/실패 후조건)
- **Given** 초기화, 작업 취소, 또는 작업 실패(reject)가 발생한 뒤
- **When** 잔여 작업이 모두 정리되면
- **Then** 상태 배지는 `대기 중`(idle)으로, 카운터는 0으로 되돌아가고, `task-add`
  control을 다시 사용할 수 있다.

### 6.5 접근성·반응형
- **Given** 대시보드가 렌더된 상태에서
- **When** 키보드만으로 조작하면 **Then** 모든 control이 Tab 포커스·Enter/Space로
  동작하고, 상태 변경이 `aria-live="polite"`로 안내되며, 상태명이 화면 텍스트로 보인다.
- **Given** viewport 폭이 **320px** 일 때 **When** 대시보드를 렌더하면 **Then** 가로
  스크롤/overflow 없이 controls가 wrap 된다.

## 7. Edge case / 실패 케이스

| 케이스 | 기대 동작 |
|---|---|
| pause 직후 실행 중 작업이 남아 있음 | `draining`(배지 '정리 중 (실행 작업 마무리)'), 신규 작업 미시작. 실행 중 작업이 모두 끝나면 `paused`로 전이 |
| pause 상태에서 작업 추가 클릭 | 게이트가 닫혀 있으므로 즉시 투입하지 않고 보류. resume 시 concurrency 한도 내 투입 |
| 작업이 reject(에러)됨 | 해당 작업만 실패 처리, 전체 중단 없음. 잔여 작업 정리 후 조건 충족 시 `idle`로 복귀 |
| pending·active 모두 0 | `idle`(배지 '대기 중'), pause 비활성 / add·resume 활성 |
| resume를 이미 열린(running) 상태에서 누름 | 상태 변화 없음(멱등), 오류 없이 무시 |
| 좁은 화면(≤320px) | controls wrap, 가로 스크롤 없음(6.5) |
| `<script type="module">` 미지원 환경 | 지원 범위 밖 — designer 시각 명세/데모 README에 "최신 브라우저 필요"로 명시 |

## 8. 회귀·비침습 불변식 (blueprint invariant)

- 기존 `p-limit` 공개 API(`pLimit`, `limit()`, `activeCount`, `pendingCount`,
  `concurrency`, `clearQueue`, `map`, `limitFunction`)와 패키지 파일(`index.js`,
  `index.d.ts`, 루트 `package.json`)은 **변경하지 않는다.** 구현은 `demo/` 하위
  additive 산출물로만 이뤄진다.
- designer와 developer는 5절의 동결된 domId·cssClass·상태 텍스트·designToken을
  변경하거나 재정의하지 않는다.

## 9. developer/tester를 위한 열린 확인 사항 (planner가 대신 결정하지 않음)

- 저장소 루트 `package.json`의 `scripts.test`(`xo && ava && tsd`)가 `demo/` 하위 신규
  파일을 린트/테스트 대상으로 포함하는지, 포함 시 xo 예외 처리 여부는 developer가 실제
  실행으로 확인·판단한다(planner는 파일을 실행하지 않음).
- 작업 실패(reject) 시나리오의 발생 비율/조건(고정 vs 랜덤), simulatedWork 지연 시간은
  developer 재량이며, 위 상태·DOM 계약만 지키면 된다.
- 색상·타이포·간격의 실제 값은 designer가 `docs/design/`에서 정의한다(5.4 token 이름은
  고정, 값은 designer 결정).
