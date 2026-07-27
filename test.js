import process from 'node:process';
import {AsyncLocalStorage} from 'node:async_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import inRange from 'in-range';
import timeSpan from 'time-span';
import randomInt from 'random-int';
import pLimit, {limitFunction} from './index.js';

test('concurrency: 1', async t => {
	const input = [
		[10, 300],
		[20, 200],
		[30, 100],
	];

	const end = timeSpan();
	const limit = pLimit(1);

	const mapper = ([value, ms]) => limit(async () => {
		await delay(ms);
		return value;
	});

	t.deepEqual(await Promise.all(input.map(x => mapper(x))), [10, 20, 30]);
	t.true(inRange(end(), {start: 590, end: 650}));
});

test('concurrency: 4', async t => {
	const concurrency = 5;
	let running = 0;

	const limit = pLimit(concurrency);

	const input = Array.from({length: 100}, () => limit(async () => {
		running++;
		t.true(running <= concurrency);
		await delay(randomInt(30, 200));
		running--;
	}));

	await Promise.all(input);
});

test('propagates async execution context properly', async t => {
	const concurrency = 2;
	const limit = pLimit(concurrency);
	const store = new AsyncLocalStorage();

	const checkId = async id => {
		await Promise.resolve();
		t.is(id, store.getStore()?.id);
	};

	const startContext = async id => store.run({id}, () => limit(checkId, id));

	await Promise.all(Array.from({length: 100}, (_, id) => startContext(id)));
});

test('non-promise returning function', async t => {
	await t.notThrowsAsync(async () => {
		const limit = pLimit(1);
		await limit(() => null);
	});
});

test('continues after sync throw', async t => {
	const limit = pLimit(1);
	let ran = false;

	const promises = [
		limit(() => {
			throw new Error('err');
		}),
		limit(() => {
			ran = true;
		}),
	];

	try {
		await Promise.all(promises);
	} catch {}

	t.is(ran, true);
});

test('accepts additional arguments', async t => {
	const limit = pLimit(1);
	const symbol = Symbol('test');

	await limit(a => t.is(a, symbol), symbol);
});

test('shared context with a limited provider helper', async t => {
	const limit = pLimit(1);
	const sharedContext = {values: []};

	const runWithContext = (function_, ...arguments_) => limit(function_, sharedContext, ...arguments_);

	const addValue = async (context, value) => {
		context.values.push(value);
		await delay(10);
		return context.values.length;
	};

	const firstPromise = runWithContext(addValue, 'first');
	const secondPromise = runWithContext(addValue, 'second');

	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 1);

	const results = await Promise.all([firstPromise, secondPromise]);

	t.deepEqual(results, [1, 2]);
	t.deepEqual(sharedContext.values, ['first', 'second']);
});

test('does not ignore errors', async t => {
	const limit = pLimit(1);
	const error = new Error('🦄');

	const promises = [
		limit(async () => {
			await delay(30);
		}),
		limit(async () => {
			await delay(80);
			throw error;
		}),
		limit(async () => {
			await delay(50);
		}),
	];

	await t.throwsAsync(Promise.all(promises), {is: error});
});

test('runs all tasks asynchronously', async t => {
	const limit = pLimit(3);

	let value = 1;

	const one = limit(() => 1);
	const two = limit(() => value);

	t.is(limit.activeCount, 2);

	value = 2;

	const result = await Promise.all([one, two]);

	t.deepEqual(result, [1, 2]);
});

test('activeCount and pendingCount properties', async t => {
	const limit = pLimit(5);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);

	const runningPromise1 = limit(() => delay(1000));
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 0);

	await runningPromise1;
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);

	const immediatePromises = Array.from({length: 5}, () => limit(() => delay(1000)));
	const delayedPromises = Array.from({length: 3}, () => limit(() => delay(1000)));

	t.is(limit.activeCount, 5);
	t.is(limit.pendingCount, 3);

	await Promise.all(immediatePromises);
	t.is(limit.activeCount, 3);
	t.is(limit.pendingCount, 0);

	await Promise.all(delayedPromises);

	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

test('clearQueue', async t => {
	const limit = pLimit(1);

	Array.from({length: 1}, () => limit(() => delay(1000)));
	Array.from({length: 3}, () => limit(() => delay(1000)));

	await Promise.resolve();
	t.is(limit.pendingCount, 3);
	limit.clearQueue();
	t.is(limit.pendingCount, 0);
});

// Node.js 20 has a bug where DOMException is not properly handled by AVA's `throwsAsync`.
const testClearQueueRejects = process.versions.node.startsWith('20.') ? test.skip : test;

testClearQueueRejects('clearQueue rejects pending promises when enabled', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});

	const runningPromise = limit(() => delay(100));
	const pendingPromiseOne = limit(() => delay(10));
	const pendingPromiseTwo = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 2);

	limit.clearQueue();
	t.is(limit.pendingCount, 0);

	await runningPromise;
	await t.throwsAsync(pendingPromiseOne, {name: 'AbortError'});
	await t.throwsAsync(pendingPromiseTwo, {name: 'AbortError'});
});

testClearQueueRejects('clearQueue rejects pending map tasks with AbortError and counts converge', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});

	let firstStarted = false;
	let firstCompleted = false;

	const mapPromise = limit.map([1, 2, 3], async value => {
		if (value === 1) {
			firstStarted = true;
			await delay(100);
			firstCompleted = true;
			return value;
		}

		await delay(10);
		return value;
	});

	// Let the first task start running while the rest stay queued
	await delay(0);
	t.true(firstStarted);
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);

	// Clearing the queue aborts the pending map tasks but leaves the running one alone
	limit.clearQueue();
	t.is(limit.pendingCount, 0);
	t.is(limit.activeCount, 1);
	t.false(firstCompleted);

	// The map rejects because its pending tasks were aborted
	await t.throwsAsync(mapPromise, {name: 'AbortError'});

	// Wait for the still-running task to finish so counts can settle
	await delay(150);
	t.true(firstCompleted);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

test('clearQueue returns the number of removed pending items and leaves active work untouched', async t => {
	const limit = pLimit(1);

	limit(() => delay(1000)); // Active
	Array.from({length: 3}, () => limit(() => delay(1000))); // Pending

	await Promise.resolve();
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 3);

	const removed = limit.clearQueue();
	t.is(removed, 3);
	t.is(limit.pendingCount, 0);
	// The active task is unaffected.
	t.is(limit.activeCount, 1);
});

test('clearQueue returns 0 when the queue is empty (no pending, active present)', async t => {
	const limit = pLimit(1);

	limit(() => delay(50)); // Active only

	await Promise.resolve();
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 0);

	t.is(limit.clearQueue(), 0);
	t.is(limit.activeCount, 1);
});

test('clearQueue returns 0 on repeat calls after the queue is already emptied', async t => {
	const limit = pLimit(1);

	limit(() => delay(1000)); // Active
	Array.from({length: 2}, () => limit(() => delay(1000))); // Pending

	await Promise.resolve();
	t.is(limit.pendingCount, 2);

	t.is(limit.clearQueue(), 2);
	t.is(limit.clearQueue(), 0);
});

test('clearQueue(reason) rejects pending promises with the given Error even when rejectOnClear is false', async t => {
	const limit = pLimit(1);
	const reason = new Error('boom');

	limit(() => delay(100)); // Active
	const pendingOne = limit(() => delay(10));
	const pendingTwo = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 2);

	const removed = limit.clearQueue(reason);
	t.is(removed, 2);
	t.is(limit.pendingCount, 0);

	await t.throwsAsync(pendingOne, {is: reason});
	await t.throwsAsync(pendingTwo, {is: reason});
});

test('clearQueue(reason) rejects with a string reason as-is (no Error wrapping)', async t => {
	const limit = pLimit(1);

	limit(() => delay(100)); // Active
	const pending = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 1);

	t.is(limit.clearQueue('nope'), 1);

	await t.notThrowsAsync((async () => {
		try {
			await pending;
			t.fail('pending promise should have rejected');
		} catch (error) {
			t.is(error, 'nope'); // Rejected with the string value as-is, not wrapped in an Error.
		}
	})());
});

test('clearQueue(reason) rejects with a non-Error reason value passed through unchanged', async t => {
	const limit = pLimit(1);
	const reason = {code: 'CANCELLED'};

	limit(() => delay(100)); // Active
	const pending = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 1);

	limit.clearQueue(reason);

	await t.notThrowsAsync((async () => {
		try {
			await pending;
			t.fail('pending promise should have rejected');
		} catch (error) {
			t.is(error, reason);
		}
	})());
});

test('clearQueue(reason) overrides the default AbortError when rejectOnClear is true', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});
	const reason = new Error('explicit');

	limit(() => delay(100)); // Active
	const pending = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 1);

	t.is(limit.clearQueue(reason), 1);

	await t.throwsAsync(pending, {is: reason});
});

