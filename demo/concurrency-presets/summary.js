// 성능 요약 UI — 렌더링·상태 전이 (F68F701A7A-113)
//
// planner frozen contract(docs/plans/perf-summary-F68F701A7A-111.md §4·§5·§7) 준수.
// - 기존 실행 데모(main.js)를 변경하지 않고 additive 로만 얹는다. main.js 는 이벤트나
//   전역을 노출하지 않으므로, 이 모듈은 기존 DOM(#concurrency-presets-root 의 항목
//   상태 class)을 MutationObserver 로 관찰해 실행 시작·프리셋별 완료·초기화를 감지한다.
// - 순수 계산(경과시간·배수)은 summary.metrics.js 에 위임한다(DOM-free·단위 테스트).
// - 신규 의존성·네트워크 호출을 추가하지 않는다.

import {SUMMARY_CONCURRENCIES, buildMetrics, formatElapsed, formatSpeedup} from './summary.metrics.js';

/** 요약 UI 상태(§5). 다른 값 금지. */
export const SUMMARY_STATE = Object.freeze({
	IDLE: 'idle',
	RUNNING: 'running',
	COMPLETE: 'complete',
	CLEARED: 'cleared',
});

/**
 * 상태명을 화면 텍스트로 노출한다(§5·§7 — 색상 단독 의존 금지, 접근성 이름 제공).
 * 각 문구는 상태명을 접두로 두어 스크린리더에서도 상태를 명확히 알린다.
 */
export const SUMMARY_STATUS_TEXT = Object.freeze({
	[SUMMARY_STATE.IDLE]: '대기 — 실행 버튼으로 동시성 1·2·4 성능을 비교하세요.',
	[SUMMARY_STATE.RUNNING]: '실행 중 — 동시성 1·2·4 프리셋을 계측하고 있습니다.',
	[SUMMARY_STATE.COMPLETE]: '완료 — 동시성 1·2·4 경과시간과 동시성1 대비 배수입니다.',
	[SUMMARY_STATE.CLEARED]: '초기화됨 — 요약이 제거되었습니다. 다시 실행할 수 있습니다.',
});

/** 카드 값이 비어 있을 때의 placeholder 텍스트(§5 idle/running/cleared). */
export const SUMMARY_PLACEHOLDER = '—';

/**
 * 상태명 텍스트를 돌려주는 순수 함수. 미지의 값은 빈 문자열.
 * @param {string} state `SUMMARY_STATE` 값
 * @returns {string}
 */
export function summaryStatusText(state) {
	return SUMMARY_STATUS_TEXT[state] ?? '';
}

// ---------------------------------------------------------------------------
// 아래부터는 브라우저 DOM 바인딩. node 에서 이 모듈을 import 할 때는 `document`가
// 없으므로 실행되지 않는다(순수 export 만 테스트 가능).
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap, {once: true});
	} else {
		bootstrap();
	}
}

