// 배치 진행 데모 — 로직 (F68F701A7A-53)
//
// frozen UI 계약(ui-contract@v1)과 planner 설계
// (docs/plans/batch-progress-implementation-plan.md §3·§4·§5) 를 그대로 구현한다.
// - p-limit 공개 API(`pLimit(n)`, 반환된 `limit()`)만 소비한다(신규 런타임 의존성 없음).
// - 결정론적 로컬 fixture 로 동시성 제한(CONCURRENCY) 배치를 실행한다.
// - 상태 전이·진행률·복원은 순수 함수(리듀서)로 분리해 DOM 없이 단위 테스트 가능.
// - p-limit 코어(../index.js)는 실행 시점에 동적 import 하므로, 리듀서만 검증하는
//   node 테스트는 yocto-queue 의존 없이 이 모듈을 그대로 import 할 수 있다.

/** 개별 작업 상태 값(계약 §4). 다른 값 금지. */
export const TASK_STATE = Object.freeze({
	PENDING: 'pending',
	RUNNING: 'running',
	DONE: 'done',
	CANCELLED: 'cancelled',
	FAILED: 'failed',
});

/**
 * 작업 상태별 화면·접근성 텍스트(계약 §4). 색상 단독 의존을 피하고
 * WCAG 1.4.1 을 충족하기 위해 각 상태에 한글 상태명을 병기한다.
 */
export const STATE_LABEL = Object.freeze({
	[TASK_STATE.PENDING]: '대기',
	[TASK_STATE.RUNNING]: '실행',
	[TASK_STATE.DONE]: '완료',
	[TASK_STATE.CANCELLED]: '취소',
	[TASK_STATE.FAILED]: '실패',
});

/**
 * 작업 상태 → 한글 라벨 텍스트를 돌려주는 순수 함수. 미지의 값은 빈 문자열.
 * @param {string} state `TASK_STATE` 값
 * @returns {string}
 */
export function stateLabel(state) {
	return STATE_LABEL[state] ?? '';
}

/** 배치 전체 상태 값(§5). 다른 값 금지. */
export const BATCH_STATE = Object.freeze({
	IDLE: 'idle',
	RUNNING: 'running',
	DONE: 'done',
	CANCELLED: 'cancelled',
	FAILED: 'failed',
});

/** p-limit 동시성 제한. 이 값으로 샘플 작업을 실행한다. */
export const CONCURRENCY = 2;

/** 실패·취소 반영 후 초기값으로 복원하기까지의 reflect 지연(ms). */
export const RESTORE_DELAY = 1200;

/**
 * 결정론적 로컬 fixture. 고정 작업 수·고정 지연으로 항상 동일하게 동작한다.
 * `fail: true` 작업은 실패 상태를 시연하며, 그 뒤에 남는 작업들이 취소 상태로
 * 전이되는 것을 보여주기 위해 마지막 작업은 실패 작업이 아니다.
 */
export const FIXTURE = Object.freeze([
	Object.freeze({id: 'task-1', label: '작업 1', delay: 500}),
	Object.freeze({id: 'task-2', label: '작업 2', delay: 400}),
	Object.freeze({id: 'task-3', label: '작업 3', delay: 450}),
	Object.freeze({id: 'task-4', label: '작업 4', delay: 400, fail: true}),
	Object.freeze({id: 'task-5', label: '작업 5', delay: 500}),
	Object.freeze({id: 'task-6', label: '작업 6', delay: 450}),
]);

/**
 * fixture 로부터 초기 작업 목록을 만든다(모두 `pending`).
 * @param {ReadonlyArray<{id: string, label: string, delay: number, fail?: boolean}>} fixture
 * @returns {Array<{id: string, label: string, delay: number, fail: boolean, state: string}>}
 */
export function createTasks(fixture = FIXTURE) {
	return fixture.map(item => ({
		id: item.id,
		label: item.label,
		delay: item.delay,
		fail: item.fail === true,
		state: TASK_STATE.PENDING,
	}));
}

/**
 * 순수 상태 전이 리듀서. 원본 배열을 변경하지 않고 새 배열을 반환한다.
 * @param {ReadonlyArray<{id: string, state: string}>} tasks
 * @param {string} id 전이 대상 작업 id
 * @param {string} nextState `TASK_STATE` 값
 * @returns {Array<object>} 갱신된 새 배열
 */
