// 배치 진행 데모 — 순수 리듀서 focused test (F68F701A7A-53)
//
// frozen UI 계약(ui-contract@v1) 및 planner 설계
// (docs/plans/batch-progress-implementation-plan.md §4·§5) 준수 검증.
//
// demo/batch-progress.js 는 `typeof document !== 'undefined'` 가드로 브라우저
// 바인딩을 감싸고, p-limit 코어(../index.js)는 실행 시점에만 동적 import 한다.
// 따라서 이 테스트는 yocto-queue 설치 없이 순수 상태 리듀서만 검증한다.
// 실 브라우저 렌더/클릭 인터랙션은 downstream tester(e2e) 가 검증한다.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
	TASK_STATE,
	STATE_LABEL,
	stateLabel,
	BATCH_STATE,
	CONCURRENCY,
	FIXTURE,
	createTasks,
	applyTransition,
	abortRemaining,
	computeProgress,
	computeBatchState,
	describeStatus,
} from '../demo/batch-progress.js';

test('TASK_STATE 는 계약(§4)의 5개 상태 값으로 동결되어 있다', () => {
	assert.deepEqual(TASK_STATE, {
		PENDING: 'pending',
		RUNNING: 'running',
		DONE: 'done',
		CANCELLED: 'cancelled',
		FAILED: 'failed',
	});
	assert.ok(Object.isFrozen(TASK_STATE));
});

test('STATE_LABEL 은 상태별 한글 텍스트(대기/실행/완료/취소/실패)를 노출한다', () => {
	assert.deepEqual(STATE_LABEL, {
		pending: '대기',
		running: '실행',
		done: '완료',
		cancelled: '취소',
		failed: '실패',
	});
	assert.ok(Object.isFrozen(STATE_LABEL));
});

test('stateLabel 은 상태 → 한글 라벨, 미지의 값은 빈 문자열', () => {
	assert.equal(stateLabel(TASK_STATE.PENDING), '대기');
	assert.equal(stateLabel(TASK_STATE.RUNNING), '실행');
	assert.equal(stateLabel(TASK_STATE.DONE), '완료');
	assert.equal(stateLabel(TASK_STATE.CANCELLED), '취소');
	assert.equal(stateLabel(TASK_STATE.FAILED), '실패');
	assert.equal(stateLabel('unknown'), '');
});

test('BATCH_STATE·CONCURRENCY 는 동결된 데모 상수다', () => {
	assert.deepEqual(BATCH_STATE, {
		IDLE: 'idle',
		RUNNING: 'running',
		DONE: 'done',
		CANCELLED: 'cancelled',
		FAILED: 'failed',
	});
	assert.ok(Object.isFrozen(BATCH_STATE));
	assert.equal(typeof CONCURRENCY, 'number');
	assert.ok(CONCURRENCY >= 1);
});

test('FIXTURE 는 결정론적이며 동결되어 있고 실패 시연 작업을 정확히 하나 포함한다', () => {
	assert.ok(Array.isArray(FIXTURE));
	assert.ok(FIXTURE.length >= 4);
	assert.ok(Object.isFrozen(FIXTURE));
	for (const item of FIXTURE) {
		assert.ok(Object.isFrozen(item));
		assert.equal(typeof item.id, 'string');
		assert.equal(typeof item.label, 'string');
		assert.equal(typeof item.delay, 'number');
	}
	// 취소·실패 상태를 시연하려면 실패 작업이 필요하며, 취소될 후속 작업이 남도록
	// 마지막 작업은 실패 작업이 아니어야 한다.
	const failCount = FIXTURE.filter(item => item.fail === true).length;
	assert.equal(failCount, 1);
	assert.notEqual(FIXTURE.at(-1).fail, true);
});

test('createTasks: fixture 로부터 모든 작업을 대기(pending) 상태로 만든다', () => {
	const tasks = createTasks();
	assert.equal(tasks.length, FIXTURE.length);
	assert.ok(tasks.every(task => task.state === TASK_STATE.PENDING));
	assert.deepEqual(tasks.map(t => t.id), FIXTURE.map(t => t.id));
	assert.equal(tasks[0].label, FIXTURE[0].label);
	assert.equal(tasks[0].delay, FIXTURE[0].delay);
});

