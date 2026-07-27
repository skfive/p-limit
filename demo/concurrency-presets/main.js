// 동시성 프리셋 비교 데모 — 로직 (F68F701A7A-47)
//
// planner frozen contract(docs/plans/concurrency-presets-plan.md §5·§9) 준수.
// - p-limit 공개 API(`pLimit(n)`, 반환된 `limit()`)만 소비한다(§2 non-goals).
// - 결정론적 로컬 fixture(고정 항목·고정 지연)로 동시성 1·2·4를 동일 입력으로 실행.
// - 상태 전이는 순수 함수(리듀서)로 분리해 DOM 없이 단위 테스트 가능(§5.2·§11).
// - p-limit 코어(../../index.js)는 실행 시점에 동적 import 하므로 리듀서만 검증하는
//   node 테스트는 yocto-queue 의존 없이 이 모듈을 그대로 import 할 수 있다.

/** 개별 항목 상태 값(§5.2). 다른 값 금지. */
export const ITEM_STATE = Object.freeze({
	WAITING: 'waiting',
	RUNNING: 'running',
	COMPLETE: 'complete',
});

/**
 * 항목 상태별 텍스트 배지 라벨(designer 계약 §5.5). 색상 단독 의존을 피하고
 * WCAG 1.4.1 을 충족하기 위해 각 항목에 상태 텍스트("대기/실행/완료")를 병기한다.
 */
export const STATE_LABEL = Object.freeze({
	[ITEM_STATE.WAITING]: '대기',
	[ITEM_STATE.RUNNING]: '실행',
	[ITEM_STATE.COMPLETE]: '완료',
});

/**
 * 항목 상태 → 배지 라벨 텍스트를 돌려주는 순수 함수(§5.5). 미지의 값은 빈 문자열.
 * @param {string} state `ITEM_STATE` 값
 * @returns {string}
 */
export function stateLabel(state) {
	return STATE_LABEL[state] ?? '';
}

/** 패널 전체 상태 값(§5.1). 다른 값 금지. */
export const PANEL_STATE = Object.freeze({
	IDLE: 'idle',
	RUNNING: 'running',
	COMPLETE: 'complete',
});

/** 동시성 프리셋(§5.2). 세 프리셋에 동일 입력을 준다. */
export const PRESET_CONCURRENCIES = Object.freeze([1, 2, 4]);

/**
 * 결정론적 로컬 fixture(§2·§12). 고정 항목 수·고정 지연 배열.
 * 오프라인에서도 항상 동일하게 동작하며 세 프리셋 모두 이 입력을 공유한다.
 */
export const FIXTURE = Object.freeze([
	Object.freeze({id: 'task-1', label: '작업 1', delay: 320}),
	Object.freeze({id: 'task-2', label: '작업 2', delay: 200}),
	Object.freeze({id: 'task-3', label: '작업 3', delay: 420}),
	Object.freeze({id: 'task-4', label: '작업 4', delay: 260}),
	Object.freeze({id: 'task-5', label: '작업 5', delay: 360}),
	Object.freeze({id: 'task-6', label: '작업 6', delay: 300}),
]);

/**
 * fixture로부터 초기 항목 목록을 만든다(모두 `waiting`).
 * @param {ReadonlyArray<{id: string, label: string, delay: number}>} fixture
 * @returns {Array<{id: string, label: string, delay: number, state: string}>}
 */
export function createItems(fixture = FIXTURE) {
	return fixture.map(item => ({
		id: item.id,
		label: item.label,
		delay: item.delay,
		state: ITEM_STATE.WAITING,
	}));
}

/**
 * 순수 상태 전이 리듀서(§5.2·§11). 원본 배열을 변경하지 않고 새 배열을 반환한다.
 * @param {ReadonlyArray<{id: string, state: string}>} items
 * @param {string} id 전이 대상 항목 id
 * @param {string} nextState `ITEM_STATE` 값
 * @returns {Array<object>} 갱신된 새 배열
 */
export function applyTransition(items, id, nextState) {
	return items.map(item => (item.id === id ? {...item, state: nextState} : item));
}

/**
 * 여러 프리셋의 항목 목록으로부터 패널 전체 상태를 도출하는 순수 함수(§5.1·§10).
 * @param {ReadonlyArray<ReadonlyArray<{state: string}>>} presets 프리셋별 항목 목록
 * @returns {string} `PANEL_STATE` 값
 */
export function computePanelState(presets) {
	const allItems = presets.flat();

	// 빈 fixture: 실행할 항목이 없으므로 complete로 본다(§10).
	if (allItems.length === 0) {
		return PANEL_STATE.COMPLETE;
	}

	if (allItems.every(item => item.state === ITEM_STATE.COMPLETE)) {
		return PANEL_STATE.COMPLETE;
	}

	// 하나라도 진행(실행/완료)됐지만 전부 완료는 아님 → running.
	if (allItems.some(item => item.state === ITEM_STATE.RUNNING || item.state === ITEM_STATE.COMPLETE)) {
		return PANEL_STATE.RUNNING;
	}

	// 모두 대기 → idle(초기/초기화 직후).
	return PANEL_STATE.IDLE;
}

/**
 * aria-live 요약 문구를 만드는 순수 함수(§8.1). 시각 타임라인을 그대로 낭독하지 않고
 * 프리셋별 대기/실행/완료 개수를 텍스트로 요약한다.
 * @param {ReadonlyArray<{concurrency: number, items: ReadonlyArray<{state: string}>}>} presets
 * @param {string} panelState `PANEL_STATE` 값
 * @returns {string}
 */
