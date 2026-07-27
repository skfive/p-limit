// 상태 구독 API(limit.subscribe) 단위 테스트 (F68F701A7A-77)
// node:test 기반 focused 유닛 테스트. 실행: `node --test tests/demo-subscribe.test.js`
// 동결 계약(docs/plans/subscribe-inspector-plan.md)의 snapshot shape·발화 시점·예외
// 격리·unsubscribe 의미를 검증한다. 기존 공개 API의 timing/정산 의미는 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import pLimit, {limitFunction} from '../index.js';

// 수동으로 해소 시점을 제어하는 태스크(전이를 결정적으로 관찰하기 위함).
function deferred() {
	let resolve;
	const promise = new Promise(innerResolve => {
		resolve = innerResolve;
	});
	return {promise, resolve};
}

// 대기 중인 microtask/next()가 모두 흐르도록 한 틱 양보한다.
const tick = () => new Promise(resolve => {
	setImmediate(resolve);
});

test('subscribe()는 계약 shape의 frozen snapshot을 전달한다', () => {
	const limit = pLimit(2);
	let snap;
	const unsubscribe = limit.subscribe(snapshot => {
		snap = snapshot;
	});

	// 태스크 없이 concurrency 변경만으로 1회 전이를 유발.
	limit.concurrency = 4;

	assert.equal(typeof unsubscribe, 'function');
	assert.ok(Object.isFrozen(snap), 'snapshot은 frozen이어야 한다');
	assert.deepEqual(
		Object.keys(snap).sort(),
		['activeCount', 'concurrency', 'pendingCount', 'status'],
	);
	assert.equal(snap.activeCount, 0);
	assert.equal(snap.pendingCount, 0);
	assert.equal(snap.concurrency, 4);
	assert.equal(snap.status, 'idle');
});

test('enqueue → start → settle 마다 통지하고 idle로 복귀한다', async () => {
	const limit = pLimit(1);
	const statuses = [];
	limit.subscribe(snapshot => statuses.push(snapshot.status));

	const task = deferred();
	const promise = limit(() => task.promise);

	// enqueue(대기 1 → idle), start(실행 1 = concurrency 1 → saturated)까지 동기 통지.
	assert.deepEqual(statuses, ['idle', 'saturated']);

	task.resolve();
	await promise;
	await tick();

	// settle 후 실행/대기 0, 상태 idle로 복귀.
	assert.equal(statuses.at(-1), 'idle');
	assert.equal(limit.activeCount, 0);
	assert.equal(limit.pendingCount, 0);
});

test('모든 슬롯이 찬 경우 saturated이며 active/pending이 정확하다', async () => {
	const limit = pLimit(2);
	let last;
	limit.subscribe(snapshot => {
		last = snapshot;
	});

	const tasks = [deferred(), deferred(), deferred()];
	const promises = tasks.map(current => limit(() => current.promise));

	// 2개 실행, 1개 대기 → saturated.
	assert.equal(last.status, 'saturated');
	assert.equal(last.activeCount, 2);
	assert.equal(last.pendingCount, 1);

	for (const current of tasks) {
		current.resolve();
	}

	await Promise.all(promises);
});

test('pause/resume는 통지하고, 이미 paused일 때 pause는 통지하지 않는다', async () => {
	const limit = pLimit(1);
	const statuses = [];
	limit.subscribe(snapshot => statuses.push(snapshot.status));

	const task = deferred();
	const promise = limit(() => task.promise);
	statuses.length = 0; // enqueue/start 통지는 제외하고 pause/resume만 관찰.

	limit.pause();
	assert.deepEqual(statuses, ['paused']);

	limit.pause(); // idempotent → 추가 통지 없음.
	assert.deepEqual(statuses, ['paused']);

	limit.resume();
	// 재개 후 실행 1 = concurrency 1 → saturated.
	assert.deepEqual(statuses, ['paused', 'saturated']);

	task.resolve();
	await promise;
});

test('clearQueue는 큐가 줄 때만 통지하고 제거 개수를 반환한다', async () => {
	const limit = pLimit(1);
	const task = deferred();
	const running = limit(() => task.promise); // 실행 중.
	limit(() => Promise.resolve()).catch(() => {}); // 대기 1건.

	const events = [];
	limit.subscribe(snapshot => events.push(snapshot));

	const removed = limit.clearQueue();
	assert.equal(removed, 1);
	assert.equal(events.length, 1);
	assert.equal(events[0].pendingCount, 0);

	// 비어 있는 큐를 다시 clear → 스냅샷 불변 → 통지 없음.
	const removedAgain = limit.clearQueue();
	assert.equal(removedAgain, 0);
	assert.equal(events.length, 1);

	task.resolve();
	await running;
});

test('concurrency 변경은 값이 실제로 바뀔 때만 통지한다', () => {
	const limit = pLimit(2);
	const events = [];
	limit.subscribe(snapshot => events.push(snapshot));

	limit.concurrency = 2; // 동일 값 → 통지 없음.
	assert.equal(events.length, 0);

	limit.concurrency = 5; // 변경 → 통지.
	assert.equal(events.length, 1);
	assert.equal(events[0].concurrency, 5);
});

test('unsubscribe 이후 통지가 중단되며 idempotent하다', () => {
	const limit = pLimit(2);
	let count = 0;
	const unsubscribe = limit.subscribe(() => {
		count++;
	});

	limit.concurrency = 3;
	assert.equal(count, 1);

	unsubscribe();
	limit.concurrency = 4;
	assert.equal(count, 1, 'unsubscribe 후에는 통지되지 않아야 한다');

	unsubscribe(); // idempotent — throw 없이 no-op.
	limit.concurrency = 5;
	assert.equal(count, 1);
});

test('한 listener의 예외가 limiter 실행과 다른 listener에 영향을 주지 않는다', async () => {
	const limit = pLimit(1);
	const seen = [];
	limit.subscribe(() => {
		throw new Error('listener boom');
	});
	limit.subscribe(snapshot => seen.push(snapshot.status));

	const task = deferred();
	let settled = false;
	const promise = limit(() => task.promise).then(() => {
		settled = true;
	});

	// throwing listener에도 불구하고 두 번째 listener는 전이를 관찰했다.
	assert.ok(seen.includes('saturated'));

	task.resolve();
	await promise;
	await tick();

	// limiter 실행/정산은 정상 진행.
	assert.equal(settled, true);
	assert.equal(limit.activeCount, 0);
});

test('listener는 구독 순서대로 통지된다', () => {
	const limit = pLimit(2);
	const order = [];
	limit.subscribe(() => order.push('a'));
	limit.subscribe(() => order.push('b'));

	limit.concurrency = 9; // 단일 전이 → a 다음 b.
	assert.deepEqual(order, ['a', 'b']);
});

test('subscribe는 함수가 아닌 인자를 거부한다', () => {
	const limit = pLimit(1);
	assert.throws(() => limit.subscribe(), {name: 'TypeError'});
	assert.throws(() => limit.subscribe(123), {name: 'TypeError'});
});

test('limitFunction도 동일한 subscribe 계약을 노출한다', async () => {
	const task = deferred();
	const limited = limitFunction(() => task.promise, {concurrency: 1});
	const statuses = [];
	const unsubscribe = limited.subscribe(snapshot => statuses.push(snapshot.status));

	const promise = limited();
	assert.ok(statuses.includes('saturated'));
	assert.equal(typeof unsubscribe, 'function');

	task.resolve();
	await promise;
});
