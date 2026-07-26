import process from 'node:process';
import test from 'ava';
import pLimit from './index.js';

// Deterministic model-based (state machine) regression suite for the p-limit
// scheduler. See docs/design/scheduler-state-machine-regression-F68F701A7A-24.md.
//
// A fixed-seed inline PRNG generates a deterministic operation sequence that
// combines enqueue (sync/async), resolve/reject, concurrency changes,
// clearQueue (with/without reason, rejectOnClear true/false), onIdle() waiters,
// synchronous throws and AsyncIterable map(). A pure-JS reference model tracks
// the observable contract; every step is compared against the real limiter.
// On the first mismatch the seed and the minimal reproduction operation index
// are reported via t.fail (§ "실패 재현").
//
// Determinism/wall-clock notes:
//   - No Math.random(): the inline mulberry32 PRNG is the only randomness source.
//   - No real timers/delay(ms): jobs settle only when the sequence explicitly
//     triggers them (SETTLE) or, for map elements, after a fixed number of
//     microtask flushes. Only microtask synchronisation (await Promise.resolve())
//     is used — this is required because the real scheduler defers queue
//     promotion to a microtask (index.js concurrency setter / enqueue).
//   - No new dependencies: the PRNG is inline; random-int/time-span are avoided
//     because they are wall-clock based.

// § PRNG — mulberry32 (inline, no new dependency). The algorithm is defined in
// terms of 32-bit integer bitwise ops, so the relevant xo rules are disabled for
// this function only.
/* eslint-disable no-bitwise, unicorn/prefer-math-trunc, operator-assignment */
function mulberry32(seed) {
	return function () {
		seed |= 0;
		seed = (seed + 0x6D_2B_79_F5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}
/* eslint-enable no-bitwise, unicorn/prefer-math-trunc, operator-assignment */

// § 실행 매트릭스 — fixed constant seed lists (never Math.random()).
const SEEDS = Array.from({length: 40}, (_, index) => index + 1);

// Seeds driving the map-inclusive sequences (offset so they generate a different
// operation stream from the strict seeds).
const MAP_SEEDS = Array.from({length: 24}, (_, index) => index + 101);

// Seeds whose sequences continue past the first full drain to prove the same
// instance stays correct when reused (Edge Case #10).
const REUSE_SEEDS = new Set([3, 11, 23, 37]);

// Microtasks flushed after each step before comparing invariants. Enough to let
// a SETTLE propagate through run()'s `await result` → next() → promotion, and to
// let the concurrency setter's queueMicrotask promotion land (§6). Measured
// locally: SETTLE settles within ~3 microtasks; 8 is a safe margin.
const STEP_FLUSHES = 8;

// Microtasks a map element waits before it auto-settles. Larger than STEP_FLUSHES
// so a map stays in-flight across several steps (lets onIdle/clearQueue interact
// with a live map instead of one that finished within a single step).
const MAP_SETTLE_FLUSHES = 12;

const flush = async count => {
	for (let index = 0; index < count; index++) {
		await Promise.resolve(); // eslint-disable-line no-await-in-loop
	}
};

// Resolve/inspect a promise without wall-clock timers: an already-settled
// promise wins the microtask race; a still-pending one loses deterministically.
const inspect = async promise => {
	const settled = (async () => {
		try {
			await promise;
			return 'fulfilled';
		} catch {
			return 'rejected';
		}
	})();

	const pending = (async () => {
		await flush(STEP_FLUSHES * 2);
		return 'pending';
	})();

	return Promise.race([settled, pending]);
};

const CONCURRENCY_CHOICES = [1, 2, 3, 5];

// `clearQueue(reason)` reason variants (§5 opcode table). Factories return fresh
// values so object identity never leaks between steps.
const REASON_FACTORIES = [
	() => ({kind: 'error', value: new Error('clear-reason')}),
	() => ({kind: 'string', value: 'string-reason'}),
	() => ({kind: 'null', value: null}),
	() => ({kind: 'zero', value: 0}),
	() => ({kind: 'object', value: {code: 'CANCELLED'}}),
];

// § 참조 모델 — pure JS simulation of the observable contract only.
class ReferenceModel {
	constructor(concurrency, rejectOnClear) {
		this.concurrency = concurrency;
		this.rejectOnClear = rejectOnClear;
		this.queue = []; // FIFO of direct job ids (pending)
		this.active = new Set(); // Running direct job ids
		this.kinds = new Map(); // JobId -> 'resolve' | 'reject' | 'sync-throw'
		this.startedOrder = []; // Cumulative start order (FIFO check)
		this.startCounts = new Map(); // JobId -> number of starts (<= 1)
		this.settled = new Map(); // JobId -> 'fulfilled' | 'rejected'
		this.mapInFlight = 0; // Active limit.map() calls (onIdle 3rd condition)
	}

	enqueue(id, kind) {
		this.kinds.set(id, kind);
		if (this.active.size < this.concurrency) {
			this.#start(id);
		} else {
			this.queue.push(id);
		}
	}

	#start(id) {
		this.active.add(id);
		this.startedOrder.push(id);
		this.startCounts.set(id, (this.startCounts.get(id) ?? 0) + 1);

		// A sync-throw job starts and throws in the same turn: start == settle.
		if (this.kinds.get(id) === 'sync-throw') {
			this.#settleInternal(id, 'rejected');
		}
	}

	#settleInternal(id, status) {
		this.active.delete(id);
		this.settled.set(id, status);
		this.#promote();
	}

	#promote() {
		while (this.queue.length > 0 && this.active.size < this.concurrency) {
			this.#start(this.queue.shift());
		}
	}

	settle(id, status) {
		if (!this.active.has(id) || this.settled.has(id)) {
			return;
		}

		this.#settleInternal(id, status);
	}

	clearQueue(hasReason) {
		const removed = this.queue.length;
		if (this.rejectOnClear || hasReason) {
			for (const id of this.queue) {
				this.settled.set(id, 'rejected');
			}
		}
		// Otherwise the pending items are silently dropped (never settle).

		this.queue = [];
		return removed;
	}

	setConcurrency(n) {
		this.concurrency = n;
		this.#promote();
	}

	isIdle() {
		return this.active.size === 0 && this.queue.length === 0 && this.mapInFlight === 0;
	}

	// Direct jobs that can still be settled by a SETTLE op.
	settleCandidates() {
		return [...this.active].filter(id => {
			const kind = this.kinds.get(id);
			return (kind === 'resolve' || kind === 'reject') && !this.settled.has(id);
		});
	}
}