test('clearQueue(null) treats null as a specified reason (not "unspecified")', async t => {
	const limit = pLimit(1);

	limit(() => delay(100)); // Active
	const pending = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 1);

	t.is(limit.clearQueue(null), 1);

	await t.notThrowsAsync((async () => {
		try {
			await pending;
			t.fail('pending promise should have rejected');
		} catch (error) {
			t.is(error, null);
		}
	})());
});

test('clearQueue(falsy reason) treats falsy values as specified reasons', async t => {
	const limit = pLimit(1);

	limit(() => delay(100)); // Active
	const pending = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.pendingCount, 1);

	t.is(limit.clearQueue(0), 1);

	await t.notThrowsAsync((async () => {
		try {
			await pending;
			t.fail('pending promise should have rejected');
		} catch (error) {
			t.is(error, 0);
		}
	})());
});

test('limitFunction() clearQueue returns the removed count delegated from the underlying limiter', async t => {
	const limitedFunction = limitFunction(() => delay(1000), {concurrency: 1});

	limitedFunction(); // Active
	limitedFunction();
	limitedFunction();

	await Promise.resolve();
	t.is(limitedFunction.pendingCount, 2);

	t.is(limitedFunction.clearQueue(), 2);
	t.is(limitedFunction.pendingCount, 0);
	t.is(limitedFunction.activeCount, 1);
});

test('limitFunction() clearQueue(reason) delegates the reason to the underlying limiter', async t => {
	const limitedFunction = limitFunction(() => delay(100), {concurrency: 1});
	const reason = new Error('delegated');

	limitedFunction(); // Active
	const pending = limitedFunction();

	await Promise.resolve();
	t.is(limitedFunction.pendingCount, 1);

	t.is(limitedFunction.clearQueue(reason), 1);

	await t.throwsAsync(pending, {is: reason});
});

test('map', async t => {
	const limit = pLimit(1);
	const results = await limit.map([1, 2, 3, 4, 5, 6, 7], input => input + 1);

	t.deepEqual(results, [2, 3, 4, 5, 6, 7, 8]);
});

test('map works when detached from the limit', async t => {
	const limit = pLimit(1);
	const {map} = limit;
	let running = 0;
	let maxRunning = 0;
	const mapper = async input => {
		running++;
		maxRunning = Math.max(maxRunning, running);
		await delay(10);
		running--;
		return input * 2;
	};

	const directResult = limit(mapper, 1);
	const mapResult = map([2, 3], mapper);

	t.deepEqual(await Promise.all([directResult, mapResult]), [2, [4, 6]]);
	t.is(maxRunning, 1);
});

test('map passes index and preserves order with concurrency', async t => {
	const limit = pLimit(3);
	const inputs = [10, 10, 10, 10, 10];

	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const results = await limit.map(inputs, async (value, index) => {
		// Simulate variable async duration per index to shuffle completion order
		await delay((inputs.length - index) * 5);
		return value + index;
	});

	// Results should be in input order and include index
	t.deepEqual(results, [10, 11, 12, 13, 14]);
});

test('map accepts an iterable (set)', async t => {
	const limit = pLimit(2);
	const inputs = new Set([1, 2, 3, 4]);

	const results = await limit.map(inputs, input => input * 2); // eslint-disable-line unicorn/no-array-method-this-argument

	t.deepEqual(results, [2, 4, 6, 8]);
});

test('map accepts an iterable (array iterator)', async t => {
	const limit = pLimit(2);
	const inputs = [1, 2, 3, 4].values();

	const results = await limit.map(inputs, input => input * 2); // eslint-disable-line unicorn/no-array-method-this-argument

	t.deepEqual(results, [2, 4, 6, 8]);
});

test('map accepts an async iterable and preserves draw order', async t => {
	const limit = pLimit(2);

	async function * source() {
		for (const value of [1, 2, 3]) {
			yield value;
		}
	}

	const results = await limit.map(source(), async value => {
		// Later items finish first, but the output must stay in draw order.
		await delay((4 - value) * 10);
		return value * 10;
	});

	t.deepEqual(results, [10, 20, 30]);
});

test('map preserves async draw order and index when completion order is shuffled', async t => {
	const limit = pLimit(3);

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5]) {
			yield value;
		}
	}

	const results = await limit.map(source(), async (value, index) => {
		await delay((6 - index) * 8);
		return `${index}:${value}`;
	});

	t.deepEqual(results, ['0:0', '1:1', '2:2', '3:3', '4:4', '5:5']);
});

test('map with an empty async iterable resolves to [] and never calls the mapper', async t => {
	const limit = pLimit(2);
	let called = 0;

	async function * source() {}

	const results = await limit.map(source(), async value => {
		called++;
		return value;
	});

	t.deepEqual(results, []);
	t.is(called, 0);
});

test('map lazily consumes an async iterable without pre-loading (in-flight <= concurrency)', async t => {
	const limit = pLimit(2);
	let drawn = 0;
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
			drawn++;
			inFlight++;
			inFlightMax = Math.max(inFlightMax, inFlight);
			yield value;
		}
	}

	const results = await limit.map(source(), async value => {
		await delay(15);
		inFlight--;
		return value * 2;
	});

	t.deepEqual(results, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
	// Never draws more than `concurrency` items ahead of completion.
	t.true(inFlightMax <= 2);
	t.is(drawn, 10);
});

test('map rejects when the mapper throws and calls the async iterator return() exactly once', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('mapper boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					return value < 5 ? {value: value++, done: false} : {value: undefined, done: true};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.map(iterable, async value => {
		if (value === 1) {
			throw error;
		}

		await delay(50);
		return value;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('map rejects when the async iterator itself rejects and cleans up once', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('iterator boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					if (value === 2) {
						throw error;
					}

					return {value: value++, done: false};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.map(iterable, async value => {
		await delay(10);
		return value;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('map raises in-flight async draws when concurrency increases mid-flight', async t => {
	const limit = pLimit(1);
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7]) {
			yield value;
		}
	}

	const promise = limit.map(source(), async value => {
		inFlight++;
		inFlightMax = Math.max(inFlightMax, inFlight);
		await delay(30);
		inFlight--;
		return value;
	});

	await delay(10);
	t.is(inFlight, 1);

	limit.concurrency = 3;

	const results = await promise;
	t.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7]);
	t.is(inFlightMax, 3);
});

test('accepts options object', async t => {
	const limit = pLimit({concurrency: 1});

	const input = [
		limit(async () => {
			await delay(50);
			return 1;
		}),
		limit(async () => {
			await delay(50);
			return 2;
		}),
	];

	t.deepEqual(await Promise.all(input), [1, 2]);
	t.is(limit.concurrency, 1);
});

test('throws on invalid concurrency argument', t => {
	t.throws(() => {
		pLimit(0);
	});

	t.throws(() => {
		pLimit(-1);
	});

	t.throws(() => {
		pLimit(1.2);
	});

	t.throws(() => {
		pLimit(undefined);
	});

	t.throws(() => {
		pLimit(true);
	});

	t.throws(() => {
		pLimit({});
	});

	t.throws(() => {
		pLimit({concurrency: 0});
	});
});

test('change concurrency to smaller value', async t => {
	const limit = pLimit(4);
	let running = 0;
	const log = [];
	const promises = Array.from({length: 10}).map(() =>
		limit(async () => {
			++running;
			log.push(running);
			await delay(50);
			--running;
		}));
	await delay(0);
	t.is(running, 4);

	limit.concurrency = 2;
	await Promise.all(promises);
	t.deepEqual(log, [1, 2, 3, 4, 2, 2, 2, 2, 2, 2]);
});

test('change concurrency to bigger value', async t => {
	const limit = pLimit(2);
	let running = 0;
	const log = [];
	const promises = Array.from({length: 10}).map(() =>
		limit(async () => {
			++running;
			log.push(running);
			await delay(50);
			--running;
		}));
	await delay(0);
	t.is(running, 2);

	limit.concurrency = 4;
	await Promise.all(promises);
	t.deepEqual(log, [1, 2, 3, 4, 4, 4, 4, 4, 4, 4]);
});