function bootstrap() {
	const region = document.getElementById('perf-summary');
	const statusEl = document.getElementById('perf-summary-status');
	const runButton = document.getElementById('preset-run');
	const resetButton = document.getElementById('preset-reset');
	const observed = document.getElementById('concurrency-presets-root');

	if (!region || !statusEl || !observed) {
		return; // 계약 마크업이 없으면 아무것도 하지 않는다(비침습).
	}

	const cards = new Map(
		SUMMARY_CONCURRENCIES.map(concurrency => [concurrency, document.getElementById(`perf-card-c${concurrency}`)]),
	);

	// 현재 실행 사이클의 계측 상태.
	let state = SUMMARY_STATE.IDLE;
	let runStart = null; // 첫 running 항목을 관찰한 시각(import 대기시간 제외).
	const ranItems = new Map(); // concurrency → 이번 사이클에 running 을 거친 항목 id 집합.
	const elapsed = new Map(); // concurrency → 경과시간(ms).

	function now() {
		return (typeof performance === 'undefined') ? Date.now() : performance.now();
	}

	function setCard(concurrency, timeText, speedupText) {
		const card = cards.get(concurrency);
		if (!card) {
			return;
		}

		const timeEl = card.querySelector('.perf-card__time');
		const speedupEl = card.querySelector('.perf-card__speedup');
		if (timeEl) {
			timeEl.textContent = timeText;
		}

		if (speedupEl) {
			speedupEl.textContent = speedupText;
		}
	}

	function clearCards() {
		for (const concurrency of SUMMARY_CONCURRENCIES) {
			setCard(concurrency, SUMMARY_PLACEHOLDER, SUMMARY_PLACEHOLDER);
		}
	}

	function renderCards(metrics) {
		for (const concurrency of SUMMARY_CONCURRENCIES) {
			const entry = metrics[`c${concurrency}`];
			setCard(concurrency, formatElapsed(entry.elapsedMs), formatSpeedup(entry.speedup));
		}
	}

	function render() {
		region.dataset.state = state;
		statusEl.textContent = summaryStatusText(state);
	}

	function resetCycle() {
		runStart = null;
		ranItems.clear();
		elapsed.clear();
	}

	function startRun() {
		state = SUMMARY_STATE.RUNNING;
		resetCycle();
		clearCards();
		render();
	}

	function clearSummary() {
		state = SUMMARY_STATE.CLEARED;
		resetCycle();
		clearCards();
		render();
		// 실행 control 재활성화는 기존 main.js 의 reset() 이 담당한다(additive 유지).
	}

	function finishRun() {
		const metrics = buildMetrics({
			1: elapsed.get(1),
			2: elapsed.get(2),
			4: elapsed.get(4),
		});
		state = SUMMARY_STATE.COMPLETE;
		renderCards(metrics);
		render(); // aria-live="polite" region 이 완료를 스크린리더에 알린다(§7).
	}

	// 한 프리셋(#timeline-preset-N)의 항목 상태를 관찰해 계측한다.
	//
	// 재실행 시 이전 실행의 complete class 가 아직 남아 있는 항목 때문에 프리셋이 잠깐
	// "전부 complete"로 오판될 수 있다. 이를 막기 위해 프리셋 단위가 아니라 **항목 id
	// 단위**로 "이번 사이클에 running 을 거쳤는가"를 추적하고, 현재 complete 인 모든
	// 항목이 이번 사이클에 실제로 running 을 거친 경우에만 완료로 인정한다.
	function measurePreset(concurrency) {
		const container = document.getElementById(`timeline-preset-${concurrency}`);
		if (!container) {
			return;
		}

		const items = [...container.querySelectorAll('.concurrency-presets__item')];
		let ran = ranItems.get(concurrency);
		if (!ran) {
			ran = new Set();
			ranItems.set(concurrency, ran);
		}

		for (const item of items) {
			if (item.classList.contains('concurrency-presets__item--running')) {
				ran.add(item.dataset.itemId);
				if (runStart === null) {
					runStart = now();
				}
			}
		}

		if (runStart === null || elapsed.has(concurrency) || items.length === 0) {
			return;
		}

		const allComplete = items.every(item => item.classList.contains('concurrency-presets__item--complete'));
		const allRanThisCycle = items.every(item => ran.has(item.dataset.itemId));
		if (allComplete && allRanThisCycle) {
			elapsed.set(concurrency, now() - runStart);
		}
	}

	function measure() {
		if (state !== SUMMARY_STATE.RUNNING) {
			return;
		}

		for (const concurrency of SUMMARY_CONCURRENCIES) {
			measurePreset(concurrency);
		}

		if (SUMMARY_CONCURRENCIES.every(concurrency => elapsed.has(concurrency))) {
			finishRun();
		}
	}

	// 실행/초기화 control 은 main.js 와 공유. 여기서는 추가 리스너로 요약 상태만 전이한다.
	runButton?.addEventListener('click', startRun);
	resetButton?.addEventListener('click', clearSummary);

	const observer = new MutationObserver(measure);
	observer.observe(observed, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['class'],
	});

	// 초기 렌더(idle) — 로드 직후 상태명·placeholder 노출(§5 idle).
	clearCards();
	render();
}