// § Operation vocabulary weights (§5 시퀀스 생성 알고리즘).
const WEIGHTS = {
	PUSH_RESOLVE: 40 / 3,
	PUSH_REJECT: 40 / 3,
	PUSH_SYNC_THROW: 40 / 3,
	SETTLE: 20,
	CLEAR_QUEUE: 7.5,
	CLEAR_QUEUE_REASON: 7.5,
	SET_CONCURRENCY: 10,
	WAIT_IDLE: 10,
	START_MAP: 5,
};

const pickWeighted = (rng, candidates) => {
	const total = candidates.reduce((sum, op) => sum + WEIGHTS[op], 0);
	let r = rng() * total;
	for (const op of candidates) {
		if (r < WEIGHTS[op]) {
			return op;
		}

		r -= WEIGHTS[op];
	}

	return candidates.at(-1);
};

const pickOpcode = (rng, model, allowMaps) => {
	const candidates = ['PUSH_RESOLVE', 'PUSH_REJECT', 'PUSH_SYNC_THROW'];
	if (model.settleCandidates().length > 0) {
		candidates.push('SETTLE');
	}

	// Map sequences use only reasoned clears: a bare clearQueue() with no reason
	// and rejectOnClear:false silently drops still-queued map() elements, which
	// makes limit.map() hang forever (a real index.js defect this suite found —
	// see the `test.failing` characterization test below and the PR notes). A
	// reasoned clear rejects those elements, so the map settles as expected. Bare
	// clearQueue() is still exercised thoroughly by the strict (map-free) sequences.
	if (!allowMaps) {
		candidates.push('CLEAR_QUEUE');
	}

	candidates.push('CLEAR_QUEUE_REASON', 'SET_CONCURRENCY', 'WAIT_IDLE');
	if (allowMaps) {
		candidates.push('START_MAP');
	}

	return pickWeighted(rng, candidates);
};