testClearQueueRejects('regression guard — clearQueue + rejectOnClear + map cancellation converges and the limiter stays usable afterwards', async t => {
	const limit = pLimit({concurrency: 2, rejectOnClear: true});

	const started = [];
	const completed = [];

	const mapPromise = limit.map([1, 2, 3, 4, 5], async value => {
		started.push(value);
		await delay(value <= 2 ? 100 : 10);
		completed.push(value);
		return value;
	});

	// Let the first two tasks start running while the rest stay queued
	await delay(0);
	t.is(limit.activeCount, 2);
	t.is(limit.pendingCount, 3);

	// Cancelling must abort every pending task without touching the running ones
	limit.clearQueue();
	t.is(limit.pendingCount, 0);
	t.is(limit.activeCount, 2);
	t.deepEqual(completed, []);

	// The map must reject (not hang forever) because its pending tasks were aborted
	await t.throwsAsync(mapPromise, {name: 'AbortError'});

	// The still-running tasks must be left alone and eventually converge to idle
	await delay(150);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.deepEqual(started.sort(), [1, 2]);
	t.deepEqual(completed.sort(), [1, 2]);

	// Convergence must be real, not cosmetic: the limiter must still accept and run new work afterwards
	const recovered = await limit.map([10, 20], async value => value * 2);
	t.deepEqual(recovered, [20, 40]);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

testClearQueueRejects('regression guard — clearQueue settles every individual pending promise (direct + map) and stays a safe no-op when idle', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});

	// Calling clearQueue before anything is queued must be a safe no-op.
	t.notThrows(() => limit.clearQueue());

	const runningPromise = limit(() => delay(50));
	const directPromiseOne = limit(() => delay(10));
	const directPromiseTwo = limit(() => delay(10));
	const mapPromise = limit.map([1, 2], async value => {
		await delay(10);
		return value;
	});

	await Promise.resolve();
	t.is(limit.pendingCount, 4);

	limit.clearQueue();
	t.is(limit.pendingCount, 0);

	// Aggregate rejection alone can hide a straggling pending promise, since
	// Promise.all short-circuits on the first rejection. Assert every individual
	// promise — both directly queued and map-internal — actually settles instead
	// of being left pending forever.
	const settled = await Promise.allSettled([directPromiseOne, directPromiseTwo, mapPromise]);
	t.true(settled.every(result => result.status === 'rejected'));
	t.true(settled.every(result => result.reason?.name === 'AbortError'));

	await runningPromise;
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);

	// Calling clearQueue on an idle limiter (queue already empty again) must remain a safe no-op.
	t.notThrows(() => limit.clearQueue());
});

test('limitFunction()', async t => {
	const concurrency = 5;
	let running = 0;

	const limitedFunction = limitFunction(async () => {
		running++;
		t.true(running <= concurrency);
		await delay(randomInt(30, 200));
		running--;
	}, {concurrency});

	const input = Array.from({length: 100}, limitedFunction);

	await Promise.all(input);
});

test('limitFunction() reports accurate activeCount and pendingCount', async t => {
	const limitedFunction = limitFunction(() => delay(50), {concurrency: 2});

	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);

	// Two run immediately, the remaining three wait in the queue.
	const promises = Array.from({length: 5}, () => limitedFunction());

	t.is(limitedFunction.activeCount, 2);
	t.is(limitedFunction.pendingCount, 3);

	await Promise.all(promises);

	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);
});

test('limitFunction() applies a raised concurrency to already-queued work', async t => {
	const limitedFunction = limitFunction(() => delay(50), {concurrency: 2});

	const promises = Array.from({length: 6}, () => limitedFunction());
	t.is(limitedFunction.activeCount, 2);
	t.is(limitedFunction.pendingCount, 4);

	limitedFunction.concurrency = 4;
	t.is(limitedFunction.concurrency, 4);

	// Promotion of queued work happens in a microtask.
	await delay(0);
	t.is(limitedFunction.activeCount, 4);
	t.is(limitedFunction.pendingCount, 2);

	await Promise.all(promises);
	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);
});

test('limitFunction() concurrency getter/setter validates input and keeps the old value on error', t => {
	const limitedFunction = limitFunction(async () => {}, {concurrency: 3});

	t.is(limitedFunction.concurrency, 3);

	limitedFunction.concurrency = 5;
	t.is(limitedFunction.concurrency, 5);

	t.throws(() => {
		limitedFunction.concurrency = 0;
	});

	// An invalid assignment must leave the previous value intact.
	t.is(limitedFunction.concurrency, 5);
});

test('limitFunction() clearQueue discards pending calls but keeps active ones', async t => {
	const limitedFunction = limitFunction(() => delay(1000), {concurrency: 1});

	limitedFunction();
	limitedFunction();
	limitedFunction();

	await Promise.resolve();
	t.is(limitedFunction.activeCount, 1);
	t.is(limitedFunction.pendingCount, 2);

	limitedFunction.clearQueue();
	t.is(limitedFunction.pendingCount, 0);
	t.is(limitedFunction.activeCount, 1);
});

testClearQueueRejects('limitFunction() clearQueue rejects pending calls when rejectOnClear is enabled', async t => {
	const limitedFunction = limitFunction(() => delay(100), {concurrency: 1, rejectOnClear: true});

	const runningPromise = limitedFunction();
	const pendingPromiseOne = limitedFunction();
	const pendingPromiseTwo = limitedFunction();

	await Promise.resolve();
	t.is(limitedFunction.activeCount, 1);
	t.is(limitedFunction.pendingCount, 2);

	limitedFunction.clearQueue();
	t.is(limitedFunction.pendingCount, 0);
	t.is(limitedFunction.activeCount, 1);

	await runningPromise;
	await t.throwsAsync(pendingPromiseOne, {name: 'AbortError'});
	await t.throwsAsync(pendingPromiseTwo, {name: 'AbortError'});

	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);
});

test('limitFunction() preserves FIFO execution order', async t => {
	const started = [];
	const limitedFunction = limitFunction(async value => {
		started.push(value);
		await delay(10);
		return value;
	}, {concurrency: 1});

	const results = await Promise.all([1, 2, 3, 4].map(value => limitedFunction(value)));

	t.deepEqual(results, [1, 2, 3, 4]);
	t.deepEqual(started, [1, 2, 3, 4]);
});

test('limitFunction() forwards arguments and keeps the existing no-this behavior', async t => {
	const calls = [];
	const context = {id: 'ctx'};

	const limitedFunction = limitFunction(function (a, b, c) {
		calls.push({arguments_: [a, b, c], this: this});
	}, {concurrency: 1});

	await limitedFunction.call(context, 1, 2, 3);

	t.deepEqual(calls[0].arguments_, [1, 2, 3]);
	// `this` is intentionally not forwarded — unchanged behavior.
	t.not(calls[0].this, context);
});

// --- onIdle() (F68F701A7A-17) ---

const IDLE_PENDING = Symbol('idle-pending');

// Resolves `true` if `promise` is still unresolved after `ms`, without using
// `.then()` (xo's promise/prefer-await-to-then) or timers/flags.
const isStillPending = async (promise, ms = 20) =>
	(await Promise.race([promise, delay(ms, IDLE_PENDING)])) === IDLE_PENDING;

test('onIdle() resolves immediately when the limiter is already idle', async t => {
	const limit = pLimit(2);

	// A freshly created limiter is idle: active/pending/in-flight map are all zero.
	await t.notThrowsAsync(limit.onIdle());

	// Calling again must still produce a fresh, resolving promise (no leak/cache).
	const first = limit.onIdle();
	const second = limit.onIdle();
	t.not(first, second);
	await t.notThrowsAsync(Promise.all([first, second]));
});

