// 상태 스냅샷 진단 데모 런타임 (F68F701A7A-118)
// planner 동결 UI 계약(ui-contract@v1) + 실행 설계(docs/plans/status-snapshot-plan-F68F701A7A-118.md)를
// 그대로 소비한다. 라이브러리 공개 표면(pLimit, limit(...), snapshot, pause/resume, clearQueue, subscribe)만
// 읽기/제어 용도로 사용하는 additive 소비자이며, DOM ID/class·상태 텍스트·design token을 재정의하지 않는다.
// 기존 데모(inspector.js / demo.js)와 p-limit 공개 API 동작은 변경하지 않는다.
import pLimit from '../index.js';

const DEFAULT_CONCURRENCY = 2;
const TASK_DURATION_MS = 1500;

// §3.4 상태 모델(동결): 상태명을 항상 화면 텍스트/접근성 이름으로 노출한다(색상 단독 구분 금지).
export const SNAPSHOT_STATE_TEXT = {
	idle: '유휴 — 대기 없는 상태입니다',
	running: '실행 중 — 작업을 처리하고 있습니다',
	paused: '일시정지 — 대기 작업 승격이 중단되었습니다',
	resumed: '실행 중 — 재개되어 작업을 처리합니다',
	cleared: '대기열 비움 — 상태와 카운트를 초기값으로 되돌렸습니다',
};

// 관찰 가능하도록 충분히 지속되는 지연 태스크(demo용 부하 생성).
function defaultMakeTask(duration = TASK_DURATION_MS) {
	return () => new Promise(resolve => {
		setTimeout(resolve, duration);
	});
}

// 파생 상태: snapshot 4필드로부터 idle/running/paused를 계산한다(§3.4 우선순위: paused > running > idle).
function deriveState(snapshot) {
	if (snapshot.isPaused) {
		return 'paused';
	}

	if (snapshot.activeCount > 0) {
		return 'running';
	}

	return 'idle';
}

/**
 * §3 UI 계약(DOM ID/class·token·상태·접근성)을 배선한다.
 * 주어진 document에 대해 pLimit 인스턴스를 만들고, 작업 추가·일시정지·재개·비우기 control과
 * limit.snapshot() 읽기 전용 스냅샷 기반 상태 카드 렌더링을 제공한다.
 * 테스트·재사용을 위해 controller를 반환한다.
 *
 * @param {Document} doc - 배선할 document.
 * @param {object} [options]
 * @param {number} [options.concurrency] - limiter 동시성(기본 2).
 * @param {() => (() => Promise<unknown>)} [options.makeTask] - 작업 팩토리(테스트 주입용).
 * @returns {{limit: import('../index.js').LimitFunction, render: () => void, destroy: () => void}}
 */
export function initStatusDemo(doc = globalThis.document, options = {}) {
	if (!doc) {
		throw new Error('initStatusDemo: document가 필요합니다');
	}

	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const makeTask = options.makeTask ?? defaultMakeTask();
	const limit = pLimit(concurrency);

	// §3.2 frozen DOM ID selector — 계약을 재정의하지 않고 조회만 한다.
	const els = {
		active: doc.querySelector('#snapshot-active-count'),
		pending: doc.querySelector('#snapshot-pending-count'),
		concurrency: doc.querySelector('#snapshot-concurrency'),
		pauseState: doc.querySelector('#snapshot-pause-state'),
		live: doc.querySelector('#snapshot-live'),
		addTask: doc.querySelector('#demo-add-task'),
		pause: doc.querySelector('#demo-pause'),
		resume: doc.querySelector('#demo-resume'),
		clear: doc.querySelector('#demo-clear'),
	};

	const cards = [...doc.querySelectorAll('#snapshot-panel .status-card')];

	// §3.4 상태에 따른 카드 modifier 토글(색상은 텍스트 라벨 보조).
	const applyCardModifier = state => {
		for (const card of cards) {
			card.classList.toggle('status-card--running', state === 'running' || state === 'resumed');
			card.classList.toggle('status-card--paused', state === 'paused');
		}
	};

	// §3.6 상태 변화 aria-live 알림 + 데이터 상태 노출(색상 외 텍스트 라벨 필수).
	const announce = (state, textOverride) => {
		if (!els.live) {
			return;
		}

		els.live.dataset.state = state;
		els.live.textContent = textOverride ?? SNAPSHOT_STATE_TEXT[state];
	};

	// 읽기 전용 limit.snapshot()을 읽어 카드/카운트/컨트롤 상태를 반영한다(§2 API 소비).
	const render = () => {
		const snapshot = limit.snapshot();

		els.active.textContent = String(snapshot.activeCount);
		els.pending.textContent = String(snapshot.pendingCount);
		els.concurrency.textContent = snapshot.concurrency === Number.POSITIVE_INFINITY
			? '∞'
			: String(snapshot.concurrency);

		// §3.4: isPaused면 "일시정지", 아니면 실행 가능/실행 중 텍스트(색상 외 텍스트 라벨).
		els.pauseState.textContent = snapshot.isPaused
			? '일시정지'
			: (snapshot.activeCount > 0 ? '실행 중' : '실행 가능');

		// 주 실행 control은 일시정지 중 비활성(§3.4 후조건: 초기화·재개 시 재활성화).
		els.addTask.disabled = snapshot.isPaused;

		const state = deriveState(snapshot);
		applyCardModifier(state);
		announce(state);
		return snapshot;
	};

	// 상태 전이가 있을 때마다 스냅샷을 다시 읽어 렌더한다. 태스크가 스스로 완료되어
	// running → idle로 돌아오는 전이도 자동 반영된다(subscribe는 기존 공개 API).
	const unsubscribe = limit.subscribe(() => {
		render();
	});

	const onAdd = () => {
		// 취소(clearQueue)로 인한 rejection을 흡수한다(데모 안정성).
		limit(makeTask).catch(() => {});
		render();
	};

	const onPause = () => {
		limit.pause();
		render();
		announce('paused');
	};

	const onResume = () => {
		limit.resume();
		render();
		announce('resumed');
	};

	const onClear = () => {
		// 대기열 비우기(취소). 후조건(§3.4): 상태·카운트를 초기값(유휴)으로 되돌리고
		// 주 실행 control(demo-add-task)을 다시 사용 가능하게 한다.
		limit.clearQueue();
		if (limit.isPaused) {
			limit.resume();
		}

		render();
		announce('cleared');
	};

	els.addTask.addEventListener('click', onAdd);
	els.pause.addEventListener('click', onPause);
	els.resume.addEventListener('click', onResume);
	els.clear.addEventListener('click', onClear);

	// 초기 렌더(유휴).
	render();

	const destroy = () => {
		unsubscribe();
		els.addTask.removeEventListener('click', onAdd);
		els.pause.removeEventListener('click', onPause);
		els.resume.removeEventListener('click', onResume);
		els.clear.removeEventListener('click', onClear);
	};

	return {limit, render, destroy};
}

// 브라우저 환경에서만 자동 배선(테스트/모듈 임포트 시 부작용 없음).
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		initStatusDemo(document);
	});
}
