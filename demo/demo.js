// 대기열 압력 히스토리 패널 런타임 (F68F701A7A-83)
// planner 동결 UI 계약(docs/plans/queue-pressure-history-plan.md §3~§7)을 그대로 소비한다.
// 라이브러리 공개 표면(pLimit, limit(...), subscribe, activeCount, pendingCount, clearQueue)만
// 읽기(관찰) 용도로 사용하는 additive 소비자이며, DOM ID/class·상태 텍스트·design token을 재정의하지 않는다.
// 기존 Inspector demo(inspector.js) 동작과 p-limit 공개 API를 변경하지 않는다.
import pLimit from '../index.js';

// §5 상태 모델(동결): 상태명을 항상 화면 텍스트/접근성 이름으로 노출한다(색상 단독 구분 금지).
export const QP_STATUS_TEXT = {
	empty: '기록 없음 — 대기열 압력 히스토리가 비어 있습니다',
	recording: '기록 중 — 대기열 압력 변화를 기록하고 있습니다',
	updated: '갱신됨 — 최신 대기열 압력 항목이 추가되었습니다',
	reset: '초기화됨 — 히스토리를 비웠습니다',
};

const DEFAULT_CONCURRENCY = 2;
const TASK_DURATION_MS = 1200;

// 관찰 가능하도록 충분히 지속되는 지연 태스크(demo용 부하 생성).
function defaultMakeTask(duration = TASK_DURATION_MS) {
	return () => new Promise(resolve => {
		setTimeout(resolve, duration);
	});
}

/**
 * §3~§7 UI 계약(DOM ID/class·token·상태·접근성·반응형) 배선.
 * 주어진 document에 대해 pLimit 인스턴스의 대기열 압력(active/pending) 변화를
 * 시간순 히스토리로 기록하고, 초기화 control을 제공한다.
 * 테스트·재사용을 위해 controller를 반환한다.
 */
export function initQueuePressureHistory(doc = globalThis.document, options = {}) {
	if (!doc) {
		throw new Error('initQueuePressureHistory: document가 필요합니다');
	}

	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const makeTask = options.makeTask ?? defaultMakeTask;
	// 기본은 라이브러리 공개 API(pLimit)를 그대로 소비한다. 테스트에서만 limiter를 주입할 수 있는 seam.
	const createLimit = options.pLimit ?? pLimit;

	const el = {
		panel: doc.getElementById('queue-pressure-panel'),
		list: doc.getElementById('queue-pressure-history-list'),
		status: doc.getElementById('queue-pressure-status'),
		reset: doc.getElementById('queue-pressure-reset'),
		// additive demo 트리거(부하 생성용) — 동결 selector가 아니며 계약 요소를 대체하지 않는다.
		enqueue: doc.getElementById('queue-pressure-enqueue'),
	};

	const limit = createLimit(concurrency);
	// 마지막으로 기록된 압력 값(중복 전이 억제용).
	let last = null;

	// §5/§6: 현재 상태 문구를 화면 텍스트로 표시하고, data-state로 §4 색상 토큰을 CSS에서 선택한다.
	function setState(state) {
		el.status.textContent = QP_STATUS_TEXT[state];
		el.status.dataset.state = state;
	}

	// §8 AC-2: active/pending 값을 색상(--qp-color-active/--qp-color-pending)과 함께 텍스트로 표시한다.
	function appendItem(active, pending) {
		const item = doc.createElement('li');
		item.className = 'queue-pressure__item';
		item.dataset.active = String(active);
		item.dataset.pending = String(pending);

		const activeSpan = doc.createElement('span');
		activeSpan.className = 'queue-pressure__active';
		activeSpan.textContent = `실행 중 ${active}`;

		const pendingSpan = doc.createElement('span');
		pendingSpan.className = 'queue-pressure__pending';
		pendingSpan.textContent = `대기 중 ${pending}`;

		item.append(activeSpan, pendingSpan);
		// 색상 외 텍스트로도 인지 가능하도록 접근성 이름을 항목에 부여한다(§6).
		item.setAttribute('aria-label', `실행 중 ${active}, 대기 중 ${pending}`);
		el.list.append(item);
	}

	// 압력 변화가 있을 때만 기록한다(값이 동일한 전이는 건너뛴다).
	function record(active, pending) {
		if (last && last.active === active && last.pending === pending) {
			return false;
		}

		last = {active, pending};
		setState('recording');
		appendItem(active, pending);
		// aria-live="polite" 목록에 항목이 추가되어 스크린리더에 알려진 직후 상태.
		setState('updated');
		return true;
	}

	// §5 후조건: 초기화 뒤 히스토리와 상태 텍스트를 초기값(empty)으로 복원하고 control을 재활성화한다.
	function reset() {
		// 재진입 방지 및 "재활성화" 의미를 위해 잠시 비활성화 후 처리 말미에 다시 활성화한다.
		el.reset.disabled = true;
		limit.clearQueue();
		el.list.replaceChildren();
		last = null;
		setState('reset');
		setState('empty');
		el.reset.disabled = false;
		if (el.enqueue) {
			el.enqueue.disabled = false;
		}
	}

	// demo 부하 생성: 태스크를 추가하면 active/pending이 변동한다.
	// fire-and-forget이며 clearQueue로 취소되어도 unhandled rejection이 없도록 삼킨다.
	function enqueue() {
		limit(makeTask()).catch(() => {});
	}

	// polling 없이 상태 전이마다 최신 snapshot으로 기록한다.
	const unsubscribe = limit.subscribe(snapshot => {
		record(snapshot.activeCount, snapshot.pendingCount);
	});

	// 초기값: empty 상태 문구 + 빈 히스토리 + control 활성.
	setState('empty');
	el.reset.disabled = false;
	if (el.enqueue) {
		el.enqueue.disabled = false;
	}

	el.reset.addEventListener('click', reset);
	if (el.enqueue) {
		el.enqueue.addEventListener('click', enqueue);
	}

	return {
		limit,
		unsubscribe,
		record,
		reset,
		enqueue,
		getState: () => el.status.dataset.state,
		getStatusText: () => el.status.textContent,
		getItemCount: () => el.list.children.length,
	};
}

// 브라우저에서만 자동 초기화한다. node import(테스트/스모크)에서는 건너뛴다.
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		initQueuePressureHistory(document);
	});
}