test('onIdle() waits until all active and pending tasks settle', async t => {
	const limit = pLimit(2);

	for (let index = 0; index < 5; index++) {
		limit(async () => delay(50));
	}

	const idle = limit.onIdle();
	t.true(await isStillPending(idle));
	t.true(limit.activeCount + limit.pendingCount > 0);

	await idle;
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

test('onIdle() resolves all concurrent waiters at the same idle transition', async t => {
	const limit = pLimit(1);

	limit(async () => delay(40));
	limit(async () => delay(40));

	const first = limit.onIdle();
	const second = limit.onIdle();
	const third = limit.onIdle();

	// Each call returns a distinct promise object.
	t.not(first, second);
	t.not(second, third);

	await t.notThrowsAsync(Promise.all([first, second, third]));
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

test('onIdle() resolves after a mapper rejects', async t => {
	const limit = pLimit(1);

	const mapped = limit.map([1, 2, 3], async value => {
		await delay(10);
		if (value === 2) {
			throw new Error('boom');
		}

		return value;
	});

	await t.throwsAsync(mapped, {message: 'boom'});

	// Even though the map rejected, every started task reached `next()`.
	await t.notThrowsAsync(limit.onIdle());
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
});

test('onIdle() resolves after a synchronous throw', async t => {
	const limit = pLimit(1);

	await t.throwsAsync(limit(() => {
		throw new Error('sync');
	}), {message: 'sync'});

	await t.notThrowsAsync(limit.onIdle());
});

test('onIdle() resolves after clearQueue() discards pending (rejectOnClear: false)', async t => {
	const limit = pLimit(1);

	limit(async () => delay(50)); // Active
	limit(async () => delay(50)); // Pending
	limit(async () => delay(50)); // Pending

	const idle = limit.onIdle();
	limit.clearQueue();
	t.is(limit.pendingCount, 0);

	// One active task still remains — not idle yet.
	t.true(await isStillPending(idle));

	await idle;
	t.is(limit.activeCount, 0);
});

test('onIdle() resolves after clearQueue() rejects pending (rejectOnClear: true)', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});

	const active = limit(async () => delay(50));
	const pending = limit(async () => delay(50));

	const idle = limit.onIdle();
	limit.clearQueue();

	await t.throwsAsync(pending);

	// The remaining active task is unaffected — still not idle.
	t.true(await isStillPending(idle, 15));

	await active;
	await idle;
	t.is(limit.activeCount, 0);
});

test('onIdle() is not resolved early by a concurrency change', async t => {
	const limit = pLimit(1);

	for (let index = 0; index < 4; index++) {
		limit(async () => delay(50));
	}

	const idle = limit.onIdle();
	limit.concurrency = 4;

	// Raising concurrency only promotes pending → active; it must not trigger idle.
	t.true(await isStillPending(idle));

	await idle;
	t.is(limit.activeCount, 0);
});

test('onIdle() works after the limiter has gone idle and is reused', async t => {
	const limit = pLimit(1);

	await limit(async () => delay(10));
	await limit.onIdle(); // Idle now

	limit(async () => delay(50));
	const idle = limit.onIdle();
	t.true(await isStillPending(idle));

	await idle;
	t.is(limit.activeCount, 0);
});

test('onIdle() does not resolve early while an async-iterable map is in progress', async t => {
	const limit = pLimit(1);

	async function * source() {
		yield * [0, 1, 2, 3, 4];
	}

	const mapped = limit.map(source(), async value => {
		await delay(20);
		return value;
	});

	const idle = limit.onIdle();

	// While the lazy map is still drawing, `activeCount` can momentarily hit 0
	// between a draw settling and the next draw, but `mapSchedulers` keeps the
	// limiter non-idle. ~5 items × 20ms ≫ 60ms sampling window.
	t.true(await isStillPending(idle, 60));

	await mapped;
	await idle;
	t.is(limit.activeCount, 0);
});

test('onIdle() waits for all concurrent async-iterable maps to settle', async t => {
	const limit = pLimit(2);

	async function * source(values) {
		yield * values;
	}

	const a = limit.map(source([0, 1, 2]), async value => {
		await delay(10);
		return value;
	});
	const b = limit.map(source([0, 1, 2, 3, 4, 5, 6, 7]), async value => {
		await delay(20);
		return value;
	});

	const idle = limit.onIdle();

	await a;
	// `a` is done but `b` is still in flight — still not idle.
	t.true(await isStillPending(idle, 10));

	await b;
	await idle;
	t.is(limit.activeCount, 0);
});

test('limitFunction() exposes onIdle() delegating to the underlying limiter', async t => {
	const limitedFunction = limitFunction(async () => delay(50), {concurrency: 1});

	// Immediate idle before any call.
	await t.notThrowsAsync(limitedFunction.onIdle());

	limitedFunction();
	limitedFunction();

	const idle = limitedFunction.onIdle();
	t.true(await isStillPending(idle));

	await idle;
	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);
});

// --- isIdle (F68F701A7A-32) ---

test('isIdle is true for a freshly created limiter', t => {
	const limit = pLimit(2);
	t.true(limit.isIdle);
});

test('isIdle is false while a task is active and true once it settles', async t => {
	const limit = pLimit(1);

	const running = limit(async () => delay(30));
	t.false(limit.isIdle);

	await running;
	t.true(limit.isIdle);
});

test('isIdle is false while tasks are pending (active + queued) and true after all settle', async t => {
	const limit = pLimit(1);

	const promises = Array.from({length: 3}, () => limit(async () => delay(20)));

	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);
	t.false(limit.isIdle);

	await Promise.all(promises);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.true(limit.isIdle);
});

test('isIdle stays false while an active task remains after clearQueue() and becomes true once it ends', async t => {
	const limit = pLimit(1);

	const active = limit(async () => delay(40)); // Active
	limit(async () => delay(40)); // Pending
	limit(async () => delay(40)); // Pending

	await Promise.resolve();
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);

	limit.clearQueue();
	t.is(limit.pendingCount, 0);
	// The active task still runs — not idle yet.
	t.false(limit.isIdle);

	await active;
	t.true(limit.isIdle);
});

test('isIdle is false while an async-iterable map is in progress', async t => {
	const limit = pLimit(1);

	async function * source() {
		yield * [0, 1, 2, 3];
	}

	const mapped = limit.map(source(), async value => {
		await delay(15);
		return value;
	});

	// While the lazy map draws, `activeCount` can momentarily hit 0 between a draw
	// settling and the next draw, but the limiter must still report non-idle until
	// the map fully settles (mirrors the `onIdle()` contract).
	t.false(limit.isIdle);

	await mapped;
	t.true(limit.isIdle);
});

test('isIdle reflects the idle state around concurrent completion', async t => {
	const limit = pLimit(3);

	const promises = Array.from({length: 3}, () => limit(async () => delay(20)));
	t.is(limit.activeCount, 3);
	t.false(limit.isIdle);

	// All three settle together — the limiter must converge to idle.
	await Promise.all(promises);
	t.true(limit.isIdle);
});

test('limitFunction() exposes isIdle delegating to the underlying limiter', async t => {
	const limitedFunction = limitFunction(async () => delay(30), {concurrency: 1});

	t.true(limitedFunction.isIdle);

	const running = limitedFunction();
	t.false(limitedFunction.isIdle);

	await running;
	t.true(limitedFunction.isIdle);
});

// --- mapSettled (F68F701A7A-90) ---
// `limit.mapSettled` mirrors `Promise.allSettled`: every element settles, an
// individual mapper rejection becomes a per-index `{status: 'rejected', reason}`
// entry (never rejecting the whole call), and results stay in input (draw) order.
// Only an input-iterator failure rejects the returned promise.

test('[S1] mapSettled settles all fulfilled and preserves input order (sync iterable)', async t => {
	const limit = pLimit(2);

	const results = await limit.mapSettled([1, 2, 3], async n => n * 10);

	t.deepEqual(results, [
		{status: 'fulfilled', value: 10},
		{status: 'fulfilled', value: 20},
		{status: 'fulfilled', value: 30},
	]);
});

test('[S2] mapSettled records a rejected entry per failing mapper without rejecting the whole call (sync iterable)', async t => {
	const limit = pLimit(2);
	const error = new Error('boom');

	const results = await limit.mapSettled([1, 2, 3], async n => {
		if (n === 2) {
			throw error;
		}

		return n * 10;
	});

	t.deepEqual(results, [
		{status: 'fulfilled', value: 10},
		{status: 'rejected', reason: error},
		{status: 'fulfilled', value: 30},
	]);
});

test('[S3] mapSettled with an empty iterable resolves to [] and never calls the mapper', async t => {
	const limit = pLimit(2);
	let called = 0;

	const results = await limit.mapSettled([], async value => {
		called++;
		return value;
	});

	t.deepEqual(results, []);
	t.is(called, 0);
});

test('[S4] mapSettled passes a 0-based index to the mapper', async t => {
	const limit = pLimit(2);

	const results = await limit.mapSettled(['a', 'b', 'c'], async (value, index) => `${index}:${value}`);

	t.deepEqual(results, [
		{status: 'fulfilled', value: '0:a'},
		{status: 'fulfilled', value: '1:b'},
		{status: 'fulfilled', value: '2:c'},
	]);
});

test('[S5] mapSettled with concurrency 1 runs sequentially and preserves order', async t => {
	const limit = pLimit(1);
	let running = 0;
	let maxRunning = 0;
	const started = [];

	const results = await limit.mapSettled([1, 2, 3, 4], async n => {
		running++;
		maxRunning = Math.max(maxRunning, running);
		started.push(n);
		await delay(10);
		running--;
		return n * 2;
	});

	t.is(maxRunning, 1);
	t.deepEqual(started, [1, 2, 3, 4]);
	t.deepEqual(results, [
		{status: 'fulfilled', value: 2},
		{status: 'fulfilled', value: 4},
		{status: 'fulfilled', value: 6},
		{status: 'fulfilled', value: 8},
	]);
});

test('[A1] mapSettled settles an async iterable in draw order despite shuffled completion', async t => {
	const limit = pLimit(2);

	async function * source() {
		for (const value of [1, 2, 3]) {
			yield value;
		}
	}

	const results = await limit.mapSettled(source(), async value => {
		// Later items finish first, but the output must stay in draw order.
		await delay((4 - value) * 10);
		return value * 10;
	});

	t.deepEqual(results, [
		{status: 'fulfilled', value: 10},
		{status: 'fulfilled', value: 20},
		{status: 'fulfilled', value: 30},
	]);
});

