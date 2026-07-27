// 동시성 프리셋 비교 데모 — 순수 리듀서 단위 테스트 (F68F701A7A-47)
//
// plan §11(line 205) AC: "상태 전이 리듀서가 DOM 없이 단위 테스트로
// waiting → running → complete 를 검증한다 (테스트 대상: test/demo-concurrency-presets.test.js)."
//
// main.js 는 `typeof document !== 'undefined'` 가드로 브라우저 코드를 감싸므로
// node 에서 import 해도 DOM 바인딩이 실행되지 않는다. 또한 p-limit 코어(../index.js)는
// 런타임 동적 import 이므로 이 테스트는 yocto-queue 설치 없이도 리듀서만 검증한다.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
	ITEM_STATE,
	PANEL_STATE,
	PRESET_CONCURRENCIES,
	FIXTURE,
	createItems,
	applyTransition,
	computePanelState,
	describeProgress,
} from '../demo/concurrency-presets/main.js';

test('상태 상수는 계약(§5) 값으로 동결되어 있다', () => {
	assert.deepEqual(ITEM_STATE, {WAITING: 'waiting', RUNNING: 'running', COMPLETE: 'complete'});
	assert.deepEqual(PANEL_STATE, {IDLE: 'idle', RUNNING: 'running', COMPLETE: 'complete'});
	assert.deepEqual(PRESET_CONCURRENCIES, [1, 2, 4]);
	assert.ok(Object.isFrozen(ITEM_STATE));
	assert.ok(Object.isFrozen(PANEL_STATE));
	assert.ok(Object.isFrozen(PRESET_CONCURRENCIES));
});

test('FIXTURE 는 결정론적(고정 항목·고정 지연)이며 동결되어 있다', () => {
	assert.equal(FIXTURE.length, 6);
	assert.ok(Object.isFrozen(FIXTURE));
	for (const item of FIXTURE) {
		assert.ok(Object.isFrozen(item));
		assert.equal(typeof item.id, 'string');
		assert.equal(typeof item.label, 'string');
		assert.equal(typeof item.delay, 'number');
	}
});

test('createItems: 기본 fixture 로부터 모든 항목을 waiting 으로 만든다', () => {
	const items = createItems();
	assert.equal(items.length, FIXTURE.length);
	assert.ok(items.every(item => item.state === ITEM_STATE.WAITING));
	assert.deepEqual(
		items.map(item => item.id),
		FIXTURE.map(item => item.id),
	);
	// id·label·delay 가 fixture 로부터 그대로 전달된다.
	assert.equal(items[0].label, FIXTURE[0].label);
	assert.equal(items[0].delay, FIXTURE[0].delay);
});

test('createItems: 원본 fixture 를 변경하지 않는다(불변)', () => {
	const custom = [{id: 'a', label: 'A', delay: 10}];
	const snapshot = JSON.stringify(custom);
	const items = createItems(custom);
	items[0].state = ITEM_STATE.COMPLETE; // 반환값 변경이 원본에 영향 없어야 한다.
	assert.equal(JSON.stringify(custom), snapshot);
	assert.equal(custom[0].state, undefined);
});

test('createItems: 빈 fixture 는 빈 목록을 반환한다', () => {
	assert.deepEqual(createItems([]), []);
});

test('applyTransition: 지정 항목만 새 상태로 전이하고 새 배열을 반환한다', () => {
	const items = createItems([
		{id: 'a', label: 'A', delay: 10},
		{id: 'b', label: 'B', delay: 20},
	]);
	const next = applyTransition(items, 'a', ITEM_STATE.RUNNING);

	// 새 배열·새 항목 객체(불변).
	assert.notEqual(next, items);
	assert.notEqual(next[0], items[0]);
	assert.equal(next[0].state, ITEM_STATE.RUNNING);
	// 매칭되지 않는 항목은 그대로.
	assert.equal(next[1].state, ITEM_STATE.WAITING);
	// 원본 배열은 변경되지 않는다.
	assert.equal(items[0].state, ITEM_STATE.WAITING);
});

test('applyTransition: 존재하지 않는 id 는 아무 항목도 바꾸지 않는다', () => {
	const items = createItems([{id: 'a', label: 'A', delay: 10}]);
	const next = applyTransition(items, 'nope', ITEM_STATE.COMPLETE);
	assert.deepEqual(
		next.map(item => item.state),
		items.map(item => item.state),
	);
});

test('applyTransition: waiting → running → complete 전이 시퀀스(§5.2 계약)', () => {
	let items = createItems([{id: 'a', label: 'A', delay: 10}]);
	assert.equal(items[0].state, ITEM_STATE.WAITING);

	items = applyTransition(items, 'a', ITEM_STATE.RUNNING);
	assert.equal(items[0].state, ITEM_STATE.RUNNING);

	items = applyTransition(items, 'a', ITEM_STATE.COMPLETE);
	assert.equal(items[0].state, ITEM_STATE.COMPLETE);
});

test('computePanelState: 모두 waiting 이면 idle(초기/초기화 직후)', () => {
	const presets = PRESET_CONCURRENCIES.map(() => createItems());
	assert.equal(computePanelState(presets), PANEL_STATE.IDLE);
});

test('computePanelState: 하나라도 running 이면 running', () => {
	const preset = applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.RUNNING);
	assert.equal(computePanelState([preset, createItems(), createItems()]), PANEL_STATE.RUNNING);
});

test('computePanelState: 일부만 complete 이고 나머지가 waiting 이면 running', () => {
	const preset = applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.COMPLETE);
	assert.equal(computePanelState([preset, createItems(), createItems()]), PANEL_STATE.RUNNING);
});

test('computePanelState: 모든 프리셋의 모든 항목이 complete 이면 complete', () => {
	const complete = () => FIXTURE.reduce(
		(items, item) => applyTransition(items, item.id, ITEM_STATE.COMPLETE),
		createItems(),
	);
	const presets = PRESET_CONCURRENCIES.map(() => complete());
	assert.equal(computePanelState(presets), PANEL_STATE.COMPLETE);
});

test('computePanelState: 빈 항목(fixture 0개)은 complete(§10 edge case)', () => {
	assert.equal(computePanelState([]), PANEL_STATE.COMPLETE);
	assert.equal(computePanelState([[], [], []]), PANEL_STATE.COMPLETE);
});

test('describeProgress: idle 상태는 준비 안내 문구', () => {
	assert.equal(
		describeProgress([], PANEL_STATE.IDLE),
		'실행 준비됨. 실행 버튼을 누르세요.',
	);
});

test('describeProgress: complete 상태는 완료 안내 문구', () => {
	assert.equal(
		describeProgress([], PANEL_STATE.COMPLETE),
		'모든 프리셋 실행이 완료되었습니다.',
	);
});

test('describeProgress: running 상태는 프리셋별 완료/실행/대기 개수를 요약한다', () => {
	const items = applyTransition(
		applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.COMPLETE),
		FIXTURE[1].id,
		ITEM_STATE.RUNNING,
	);
	const presets = [{concurrency: 1, items}];
	const summary = describeProgress(presets, PANEL_STATE.RUNNING);

	assert.ok(summary.startsWith('실행 중 —'));
	// 6개 중 1 complete, 1 running, 나머지 4 waiting.
	assert.ok(summary.includes('동시성 1: 완료 1, 실행 1, 대기 4'));
});
