// 동시성 시각화 예제 — 로직 (F68F701A7A-41)
//
// 저장소 루트의 p-limit 코어를 상대 경로로 그대로 import 한다.
// 외부 CDN/프레임워크/신규 의존성 없이 기존 공개 API만 소비한다.
//   - pLimit(concurrency)  → limit() 함수 반환
//   - limit(fn)            → fn 을 동시 실행 제한 하에 스케줄링, promise 반환
//   - limit.activeCount    → 현재 실행 중 작업 수 (읽기 전용)
//   - limit.pendingCount   → 대기열 작업 수 (읽기 전용)
//   - limit.concurrency    → 동시 실행 허용 개수 (get/set)
//
// plan(docs/plans/concurrency-visualizer-plan.md) §4·§6 계약을 그대로 구현한다.
import pLimit from '../../index.js';

// ─────────────────────────────────────────────────────────────
// 1. 순수 상태 로직 (DOM 비의존 — tester 가 단위 테스트로 검증)
// ─────────────────────────────────────────────────────────────

/**
 * 새 task 객체를 초기 상태(queued)로 생성한다.
 * @param {number} id
 * @returns {{id:number, state:'queued', startedAt:null, endedAt:null}}
 */
export function createTask(id) {
	return {id, state: 'queued', startedAt: null, endedAt: null};
}

/**
 * 상태 전이를 적용한 새 tasks 배열을 반환한다 (불변 갱신).
 * 전이 규칙: queued → active → (done | error)
 *  - active  진입 시 startedAt 기록
 *  - done/error 진입 시 endedAt 기록
 * @param {Array} tasks
 * @param {number} id
 * @param {'queued'|'active'|'done'|'error'} nextState
 * @param {number} timestamp
 * @returns {Array} 새 배열 (원본 불변)
 */
export function applyTransition(tasks, id, nextState, timestamp) {
	return tasks.map((task) => {
		if (task.id !== id) {
			return task;
		}

		const next = {...task, state: nextState};
		if (nextState === 'active') {
			next.startedAt = timestamp;
		} else if (nextState === 'done' || nextState === 'error') {
			next.endedAt = timestamp;
		}

		return next;
	});
}

/**
 * p-limit 인스턴스를 단일 진실 소스로 삼아 집계 상태를 읽는다.
 * @param {Function} limit
 * @returns {{activeCount:number, pendingCount:number, concurrency:number}}
 */
export function readAggregate(limit) {
	return {
		activeCount: limit.activeCount,
		pendingCount: limit.pendingCount,
		concurrency: limit.concurrency,
	};
}

// ─────────────────────────────────────────────────────────────
// 2. 브라우저 부트스트랩 (document 존재 시에만 실행)
//    node 환경(단위 테스트 import)에서는 아래 블록이 건너뛰어져
//    순수 함수만 안전하게 재사용할 수 있다.
// ─────────────────────────────────────────────────────────────

/**
 * 인위적 지연 promise (외부 네트워크 없이 오프라인 동작).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function randomInt(min, max) {
	return Math.floor(min + (Math.random() * (max - min)));
}

function initVisualizer(document_) {
	const DEFAULT_CONCURRENCY = 3;
	const DEFAULT_TASK_COUNT = 20;
	const MAX_TASK_COUNT = 30; // plan §7: 데모 한계
	const ERROR_RATE = 0.15; // task reject 시나리오 비율 (developer 재량)

	const sliderEl = document_.querySelector('#concurrency-slider');
	const concurrencyValueEl = document_.querySelector('#concurrency-value');
	const activeCountEl = document_.querySelector('#active-count');
	const pendingCountEl = document_.querySelector('#pending-count');
	const gridEl = document_.querySelector('#task-grid');
	const taskCountEl = document_.querySelector('#task-count');
	const runButtonEl = document_.querySelector('#run-button');
	const resetButtonEl = document_.querySelector('#reset-button');

	let limit = pLimit(DEFAULT_CONCURRENCY);
	let tasks = [];

	// task id → DOM 요소 캐시 (id 대조로 O(1) 갱신)
	const taskElements = new Map();

	function renderCounters() {
		const aggregate = readAggregate(limit);
		activeCountEl.textContent = String(aggregate.activeCount);
		pendingCountEl.textContent = String(aggregate.pendingCount);
		concurrencyValueEl.textContent = String(aggregate.concurrency);
	}

	function renderGrid() {
		gridEl.textContent = '';
		taskElements.clear();
		for (const task of tasks) {
			const element = document_.createElement('div');
			element.className = 'task';
			element.dataset.id = String(task.id);
			element.dataset.state = task.state;
			element.textContent = String(task.id);
			gridEl.append(element);
			taskElements.set(task.id, element);
		}
	}

	function updateTaskElement(id, state) {
		const element = taskElements.get(id);
		if (element) {
			element.dataset.state = state;
		}
	}

	function transition(id, nextState) {
		tasks = applyTransition(tasks, id, nextState, Date.now());
		updateTaskElement(id, nextState);
		renderCounters();
	}

	/**
	 * 개별 task 를 p-limit 아래에서 실행하며 상태를 추적한다.
	 * 호출 즉시 active 로 전이(= 실제 실행 슬롯 확보 시점),
	 * 지연 후 무작위로 done/error 로 종료.
	 */
	function trackedWork(task) {
		transition(task.id, 'active');
		return delay(randomInt(400, 1400)).then(() => {
			if (Math.random() < ERROR_RATE) {
				transition(task.id, 'error');
				throw new Error(`task ${task.id} failed`);
			}

			transition(task.id, 'done');
		});
	}

	function run() {
		const requested = Number(taskCountEl?.value) || DEFAULT_TASK_COUNT;
		const count = Math.max(1, Math.min(MAX_TASK_COUNT, requested));

		// 새 실행마다 깨끗한 인스턴스로 재시작(진행 중 task 강제 취소는 미지원 — plan §5).
		limit = pLimit(Number(sliderEl.value));
		tasks = Array.from({length: count}, (_, index) => createTask(index + 1));
		renderGrid();
		renderCounters();

		for (const task of tasks) {
			// error 는 표시만 하고 큐 처리는 계속(전체 중단 없음 — plan §7).
			limit(() => trackedWork(task)).catch(() => {});
		}
	}

	function reset() {
		limit = pLimit(Number(sliderEl.value));
		tasks = [];
		renderGrid();
		renderCounters();
	}

	// 동시성 슬라이더: 실행 중에도 즉시 반영(재시작 불필요 — plan §5).
	sliderEl.addEventListener('input', () => {
		limit.concurrency = Number(sliderEl.value);
		renderCounters();
	});

	runButtonEl?.addEventListener('click', run);
	resetButtonEl?.addEventListener('click', reset);

	// 초기 상태 표시 후 데모 자동 시작(AC: 로드 시 슬라이더 + 초기 task 목록 표시).
	concurrencyValueEl.textContent = String(DEFAULT_CONCURRENCY);
	run();
}

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			initVisualizer(document);
		});
	} else {
		initVisualizer(document);
	}
}