export function applyTransition(tasks, id, nextState) {
	return tasks.map(task => (task.id === id ? {...task, state: nextState} : task));
}

/**
 * 실패 발생 시 아직 종료되지 않은(대기·실행) 작업을 취소로 전이하는 순수 함수.
 * 이미 완료·실패한 작업은 그대로 둔다(§5 — 실패 후 남은 작업은 취소로 표시).
 * @param {ReadonlyArray<{state: string}>} tasks
 * @returns {Array<object>} 갱신된 새 배열
 */
export function abortRemaining(tasks) {
	return tasks.map(task =>
		(task.state === TASK_STATE.PENDING || task.state === TASK_STATE.RUNNING
			? {...task, state: TASK_STATE.CANCELLED}
			: task),
	);
}

/**
 * 완료(done) 작업 비율을 정수 퍼센트로 계산하는 순수 함수(§5 진행률).
 * @param {ReadonlyArray<{state: string}>} tasks
 * @returns {{done: number, total: number, percent: number}}
 */
export function computeProgress(tasks) {
	const total = tasks.length;
	const done = tasks.filter(task => task.state === TASK_STATE.DONE).length;
	const percent = total === 0 ? 0 : Math.round((done / total) * 100);
	return {done, total, percent};
}

/**
 * 작업 목록으로부터 배치 전체 상태를 도출하는 순수 함수(§5).
 * @param {ReadonlyArray<{state: string}>} tasks
 * @returns {string} `BATCH_STATE` 값
 */
export function computeBatchState(tasks) {
	if (tasks.length === 0) {
		return BATCH_STATE.DONE;
	}

	if (tasks.every(task => task.state === TASK_STATE.PENDING)) {
		return BATCH_STATE.IDLE;
	}

	// 실패가 하나라도 있으면 배치는 실패로 중단된 것으로 본다(취소보다 우선).
	if (tasks.some(task => task.state === TASK_STATE.FAILED)) {
		return BATCH_STATE.FAILED;
	}

	if (tasks.every(task => task.state === TASK_STATE.DONE)) {
		return BATCH_STATE.DONE;
	}

	// 실패 없이 완료·취소만 남았다면 취소로 종료된 배치.
	if (tasks.every(task => task.state === TASK_STATE.DONE || task.state === TASK_STATE.CANCELLED)) {
		return BATCH_STATE.CANCELLED;
	}

	// 그 외(일부 실행/완료, 미종료 작업 존재) → 진행 중.
	return BATCH_STATE.RUNNING;
}

/**
 * aria-live 상태 영역에 표시할 한글 요약 문구를 만드는 순수 함수(§7 접근성).
 * 모든 배치 상태에서 한글 상태명을 텍스트로 노출한다.
 * @param {ReadonlyArray<{state: string}>} tasks
 * @returns {string}
 */
export function describeStatus(tasks) {
	const {done, total, percent} = computeProgress(tasks);
	const batchState = computeBatchState(tasks);

	switch (batchState) {
		case BATCH_STATE.IDLE: {
			return '대기 — 시작 버튼을 눌러 배치를 실행하세요.';
		}

		case BATCH_STATE.RUNNING: {
			return `실행 중 — 완료 ${done}/${total} (${percent}%)`;
		}

		case BATCH_STATE.DONE: {
			return `완료 — 전체 ${total}개 작업이 완료되었습니다.`;
		}

		case BATCH_STATE.FAILED: {
			return `실패 — 작업이 실패해 배치를 중단했습니다 (완료 ${done}/${total}).`;
		}

		case BATCH_STATE.CANCELLED: {
			return '취소 — 남은 작업을 취소하고 초기 상태로 되돌립니다.';
		}

		default: {
			return '';
		}
	}
}

// ---------------------------------------------------------------------------
// 아래부터는 브라우저 DOM 바인딩. node 에서 이 모듈을 import 해 리듀서만
// 테스트할 때는 `document` 가 없으므로 실행되지 않는다(DOM 없는 focused test).
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap, {once: true});
	} else {
		bootstrap();
	}
}