test('[A2] mapSettled keeps consuming after a mapper rejects mid-stream (async iterable)', async t => {
	const limit = pLimit(2);
	const error = new Error('bad');

	async function * source() {
		yield 'a';
		yield 'b'; // Fails
		yield 'c';
	}

	const results = await limit.mapSettled(source(), async value => {
		if (value === 'b') {
			throw error;
		}

		return value.toUpperCase();
	});

	t.deepEqual(results, [
		{status: 'fulfilled', value: 'A'},
		{status: 'rejected', reason: error},
		{status: 'fulfilled', value: 'C'},
	]);
});

test('[A3] mapSettled lazily consumes an async iterable (in-flight <= concurrency)', async t => {
	const limit = pLimit(2);
	let drawn = 0;
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
			drawn++;
			inFlight++;
			inFlightMax = Math.max(inFlightMax, inFlight);
			yield value;
		}
	}

	const results = await limit.mapSettled(source(), async value => {
		await delay(15);
		inFlight--;
		return value;
	});

	t.is(results.length, 10);
	t.true(results.every(result => result.status === 'fulfilled'));
	// Never draws more than `concurrency` items ahead of completion.
	t.true(inFlightMax <= 2);
	t.is(drawn, 10);
});

test('[A4] mapSettled rejects when the async iterator itself throws and cleans up once', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('iterator boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					if (value === 2) {
						throw error;
					}

					return {value: value++, done: false};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// The input iterator failing (unlike a mapper rejection) rejects the whole call.
	await t.throwsAsync(limit.mapSettled(iterable, async value => {
		await delay(10);
		return value;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('[A5] mapSettled raises in-flight async draws when concurrency increases mid-flight', async t => {
	const limit = pLimit(1);
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7]) {
			yield value;
		}
	}

	const promise = limit.mapSettled(source(), async value => {
		inFlight++;
		inFlightMax = Math.max(inFlightMax, inFlight);
		await delay(30);
		inFlight--;
		return value;
	});

	await delay(10);
	t.is(inFlight, 1);

	limit.concurrency = 3;

	const results = await promise;
	t.is(results.length, 8);
	t.true(results.every(result => result.status === 'fulfilled'));
	t.is(inFlightMax, 3);
});

test('[I1] mapSettled holds off new async draws while paused and completes after resume', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3]) {
			drawn++;
			yield value;
		}
	}

	const mapped = limit.mapSettled(source(), async value => {
		await delay(15);
		return value * 10;
	});

	// Let the first draw start, then pause before the rest are drawn.
	await delay(5);
	limit.pause();
	const drawnAtPause = drawn;

	await delay(40);
	// No new draws happened while paused.
	t.is(drawn, drawnAtPause);

	limit.resume();
	const results = await mapped;

	t.deepEqual(results, [
		{status: 'fulfilled', value: 0},
		{status: 'fulfilled', value: 10},
		{status: 'fulfilled', value: 20},
		{status: 'fulfilled', value: 30},
	]);
	t.is(drawn, 4);
});

test('[I2] mapSettled absorbs clearQueue-rejected pending tasks as rejected entries without rejecting the whole call', async t => {
	const limit = pLimit(1);
	const reason = new Error('cleared');

	const mapped = limit.mapSettled([1, 2, 3], async n => {
		await delay(20);
		return n * 10;
	});

	// Concurrency 1: index 0 is active, indexes 1 and 2 wait in the queue.
	await Promise.resolve();
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);

	limit.clearQueue(reason);
	t.is(limit.pendingCount, 0);

	const results = await mapped;

	t.deepEqual(results, [
		{status: 'fulfilled', value: 10},
		{status: 'rejected', reason},
		{status: 'rejected', reason},
	]);
});

test('[I3] mapSettled keeps the limiter non-idle until it settles, then onIdle resolves', async t => {
	const limit = pLimit(1);

	async function * source() {
		yield * [0, 1, 2, 3];
	}

	const mapped = limit.mapSettled(source(), async value => {
		await delay(15);
		return value;
	});

	t.false(limit.isIdle);

	const idle = limit.onIdle();
	// While the lazy map is still drawing, the limiter must stay non-idle.
	t.true(await isStillPending(idle, 40));

	await mapped;
	await idle;
	t.true(limit.isIdle);
	t.is(limit.activeCount, 0);
});

// --- isSaturated (F68F701A7A-36) ---

test('isSaturated is false for a freshly created limiter', t => {
	const limit = pLimit(2);
	t.false(limit.isSaturated);
});

test('isSaturated is false while active tasks stay below concurrency', async t => {
	const limit = pLimit(3);

	const promises = Array.from({length: 2}, () => limit(async () => delay(30)));
	t.is(limit.activeCount, 2);
	// Two active out of three slots — still a free slot, not saturated.
	t.false(limit.isSaturated);

	await Promise.all(promises);
	t.false(limit.isSaturated);
});

test('isSaturated is true exactly when active tasks reach concurrency', async t => {
	const limit = pLimit(2);

	const promises = Array.from({length: 2}, () => limit(async () => delay(30)));
	t.is(limit.activeCount, 2);
	t.true(limit.isSaturated);

	await Promise.all(promises);
	// All settled — slots free again.
	t.false(limit.isSaturated);
});

test('isSaturated is true while tasks are pending (active === concurrency, queue non-empty)', async t => {
	const limit = pLimit(1);

	const promises = Array.from({length: 3}, () => limit(async () => delay(20)));
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);
	// The single slot is taken and work is queued behind it.
	t.true(limit.isSaturated);

	await Promise.all(promises);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.false(limit.isSaturated);
});

test('isSaturated flips to false synchronously when concurrency is raised above the active count', async t => {
	const limit = pLimit(1);

	const promises = Array.from({length: 3}, () => limit(async () => delay(30)));
	t.is(limit.activeCount, 1);
	t.true(limit.isSaturated);

	// Raising the limit frees a slot immediately — the getter must reflect it
	// synchronously, before the microtask that promotes queued work runs.
	limit.concurrency = 2;
	t.false(limit.isSaturated);

	await Promise.all(promises);
});

test('isSaturated flips to true synchronously when concurrency is lowered to the active count', async t => {
	const limit = pLimit(3);

	const promises = Array.from({length: 2}, () => limit(async () => delay(30)));
	t.is(limit.activeCount, 2);
	t.false(limit.isSaturated);

	// Lowering the limit to the current active count saturates immediately.
	limit.concurrency = 2;
	t.true(limit.isSaturated);

	await Promise.all(promises);
});

test('isSaturated is always false for an infinite-concurrency limiter', async t => {
	const limit = pLimit(Number.POSITIVE_INFINITY);

	const promises = Array.from({length: 5}, () => limit(async () => delay(20)));
	t.is(limit.activeCount, 5);
	// No finite active count can ever reach infinite concurrency.
	t.false(limit.isSaturated);

	await Promise.all(promises);
	t.false(limit.isSaturated);
});

test('limitFunction() exposes isSaturated delegating to the underlying limiter', async t => {
	const limitedFunction = limitFunction(async () => delay(30), {concurrency: 1});

	t.false(limitedFunction.isSaturated);

	const running = limitedFunction();
	t.true(limitedFunction.isSaturated);

	await running;
	t.false(limitedFunction.isSaturated);
});

// --- isSaturated complexity guard (F68F701A7A-38) ---
// The doc/type contract (readme.md, index.d.ts) promises `isSaturated` is an O(1)
// read — its cost must never grow with activeCount, pendingCount, or in-flight `map`
// draws. These guards keep that contract from silently regressing to an O(n)
// implementation (e.g. iterating the queue) as the code evolves.

