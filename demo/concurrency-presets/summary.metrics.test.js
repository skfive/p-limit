// 성능 요약 UI — 정적 마크업 계약 + metric 포맷 계약 focused 회귀 가드 (F68F701A7A-116)
//
// planner frozen contract(docs/plans/perf-summary-F68F701A7A-111.md §4·§6·§7·§9) 준수.
// DOM/브라우저 없이 파일 내용(fs.readFileSync)만으로 검증한다 — E2E 아님.
//
// 범위 안내: computeSpeedup/buildMetrics/formatElapsed/formatSpeedup 의 "숫자 결과
// 정확성"은 developer 가 이미 test/demo-perf-summary.test.js(ava) 에서 focused 로
// 검증했으므로 여기서는 재작성하지 않는다(중복 금지). 이 파일은 tester 고유 영역인
// (1) index.html/summary.css 의 frozen id·class·design token 존재,
// (2) SUMMARY_CONCURRENCIES(§4 카드 id) ↔ 정적 마크업 간 정합성,
// (3) formatElapsed/formatSpeedup 의 표기 "형식" 계약(정확한 값이 아니라 패턴)
// 만 다룬다.

import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {SUMMARY_CONCURRENCIES, formatElapsed, formatSpeedup} from './summary.metrics.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dirname, 'summary.css'), 'utf8');

// --- §4.1 DOM ID 계약(동결) ---------------------------------------------

test('§4.1 — index.html 에 frozen 요약 region/카드 id 가 존재한다', t => {
	for (const id of ['perf-summary', 'perf-summary-status', 'perf-summary-cards', 'perf-card-c1', 'perf-card-c2', 'perf-card-c4']) {
		t.true(html.includes(`id="${id}"`), `id="${id}" 누락`);
	}
});

// --- §4.2 CSS class 계약(동결) -------------------------------------------

test('§4.2 — index.html 마크업에 frozen class 가 존재한다', t => {
	for (const className of ['perf-summary', 'perf-summary__status', 'perf-summary__cards', 'perf-card', 'perf-card__label', 'perf-card__time', 'perf-card__speedup']) {
		t.true(html.includes(className), `class "${className}" 누락(html)`);
	}
});

test('§4.2 — summary.css 에 frozen class selector 가 존재한다', t => {
	for (const selector of ['.perf-summary', '.perf-summary__status', '.perf-summary__cards', '.perf-card', '.perf-card__label', '.perf-card__time', '.perf-card__speedup']) {
		t.true(css.includes(selector), `selector "${selector}" 누락(css)`);
	}
});

// --- §6 Design token 계약(동결 · exact value) -----------------------------

test('§6 — summary.css 의 design token 이 exact value 로 정의되어 있다', t => {
	const tokens = {
		'--perf-summary-gap': '12px',
		'--perf-card-bg': '#f8fafc',
		'--perf-card-accent': '#2563eb',
		'--perf-card-radius': '8px',
		'--perf-card-text': '#0f172a',
	};

	for (const [token, value] of Object.entries(tokens)) {
		t.true(css.includes(`${token}: ${value};`), `${token}: ${value}; 누락 또는 값 변경`);
	}
});

// --- §7 접근성 계약(동결) --------------------------------------------------

test('§7 — perf-summary region 이 aria-live="polite" 를 유지한다', t => {
	const sectionMatch = /<section id="perf-summary"[^>]*>/.exec(html);
	t.truthy(sectionMatch, '#perf-summary section 태그를 찾을 수 없음');
	t.true(sectionMatch[0].includes('aria-live="polite"'));
});

// --- SUMMARY_CONCURRENCIES(§4 카드 id) ↔ 정적 마크업 정합성 ----------------

test('SUMMARY_CONCURRENCIES 의 각 동시성 값에 대응하는 카드 id 가 마크업에 존재한다', t => {
	for (const concurrency of SUMMARY_CONCURRENCIES) {
		t.true(html.includes(`id="perf-card-c${concurrency}"`), `perf-card-c${concurrency} 누락 — summary.metrics.js 와 index.html 불일치`);
	}
});

// --- §9 표기 "형식" 계약(값이 아니라 패턴 — 숫자 정확성은 dev ava 테스트 담당) ---

test('§9 — formatElapsed 는 "<정수>ms" 형식을 따른다', t => {
	t.regex(formatElapsed(1234.5), /^\d+ms$/);
	t.is(formatElapsed(Number.NaN), '—');
});

test('§9 — formatSpeedup 는 "<소수 둘째자리>×" 형식을 따른다', t => {
	t.regex(formatSpeedup(1.874), /^\d+\.\d{2}×$/);
	t.is(formatSpeedup(0), '1.00×');
});
