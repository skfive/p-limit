# 동시성 시각화 예제 (concurrency-visualizer)

`p-limit`의 동시 실행 제한 동작을 브라우저에서 눈으로 확인하는 정적 예제입니다.
작업 수와 동시성(concurrency)을 조절하면 각 작업이 **대기 → 실행 → 완료/에러**로
전이되는 과정과 집계 카운터(실행 중/대기 중/동시성)가 실시간으로 갱신됩니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | DOM 마크업 (컨트롤·카운터·task 그리드) |
| `style.css` | 시각 스타일 (CSS 변수 토큰·상태별 색상·모션·포커스) |
| `app.js` | 로직 — `p-limit` 소비, 상태 추적, DOM 갱신 |

`app.js`는 저장소 루트의 `index.js`(p-limit 코어)를 `../../index.js` 상대 경로로
그대로 import 합니다. **외부 CDN·프레임워크·신규 npm 의존성은 사용하지 않습니다.**

## 실행 방법

p-limit 코어는 transitive 의존으로 `yocto-queue`(기존 dependency)를 import 하므로,
먼저 저장소 루트에서 의존성을 설치합니다.

```sh
# 저장소 루트에서 1회
npm install
```

그다음 이 디렉터리를 정적 서버로 열면 됩니다. 빌드 단계는 필요 없습니다.

```sh
# 예: 저장소 루트에서 간단한 정적 서버 기동
npx http-server . -p 8080
# 브라우저에서 http://localhost:8080/examples/concurrency-visualizer/ 접속
```

- 브라우저 네이티브 ESM(`<script type="module">`)으로 동작합니다.
- `index.html`의 import map이 bare specifier `yocto-queue`를 로컬
  `../../node_modules/yocto-queue/index.js`로 매핑합니다(외부 CDN 0건).

> **참고**: `file://`로 직접 열 경우 브라우저의 module/ import map 보안 정책 때문에
> 로딩이 막힐 수 있어 정적 서버 사용을 권장합니다. 최신 브라우저가 필요합니다
> (`<script type="module">` · import map 미지원 환경은 지원 범위 밖).

## 사용법

1. **작업 수** 입력(1~30)과 **동시성** 슬라이더(1~10)를 설정합니다.
2. **실행** 버튼을 누르면 해당 개수의 작업이 생성되어 동시성 제한 아래에서 처리됩니다.
   - 실행 중에는 시작 버튼이 비활성화됩니다.
3. 실행 중 슬라이더를 움직이면 `limit.concurrency`가 즉시 반영되어 "실행 중" 작업
   수가 새 값 이하로 유지되는 것을 관찰할 수 있습니다.
4. **초기화** 버튼은 작업 목록을 비우고 카운터를 0으로 되돌립니다.

작업은 `setTimeout` 기반의 인위적 지연으로 시뮬레이션하며, 실제 네트워크 요청은
하지 않습니다(오프라인 동작). 일부 작업은 데모를 위해 무작위로 에러 상태가 됩니다.

## 상태 색상 (접근성)

색각 이상 사용자도 구분할 수 있도록 색상뿐 아니라 각 칩에 **상태 라벨 텍스트**와
`aria-label`("작업 3, 실행 중")을 함께 표기합니다.

| 상태 | 라벨 |
|---|---|
| `queued` | 대기 |
| `active` | 실행 |
| `done` | 완료 |
| `error` | 에러 |
