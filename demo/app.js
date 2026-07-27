/*
 * pause/resume 대시보드 런타임 (F68F701A7A-65)
 *
 * frozen UI 계약(ui-contract@v1)의 domId·상태 텍스트를 그대로 소비한다.
 * p-limit 코어 API(pLimit, limit(), activeCount, pendingCount, clearQueue)만 사용하며
 * pause/resume는 demo 레이어의 게이트로 구현한다(코어 API 변경 없음).
 *
 * 게이트 모델:
 * - 게이트 열림(running/idle): 추가된 작업을 즉시 limit()로 투입한다.
 * - 일시정지(pause): 게이트를 닫고, 아직 시작 전인(limit 대기열) 작업을 clearQueue로
 *   빼내어 보류 큐로 옮긴다. 실행 중 작업은 끝까지 실행된다(draining).
 * - 재개(resume): 게이트를 열고 보류 작업을 순차 재투입한다(concurrency 한도 유지).
 * - 집계는 항상 limit.activeCount / limit.pendingCount를 단일 진실 소스로 읽는다.
 */

import pLimit from '../index.js';

const CONCURRENCY = 3;
const WORK_MIN_MS = 1200;
const WORK_MAX_MS = 2800;
const FAILURE_RATE = 0.12;

const STATUS_TEXT = {
	idle: '대기 중',
	running: '실행 중',
	draining: '정리 중 (실행 작업 마무리)',
	paused: '일시정지됨',
};

const TASK_STATUS_TEXT = {
	held: '보류 (재개 대기)',
	pending: '대기 중',
	running: '실행 중',
	done: '완료',
	failed: '실패',
};

const addButton = document.querySelector('#task-add');
const pauseButton = document.querySelector('#task-pause');
const resumeButton = document.querySelector('#task-resume');
const activeCountEl = document.querySelector('#active-count');
const pendingCountEl = document.querySelector('#pending-count');
const statusBadge = document.querySelector('#status-badge');
const taskListEl = document.querySelector('#task-list');
const concurrencyValueEl = document.querySelector('#concurrency-value');

const limit = pLimit(CONCURRENCY);
const tasks = []; // 생성 순서대로 유지되는 전체 작업 레코드
const heldQueue = []; // 게이트가 닫혀 재개를 기다리는 레코드(FIFO)
let gateOpen = true;
let sequence = 0;

if (concurrencyValueEl) {
	concurrencyValueEl.textContent = String(CONCURRENCY);
}

function simulatedWork() {
	return new Promise((resolve, reject) => {
		const delay = WORK_MIN_MS + Math.random() * (WORK_MAX_MS - WORK_MIN_MS);
		setTimeout(() => {
			if (Math.random() < FAILURE_RATE) {
				reject(new Error('작업 실패'));
			} else {
				resolve();
			}
		}, delay);
	});
}

function submit(record) {
	record.status = 'pending';
	limit(async () => {
		record.status = 'running';
		render();
		await simulatedWork();
	})
		.then(() => {
			record.status = 'done';
		})
		.catch(() => {
			record.status = 'failed';
		})
		.finally(() => {
			render();
		});
	render();
}

function addTask() {
	sequence += 1;
	const record = {id: sequence, status: gateOpen ? 'pending' : 'held'};
	tasks.push(record);
	if (gateOpen) {
		submit(record);
	} else {
		heldQueue.push(record);
		render();
	}
}

function pause() {
	if (!gateOpen) {
		return;
	}

	gateOpen = false;

	// 아직 시작 전(limit 대기열)인 작업을 보류로 옮겨 pause 중 신규 시작을 막는다.
	for (const record of tasks) {
		if (record.status === 'pending') {
			record.status = 'held';
			heldQueue.push(record);
		}
	}

	limit.clearQueue();
	render();
}

function resume() {
	if (gateOpen) {
		return;
	}

	gateOpen = true;
	while (heldQueue.length > 0) {
		submit(heldQueue.shift());
	}

	render();
}

function computeState() {
	const active = limit.activeCount;
	if (!gateOpen) {
		return active > 0 ? 'draining' : 'paused';
	}

	if (active === 0 && limit.pendingCount === 0 && heldQueue.length === 0) {
		return 'idle';
	}

	return 'running';
}

function badgeModifier(state) {
	if (state === 'running') {
		return 'status-badge--running';
	}

	if (state === 'idle') {
		return 'status-badge--idle';
	}

	// draining·paused는 동결된 별도 draining class가 없으므로 paused 변형을 공유하고
	// 상태 구분은 배지 텍스트로 노출한다.
	return 'status-badge--paused';
}

function renderTasks() {
	taskListEl.replaceChildren();
	for (const record of tasks) {
		const item = document.createElement('li');
		item.className = 'task-item';
		item.dataset.status = record.status;
		item.textContent = `#${record.id} · ${TASK_STATUS_TEXT[record.status]}`;
		taskListEl.append(item);
	}
}

function render() {
	const state = computeState();

	activeCountEl.textContent = String(limit.activeCount);
	pendingCountEl.textContent = String(limit.pendingCount);

	statusBadge.textContent = STATUS_TEXT[state];
	statusBadge.className = `status-badge ${badgeModifier(state)}`;

	// 작업 추가는 항상 가능(게이트가 닫혀 있으면 보류로 큐잉).
	addButton.disabled = false;
	pauseButton.disabled = state !== 'running';
	resumeButton.disabled = state === 'running';

	renderTasks();
}

addButton.addEventListener('click', addTask);
pauseButton.addEventListener('click', pause);
resumeButton.addEventListener('click', resume);

render();
