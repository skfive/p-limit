// 실시간 Inspector demo 런타임 (F68F701A7A-77)
// planner 동결 계약(docs/plans/subscribe-inspector-plan.md §3~§4)을 그대로 소비한다.
// 라이브러리 공개 표면(pLimit, limit(...), subscribe, clearQueue, pause, resume)만
// 사용하는 additive 소비자이며, DOM ID/class·상태 텍스트·design token을 재정의하지 않는다.
import pLimit from '../index.js';

// §4.4 상태 텍스트 모델(동결): API status → 화면 텍스트 라벨(1:1).
// 색상만이 아니라 상태명을 항상 화면 텍스트로 노출한다.
export const STATUS_TEXT = {
	idle: 'Idle',
	active: 'Running',
	saturated: 'Saturated',
	paused: 'Paused',
};

const DEFAULT_CONCURRENCY = 3;
const TASK_DURATION_MS = 1600;

// 기본 작업: 일정 시간 실행되는 지연 태스크(관찰 가능하도록 충분히 길게).
function defaultMakeTask(duration = TASK_DURATION_MS) {
	return () => new Promise(resolve => {
		setTimeout(resolve, duration);
	});
}

// §3.4 초기 스냅샷: subscribe()는 즉시 통지하지 않으므로, 구독 직후 현재 introspection
// 값을 직접 읽어 초기 렌더한다. status는 §3.3 우선순위(paused > saturated > active > idle).
function readSnapshot(limit) {
	let status;
	if (limit.isPaused) {
		status = 'paused';
	} else if (limit.isSaturated) {
		status = 'saturated';
	} else if (limit.activeCount > 0) {
		status = 'active';
	} else {
		status = 'idle';
	}

	return {
		activeCount: limit.activeCount,
		pendingCount: limit.pendingCount,
		concurrency: limit.concurrency,
		status,
	};
}

/**
 * §4 UI 계약(DOM ID/class·상태 텍스트·token) 배선.
 * 주어진 document에 대해 pLimit 인스턴스를 구독하고 상태 전이마다 렌더한다.
 * 테스트·재사용을 위해 controller를 반환한다.
 */
export function initInspector(doc = globalThis.document, options = {}) {
	if (!doc) {
		throw new Error('initInspector: document가 필요합니다');
	}

	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const makeTask = options.makeTask ?? defaultMakeTask;

	const el = {
		root: doc.getElementById('inspector-root'),
		badge: doc.getElementById('inspector-status-badge'),
		active: doc.getElementById('inspector-active-count'),
		pending: doc.getElementById('inspector-pending-count'),
		concurrency: doc.getElementById('inspector-concurrency-value'),
		enqueue: doc.getElementById('inspector-enqueue'),
		clear: doc.getElementById('inspector-clear'),
		pause: doc.getElementById('inspector-pause'),
		resume: doc.getElementById('inspector-resume'),
	};

	const limit = pLimit(concurrency);

	function render(snapshot) {
		const {status} = snapshot;
		// §4.4/§4.6: 상태명을 화면 텍스트로 노출(aria-live 배지가 스크린리더에 통지).
		el.badge.textContent = STATUS_TEXT[status];
		// data-status로 §4.5 design token 색상을 CSS에서 선택한다(색상은 보조 신호).
		el.badge.dataset.status = status;
		el.active.textContent = String(snapshot.activeCount);
		el.pending.textContent = String(snapshot.pendingCount);
		el.concurrency.textContent = snapshot.concurrency === Number.POSITIVE_INFINITY
			? '∞'
			: String(snapshot.concurrency);

		// §4.8 후조건: 주 실행 control(enqueue)은 항상 사용 가능.
		// pause/resume은 현재 상태를 반영하고, clear는 비울 대기 항목이 있을 때만 활성.
		el.enqueue.disabled = false;
		el.pause.disabled = status === 'paused';
		el.resume.disabled = status !== 'paused';
		el.clear.disabled = snapshot.pendingCount === 0;
	}

	// 상태 전이마다 최신 snapshot으로 렌더.
	const unsubscribe = limit.subscribe(render);
	// 구독 직후 초기 상태(idle · 지표 0 · control 활성)로 수렴.
	render(readSnapshot(limit));

	function handleEnqueue() {
		// fire-and-forget: clearQueue로 취소되거나 실패해도 unhandled rejection이 없도록 삼킨다.
		// 정산 의미는 라이브러리가 그대로 보존한다(구독은 관찰만 한다).
		limit(makeTask()).catch(() => {});
	}

	function handleClear() {
		limit.clearQueue();
	}

	function handlePause() {
		limit.pause();
	}

	function handleResume() {
		limit.resume();
	}

	el.enqueue.addEventListener('click', handleEnqueue);
	el.clear.addEventListener('click', handleClear);
	el.pause.addEventListener('click', handlePause);
	el.resume.addEventListener('click', handleResume);

	return {
		limit,
		unsubscribe,
		render,
		readSnapshot: () => readSnapshot(limit),
		getStatusText: () => el.badge.textContent,
	};
}

// 브라우저에서만 자동 초기화한다. node import(테스트/스모크)에서는 건너뛴다.
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		initInspector(document);
	});
}
