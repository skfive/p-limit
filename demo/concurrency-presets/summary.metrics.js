// 성능 요약 metric 계산 — 순수 함수 (F68F701A7A-113)
//
// planner frozen contract(docs/plans/perf-summary-F68F701A7A-111.md §9) 준수.
// - DOM 없이 경과시간(ms)·동시성1 대비 배수(speedup)를 계산한다.
// - p-limit 공개 API(index.js, index.d.ts)를 변경하지 않고, 신규 의존성·네트워크
//   호출을 추가하지 않는다.
// - 브라우저(summary.js)와 node 단위 테스트가 동일하게 import 하는 DOM-free 모듈.

/** 요약 카드가 대응하는 동시성 프리셋(§4·§9). 다른 값 금지. */
export const SUMMARY_CONCURRENCIES = Object.freeze([1, 2, 4]);

/**
 * 동시성1 대비 배수를 계산하는 순수 함수(§9·§12).
 * `baseMs / elapsedMs`. 0 나눗셈·비정상 값(NaN/음수/0)은 배수 1로 방어한다.
 * @param {number} baseMs 동시성1 경과시간(ms)
 * @param {number} elapsedMs 대상 프리셋 경과시간(ms)
 * @returns {number} 배수(실제 계측값 — 1 이상을 보장하지 않음)
 */
export function computeSpeedup(baseMs, elapsedMs) {
	if (!Number.isFinite(baseMs) || !Number.isFinite(elapsedMs) || baseMs <= 0 || elapsedMs <= 0) {
		return 1;
	}

	return baseMs / elapsedMs;
}

/**
 * 프리셋별 경과시간(ms)으로부터 §9 metric 데이터 구조를 만드는 순수 함수.
 * 동시성1은 배수 1로 고정하고, 동시성2·4는 동시성1 경과시간 대비 배수를 산출한다.
 * @param {{1: number, 2: number, 4: number}} elapsedByConcurrency 동시성 → 경과시간(ms)
 * @returns {{c1: object, c2: object, c4: object}} §9 계약 구조
 */
export function buildMetrics(elapsedByConcurrency) {
	const baseMs = elapsedByConcurrency[1];

	const entry = concurrency => {
		const elapsedMs = elapsedByConcurrency[concurrency];
		return {
			concurrency,
			elapsedMs,
			speedup: concurrency === 1 ? 1 : computeSpeedup(baseMs, elapsedMs),
		};
	};

	return {
		c1: entry(1),
		c2: entry(2),
		c4: entry(4),
	};
}

/**
 * 경과시간(ms)을 카드 표기 문자열로 변환하는 순수 함수(§9).
 * 정수 ms 뒤에 "ms"를 붙인다. 비정상 값은 placeholder("—").
 * @param {number} elapsedMs
 * @returns {string} 예: "1860ms"
 */
export function formatElapsed(elapsedMs) {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
		return '—';
	}

	return `${Math.round(elapsedMs)}ms`;
}

/**
 * 배수를 카드 표기 문자열로 변환하는 순수 함수(§9).
 * 소수 둘째 자리 + "×"(예: "1.00×", "1.87×"). 비정상 값은 "1.00×".
 * @param {number} speedup
 * @returns {string}
 */
export function formatSpeedup(speedup) {
	if (!Number.isFinite(speedup) || speedup <= 0) {
		return '1.00×';
	}

	return `${speedup.toFixed(2)}×`;
}
