import Queue from 'yocto-queue';

// Module-global preset registry (one per module): maps a preset name to a
// concurrency value. Every limiter created from this module shares it. Starts
// empty — no built-in presets are provided (see docs/plans, additive integrity).
const presets = new Map();

export default function pLimit(concurrency) {
	let rejectOnClear = false;

	if (typeof concurrency === 'object') {
		({concurrency, rejectOnClear = false} = concurrency);
	}

	// A string concurrency is always a preset name (never number-parsed): resolve
	// it to the registered numeric value before the core validation runs. This is
	// the only new branch on the creation path; numbers/objects behave exactly as
	// before (additive integrity).
	if (typeof concurrency === 'string') {
		concurrency = lookupPreset(concurrency);
	}

	validateConcurrency(concurrency);

	if (typeof rejectOnClear !== 'boolean') {
		throw new TypeError('Expected `rejectOnClear` to be a boolean');
	}

	const queue = new Queue();
	let activeCount = 0;

	// When paused, no queued task is promoted to running; already-running tasks
	// settle normally. Starts `false` so consumers that never call `pause()` keep
	// the exact previous scheduling behavior/timing (additive integrity).
	let paused = false;

	// Active `limit.map` lazy schedulers. On a concurrency change we notify them
	// so a raised limit promotes additional draws (mirrors the queue promotion below).
	const mapSchedulers = new Set();

	// Resolve callbacks for outstanding `onIdle()` calls awaiting the idle state.
	const idleWaiters = new Set();

	// Registered state-change listeners. Each receives a frozen snapshot on every
	// state transition (enqueue/start/settle, pause/resume, clearQueue, concurrency
	// change). Purely additive: with no listeners the scheduling path is untouched,
	// preserving the exact previous timing/settlement semantics (additive integrity).
	const listeners = new Set();

	// Derive the frozen snapshot shape (frozen contract: activeCount, pendingCount,
	// concurrency, status). `status` follows the fixed priority order:
	// paused > saturated > active > idle. An infinite concurrency is never saturated
	// because `activeCount` is always finite, so `activeCount >= Infinity` is false.
	const snapshot = () => {
		let status;
		if (paused) {
			status = 'paused';
		} else if (activeCount >= concurrency) {
			status = 'saturated';
		} else if (activeCount > 0) {
			status = 'active';
		} else {
			status = 'idle';
		}

		return Object.freeze({
			activeCount,
			pendingCount: queue.size,
			concurrency,
			status,
		});
	};

	// Notify every listener with one shared frozen snapshot for this transition.
	// Iterates a copy so a listener may (un)subscribe during notification without
	// breaking the walk, and skips any listener removed mid-walk. Each call is
	// isolated in try/catch so a throwing listener never affects scheduling or the
	// other listeners, and never changes a task's Promise settlement semantics.
	const notifyListeners = () => {
		if (listeners.size === 0) {
			return;
		}

		const snap = snapshot();
		// Iterate a snapshot copy so a listener may (un)subscribe mid-notification
		// without corrupting the walk; the copy is intentional (re-entrancy safety).
		// eslint-disable-next-line unicorn/no-useless-spread
		for (const listener of [...listeners]) {
			if (!listeners.has(listener)) {
				continue;
			}

			try {
				listener(snap);
			} catch {}
		}
	};

	// The limiter is idle when nothing is running, nothing is queued, and no lazy
	// `limit.map()` is still drawing. The `mapSchedulers` check prevents a false
	// positive during the gap between a map draw settling and the next draw.
	const isIdle = () => activeCount === 0 && queue.size === 0 && mapSchedulers.size === 0;

	// Broadcast to all outstanding `onIdle()` waiters when (and only when) the
	// limiter has actually reached the idle state, then clear them so each resolve
	// fires exactly once (no leak, no double-fire on later reuse).
	const notifyIdle = () => {
		if (idleWaiters.size === 0 || !isIdle()) {
			return;
		}

		for (const resolve of idleWaiters) {
			resolve();
		}

		idleWaiters.clear();
	};

	const resumeNext = () => {
		// Process the next queued function if we're under the concurrency limit.
		// While paused, promotion is suspended so no queued task starts.
		if (!paused && activeCount < concurrency && queue.size > 0) {
			activeCount++;
			queue.dequeue().run();
			// Start transition: a queued task was promoted to running (active+1, pending-1).
			notifyListeners();
		}
	};

	const next = () => {
		activeCount--;
		// Settle transition: a running task finished (active-1), before any promotion.
		notifyListeners();
		resumeNext();
		notifyIdle();
	};

	const run = async (function_, resolve, arguments_) => {
		// Execute the function and capture the result promise
		const result = (async () => function_(...arguments_))();

		// Resolve immediately with the promise (don't wait for completion)
		resolve(result);

		// Wait for the function to complete (success or failure)
		// We catch errors here to prevent unhandled rejections,
		// but the original promise rejection is preserved for the caller
		try {
			await result;
		} catch {}

		// Decrement active count and process next queued function
		next();
	};

	const enqueue = (function_, resolve, reject, arguments_) => {
		const queueItem = {reject};

		// Queue the internal resolve function instead of the run function
		// to preserve the asynchronous execution context.
		new Promise(internalResolve => { // eslint-disable-line promise/param-names
			queueItem.run = internalResolve;
			queue.enqueue(queueItem);
		}).then(run.bind(undefined, function_, resolve, arguments_)); // eslint-disable-line promise/prefer-await-to-then

		// enqueue transition: a task was added to the pending queue (pending+1).
		notifyListeners();

		// Start processing immediately if we haven't reached the concurrency limit
		if (activeCount < concurrency) {
			resumeNext();
		}
	};

	const generator = (function_, ...arguments_) => new Promise((resolve, reject) => {
		enqueue(function_, resolve, reject, arguments_);
	});

	// Eagerly schedule every element of a sync iterable through the existing
	// scheduling path (`generator`), preserving input (draw) order. Shared by the
	// sync branch of `map` and `mapSettled` so the draw construction lives in one
	// place; only the aggregation (`Promise.all` vs `Promise.allSettled`) differs.
	const mapEager = (iterable, function_) =>
		Array.from(iterable, (value, index) => generator(function_, value, index));

	// Lazily consume an async iterator, keeping at most `concurrency` items
	// "drawn but not yet settled" at any time (no pre-loading). Results are
	// stored by draw order, so completion order does not affect the output.
	// When `settleMode` is `true` (`limit.mapSettled`), an individual mapper
	// rejection is recorded as a `PromiseSettledResult` and consumption keeps
	// going, so only an input-iterator failure rejects the returned promise.
	const mapAsyncIterable = (iterator, function_, settleMode) => new Promise((resolve, reject) => {
		const results = [];
		let index = 0;
		let inFlight = 0;
		let iteratorDone = false;
		let settled = false;
		let drawing = false;

		const finalizeReject = async error => {
			settled = true;
			mapSchedulers.delete(schedule);

			// Best-effort iterator cleanup — call `return()` exactly once if present,
			// matching how `for await...of` releases resources on early exit.
			if (typeof iterator.return === 'function') {
				try {
					await iterator.return();
				} catch {}
			}

			reject(error);
			notifyIdle();
		};

		const settleResolve = () => {
			settled = true;
			mapSchedulers.delete(schedule);
			resolve(results);
			notifyIdle();
		};

		const onTaskDone = () => {
			inFlight--;

			if (settled) {
				return;
			}

			if (iteratorDone && inFlight === 0) {
				settleResolve();
				return;
			}

			schedule();
		};

		// Run one mapper through the existing scheduling path so `active <= concurrency`
		// stays enforced by the limiter itself (no duplicate scheduling logic).
		const runTask = async (value, currentIndex) => {
			try {
				const result = await generator(function_, value, currentIndex);

				if (!settled) {
					results[currentIndex] = settleMode ? {status: 'fulfilled', value: result} : result;
				}

				onTaskDone();
			} catch (error) {
				// In `mapSettled` a mapper rejection is a per-index settled result,
				// not a fatal error: record it verbatim and keep consuming, treating
				// this slot exactly like a completed task (drives the next draw).
				if (settleMode) {
					if (!settled) {
						results[currentIndex] = {status: 'rejected', reason: error};
					}

					onTaskDone();
					return;
				}

				inFlight--;

				if (!settled) {
					finalizeReject(error);
				}
			}
		};

		const drawOne = async () => {
			drawing = true;
			const currentIndex = index++;

			let result;
			try {
				result = await iterator.next();
			} catch (error) {
				drawing = false;

				if (!settled) {
					iteratorDone = true;
					finalizeReject(error);
				}

				return;
			}

			drawing = false;

			if (settled) {
				return;
			}

			if (result.done) {
				iteratorDone = true;

				if (inFlight === 0) {
					settleResolve();
				}

				return;
			}

			inFlight++;
			runTask(result.value, currentIndex);

			// A slot may still be free — try to fill it.
			schedule();
		};

		function schedule() {
			if (settled || drawing || iteratorDone || paused) {
				return;
			}

			if (inFlight < concurrency) {
				drawOne();
			}
		}

		mapSchedulers.add(schedule);
		schedule();
	});

	// Lazily consume an iterator (sync or async) with bounded concurrency,
	// resolving to the first input value (by draw index) whose predicate is
	// truthy, then stopping early. Unlike `mapAsyncIterable` (which drains fully),
	// a confirmed lowest-matching index ends the draw: no further items are pulled
	// and not-yet-started predicates never start. Predicates already in flight are
	// allowed to settle so they never surface as unhandled rejections, and the
	// iterator's `return()` is called once on early exit. A predicate rejection
	// (before the call settles) is fatal, mirroring `map`/`filter`.
	const findFirstMatch = (iterator, predicateFunction) => new Promise((resolve, reject) => {
		const values = [];
		const inFlightIndices = new Set();
		let index = 0;
		let inFlight = 0;
		let iteratorDone = false;
		let settled = false;
		let drawing = false;
		let matchIndex;

		// Any in-flight predicate with a smaller index could still become the
		// winner, so the result is only confirmed once none remain below `matchIndex`.
		const hasInFlightBelow = threshold => {
			for (const inFlightIndex of inFlightIndices) {
				if (inFlightIndex < threshold) {
					return true;
				}
			}

			return false;
		};

		const finish = async (isReject, payload) => {
			settled = true;
			mapSchedulers.delete(schedule);

			// Best-effort iterator cleanup on early exit — call `return()` exactly
			// once if present and the iterator has not been exhausted, matching how
			// `for await...of` releases resources on an early break.
			if (!iteratorDone && typeof iterator.return === 'function') {
				try {
					await iterator.return();
				} catch {}
			}

			if (isReject) {
				reject(payload);
			} else {
				resolve(payload);
			}

			notifyIdle();
		};

		// Resolve as soon as the lowest matching index is confirmed (no smaller
		// index still in flight), or resolve with `undefined` once the iterator is
		// drained with nothing matched.
		const tryComplete = () => {
			if (settled) {
				return;
			}

			if (matchIndex !== undefined && !hasInFlightBelow(matchIndex)) {
				finish(false, values[matchIndex]);
				return;
			}

			if (iteratorDone && inFlight === 0 && matchIndex === undefined) {
				finish(false, undefined);
				return;
			}

			schedule();
		};

		// Run one predicate through the existing scheduling path so `active <=
		// concurrency` stays enforced by the limiter itself (no duplicate scheduling).
		const runTask = async (value, currentIndex) => {
			try {
				const verdict = await generator(predicateFunction, value, currentIndex);

				inFlightIndices.delete(currentIndex);
				inFlight--;

				if (settled) {
					return;
				}

				// Lower `matchIndex` toward the smallest truthy index seen so far;
				// completion order never changes the winner (INV-1).
				if (verdict && (matchIndex === undefined || currentIndex < matchIndex)) {
					matchIndex = currentIndex;
				}

				tryComplete();
			} catch (error) {
				inFlightIndices.delete(currentIndex);
				inFlight--;

				// A predicate rejection is fatal before the call settles (like `map`/
				// `filter`, unlike `mapSettled`); after it settles, the rejection is
				// swallowed here so it never becomes an unhandled rejection (INV-3/5).
				if (!settled) {
					finish(true, error);
				}
			}
		};

		const drawOne = async () => {
			drawing = true;
			const currentIndex = index++;

			let result;
			try {
				result = await iterator.next();
			} catch (error) {
				drawing = false;

				if (!settled) {
					iteratorDone = true;
					finish(true, error);
				}

				return;
			}

			drawing = false;

			// A match may have been confirmed (or the call otherwise settled) while
			// we awaited `next()`. This value was consumed but can no longer win
			// (its index is the largest drawn), so drop it.
			if (settled || matchIndex !== undefined) {
				return;
			}

			if (result.done) {
				iteratorDone = true;

				if (inFlight === 0) {
					finish(false, undefined);
				}

				return;
			}

			inFlight++;
			inFlightIndices.add(currentIndex);
			values[currentIndex] = result.value;
			runTask(result.value, currentIndex);

			// A slot may still be free — try to fill it.
			schedule();
		};

		function schedule() {
			// No new draws once the result is settled, the iterator is exhausted, the
			// limiter is paused, a draw is already awaiting `next()`, or a match has
			// been confirmed (every future index is larger than `matchIndex`).
			if (settled || drawing || iteratorDone || paused || matchIndex !== undefined) {
				return;
			}

			if (inFlight < concurrency) {
				drawOne();
			}
		}

		mapSchedulers.add(schedule);
		schedule();
	});

	// The single concurrency-mutation boundary, shared by the `concurrency` setter
	// and `usePreset()` so there is exactly one scheduling path (no duplication).
	// It validates, updates the live limit, emits the change transition only when
	// the value actually changed, then drains promotable tasks on a microtask —
	// preserving the exact previous timing/settlement semantics.
	const setConcurrency = newConcurrency => {
		validateConcurrency(newConcurrency);
		const changed = newConcurrency !== concurrency;
		concurrency = newConcurrency;

		// Concurrency-change transition, emitted only when the value actually
		// changed (plan §3.4 / E4). The microtask drain below preserves the
		// existing timing and emits its own start transitions via resumeNext().
		if (changed) {
			notifyListeners();
		}

		queueMicrotask(() => {
			// The `!paused` guard both honors a paused limiter (drain stays
			// deferred until `resume()`) and prevents an infinite loop: while
			// paused, `resumeNext()` is a no-op so `activeCount`/`queue.size`
			// would never change inside this loop.
			// eslint-disable-next-line no-unmodified-loop-condition
			while (!paused && activeCount < concurrency && queue.size > 0) {
				resumeNext();
			}

			// Promote lazily-consumed `limit.map` draws to the new limit too.
			for (const schedule of mapSchedulers) {
				schedule();
			}
		});
	};

	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount,
		},
		pendingCount: {
			get: () => queue.size,
		},
		clearQueue: {
			value(reason) {
				// Snapshot the pending count before settling — this is the return value
				// regardless of how the items are settled below.
				const removedCount = queue.size;

				if (reason === undefined) {
					// Unspecified reason: fall back to the constructor's `rejectOnClear`.
					if (rejectOnClear) {
						const abortError = AbortSignal.abort().reason;

						while (queue.size > 0) {
							queue.dequeue().reject(abortError);
						}
					} else {
						queue.clear();
					}
				} else {
					// A specified reason (including `null`/falsy values) overrides
					// `rejectOnClear` and rejects every pending promise with it verbatim.
					while (queue.size > 0) {
						queue.dequeue().reject(reason);
					}
				}

				notifyIdle();

				// Only emit when the queue actually shrank: clearing an already-empty
				// queue leaves the snapshot unchanged (plan §3.4 / E3 → no emission).
				if (removedCount > 0) {
					notifyListeners();
				}

				return removedCount;
			},
		},
		onIdle: {
			value() {
				if (isIdle()) {
					return Promise.resolve();
				}

				return new Promise(resolve => {
					idleWaiters.add(resolve);
				});
			},
		},
		isIdle: {
			// O(1) read of the same idle predicate `onIdle()` waits for: nothing
			// running, nothing queued, no lazy `limit.map()` still drawing.
			get: () => isIdle(),
		},
		isSaturated: {
			// O(1) read of whether every concurrency slot is occupied: `true` when
			// `activeCount` has reached `concurrency`, `false` while a slot is free.
			// Reads the live `concurrency`, so it is accurate synchronously right
			// after a concurrency change (an infinite limit is never saturated).
			get: () => activeCount >= concurrency,
		},
		pause: {
			value() {
				// Idempotent: pausing while already paused is a no-op and emits nothing
				// (plan §3.4). Running tasks are untouched; only the promotion of queued
				// tasks is suspended.
				if (paused) {
					return;
				}

				paused = true;
				// Pause transition: status becomes 'paused'.
				notifyListeners();
			},
		},
		resume: {
			value() {
				if (!paused) {
					return;
				}

				paused = false;

				// Resume transition: status leaves 'paused' before any promotion below.
				notifyListeners();

				// Promote queued tasks up to the current concurrency, mirroring the
				// concurrency setter's drain. `resumeNext()` still schedules the actual
				// run() via a microtask, so execution context/timing is unchanged. Each
				// promotion emits its own start transition via `resumeNext()`.
				// eslint-disable-next-line no-unmodified-loop-condition
				while (activeCount < concurrency && queue.size > 0) {
					resumeNext();
				}

				// Re-wake lazy `limit.map()` draws that were held off while paused.
				for (const schedule of mapSchedulers) {
					schedule();
				}
			},
		},
		isPaused: {
			// O(1) read of whether the limiter is paused: `true` after `pause()` and
			// before `resume()`. Mirrors the `isIdle`/`isSaturated` introspection.
			get: () => paused,
		},
		concurrency: {
			get: () => concurrency,

			set(newConcurrency) {
				setConcurrency(newConcurrency);
			},
		},
		usePreset: {
			value(name) {
				// Resolve the preset name BEFORE any mutation so an unknown name throws
				// `UnknownPresetError` while `concurrency` is left untouched (plan §3.3 /
				// E1). On success this is exactly `limit.concurrency = <preset value>`.
				const value = lookupPreset(name);
				setConcurrency(value);
			},
		},
		map: {
			async value(iterable, function_) {
				// Async iterables are consumed lazily so infinite/streaming sources
				// work with O(concurrency) items in flight. Sync iterables keep the
				// existing eager path for 100% backward-compatible behavior/timing.
				if (typeof iterable[Symbol.asyncIterator] === 'function') {
					return mapAsyncIterable(iterable[Symbol.asyncIterator](), function_, false);
				}

				return Promise.all(mapEager(iterable, function_));
			},
		},
		mapSettled: {
			async value(iterable, function_) {
				// Like `map`, but every element settles: an individual mapper
				// rejection becomes a `{status: 'rejected', reason}` entry instead of
				// rejecting the whole call, mirroring `Promise.allSettled` while
				// preserving input (draw) order. Only an input-iterator failure
				// rejects the returned promise.
				if (typeof iterable[Symbol.asyncIterator] === 'function') {
					return mapAsyncIterable(iterable[Symbol.asyncIterator](), function_, true);
				}

				return Promise.allSettled(mapEager(iterable, function_));
			},
		},
		filter: {
			async value(iterable, predicateFunction) {
				// Shares the same lazy async / eager sync draw engine as `map`: each
				// predicate runs through `generator`, so `active <= concurrency` stays
				// enforced by the limiter. Only the aggregation differs — keep the
				// original items whose predicate resolved truthy, in input (draw) order
				// regardless of completion order. Like `map` (and unlike `mapSettled`), a
				// predicate rejection is fatal: it rejects the whole call with that reason
				// and, for async iterables, calls the iterator's `return()` once.
				if (typeof iterable[Symbol.asyncIterator] === 'function') {
					const values = [];

					// Reuse `mapAsyncIterable` in non-settle mode: it resolves to the
					// per-draw predicate verdicts (or rejects on the first predicate/
					// iterator failure with one `return()` cleanup). Recording each value
					// by its draw index keeps `values`/`verdicts` aligned for compaction.
					const verdicts = await mapAsyncIterable(iterable[Symbol.asyncIterator](), async (value, index) => {
						values[index] = value;
						return predicateFunction(value, index);
					}, false);

					return values.filter((value, index) => verdicts[index]);
				}

				// Sync iterables keep the eager path: materialize once, schedule every
				// predicate through the shared `mapEager` draw construction, then compact
				// by JavaScript truthiness (`Array.prototype.filter` on the verdicts).
				const values = [...iterable];
				const verdicts = await Promise.all(mapEager(values, predicateFunction));

				return values.filter((value, index) => verdicts[index]);
			},
		},
		find: {
			async value(iterable, predicateFunction) {
				// Resolve to the first input item (by draw index) whose predicate is
				// truthy, matching `Array.prototype.find`, or `undefined` when nothing
				// matches. Unlike `map`/`filter`/`mapSettled` (which consume the whole
				// input), `find` stops early: once the lowest matching index is
				// confirmed, no further items are drawn. Both sync and async iterables
				// use the single lazy bounded draw loop so early termination is
				// observable either way (INV-4) — `find` is new, so no legacy sync
				// eager timing needs preserving. Each predicate runs through
				// `generator`, so `active <= concurrency` stays enforced (INV-6).
				const iterator = typeof iterable[Symbol.asyncIterator] === 'function'
					? iterable[Symbol.asyncIterator]()
					: iterable[Symbol.iterator]();

				return findFirstMatch(iterator, predicateFunction);
			},
		},
		snapshot: {
			value() {
				// Read-only, side-effect-free O(1) point-in-time snapshot (plan §2).
				// Returns a fresh frozen plain object each call — not a live reference,
				// so later state changes are not reflected (re-call to re-read). Exactly
				// four fields: activeCount/pendingCount/concurrency/isPaused. Purely
				// additive: touches no scheduling/timing/settlement state, and is a
				// separate entry point from `subscribe` (whose payload exposes `status`,
				// left unchanged).
				return Object.freeze({
					activeCount,
					pendingCount: queue.size,
					concurrency,
					isPaused: paused,
				});
			},
		},
		subscribe: {
			value(listener) {
				if (typeof listener !== 'function') {
					throw new TypeError('Expected `listener` to be a function');
				}

				// Registration order is preserved by the Set insertion order, so
				// listeners are notified in the order they subscribed.
				listeners.add(listener);

				let subscribed = true;
				return () => {
					// Idempotent unsubscribe: safe to call more than once, and safe for a
					// listener to unsubscribe itself during notification (notifyListeners
					// walks a copy and re-checks membership). After this, the listener is
					// never notified again on any future transition.
					if (!subscribed) {
						return;
					}

					subscribed = false;
					listeners.delete(listener);
				};
			},
		},
	});

	return generator;
}

