import Queue from 'yocto-queue';

export default function pLimit(concurrency) {
	let rejectOnClear = false;

	if (typeof concurrency === 'object') {
		({concurrency, rejectOnClear = false} = concurrency);
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