const repro = ({seed, stepIndex, invariantId, expected, actual, config, opLog}) =>
	`seed=${seed} step=${stepIndex} invariant=${invariantId} `
	+ `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} `
	+ `config=${JSON.stringify(config)} ops=${JSON.stringify(opLog)}`;

// Drive one deterministic sequence and assert every invariant along the way.
// `allowMaps` selects the sequence category:
//   - false (strict): a pure direct-job sequence — the reference model tracks
//     reality exactly, so I1(exact)/I2/I3/I6-per-job are compared verbatim.
//   - true (map): map() ops are mixed in. Map elements share the real queue and
//     concurrency slots (and self-settle asynchronously), so the exact/order/
//     identity comparisons are relaxed; the order-independent invariants
//     (I1-safety, I4, I5, I7-liveness, I8, I9, every map settles) still hold.
const runSequence = async (t, seed, {allowMaps} = {}) => {
	const rng = mulberry32(seed);

	const concurrency = CONCURRENCY_CHOICES[Math.floor(rng() * CONCURRENCY_CHOICES.length)];
	const rejectOnClear = rng() < 0.5;
	const config = {concurrency, rejectOnClear};

	const limit = pLimit({concurrency, rejectOnClear});
	const model = new ReferenceModel(concurrency, rejectOnClear);

	// Highest concurrency ever configured. Lowering concurrency never aborts
	// already-running tasks, so activeCount can temporarily exceed the current
	// concurrency — but it can never exceed the highest value ever seen, because
	// a task only starts while activeCount < the concurrency in effect then.
	let maxConcurrencyEver = concurrency;

	// Real-side observation collected as a side effect of the job bodies (§6):
	// the library internals are never hooked.
	const realStartedOrder = [];
	const realStartCounts = new Map();
	const observeStart = id => {
		realStartedOrder.push(id);
		realStartCounts.set(id, (realStartCounts.get(id) ?? 0) + 1);
	};

	const deferreds = new Map(); // JobId -> {resolve, reject}
	const jobRecords = []; // {id, promise, kind}
	const mapPromises = [];
	const idleWaiters = []; // {resolved, sawMap, done}

	// Number of map()-spawned tasks currently living inside the real limiter
	// (drawn/created but their mapper has not returned yet). Incremented at each
	// iterable draw, decremented when the mapper exits — so it counts pending,
	// active AND post-rejection lingering map tasks. Exact active/pending
	// comparisons are only valid when this is 0, because map tasks share the
	// real active/queue but are intentionally not tracked as direct jobs.
	let mapTasksOutstanding = 0;

	// Map elements share the real FIFO queue and consume real concurrency slots,
	// so under a limited concurrency they delay direct jobs relative to the
	// direct-only reference model. Once a map interleaves with a contended queue
	// the exact active/pending counts desync until the limiter drains fully back
	// to idle. This flag gates the exact comparisons: they run only in map-free
	// windows (before the first map, and after the limiter re-idles) — during map
	// interleaving the order-independent invariants (I1-safety, I6..I9) still hold.
	let mapDesynced = false;

	// Latches once any map() runs in this sequence. Per-job I6 compares each job's
	// final status to the model, which is only faithful when no map ever perturbed
	// the direct schedule; map sequences instead rely on I8/I9 + every-map-settles.
	let sequenceHadMap = false;

	const countingMapper = failAtIndex => async (value, index) => {
		try {
			await flush(MAP_SETTLE_FLUSHES);
			if (index === failAtIndex) {
				throw new Error('map-fail');
			}

			return value;
		} finally {
			// Defer the decrement past the limiter's own next() so the counter
			// never reads 0 while a settling map task still occupies `active`. This
			// keeps the counter a conservative over-count: counter === 0 reliably
			// means no map task remains in the real limiter.
			(async () => {
				await flush(4);
				mapTasksOutstanding--;
			})();
		}
	};

	const makeSyncIterable = size => ({
		* [Symbol.iterator]() {
			for (let index = 0; index < size; index++) {
				mapTasksOutstanding++;
				yield index;
			}
		},
	});

	const makeAsyncIterable = size => (async function * () {
		for (let index = 0; index < size; index++) {
			mapTasksOutstanding++;
			yield index;
		}
	})();

	let unhandled = 0;
	const onUnhandled = () => {
		unhandled++;
	};

	process.on('unhandledRejection', onUnhandled);

	const opLog = [];
	const abort = Symbol('abort');
	const fail = (invariantId, expected, actual, stepIndex) => {
		t.fail(repro({
			seed, stepIndex, invariantId, expected, actual, config, opLog,
		}));
		throw abort;
	};

	// Attach a handler immediately so a rejection is never momentarily unhandled.
	const track = promise => {
		(async () => {
			try {
				await promise;
			} catch {}
		})();
	};

	const enqueueJob = kind => {
		const id = jobRecords.length;
		let promise;
		if (kind === 'sync-throw') {
			promise = limit(() => {
				observeStart(id);
				throw new Error('sync-throw');
			});
		} else {
			const deferred = {};
			const gate = new Promise((resolve, reject) => {
				deferred.resolve = resolve;
				deferred.reject = reject;
			});
			// Permanent consumer so a rejected gate is never momentarily unhandled,
			// even if the job it belongs to is silently dropped and never awaits it.
			track(gate);
			deferreds.set(id, deferred);
			promise = limit(async () => {
				observeStart(id);
				await gate;
			});
		}

		track(promise);
		jobRecords.push({id, promise, kind});
		model.enqueue(id, kind);
		return id;
	};

	// Compare the per-step invariants that hold after microtask stabilisation.
	// eslint-disable-next-line complexity -- one linear pass over the invariant set.
	const checkStepInvariants = stepIndex => {
		// I1 (safety) — activeCount never exceeds the highest concurrency ever
		// configured. This is the real over-scheduling guard: a task starts only
		// while activeCount < the concurrency in effect, so it can never exceed
		// maxConcurrencyEver even after concurrency is lowered mid-flight.
		if (!(limit.activeCount <= maxConcurrencyEver)) {
			fail('I1', `<= ${maxConcurrencyEver}`, limit.activeCount, stepIndex);
		}

		// I1 (precise) + I2 — in a map-free window the real active/pending counts
		// must match the reference model exactly.
		if (mapTasksOutstanding === 0 && !mapDesynced) {
			if (limit.activeCount !== model.active.size) {
				fail('I1', model.active.size, limit.activeCount, stepIndex);
			}

			if (limit.pendingCount !== model.queue.length) {
				fail('I2', model.queue.length, limit.pendingCount, stepIndex);
			}
		}

		// Clear the map-desync flag once the limiter has fully drained back to a
		// clean idle resync point (both the model and the real limiter empty).
		if (mapTasksOutstanding === 0 && model.isIdle()
			&& limit.activeCount === 0 && limit.pendingCount === 0) {
			mapDesynced = false;
		}

		// I4 — each job starts at most once (running total).
		for (const count of realStartCounts.values()) {
			if (count > 1) {
				fail('I4', 1, count, stepIndex);
			}
		}

		// I3 — the real start order must match the model start order (FIFO). Once a
		// map runs, map elements consume slots and can cause a pending direct job to
		// be cleared before it ever starts, permanently diverging the two orders, so
		// this is compared only up to the first map of the sequence.
		if (!sequenceHadMap) {
			for (let index = 0; index < realStartedOrder.length; index++) {
				if (model.startedOrder[index] !== realStartedOrder[index]) {
					fail('I3', model.startedOrder.slice(0, index + 1), realStartedOrder.slice(0, index + 1), stepIndex);
				}
			}
		}

		// I7 — onIdle() resolves only at an idle transition, never before.
		// A map's asynchronous, self-settling elements make per-step idle timing
		// unobservable without races, so for any waiter whose lifetime overlapped
		// map activity we only assert liveness (it resolves by drain end, below).
		// For map-free waiters the model's idle predicate is race-free (direct jobs
		// settle only on explicit SETTLE ops), so the strong check applies:
		const idleNow = model.isIdle();
		for (const waiter of idleWaiters) {
			if (mapTasksOutstanding > 0) {
				waiter.sawMap = true;
			}

			if (waiter.done || waiter.sawMap) {
				continue;
			}

			if (idleNow) {
				if (!waiter.resolved) {
					fail('I7', 'resolved-at-idle', 'still-pending', stepIndex);
				}

				waiter.done = true;
			} else if (waiter.resolved) {
				fail('I7', 'pending-until-idle', 'resolved-early', stepIndex);
			}
		}
	};

	// eslint-disable-next-line complexity -- a flat dispatch over the opcode set.
	const applyOperation = async stepIndex => {
		const opcode = pickOpcode(rng, model, allowMaps);
		switch (opcode) {
			case 'PUSH_RESOLVE': {
				enqueueJob('resolve');
				opLog.push({index: stepIndex, opcode, params: {}});
				break;
			}

			case 'PUSH_REJECT': {
				enqueueJob('reject');
				opLog.push({index: stepIndex, opcode, params: {}});
				break;
			}

			case 'PUSH_SYNC_THROW': {
				enqueueJob('sync-throw');
				opLog.push({index: stepIndex, opcode, params: {}});
				break;
			}

			case 'SETTLE': {
				const candidates = model.settleCandidates();
				const id = candidates[Math.floor(rng() * candidates.length)];
				const kind = model.kinds.get(id);
				const status = kind === 'reject' ? 'rejected' : 'fulfilled';
				if (status === 'rejected') {
					deferreds.get(id).reject(new Error(`settle-reject-${id}`));
				} else {
					deferreds.get(id).resolve();
				}

				model.settle(id, status);
				opLog.push({index: stepIndex, opcode, params: {id, status}});
				break;
			}

			case 'CLEAR_QUEUE': {
				const activeBefore = limit.activeCount;
				const modelRemoved = model.clearQueue(false);
				const removed = limit.clearQueue();
				opLog.push({index: stepIndex, opcode, params: {removed}});
				// I5 — clearQueue never touches active work.
				if (limit.activeCount !== activeBefore) {
					fail('I5', activeBefore, limit.activeCount, stepIndex);
				}

				// Return value equals pending-before only when no map elements are
				// mixed into the real queue.
				if (mapTasksOutstanding === 0 && removed !== modelRemoved) {
					fail('I5', modelRemoved, removed, stepIndex);
				}

				break;
			}

			case 'CLEAR_QUEUE_REASON': {
				const {kind, value} = REASON_FACTORIES[Math.floor(rng() * REASON_FACTORIES.length)]();
				const activeBefore = limit.activeCount;
				const modelRemoved = model.clearQueue(true);
				const removed = limit.clearQueue(value);
				opLog.push({index: stepIndex, opcode, params: {reasonKind: kind, removed}});
				if (limit.activeCount !== activeBefore) {
					fail('I5', activeBefore, limit.activeCount, stepIndex);
				}

				if (mapTasksOutstanding === 0 && removed !== modelRemoved) {
					fail('I5', modelRemoved, removed, stepIndex);
				}

				break;
			}

			case 'SET_CONCURRENCY': {
				const n = CONCURRENCY_CHOICES[Math.floor(rng() * CONCURRENCY_CHOICES.length)];
				limit.concurrency = n;
				model.setConcurrency(n);
				maxConcurrencyEver = Math.max(maxConcurrencyEver, n);
				opLog.push({index: stepIndex, opcode, params: {n}});
				break;
			}

			case 'WAIT_IDLE': {
				const wasIdle = model.isIdle();
				const promise = limit.onIdle();
				// Mark the waiter map-touched from the start if a map is live now.
				const waiter = {resolved: false, done: false, sawMap: mapTasksOutstanding > 0};
				(async () => {
					try {
						await promise;
					} catch {}

					waiter.resolved = true;
				})();

				idleWaiters.push(waiter);
				opLog.push({index: stepIndex, opcode, params: {wasIdle}});
				break;
			}

			case 'START_MAP': {
				const size = 1 + Math.floor(rng() * 6);
				const failAtIndex = rng() < 0.5 ? null : Math.floor(rng() * size);
				const kind = rng() < 0.5 ? 'sync-iterable' : 'async-iterable';
				const iterable = kind === 'async-iterable'
					? makeAsyncIterable(size)
					: makeSyncIterable(size);
				// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
				const mapPromise = limit.map(iterable, countingMapper(failAtIndex));
				track(mapPromise);
				mapPromises.push(mapPromise);
				mapDesynced = true;
				sequenceHadMap = true;
				model.mapInFlight++;
				(async () => {
					try {
						await mapPromise;
					} catch {}

					model.mapInFlight--;
				})();

				opLog.push({index: stepIndex, opcode, params: {size, failAtIndex, kind}});
				break;
			}

			default: {
				throw new Error(`unknown opcode: ${opcode}`);
			}
		}
	};

	// Force every still-unsettled direct job to settle and let maps finish, then
	// let the counts converge (§5 DRAIN 종료 절차).
	const drain = async () => {
		// Release every direct job's gate so it can run to completion — regardless
		// of whether the model still considers it active. A map may have perturbed
		// the real schedule so a job the model already dropped is still live in the
		// limiter; resolving/rejecting every gate guarantees nothing hangs.
		for (const [id, deferred] of deferreds) {
			if (model.kinds.get(id) === 'reject') {
				deferred.reject(new Error(`drain-reject-${id}`));
			} else {
				deferred.resolve();
			}
		}

		for (let guard = 0; guard < 400; guard++) {
			// Keep the model settling too so model.settled stays complete for the
			// strict per-job I6 comparison.
			for (const id of model.settleCandidates()) {
				model.settle(id, model.kinds.get(id) === 'reject' ? 'rejected' : 'fulfilled');
			}

			// Done when the real limiter is idle, the model is empty, and every map
			// promise has settled (model.mapInFlight is decremented as each map
			// settles). mapTasksOutstanding is intentionally not part of this
			// condition: a reasoned clearQueue can reject a queued map element whose
			// mapper then never runs to decrement the counter, but the map promise
			// itself still settles — which is what actually matters for convergence.
			if (limit.activeCount === 0 && limit.pendingCount === 0
				&& model.active.size === 0 && model.queue.length === 0 && model.mapInFlight === 0) {
				break;
			}

			await flush(STEP_FLUSHES); // eslint-disable-line no-await-in-loop
		}
	};

	try {
		const length = 20 + Math.floor(rng() * 41); // L ∈ [20, 60]
		const phases = [length];
		if (REUSE_SEEDS.has(seed)) {
			phases.push(5 + Math.floor(rng() * 11)); // Reuse phase L2 ∈ [5, 15]
		}

		let step = 0;
		for (const phaseLength of phases) {
			for (let index = 0; index < phaseLength; index++) {
				await applyOperation(step); // eslint-disable-line no-await-in-loop
				await flush(STEP_FLUSHES); // eslint-disable-line no-await-in-loop
				checkStepInvariants(step);
				step++;
			}

			// Drain between phases so the reuse phase runs on a fully-idle instance.
			await drain(); // eslint-disable-line no-await-in-loop
			await flush(STEP_FLUSHES); // eslint-disable-line no-await-in-loop
			checkStepInvariants(step);
		}
	} catch (error) {
		if (error !== abort) {
			process.removeListener('unhandledRejection', onUnhandled);
			throw error;
		}

		process.removeListener('unhandledRejection', onUnhandled);
		return; // First mismatch already reported via t.fail.
	}

	// Final drain + convergence checks.
	await drain();
	await flush(STEP_FLUSHES);

	// I8 — counts converge to zero at the end.
	t.is(limit.activeCount, 0, `seed=${seed} I8 activeCount`);
	t.is(limit.pendingCount, 0, `seed=${seed} I8 pendingCount`);

	// I6 — every direct job settled exactly per its policy; silently-dropped jobs
	// (clearQueue without reason and rejectOnClear:false) stay pending forever.
	// Compared per-job only in strict (map-free) sequences, where the model tracks
	// reality faithfully. In map sequences the direct schedule is perturbed, so
	// per-job settlement is covered instead by I8 (nothing left in the limiter),
	// the every-map-settles check below, and I9 (no unhandled rejection).
	if (!sequenceHadMap) {
		for (const {id, promise} of jobRecords) {
			const status = await inspect(promise); // eslint-disable-line no-await-in-loop
			const expected = model.settled.get(id) ?? 'pending';
			t.is(status, expected, `seed=${seed} I6 job=${id}`);
		}
	}

	// Every map() call must settle (fulfil or reject) by drain — never hang.
	for (const [mapIndex, mapPromise] of mapPromises.entries()) {
		const status = await inspect(mapPromise); // eslint-disable-line no-await-in-loop
		if (status !== 'fulfilled' && status !== 'rejected') {
			t.fail(repro({
				seed, stepIndex: `map#${mapIndex}`, invariantId: 'I6-map',
				expected: 'settled', actual: status, config, opLog,
			}));
			process.removeListener('unhandledRejection', onUnhandled);
			return;
		}
	}

	// I7 — every registered waiter resolved once the instance became idle.
	for (const waiter of idleWaiters) {
		t.true(waiter.resolved, `seed=${seed} I7 idle waiter resolved`);
	}

	await flush(STEP_FLUSHES);
	process.removeListener('unhandledRejection', onUnhandled);

	// I9 — no unhandled rejection escaped during the whole sequence.
	t.is(unhandled, 0, `seed=${seed} I9 unhandledRejection count`);
};