export function describeProgress(presets, panelState) {
	if (panelState === PANEL_STATE.IDLE) {
		return '실행 준비됨. 실행 버튼을 누르세요.';
	}

	if (panelState === PANEL_STATE.COMPLETE) {
		return '모든 프리셋 실행이 완료되었습니다.';
	}

	const parts = presets.map(preset => {
		const complete = preset.items.filter(item => item.state === ITEM_STATE.COMPLETE).length;
		const running = preset.items.filter(item => item.state === ITEM_STATE.RUNNING).length;
		const waiting = preset.items.filter(item => item.state === ITEM_STATE.WAITING).length;
		return `동시성 ${preset.concurrency}: 완료 ${complete}, 실행 ${running}, 대기 ${waiting}`;
	});

	return `실행 중 — ${parts.join(' / ')}`;
}

// ---------------------------------------------------------------------------
// 아래부터는 브라우저 DOM 바인딩. node에서 이 모듈을 import 해 리듀서만
// 테스트할 때는 `document`가 없으므로 실행되지 않는다(§11 DOM 없는 단위 테스트).
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap, {once: true});
	} else {
		bootstrap();
	}
}

function bootstrap() {
	const root = document.getElementById('concurrency-presets-root');
	const runButton = document.getElementById('preset-run');
	const resetButton = document.getElementById('preset-reset');
	const statusRegion = document.querySelector('.concurrency-presets__status');
	const timelines = new Map(
		PRESET_CONCURRENCIES.map(concurrency => [concurrency, document.getElementById(`timeline-preset-${concurrency}`)]),
	);

	if (!root || !runButton || !resetButton) {
		return;
	}

	// 프리셋별 상태: {concurrency, items}. items는 순수 리듀서로만 갱신한다.
	let presets = [];
	let isRunning = false;
	let runToken = 0;

	function render() {
		for (const preset of presets) {
			const container = timelines.get(preset.concurrency);
			if (!container) {
				continue;
			}

			for (const item of preset.items) {
				const element = container.querySelector(`[data-item-id="${item.id}"]`);
				if (element) {
					element.className = `concurrency-presets__item concurrency-presets__item--${item.state}`;
					// 상태 텍스트 배지도 함께 갱신(§5.5 — 색상 단독 의존 금지).
					const tag = element.querySelector('.state-tag');
					if (tag) {
						tag.textContent = stateLabel(item.state);
					}
				}
			}
		}

		const panelState = computePanelState(presets.map(preset => preset.items));
		root.dataset.state = panelState;

		if (statusRegion) {
			statusRegion.textContent = describeProgress(presets, panelState);
		}

		return panelState;
	}

	function buildTimelines() {
		presets = PRESET_CONCURRENCIES.map(concurrency => ({concurrency, items: createItems()}));

		for (const preset of presets) {
			const container = timelines.get(preset.concurrency);
			if (!container) {
				continue;
			}

			container.replaceChildren(
				...preset.items.map(item => {
					const element = document.createElement('li');
					element.dataset.itemId = item.id;
					element.className = `concurrency-presets__item concurrency-presets__item--${item.state}`;

					// 항목 라벨.
					const label = document.createElement('span');
					label.className = 'concurrency-presets__label';
					label.textContent = `${item.label} (${item.delay}ms)`;

					// 상태 텍스트 배지(§5.5 — 색상 단독 의존 금지, WCAG 1.4.1).
					// aria-live 요약 region 과 중복 낭독을 피하려 aria-hidden 처리(§5.3).
					const tag = document.createElement('span');
					tag.className = 'state-tag';
					tag.setAttribute('aria-hidden', 'true');
					tag.textContent = stateLabel(item.state);

					element.append(label, tag);
					return element;
				}),
			);
		}
	}

	function setItemState(concurrency, id, nextState) {
		presets = presets.map(preset =>
			(preset.concurrency === concurrency
				? {concurrency, items: applyTransition(preset.items, id, nextState)}
				: preset),
		);
	}

	function reset() {
		runToken += 1; // 진행 중이던 렌더 콜백을 무효화(§9.5: 다음 실행 기준 재설정).
		isRunning = false;
		// 실행 중 초기화 시 in-flight run()의 완료 분기(token===runToken)가 다시
		// 실행되지 않으므로, 여기서 실행 버튼을 직접 되살려 영구 비활성화를 막는다.
		runButton.disabled = false;
		buildTimelines();
		render();
	}

	async function run() {
		if (isRunning) {
			return; // 연타 시 중복 실행 방지(§10).
		}

		isRunning = true;
		runButton.disabled = true;
		const token = ++runToken;

		// p-limit 코어는 실행 시점에만 로드(브라우저는 import map으로 yocto-queue 해소).
		const {default: pLimit} = await import('../../index.js');

		const delay = ms => new Promise(resolve => {
			setTimeout(resolve, ms);
		});

		const runPreset = preset => {
			const limit = pLimit(preset.concurrency);
			return Promise.all(
				preset.items.map(item =>
					limit(async () => {
						if (token !== runToken) {
							return;
						}

						setItemState(preset.concurrency, item.id, ITEM_STATE.RUNNING);
						render();

						await delay(item.delay);

						if (token !== runToken) {
							return;
						}

						setItemState(preset.concurrency, item.id, ITEM_STATE.COMPLETE);
						render();
					}),
				),
			);
		};

		render();
		await Promise.all(presets.map(preset => runPreset(preset)));

		if (token === runToken) {
			isRunning = false;
			runButton.disabled = false;
			render();
		}
	}

	runButton.addEventListener('click', run);
	resetButton.addEventListener('click', reset);

	reset();
}