test('applyTransition: 대상 작업만 새 상태로 바꾸고 원본을 변경하지 않는다', () => {
	const tasks = createTasks();
	const next = applyTransition(tasks, tasks[1].id, TASK_STATE.RUNNING);
	assert.notEqual(next, tasks);
	assert.equal(tasks[1].state, TASK_STATE.PENDING); // 원본 불변
	assert.equal(next[1].state, TASK_STATE.RUNNING);
	assert.equal(next[0].state, TASK_STATE.PENDING); // 다른 항목은 그대로
});

test('computeProgress: 완료(done) 비율을 정수 퍼센트로 계산한다', () => {
	const tasks = createTasks();
	assert.deepEqual(computeProgress(tasks), {done: 0, total: tasks.length, percent: 0});

	const allDone = tasks.map(t => ({...t, state: TASK_STATE.DONE}));
	assert.deepEqual(computeProgress(allDone), {done: tasks.length, total: tasks.length, percent: 100});

	// 반올림 검증: 3개 중 1개 완료 → 33%
	const three = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.PENDING},
		{id: 'c', state: TASK_STATE.PENDING},
	];
	assert.equal(computeProgress(three).percent, 33);

	// 빈 목록은 0%
	assert.deepEqual(computeProgress([]), {done: 0, total: 0, percent: 0});
});

test('abortRemaining: 대기·실행 중 작업을 취소로 바꾸고 완료·실패는 유지한다', () => {
	const tasks = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.RUNNING},
		{id: 'c', state: TASK_STATE.PENDING},
		{id: 'd', state: TASK_STATE.FAILED},
	];
	const next = abortRemaining(tasks);
	assert.notEqual(next, tasks);
	assert.equal(next[0].state, TASK_STATE.DONE); // 완료 유지
	assert.equal(next[1].state, TASK_STATE.CANCELLED); // 실행 → 취소
	assert.equal(next[2].state, TASK_STATE.CANCELLED); // 대기 → 취소
	assert.equal(next[3].state, TASK_STATE.FAILED); // 실패 유지
	assert.equal(tasks[1].state, TASK_STATE.RUNNING); // 원본 불변
});

test('computeBatchState: 전부 대기면 idle', () => {
	assert.equal(computeBatchState(createTasks()), BATCH_STATE.IDLE);
});

test('computeBatchState: 진행 중(일부 실행/완료, 실패 없음)이면 running', () => {
	const tasks = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.RUNNING},
		{id: 'c', state: TASK_STATE.PENDING},
	];
	assert.equal(computeBatchState(tasks), BATCH_STATE.RUNNING);
});

test('computeBatchState: 전부 완료면 done', () => {
	const tasks = createTasks().map(t => ({...t, state: TASK_STATE.DONE}));
	assert.equal(computeBatchState(tasks), BATCH_STATE.DONE);
});

test('computeBatchState: 하나라도 실패면 failed (취소가 섞여도 실패 우선)', () => {
	const tasks = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.FAILED},
		{id: 'c', state: TASK_STATE.CANCELLED},
	];
	assert.equal(computeBatchState(tasks), BATCH_STATE.FAILED);
});

test('computeBatchState: 실패 없이 완료·취소만 남으면 cancelled', () => {
	const tasks = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.CANCELLED},
		{id: 'c', state: TASK_STATE.CANCELLED},
	];
	assert.equal(computeBatchState(tasks), BATCH_STATE.CANCELLED);
});

test('describeStatus: 각 배치 상태를 한글 상태명이 포함된 텍스트로 설명한다', () => {
	const idle = createTasks();
	assert.match(describeStatus(idle), /대기/);

	const running = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.RUNNING},
		{id: 'c', state: TASK_STATE.PENDING},
	];
	const runningText = describeStatus(running);
	assert.match(runningText, /실행/);
	assert.match(runningText, /1\/3/); // 진행률(완료/전체) 포함

	const done = createTasks().map(t => ({...t, state: TASK_STATE.DONE}));
	assert.match(describeStatus(done), /완료/);

	const failed = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.FAILED},
		{id: 'c', state: TASK_STATE.CANCELLED},
	];
	assert.match(describeStatus(failed), /실패/);

	const cancelled = [
		{id: 'a', state: TASK_STATE.DONE},
		{id: 'b', state: TASK_STATE.CANCELLED},
	];
	assert.match(describeStatus(cancelled), /취소/);
});