// Strict, map-free sequences: the reference model tracks reality exactly, so
// every invariant (I1-exact, I2, I3, I4, I5, I6-per-job, I7, I8, I9) is compared
// verbatim. This is the rigorous validation of the direct-job state machine
// (enqueue, sync/async settle, sync throw, concurrency up/down, clearQueue with
// every reason variant, onIdle waiters, reuse).
for (const seed of SEEDS) {
	test.serial(`state machine (strict) — seed ${seed}`, async t => {
		await runSequence(t, seed, {allowMaps: false});
	});
}

// Map-inclusive sequences: mix limit.map() (sync/async iterable, with and without
// a mid-flight mapper throw) into the same instance alongside every other op. Map
// elements share the real queue/slots and self-settle asynchronously, so the
// exact/order/identity comparisons are relaxed while the order-independent
// invariants (I1-safety, I4, I5, I7-liveness, I8, every-map-settles, I9) hold.
for (const seed of MAP_SEEDS) {
	test.serial(`state machine (map) — seed ${seed}`, async t => {
		await runSequence(t, seed, {allowMaps: true});
	});
}

// Edge Case #1 — clearQueue on an empty queue is a no-op returning 0, for both
// rejectOnClear settings and with/without a reason.
test.serial('edge — clearQueue on an empty queue returns 0', t => {
	for (const rejectOnClear of [false, true]) {
		const limit = pLimit({concurrency: 2, rejectOnClear});
		t.is(limit.clearQueue(), 0);
		t.is(limit.clearQueue(new Error('x')), 0);
		t.is(limit.activeCount, 0);
		t.is(limit.pendingCount, 0);
	}
});