test('isSaturated getter performs a plain O(1) comparison — no loop/iteration/allocation (analysis)', t => {
	const limit = pLimit(2);
	const descriptor = Object.getOwnPropertyDescriptor(limit, 'isSaturated');

	t.is(typeof descriptor.get, 'function');
	t.is(descriptor.set, undefined); // Read-only — no setter to reason about.

	const getterSource = descriptor.get.toString();

	// The read's cost must be independent of how many tasks are active, pending, or
	// being lazily drawn by `map` — so the getter body must not loop/iterate...
	t.notRegex(
		getterSource,
		/\bfor\s*\(|\.forEach\(|\.reduce\(|while\s*\(/,
		`isSaturated getter must not contain a loop (found in: ${getterSource})`,
	);
	// ...must not read a collection whose size scales with task count...
	t.notRegex(
		getterSource,
		/queue\.|mapSchedulers|idleWaiters/,
		`isSaturated getter must only compare the scalar activeCount/concurrency (found in: ${getterSource})`,
	);
	// ...and must not allocate (keeps space O(1) too).
	t.notRegex(
		getterSource,
		/\bnew\s+/,
		`isSaturated getter must not allocate (found in: ${getterSource})`,
	);
});

test('limitFunction() isSaturated getter delegates without adding its own loop/iteration (analysis)', t => {
	const limitedFunction = limitFunction(async () => {}, {concurrency: 1});
	const descriptor = Object.getOwnPropertyDescriptor(limitedFunction, 'isSaturated');

	t.is(typeof descriptor.get, 'function');
	t.is(descriptor.set, undefined);

	const getterSource = descriptor.get.toString();
	t.notRegex(
		getterSource,
		/\bfor\s*\(|\.forEach\(|\.reduce\(|while\s*\(/,
		`limitFunction() isSaturated getter must not loop (found in: ${getterSource})`,
	);
});

test('isSaturated read time does not scale with pending queue size (benchmark)', async t => {
	// Kept deliberately small (queue fill + reads finish in low single-digit ms): AVA runs
	// this file's tests concurrently in one process, so a longer synchronous busy-loop here
	// would block the event loop and could itself make unrelated timing-sensitive tests flaky.
	const measureReadTimeMs = async pendingSize => {
		const limit = pLimit(1);
		limit(() => new Promise(() => {})); // Occupies the only slot; deliberately never settles.
		await Promise.resolve();

		for (let index = 0; index < pendingSize; index++) {
			limit(() => {});
		}

		t.is(limit.pendingCount, pendingSize);

		const iterations = 5000;

		// Warm up the getter once before timing, so JIT warmup noise doesn't skew the read.
		for (let index = 0; index < 1000; index++) {
			if (limit.isSaturated) {
				// No-op — the branch just forces the read so it can't be optimized away.
			}
		}

		const start = process.hrtime.bigint();
		for (let index = 0; index < iterations; index++) {
			if (limit.isSaturated) {
				// No-op — the branch just forces the read so it can't be optimized away.
			}
		}

		const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

		limit.clearQueue(); // Drop the queued tasks; none of them were ever awaited on.
		return elapsedMs;
	};

	const small = await measureReadTimeMs(5);
	const large = await measureReadTimeMs(2000);

	// A true O(1) getter costs the same regardless of pending queue size. The generous
	// multiplier absorbs machine/CI noise while still catching an O(n) regression (e.g.
	// iterating the queue on every read), which would blow past this by orders of magnitude
	// at a 400x queue-size difference.
	t.true(
		large < (small * 20) + 50,
		`expected roughly constant read time regardless of queue size, got small=${small.toFixed(2)}ms large=${large.toFixed(2)}ms`,
	);
});

// --- pause() / resume() / isPaused (F68F701A7A-59) ---

test('pause() keeps newly submitted tasks pending instead of starting them', async t => {
	const limit = pLimit(2);
	t.is(limit.activeCount, 0);

	limit.pause();
	t.true(limit.isPaused);

	let started = false;
	const promises = [
		limit(async () => {
			started = true;
			await delay(10);
		}),
		limit(async () => delay(10)),
	];

	await delay(5);

	// Nothing started while paused, even though both slots were free.
	t.false(started);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 2);

	limit.resume();
	t.is(limit.activeCount, 2);
	t.is(limit.pendingCount, 0);

	await Promise.all(promises);
});

test('pause() lets already-running tasks settle normally', async t => {
	const limit = pLimit(1);

	let resolved = false;
	const running = limit(async () => {
		await delay(30);
		resolved = true;
		return 'done';
	});

	await Promise.resolve();
	t.is(limit.activeCount, 1);

	limit.pause();

	// The running task must still complete despite the pause.
	t.is(await running, 'done');
	t.true(resolved);
});

test('resume() promotes pending tasks up to concurrency in FIFO order', async t => {
	const limit = pLimit(2);
	limit.pause();

	const started = [];
	const promises = [1, 2, 3, 4].map(value => limit(async () => {
		started.push(value);
		await delay(20);
		return value;
	}));

	await delay(5);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 4);

	limit.resume();

	// Only up to `concurrency` (2) are promoted; queue order is preserved.
	t.is(limit.activeCount, 2);
	t.is(limit.pendingCount, 2);

	t.deepEqual(await Promise.all(promises), [1, 2, 3, 4]);
	t.deepEqual(started, [1, 2, 3, 4]);
});

test('concurrency raised while paused takes effect on resume', async t => {
	const limit = pLimit(1);
	limit.pause();

	const promises = Array.from({length: 4}, () => limit(async () => delay(20)));
	await delay(5);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 4);

	limit.concurrency = 3;
	// While paused the value updates but no draining happens yet.
	await delay(5);
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 4);

	limit.resume();
	// Promotion uses the new (raised) limit.
	t.is(limit.activeCount, 3);
	t.is(limit.pendingCount, 1);

	await Promise.all(promises);
	t.is(limit.activeCount, 0);
});

test('lowering concurrency while paused never cancels already-running tasks', async t => {
	const limit = pLimit(3);

	const promises = Array.from({length: 3}, () => limit(async () => delay(30)));
	await delay(5);
	t.is(limit.activeCount, 3);

	limit.pause();
	limit.concurrency = 1;

	// The three in-flight tasks keep running; neither pause nor lowering stops them.
	t.is(limit.activeCount, 3);

	await Promise.all(promises);
	t.is(limit.activeCount, 0);
});

test('clearQueue while paused discards pending tasks and resume starts nothing', async t => {
	const limit = pLimit(1);
	const reason = new Error('cleared while paused');

	const running = limit(() => delay(40)); // Active
	const pendingOne = limit(() => delay(10));
	const pendingTwo = limit(() => delay(10));

	await Promise.resolve();
	t.is(limit.activeCount, 1);
	t.is(limit.pendingCount, 2);

	limit.pause();
	const removed = limit.clearQueue(reason);
	t.is(removed, 2);
	t.is(limit.pendingCount, 0);

	await t.throwsAsync(pendingOne, {is: reason});
	await t.throwsAsync(pendingTwo, {is: reason});

	limit.resume();
	await delay(0);
	// Nothing left to start.
	t.is(limit.pendingCount, 0);

	await running;
	t.is(limit.activeCount, 0);
});

test('a paused limiter with pending tasks is never idle until resumed', async t => {
	const limit = pLimit(1);
	limit.pause();

	limit(() => delay(20));
	limit(() => delay(20));

	await Promise.resolve();
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 2);
	t.false(limit.isIdle);

	const idle = limit.onIdle();
	t.true(await isStillPending(idle));

	limit.resume();
	await idle;
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.true(limit.isIdle);
});

test('pause()/resume() are idempotent and isPaused reflects the transition', t => {
	const limit = pLimit(1);

	t.false(limit.isPaused);

	limit.pause();
	t.true(limit.isPaused);
	// A second pause is a no-op.
	limit.pause();
	t.true(limit.isPaused);

	limit.resume();
	t.false(limit.isPaused);
	// Resuming when not paused is a no-op.
	limit.resume();
	t.false(limit.isPaused);
});

test('pause() holds off new async-iterable map draws and resume() finishes them in order', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3]) {
			drawn++;
			yield value;
		}
	}

	const mapped = limit.map(source(), async value => {
		await delay(15);
		return value * 10;
	});

	// Let the first draw start, then pause before the rest are drawn.
	await delay(5);
	limit.pause();
	const drawnAtPause = drawn;

	await delay(40);
	// No new draws happened while paused.
	t.is(drawn, drawnAtPause);

	limit.resume();
	const results = await mapped;

	// Every value is processed and the output stays in draw order.
	t.deepEqual(results, [0, 10, 20, 30]);
	t.is(drawn, 4);
});

test('limitFunction() delegates pause()/resume()/isPaused to the underlying limiter', async t => {
	const limitedFunction = limitFunction(() => delay(20), {concurrency: 2});

	t.false(limitedFunction.isPaused);

	limitedFunction.pause();
	t.true(limitedFunction.isPaused);

	const promises = Array.from({length: 3}, () => limitedFunction());
	await delay(5);
	// Paused: nothing starts even with free slots.
	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 3);

	limitedFunction.resume();
	t.false(limitedFunction.isPaused);
	t.is(limitedFunction.activeCount, 2);
	t.is(limitedFunction.pendingCount, 1);

	await Promise.all(promises);
	t.is(limitedFunction.activeCount, 0);
	t.is(limitedFunction.pendingCount, 0);
});

// --- filter (F68F701A7A-96) ---
// `limit.filter` mirrors `Array.prototype.filter`: it keeps only the original
// items whose predicate resolves truthy, in input (draw) order regardless of
// completion order. Like `limit.map` (and unlike `mapSettled`), a predicate
// rejection is fatal — it rejects the whole call with that reason and, for async
// iterables, calls the iterator's `return()` once for cleanup.