export function limitFunction(function_, options) {
	const limit = pLimit(options);

	const limitedFunction = (...arguments_) => limit(() => function_(...arguments_));

	// Expose the same observation/control surface as the underlying `pLimit`
	// instance by delegating to it — no scheduling logic is duplicated.
	Object.defineProperties(limitedFunction, {
		activeCount: {
			get: () => limit.activeCount,
		},
		pendingCount: {
			get: () => limit.pendingCount,
		},
		clearQueue: {
			value(reason) {
				return limit.clearQueue(reason);
			},
		},
		onIdle: {
			value() {
				return limit.onIdle();
			},
		},
		isIdle: {
			get: () => limit.isIdle,
		},
		isSaturated: {
			get: () => limit.isSaturated,
		},
		pause: {
			value() {
				limit.pause();
			},
		},
		resume: {
			value() {
				limit.resume();
			},
		},
		isPaused: {
			get: () => limit.isPaused,
		},
		concurrency: {
			get: () => limit.concurrency,

			set(newConcurrency) {
				limit.concurrency = newConcurrency;
			},
		},
		usePreset: {
			value(name) {
				// Delegate to the underlying limiter so preset resolution and the
				// concurrency-mutation scheduling live in exactly one place.
				limit.usePreset(name);
			},
		},
		filter: {
			value(iterable, predicateFunction) {
				// Delegate to the underlying limiter's `filter` — no scheduling or
				// aggregation logic is duplicated here. (`limit.filter` is the p-limit
				// method, not `Array#filter`; the disable silences that misdetection.)
				// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
				return limit.filter(iterable, predicateFunction);
			},
		},
		find: {
			value(iterable, predicateFunction) {
				// Delegate to the underlying limiter's `find` — no scheduling or
				// early-termination logic is duplicated here.
				// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
				return limit.find(iterable, predicateFunction);
			},
		},
		snapshot: {
			value() {
				// Delegate to the underlying limiter so the read-only snapshot shape and
				// values are produced in exactly one place (no logic duplication).
				return limit.snapshot();
			},
		},
		subscribe: {
			value(listener) {
				// Delegate to the underlying limiter so the exact same subscription
				// contract (snapshot shape, emission order, isolation, unsubscribe) is
				// provided without duplicating any logic.
				return limit.subscribe(listener);
			},
		},
	});

	return limitedFunction;
}