function bootstrap() {
	const root = document.getElementById('batch-progress-root');
	const startButton = document.getElementById('batch-progress-start');
	const resetButton = document.getElementById('batch-progress-reset');
	const statusRegion = document.getElementById('batch-progress-status');
	const bar = document.getElementById('batch-progress-bar');
	const percentLabel = document.getElementById('batch-progress-percent');
	const taskList = document.getElementById('batch-task-list');

	if (!root || !startButton || !resetButton || !bar || !taskList) {
		return;
	}

	const barFill = bar.querySelector('.batch-progress__bar-fill');

	let tasks = [];
	let isRunning = false;
	let runToken = 0;
	let restoreTimer = 0;

	function render() {
		for (const task of tasks) {
			const element = taskList.querySelector(`[data-task-id="${task.id}"]`);
			if (!element) {
				continue;
			}

			element.className = `batch-task batch-task--${task.state}`;
			const tag = element.querySelector('.batch-task__state');
			if (tag) {
				// 상태명을 화면 텍스트로 노출(§7 — 색상 단독 의존 금지, 접근성 이름).
				tag.textContent = stateLabel(task.state);
			}
		}

		const {percent} = computeProgress(tasks);
		if (barFill) {
			barFill.style.width = `${percent}%`;
		}

		bar.setAttribute('aria-valuenow', String(percent));
		if (percentLabel) {
			percentLabel.textContent = `${percent}%`;
		}

		root.dataset.state = computeBatchState(tasks);
		if (statusRegion) {
			statusRegion.textContent = describeStatus(tasks);
		}
	}

	function buildTaskList() {
		tasks = createTasks();
		taskList.replaceChildren(
			...tasks.map(task => {
				const element = document.createElement('li');
				element.dataset.taskId = task.id;
				element.className = `batch-task batch-task--${task.state}`;

				const label = document.createElement('span');
				label.className = 'batch-task__label';
				label.textContent = `${task.label} (${task.delay}ms)`;

				// 상태 텍스트(§7 — 색상 단독 의존 금지). 스크린리더도 상태명을 읽는다.
				const tag = document.createElement('span');
				tag.className = 'batch-task__state';
				tag.textContent = stateLabel(task.state);

				element.append(label, tag);
				return element;
			}),
		);
	}

	function setTaskState(id, nextState) {
		tasks = applyTransition(tasks, id, nextState);
	}

	function restore() {
		if (restoreTimer) {
			clearTimeout(restoreTimer);
			restoreTimer = 0;
		}

		runToken += 1; // 진행 중이던 콜백/예약된 복원을 무효화.
		isRunning = false;
		startButton.disabled = false; // 초기화 시 시작 버튼 즉시 재활성화(§5).
		buildTaskList();
		render();
	}

	function handleFailure(token, failedId) {
		// 실패 반영 → 남은 작업 취소 반영 → 시작 버튼 즉시 재활성화 → reflect 후 복원(§5).
		setTaskState(failedId, TASK_STATE.FAILED);
		tasks = abortRemaining(tasks);
		isRunning = false;
		startButton.disabled = false;
		render();

		restoreTimer = setTimeout(() => {
			restoreTimer = 0;
			if (token === runToken) {
				restore();
			}
		}, RESTORE_DELAY);
	}

	async function run() {
		if (isRunning) {
			return; // 연타 시 중복 실행 방지.
		}

		// 매 실행은 항상 초기(대기) 목록에서 시작한다.
		if (restoreTimer) {
			clearTimeout(restoreTimer);
			restoreTimer = 0;
		}

		buildTaskList();
		isRunning = true;
		startButton.disabled = true;
		const token = ++runToken;
		let failed = false;

		render();

		// p-limit 코어는 실행 시점에만 로드(브라우저는 import map 으로 yocto-queue 해소).
		const {default: pLimit} = await import('../index.js');
		const limit = pLimit(CONCURRENCY);
		const delay = ms => new Promise(resolve => {
			setTimeout(resolve, ms);
		});

		await Promise.allSettled(
			tasks.map(task =>
				limit(async () => {
					if (token !== runToken || failed) {
						return;
					}

					setTaskState(task.id, TASK_STATE.RUNNING);
					render();

					await delay(task.delay);

					if (token !== runToken || failed) {
						return;
					}

					if (task.fail) {
						failed = true;
						handleFailure(token, task.id);
						return;
					}

					setTaskState(task.id, TASK_STATE.DONE);
					render();
				}),
			),
		);

		if (token === runToken && !failed) {
			// 정상 완료: 전체 done, 시작 버튼 재활성화하여 재실행 가능.
			isRunning = false;
			startButton.disabled = false;
			render();
		}
	}

	startButton.addEventListener('click', run);
	resetButton.addEventListener('click', restore);

	restore();
}
