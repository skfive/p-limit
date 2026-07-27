# 동시성 프리셋 비교 데모

`p-limit`에서 **동시성 값이 실행 타임라인에 주는 영향**을 나란히 비교하는 정적 브라우저 데모입니다. 동일한 결정론적 작업 집합을 동시성 **1 · 2 · 4** 세 프리셋으로 각각 실행하고 세 타임라인을 한 화면에서 비교합니다.

- 라우트: `/demo/concurrency-presets`
- 빌드 불필요 — 브라우저 네이티브 ESM(`<script type="module">`) + import map으로 동작합니다.
- 외부 API·네트워크 요청 없음 — 작업은 `setTimeout` 기반 인위적 지연으로만 시뮬레이션하며 오프라인에서도 동일하게 동작합니다.

## 실행 방법

1. 저장소 루트에서 의존성을 한 번 설치합니다(코어가 transitive로 쓰는 `yocto-queue`를 `node_modules/`에 설치하기 위함 — import map이 `../../node_modules/yocto-queue/index.js`를 가리킵니다).

   ```sh
   npm install
   ```

2. 저장소 루트에서 정적 서버를 띄웁니다.

   ```sh
   npx http-server . -p 8080
   ```

3. 브라우저에서 접속합니다.

   ```
   http://localhost:8080/demo/concurrency-presets/
   ```

> `file://`로 직접 열면 import map / module 보안 정책 때문에 로드가 막힐 수 있으니 정적 서버로 여세요. 최신 브라우저(import map 지원)가 필요합니다.

## 사용법

- **실행**: 세 프리셋을 동시에 재생합니다. 각 항목이 `대기 → 실행 → 완료`로 전이합니다. 동시성 1은 한 번에 1개만 실행되어 가장 긴 직렬 타임라인을, 동시성 4는 가장 짧은 타임라인을 보여줍니다.
- **초기화**: 모든 항목을 다시 `대기`로 되돌립니다. (p-limit은 진행 중 task 취소를 제공하지 않으므로, 초기화는 다음 실행 기준을 재설정하는 의미입니다.)

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | DOM 구조(계약 §6의 id/class). |
| `main.js` | p-limit 소비, 결정론적 fixture, 순수 상태 전이 리듀서, DOM 갱신. |
| `styles.css` | 시각 스타일 · design token 값. **designer 작업(F68F701A7A-46)의 산출물이며 이 PR에는 포함되지 않습니다.** `index.html`이 `<link>`로 참조하지만, 파일이 없어도 페이지·리듀서 로직은 스타일 없이 정상 동작합니다(계약 §4·§7). |

상태 전이 리듀서(`applyTransition` / `computePanelState` 등)는 `main.js`에서 순수 함수로 export 되어 DOM 없이 단위 테스트할 수 있습니다(`test/demo-concurrency-presets.test.js`, plan §11).
