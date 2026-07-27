// 동시성 프리셋 비교 UI 런타임 (F68F701A7A-71)
// planner 실행 계약(docs/plans/implementation-plan.md §3~§5)을 그대로 구현한다.
// 라이브러리 공개 표면(pLimit, limit(...), activeCount, pendingCount)만 소비하는 additive 소비자.
import pLimit from '../index.js';

// §3 프리셋 정의 (frozen): 느림=1 / 균형=2 / 빠름=4
export const PRESETS = {
	slow: {id: 'preset-slow', concurrency: 1, label: '느림 (동시 1)'},
	balanced: {id: 'preset-balanced', concurrency: 2, label: '균형 (동시 2)'},
	fast: {id: 'preset-fast', concurrency: 4, label: '빠름 (동시 4)'},
};

// §5.3 상태 모델 (exact): idle / running / complete / error
// 색상만이 아니라 상태명을 화면 텍스트로 반드시 노출한다.
export const STATUS = {
	idle: {name: '대기 중', desc: '프리셋을 선택하고 실행하세요'},
	running: {name: '실행 중', desc: '태스크를 처리하고 있습니다'},
	complete: {name: '완료', desc: '모든 태스크가 끝났습니다'},
	error: {name: '오류', desc: '실행 중 문제가 발생했습니다'},
};

// 프리셋 간 동일 배치로 비교 가능하도록 배치 크기·지연을 고정한다(§4).
const BATCH_SIZE = 8;
const TASK_DELAY_MS = 260;

function now() {
	return (typeof performance !== 'undefined' && typeof performance.now === 'function')
		? performance.now()
		: Date.now();
}

function delay(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

/**
 * §4 p-limit 실행 연결: 선택 프리셋의 concurrency로 pLimit 인스턴스를 만들어
 * 동일 배치를 스케줄하고, activeCount/pendingCount를 onProgress로 통지한다.
 * DOM과 분리된 순수 오케스트레이션이라 헤드리스로 검증 가능하다.
 */
export async function runPreset({concurrency, batchSize = BATCH_SIZE, makeTask, onProgress}) {
	const limit = pLimit(concurrency);
	let maxActive = 0;

	const report = () => {
		if (limit.activeCount > maxActive) {
			maxActive = limit.activeCount;
		}

		if (typeof onProgress === 'function') {
			onProgress({active: limit.activeCount, pending: limit.pendingCount});
		}
	};

	const start = now();
	const tasks = Array.from({length: batchSize}, (_, index) => limit(async () => {
		report();
		const result = await makeTask(index);
		report();
		return result;
	}));

	// 스케줄 직후: 한도를 초과한 태스크는 pending으로 쌓인다.
	report();
	const results = await Promise.all(tasks);
	// 배치 완료: active/pending은 0/0으로 수렴한다.
	report();

	return {maxActive, elapsedMs: now() - start, results};
}

/**
 * §5 UI 계약(DOM/상태/token) 배선. 주어진 document에 대해 이벤트 핸들러를 연결한다.
 * 테스트·재사용을 위해 controller를 반환한다.
 */
export function initPresetLab(doc = globalThis.document) {
	if (!doc) {
		throw new Error('initPresetLab: document가 필요합니다');
	}

	const presetEls = {
		slow: doc.getElementById(PRESETS.slow.id),
		balanced: doc.getElementById(PRESETS.balanced.id),
		fast: doc.getElementById(PRESETS.fast.id),
	};
	const runBtn = doc.getElementById('preset-run');
	const activeEl = doc.getElementById('active-count');
	const pendingEl = doc.getElementById('pending-count');
	const statusEl = doc.getElementById('status-message');
	const resultTable = doc.getElementById('result-table');
	const resultBody = resultTable ? resultTable.querySelector('tbody') : null;

	let selectedKey = null;
	let currentState = 'idle';

	function setCounters(active, pending) {
		activeEl.textContent = String(active);
		pendingEl.textContent = String(pending);
	}

	function resetCounters() {
		setCounters(0, 0);
	}

	function setState(state, extraText) {
		currentState = state;
		const info = STATUS[state];
		statusEl.dataset.state = state;
		statusEl.textContent = extraText
			? `상태: ${info.name} — ${extraText}`
			: `상태: ${info.name} — ${info.desc}`;
		// §5.3 후조건: running 동안만 실행 control 비활성, 그 외에는 재사용 가능.
		runBtn.disabled = state === 'running';
	}

	function selectPreset(key) {
		selectedKey = key;
		for (const [presetKey, preset] of Object.entries(PRESETS)) {
			const el = presetEls[presetKey];
			const isActive = presetKey === key;
			el.classList.toggle('preset-lab__preset--active', isActive);
			el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
		}
	}

	function addResultRow(label, maxActive, elapsedMs) {
		if (!resultBody) {
			return;
		}

		const row = doc.createElement('tr');
		const cells = [label, String(maxActive), String(elapsedMs)];
		for (const value of cells) {
			const cell = doc.createElement('td');
			cell.textContent = value;
			row.append(cell);
		}

		resultBody.append(row);
	}

	async function handleRun() {
		// E2: running 중 재클릭 무시(중복 실행 방지).
		if (currentState === 'running') {
			return;
		}

		// E1: 프리셋 미선택 시 error로 빠지지 않고 화면 텍스트로 안내한다.
		if (!selectedKey) {
			setState('idle', '프리셋을 먼저 선택하세요');
			return;
		}

		const preset = PRESETS[selectedKey];
		setState('running');
		resetCounters();

		try {
			const {maxActive, elapsedMs} = await runPreset({
				concurrency: preset.concurrency,
				makeTask: () => delay(TASK_DELAY_MS),
				onProgress: ({active, pending}) => setCounters(active, pending),
			});
			// §5.3 complete: 최종 카운터 0/0, 결과 표 채움.
			setCounters(0, 0);
			addResultRow(preset.label, maxActive, Math.round(elapsedMs));
			setState('complete');
		} catch {
			// E3: 태스크 reject → error 진입, 카운터 초기화, 실행 control 재사용 가능.
			resetCounters();
			setState('error');
		}
	}

	for (const [key, el] of Object.entries(presetEls)) {
		el.addEventListener('click', () => selectPreset(key));
	}

	runBtn.addEventListener('click', handleRun);

	// 초기 상태(idle): 카운터 0/0, 대기 텍스트, 실행 control 사용 가능.
	resetCounters();
	setState('idle');

	return {selectPreset, run: handleRun, getState: () => currentState};
}

// 브라우저에서만 자동 초기화한다. node import(테스트/스모크)에서는 건너뛴다.
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		initPresetLab(document);
	});
}