test('[F1] filter keeps truthy items in input order (sync iterable)', async t => {
	const limit = pLimit(2);

	const results = await limit.filter([1, 2, 3, 4], async n => n % 2 === 0);

	t.deepEqual(results, [2, 4]);
});

test('[F2] filter never runs more predicates than the concurrency limit (sync iterable)', async t => {
	const limit = pLimit(2);
	let running = 0;
	let maxRunning = 0;

	const results = await limit.filter([1, 2, 3, 4, 5, 6], async n => {
		running++;
		maxRunning = Math.max(maxRunning, running);
		await delay(10);
		running--;
		return n > 3;
	});

	t.deepEqual(results, [4, 5, 6]);
	t.true(maxRunning <= 2);
});

test('[F3] filter preserves input order even when completion order is shuffled', async t => {
	const limit = pLimit(3);
	const inputs = [0, 1, 2, 3, 4, 5];

	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const results = await limit.filter(inputs, async (value, index) => {
		// Later indexes finish first, but the output must stay in input order.
		await delay((inputs.length - index) * 5);
		return value % 2 === 0;
	});

	t.deepEqual(results, [0, 2, 4]);
});

test('[F4] filter uses JavaScript truthiness (0/""/null/undefined/NaN excluded)', async t => {
	const limit = pLimit(2);
	const inputs = ['keep-a', 'keep-b', 'drop-c', 'keep-d', 'drop-e'];

	// Return a variety of truthy/falsy verdicts (not just booleans).
	const verdicts = [1, 'yes', 0, {}, ''];

	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const results = await limit.filter(inputs, async (value, index) => verdicts[index]);

	t.deepEqual(results, ['keep-a', 'keep-b', 'keep-d']);
});

test('[F5] filter passes a 0-based draw index to the predicate', async t => {
	const limit = pLimit(2);
	const seen = [];

	const results = await limit.filter(['a', 'b', 'c'], async (value, index) => {
		seen.push([value, index]);
		return true;
	});

	t.deepEqual(results, ['a', 'b', 'c']);
	t.deepEqual(seen.sort((left, right) => left[1] - right[1]), [['a', 0], ['b', 1], ['c', 2]]);
});

test('[F6] filter resolves to [] for an empty iterable and never calls the predicate', async t => {
	const limit = pLimit(2);
	let called = 0;

	const results = await limit.filter([], async () => {
		called++;
		return true;
	});

	t.deepEqual(results, []);
	t.is(called, 0);
});

test('[F7] filter resolves to [] when every item is excluded', async t => {
	const limit = pLimit(2);

	const results = await limit.filter([1, 2, 3], async () => false);

	t.deepEqual(results, []);
});

test('[F8] filter returns the original items in order when every item passes', async t => {
	const limit = pLimit(2);

	const results = await limit.filter([3, 1, 2], async () => true);

	t.deepEqual(results, [3, 1, 2]);
});

test('[F9] filter accepts a sync iterable (set) and a sync predicate', async t => {
	const limit = pLimit(2);

	const results = await limit.filter(new Set([1, 2, 3, 4]), n => n > 2);

	t.deepEqual(results, [3, 4]);
});

test('[F10] filter keeps input order for an async iterable despite shuffled completion', async t => {
	const limit = pLimit(2);

	async function * source() {
		for (const value of [1, 2, 3, 4]) {
			yield value;
		}
	}

	const results = await limit.filter(source(), async (value, index) => {
		await delay((5 - index) * 10);
		return value % 2 === 1;
	});

	t.deepEqual(results, [1, 3]);
});

test('[F11] filter lazily consumes an async iterable (in-flight <= concurrency)', async t => {
	const limit = pLimit(2);
	let drawn = 0;
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
			drawn++;
			inFlight++;
			inFlightMax = Math.max(inFlightMax, inFlight);
			yield value;
		}
	}

	const results = await limit.filter(source(), async value => {
		await delay(15);
		inFlight--;
		return value % 2 === 0;
	});

	t.deepEqual(results, [0, 2, 4, 6, 8]);
	t.true(inFlightMax <= 2);
	t.is(drawn, 10);
});

test('[F12] filter rejects when the predicate throws and calls the async iterator return() once', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('predicate boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					return value < 5 ? {value: value++, done: false} : {value: undefined, done: true};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.filter(iterable, async value => {
		if (value === 1) {
			throw error;
		}

		await delay(50);
		return true;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('[F13] filter rejects when a sync-iterable predicate rejects (fail-fast, unlike mapSettled)', async t => {
	const limit = pLimit(2);
	const error = new Error('sync predicate boom');

	await t.throwsAsync(limit.filter([1, 2, 3], async n => {
		if (n === 2) {
			throw error;
		}

		return true;
	}), {is: error});
});

test('[F14] filter rejects when the async iterator itself rejects and cleans up once', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('iterator boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					if (value === 2) {
						throw error;
					}

					return {value: value++, done: false};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.filter(iterable, async () => {
		await delay(10);
		return true;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('[F15] filter raises in-flight async draws when concurrency increases mid-flight', async t => {
	const limit = pLimit(1);
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3, 4, 5, 6, 7]) {
			yield value;
		}
	}

	const promise = limit.filter(source(), async value => {
		inFlight++;
		inFlightMax = Math.max(inFlightMax, inFlight);
		await delay(30);
		inFlight--;
		return value % 2 === 0;
	});

	await delay(10);
	t.is(inFlight, 1);

	limit.concurrency = 3;

	const results = await promise;
	t.deepEqual(results, [0, 2, 4, 6]);
	t.is(inFlightMax, 3);
});

test('[F16] filter holds off new async draws while paused and completes after resume', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3]) {
			drawn++;
			yield value;
		}
	}

	const filtered = limit.filter(source(), async value => {
		await delay(15);
		return value % 2 === 0;
	});

	// Let the first draw start, then pause before the rest are drawn.
	await delay(5);
	limit.pause();
	const drawnAtPause = drawn;

	await delay(40);
	// No new draws happened while paused.
	t.is(drawn, drawnAtPause);

	limit.resume();
	const results = await filtered;

	t.deepEqual(results, [0, 2]);
	t.is(drawn, 4);
});

test('[F17] filter keeps the limiter non-idle until it settles, then onIdle resolves', async t => {
	const limit = pLimit(1);

	async function * source() {
		yield * [0, 1, 2, 3];
	}

	const filtered = limit.filter(source(), async value => {
		await delay(15);
		return value % 2 === 0;
	});

	t.false(limit.isIdle);

	const idle = limit.onIdle();
	// While the lazy filter is still drawing, the limiter must stay non-idle.
	t.true(await isStillPending(idle, 40));

	await filtered;
	await idle;
	t.true(limit.isIdle);
	t.is(limit.activeCount, 0);
});

test('[F18] limitFunction() exposes filter delegating to the underlying limiter', async t => {
	const limitedFunction = limitFunction(async n => n, {concurrency: 2});

	const results = await limitedFunction.filter([1, 2, 3, 4, 5], async n => n % 2 === 1);

	t.deepEqual(results, [1, 3, 5]);
});

// `limit.find` mirrors `Array.prototype.find`: it resolves to the first original
// item (by input/draw index) whose predicate resolves truthy, or `undefined` when
// nothing matches. Unlike `map`/`filter`/`mapSettled` (which consume the whole
// input), `find` stops early once the lowest matching index is confirmed: no
// further items are drawn and not-yet-started predicates never start. Predicates
// already in flight are allowed to settle so they never surface as unhandled
// rejections; for an async iterable the iterator's `return()` is called once. Like
// `map`/`filter` (and unlike `mapSettled`), a predicate rejection is fatal before
// the call settles. (INV-1..9 of the execution blueprint.)

test('[FIND1] find resolves to the first matching item (sync iterable)', async t => {
	const limit = pLimit(2);

	const result = await limit.find([1, 2, 3, 4], async n => n % 2 === 0);

	t.is(result, 2);
});

test('[FIND2] find returns the lowest input index even when a later index resolves truthy first (INV-1)', async t => {
	const limit = pLimit(2);

	// Index 0 (`a`) is slow-truthy, index 1 (`b`) is fast-truthy. The lowest input
	// index must win regardless of completion order.
	const result = await limit.find(['a', 'b'], async (_value, index) => {
		await delay(index === 0 ? 40 : 5);
		return true;
	});

	t.is(result, 'a');
});

test('[FIND3] find resolves to undefined when nothing matches (INV-9)', async t => {
	const limit = pLimit(2);

	const result = await limit.find([1, 2, 3], async () => false);

	t.is(result, undefined);
});

