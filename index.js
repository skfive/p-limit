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

	// Active `limit.map` lazy schedulers. On a concurrency change we notify them
	// so a raised limit promotes additional draws (mirrors the queue promotion below).
	const mapSchedulers = new Set();

	// Resolve callbacks for outstanding `onIdle()` calls awaiting the idle state.
	const idleWaiters = new Set();

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
		// Process the next queued function if we're under the concurrency limit
		if (activeCount < concurrency && queue.size > 0) {
			activeCount++;
			queue.dequeue().run();
		}
	};

	const next = () => {
		activeCount--;
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

		// Start processing immediately if we haven't reached the concurrency limit
		if (activeCount < concurrency) {
			resumeNext();
		}
	};

	const generator = (function_, ...arguments_) => new Promise((resolve, reject) => {
		enqueue(function_, resolve, reject, arguments_);
	});

	// Lazily consume an async iterator, keeping at most `concurrency` items
	// "drawn but not yet settled" at any time (no pre-loading). Results are
	// stored by draw order, so completion order does not affect the output.
	const mapAsyncIterable = (iterator, function_) => new Promise((resolve, reject) => {
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
					results[currentIndex] = result;
				}

				onTaskDone();
			} catch (error) {
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
			if (settled || drawing || iteratorDone) {
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
		concurrency: {
			get: () => concurrency,

			set(newConcurrency) {
				validateConcurrency(newConcurrency);
				concurrency = newConcurrency;

				queueMicrotask(() => {
					// eslint-disable-next-line no-unmodified-loop-condition
					while (activeCount < concurrency && queue.size > 0) {
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
					return mapAsyncIterable(iterable[Symbol.asyncIterator](), function_);
				}

				const promises = Array.from(iterable, (value, index) => generator(function_, value, index));
				return Promise.all(promises);
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
		concurrency: {
			get: () => limit.concurrency,

			set(newConcurrency) {
				limit.concurrency = newConcurrency;
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
