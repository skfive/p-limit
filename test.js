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
