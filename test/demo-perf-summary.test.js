// 성능 요약 metric 순수 함수 focused test (F68F701A7A-113)
//
// DOM 없이 summary.metrics.js 의 경과시간·배수 계산과 표기 포맷을 검증한다(§9·§12).
// summary.js 의 순수 export(상태명 텍스트)도 함께 검증한다 — document 가 없으므로
// 브라우저 bootstrap 은 실행되지 않는다.

import test from 'ava';
import {
	SUMMARY_CONCURRENCIES,
	computeSpeedup,
	buildMetrics,
	formatElapsed,
	formatSpeedup,
} from '../demo/concurrency-presets/summary.metrics.js';
import {SUMMARY_STATE, summaryStatusText} from '../demo/concurrency-presets/summary.js';

test('SUMMARY_CONCURRENCIES 는 동결된 [1, 2, 4]', t => {
	t.deepEqual([...SUMMARY_CONCURRENCIES], [1, 2, 4]);
	t.true(Object.isFrozen(SUMMARY_CONCURRENCIES));
});

test('computeSpeedup 는 base/elapsed 를 계산한다', t => {
	t.is(computeSpeedup(1000, 500), 2);
	t.is(computeSpeedup(1860, 620), 3);
	t.is(computeSpeedup(1000, 1000), 1);
});

test('computeSpeedup 는 0 나눗셈·비정상 값을 배수 1 로 방어한다(§12)', t => {
	t.is(computeSpeedup(0, 500), 1);
	t.is(computeSpeedup(1000, 0), 1);
	t.is(computeSpeedup(-5, 500), 1);
	t.is(computeSpeedup(1000, -5), 1);
	t.is(computeSpeedup(Number.NaN, 500), 1);
	t.is(computeSpeedup(1000, Number.NaN), 1);
});

test('buildMetrics 는 §9 계약 구조를 산출하고 동시성1 배수는 1', t => {
	const metrics = buildMetrics({1: 1800, 2: 1000, 4: 600});

	t.deepEqual(metrics.c1, {concurrency: 1, elapsedMs: 1800, speedup: 1});
	t.is(metrics.c2.concurrency, 2);
	t.is(metrics.c2.elapsedMs, 1000);
	t.is(metrics.c2.speedup, 1.8);
	t.is(metrics.c4.concurrency, 4);
	t.is(metrics.c4.elapsedMs, 600);
	t.is(metrics.c4.speedup, 3);
});

test('buildMetrics 는 동시성1 경과시간 0 에서도 배수를 방어한다(§12)', t => {
	const metrics = buildMetrics({1: 0, 2: 0, 4: 0});

	t.is(metrics.c1.speedup, 1);
	t.is(metrics.c2.speedup, 1);
	t.is(metrics.c4.speedup, 1);
});

test('formatElapsed 는 정수 ms 문자열을 만든다', t => {
	t.is(formatElapsed(1860), '1860ms');
	t.is(formatElapsed(620.7), '621ms');
	t.is(formatElapsed(0), '0ms');
});

test('formatElapsed 는 비정상 값을 placeholder 로', t => {
	t.is(formatElapsed(Number.NaN), '—');
	t.is(formatElapsed(-1), '—');
});

test('formatSpeedup 는 소수 둘째 자리 × 형식', t => {
	t.is(formatSpeedup(1), '1.00×');
	t.is(formatSpeedup(1.874), '1.87×');
	t.is(formatSpeedup(3), '3.00×');
});

test('formatSpeedup 는 비정상 값을 1.00× 로', t => {
	t.is(formatSpeedup(Number.NaN), '1.00×');
	t.is(formatSpeedup(0), '1.00×');
	t.is(formatSpeedup(-2), '1.00×');
});

test('summaryStatusText 는 상태명을 화면 텍스트로 노출한다(§5·§7)', t => {
	t.true(summaryStatusText(SUMMARY_STATE.IDLE).startsWith('대기'));
	t.true(summaryStatusText(SUMMARY_STATE.RUNNING).startsWith('실행 중'));
	t.true(summaryStatusText(SUMMARY_STATE.COMPLETE).startsWith('완료'));
	t.true(summaryStatusText(SUMMARY_STATE.CLEARED).startsWith('초기화됨'));
	t.is(summaryStatusText('unknown'), '');
});
