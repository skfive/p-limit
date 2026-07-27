import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import pLimit from './index.js';

// --- F68F701A7A-99: limit.filter regression guard ---
//
// dev (F68F701A7A-96) already covers `limit.filter` exhaustively in test.js
// ([F1]-[F18]): order preservation, truthiness, index, empty/all-pass/all-fail,
// lazy async draw, concurrency adherence, pause/resume, onIdle interaction, and
// `limitFunction()` delegation. Per tester scope, those are not re-verified here.
//
// This file is an independent regression guard, kept in its own file so it
// keeps protecting the contract even if test.js is ever refactored, focused on
// exactly the two behaviors named in this task's acceptance criteria:
//   AC1 — truthy items keep input (draw) order for both sync and async iterables.
//   AC2 — a predicate rejection rejects the whole call AND the limiter's own
//         state contract (activeCount/pendingCount/isIdle, continued usability)
//         converges normally afterward — not merely "it throws".

test('AC1 — filter keeps truthy items in input order for a sync iterable despite shuffled completion', async t => {
	const limit = pLimit(3);
	const inputs = [0, 1, 2, 3, 4, 5];

	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const results = await limit.filter(inputs, async (value, index) => {
		// Later indexes resolve first; output must still follow input (draw) order.
		await delay((inputs.length - index) * 5);
		return value % 2 === 0;
	});

	t.deepEqual(results, [0, 2, 4]);
});

test('AC1 — filter keeps truthy items in input (draw) order for an async iterable despite shuffled completion', async t => {
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

test('AC2 — predicate rejection on a sync iterable rejects the whole call and the limiter converges back to idle and stays usable', async t => {
	const limit = pLimit(2);
	const error = new Error('predicate boom');

	await t.throwsAsync(limit.filter([1, 2, 3, 4], async n => {
		if (n === 3) {
			throw error;
		}

		await delay(10);
		return true;
	}), {is: error});

	// The limiter's own state contract must converge normally after the
	// rejection settles, not stay poisoned with stale counts.
	await limit.onIdle();
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.true(limit.isIdle);

	// And it must still accept and run new work afterward.
	const recovered = await limit.filter([5, 6, 7], async n => n > 5);
	t.deepEqual(recovered, [6, 7]);
});

test('AC2 — predicate rejection on an async iterable rejects the whole call, cleans up the iterator once, and the limiter converges back to idle and stays usable', async t => {
	const limit = pLimit(2);
	const error = new Error('async predicate boom');
	let returnCalls = 0;

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
		if (value === 2) {
			throw error;
		}

		await delay(20);
		return true;
	}), {is: error});

	t.is(returnCalls, 1);

	await limit.onIdle();
	t.is(limit.activeCount, 0);
	t.is(limit.pendingCount, 0);
	t.true(limit.isIdle);

	const recovered = await limit.filter([1, 2, 3], async n => n > 1);
	t.deepEqual(recovered, [2, 3]);
});