test('[FIND4] find resolves to undefined for an empty iterable and never calls the predicate (INV-9)', async t => {
	const limit = pLimit(2);
	let called = 0;

	const result = await limit.find([], async () => {
		called++;
		return true;
	});

	t.is(result, undefined);
	t.is(called, 0);
});

test('[FIND5] find uses JavaScript truthiness, not strict booleans (INV-9)', async t => {
	const limit = pLimit(1);
	const inputs = ['a', 'b', 'c'];

	// First two verdicts are falsy (0, ''), the third is a truthy non-boolean.
	const verdicts = [0, '', 'yes'];

	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const result = await limit.find(inputs, async (_value, index) => verdicts[index]);

	t.is(result, 'c');
});

test('[FIND6] find passes a 0-based draw index to the predicate (INV-9)', async t => {
	const limit = pLimit(1);
	const seen = [];

	// Concurrency 1 keeps the falsy draws strictly in input order.
	const result = await limit.find(['a', 'b', 'c'], async (_value, index) => {
		seen.push(index);
		return false;
	});

	t.is(result, undefined);
	t.deepEqual(seen, [0, 1, 2]);
});

test('[FIND7] find lazily consumes a sync iterable and stops drawing past the match (INV-4)', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	function * source() {
		for (const value of [1, 2, 3, 4, 5]) {
			drawn++;
			yield value;
		}
	}

	const result = await limit.find(source(), async n => n === 2);

	t.is(result, 2);
	// Only 1 and 2 are pulled; 3/4/5 are never drawn from the generator.
	t.is(drawn, 2);
});

test('[FIND8] find stops drawing an async iterable past the match (INV-2)', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	async function * source() {
		for (const value of [1, 2, 3, 4, 5, 6, 7, 8]) {
			drawn++;
			yield value;
		}
	}

	const result = await limit.find(source(), async n => n === 3);

	t.is(result, 3);
	t.is(drawn, 3);
});

test('[FIND9] find resolves for an infinite async iterable without hanging (INV-2)', async t => {
	const limit = pLimit(2);

	async function * naturals() {
		let n = 0;
		while (true) {
			yield n++;
		}
	}

	const result = await limit.find(naturals(), async n => n === 5);

	t.is(result, 5);
});

test('[FIND10] find lets an already-started predicate settle without an unhandled rejection after an earlier match wins (INV-3)', async t => {
	const limit = pLimit(3);

	await t.notThrowsAsync(async () => {
		const result = await limit.find([0, 1, 2], async (_value, index) => {
			if (index === 0) {
				return true; // Fast truthy — confirms match at index 0.
			}

			await delay(20);
			throw new Error(`late boom ${index}`); // Rejects after the call settled.
		});

		t.is(result, 0);
	});

	// Flush past the in-flight predicates' rejections: if they were not swallowed
	// they would surface as unhandled rejections and fail the run.
	await delay(50);
});

test('[FIND11] find rejects when a sync-iterable predicate rejects (fail-fast, unlike mapSettled) (INV-5)', async t => {
	const limit = pLimit(2);
	const error = new Error('predicate boom');

	await t.throwsAsync(limit.find([1, 2, 3], async n => {
		if (n === 1) {
			throw error;
		}

		return false;
	}), {is: error});
});

test('[FIND12] find rejects when the predicate throws and calls the async iterator return() once (INV-5)', async t => {
	const limit = pLimit(2);
	let returnCalls = 0;
	const error = new Error('async predicate boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					return value < 5 ? {value: value++, done: false} : {value: undefined, done: true};
				},
				async return() {
					returnCalls++;
					return {value: undefined, done: true};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.find(iterable, async value => {
		if (value === 1) {
			throw error;
		}

		await delay(50);
		return false;
	}), {is: error});

	t.is(returnCalls, 1);
});

test('[FIND13] find rejects when the async iterator itself rejects (INV-5)', async t => {
	const limit = pLimit(2);
	const error = new Error('iterator boom');

	const iterable = {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					if (value === 2) {
						throw error;
					}

					return {value: value++, done: false};
				},
			};
		},
	};

	// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
	await t.throwsAsync(limit.find(iterable, async () => {
		await delay(10);
		return false;
	}), {is: error});
});

test('[FIND14] find never runs more predicates than the concurrency limit (INV-6)', async t => {
	const limit = pLimit(2);
	let running = 0;
	let maxRunning = 0;

	const result = await limit.find([1, 2, 3, 4, 5, 6], async n => {
		running++;
		maxRunning = Math.max(maxRunning, running);
		await delay(10);
		running--;
		return n === 6;
	});

	t.is(result, 6);
	t.true(maxRunning <= 2);
});

test('[FIND15] find keeps the lowest matching index for an async iterable despite shuffled completion (INV-1)', async t => {
	const limit = pLimit(3);

	async function * source() {
		yield * ['a', 'b', 'c', 'd'];
	}

	// Both `b` (index 1) and `c` (index 2) match, and `c` completes first, but the
	// lower index `b` must win.
	const result = await limit.find(source(), async (value, index) => {
		await delay((4 - index) * 10);
		return value === 'b' || value === 'c';
	});

	t.is(result, 'b');
});

test('[FIND16] find holds off new async draws while paused and completes after resume (INV-7)', async t => {
	const limit = pLimit(1);
	let drawn = 0;

	async function * source() {
		for (const value of [0, 1, 2, 3]) {
			drawn++;
			yield value;
		}
	}

	const found = limit.find(source(), async value => {
		await delay(15);
		return value === 2;
	});

	// Let the first draw start, then pause before the rest are drawn.
	await delay(5);
	limit.pause();
	const drawnAtPause = drawn;

	await delay(40);
	// No new draws happened while paused.
	t.is(drawn, drawnAtPause);

	limit.resume();
	const result = await found;

	t.is(result, 2);
});

test('[FIND17] find resolves while paused when a running predicate already confirms the match (INV-7)', async t => {
	const limit = pLimit(1);

	const found = limit.find([10, 20, 30], async value => {
		await delay(20);
		return value === 10;
	});

	// Pause after the first predicate has started running.
	await delay(5);
	limit.pause();

	const result = await found;

	t.is(result, 10);
	t.true(limit.isPaused);
});

test('[FIND18] find rejects when a pending predicate is rejected by clearQueue(reason) (INV-8)', async t => {
	const limit = pLimit(1);
	const error = new Error('cleared');

	// Occupy the single slot so the find predicate cannot be promoted and sits
	// pending in the queue, where clearQueue can reject it.
	const blocker = limit(() => delay(100));

	const found = limit.find([1, 2, 3], async n => n === 1);

	await delay(10);
	const removed = limit.clearQueue(error);

	await t.throwsAsync(found, {is: error});
	t.is(removed, 1);

	await blocker;
});

test('[FIND19] find rejects with an AbortError when rejectOnClear clears a pending predicate (INV-8)', async t => {
	const limit = pLimit({concurrency: 1, rejectOnClear: true});

	const blocker = limit(() => delay(100));

	const found = limit.find([1, 2, 3], async n => n === 1);

	await delay(10);
	limit.clearQueue();

	await t.throwsAsync(found, {name: 'AbortError'});

	await blocker;
});

test('[FIND20] limitFunction() exposes find delegating to the underlying limiter', async t => {
	const limitedFunction = limitFunction(async n => n, {concurrency: 2});

	const result = await limitedFunction.find([1, 2, 3, 4, 5], async n => n > 3);

	t.is(result, 4);
});

test('[FIND21] find keeps the limiter non-idle until it settles, then onIdle resolves (INV-2)', async t => {
	const limit = pLimit(1);

	async function * source() {
		yield * [0, 1, 2, 3];
	}

	const found = limit.find(source(), async _value => {
		await delay(15);
		return false;
	});

	t.false(limit.isIdle);

	const idle = limit.onIdle();
	// While the lazy find is still drawing, the limiter must stay non-idle.
	t.true(await isStillPending(idle, 40));

	await found;
	await idle;
	t.true(limit.isIdle);
	t.is(limit.activeCount, 0);
});

test('[FIND22] find raises in-flight async draws when concurrency increases mid-flight (INV-6)', async t => {
	const limit = pLimit(1);
	let inFlight = 0;
	let inFlightMax = 0;

	async function * source() {
		yield * [0, 1, 2, 3, 4, 5, 6, 7];
	}

	const promise = limit.find(source(), async value => {
		inFlight++;
		inFlightMax = Math.max(inFlightMax, inFlight);
		await delay(30);
		inFlight--;
		return value === 7;
	});

	await delay(10);
	t.is(inFlight, 1);

	limit.concurrency = 3;

	const result = await promise;
	t.is(result, 7);
	t.is(inFlightMax, 3);
});