// KNOWN DEFECT (found by this suite via seeds 101/110) — characterization test.
//
// A bare `clearQueue()` (no reason) with `rejectOnClear: false` silently drops
// still-queued `limit.map()` elements via `queue.clear()`, so those element
// promises never settle. `limit.map()` therefore hangs forever (its `Promise.all`
// / lazy scheduler never completes) and, worse, `onIdle()` resolves while the map
// is still unsettled. With a reason, or with `rejectOnClear: true`, the pending
// elements reject (AbortError / the reason) and the map settles correctly — so
// only the silent-drop path is broken.
//
// index.js is out of scope for this task (design F68F701A7A-24 §범위 fixes the
// suite as test-only; index.js is also outside this persona's file ownership), so
// the fix is filed for the index.js owner (see PR "Discovered defect"). This is a
// `test.failing` for the DESIRED contract — it fails today (the map hangs) and so
// keeps the suite green; once the limiter aborts orphaned map elements on a bare
// clearQueue it will start passing, at which point AVA flags it and it must be
// promoted from `test.failing` to `test`.
test.failing('DEFECT: bare clearQueue() must not leave an in-flight map() hanging', async t => {
	const limit = pLimit(1); // The rejectOnClear option defaults to false.

	const mapPromise = limit.map([0, 1, 2, 3, 4], async value => {
		await flush(4);
		return value;
	});

	// Consume the rejection (if any) so it can never become an unhandled rejection.
	const consumed = (async () => {
		try {
			await mapPromise;
		} catch {}
	})();

	await flush(2); // Element 0 is running; elements 1..4 sit queued.
	limit.clearQueue(); // Silently drops the four queued elements.
	await flush(50);

	const status = await inspect(mapPromise);
	t.true(
		status === 'fulfilled' || status === 'rejected',
		'limit.map() must settle after its pending elements are cleared, not hang',
	);

	await consumed;
});