function validateConcurrency(concurrency) {
	if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 1 and up');
	}
}

/**
Thrown when a preset name is looked up (`pLimit(name)`, `pLimit({concurrency: name})`,
or `limit.usePreset(name)`) but no preset with that name has been registered.
*/
export class UnknownPresetError extends Error {
	constructor(presetName) {
		super(`Unknown preset: \`${presetName}\``);
		this.name = 'UnknownPresetError';
		this.presetName = presetName;
	}
}

// Resolve a preset name to its registered concurrency value, throwing
// `UnknownPresetError` when it is not registered. The lookup never mutates the
// registry, so callers can resolve before mutating and leave state intact on failure.
function lookupPreset(name) {
	if (!presets.has(name)) {
		throw new UnknownPresetError(name);
	}

	return presets.get(name);
}

export function definePreset(name, concurrency) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Expected `name` to be a non-empty string');
	}

	// Reuse the core concurrency rule (positive integer or Infinity) so preset
	// values follow the exact same validity contract — no new validation rule.
	// Validation runs before the write, so a rejected value leaves any existing
	// registration for `name` untouched (plan §7 E2).
	validateConcurrency(concurrency);

	// Register / overwrite. Already-created limiters captured their concurrency at
	// creation time, so overwriting a name does not retroactively change them.
	presets.set(name, concurrency);
}
