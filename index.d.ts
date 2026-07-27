/**
The derived, human-facing state of a limiter, chosen by a fixed priority order (`paused` > `saturated` > `active` > `idle`):

- `'paused'` — the limiter is paused (`isPaused` is `true`); no queued task will start until `resume()`.
- `'saturated'` — every concurrency slot is occupied (`activeCount >= concurrency`). A limiter with infinite `concurrency` is never saturated.
- `'active'` — at least one task is running but a slot is still free.
- `'idle'` — nothing is running.
*/
export type LimiterStatus = 'idle' | 'active' | 'saturated' | 'paused';

/**
An immutable snapshot of a limiter's observable state at a single moment, delivered to `subscribe()` listeners on every state transition.

The object is frozen; listeners must not mutate it.
*/
export type LimiterSnapshot = {
	/**
	The number of promises that are currently running.
	*/
	readonly activeCount: number;

	/**
	The number of promises that are waiting to run.
	*/
	readonly pendingCount: number;

	/**
	The current concurrency limit (may be `Infinity`).
	*/
	readonly concurrency: number;

	/**
	The derived status of the limiter. See {@link LimiterStatus}.
	*/
	readonly status: LimiterStatus;
};

export type LimitFunction = {
	/**
	The number of promises that are currently running.
	*/
	readonly activeCount: number;

	/**
	The number of promises that are waiting to run (i.e. their internal `fn` was not called yet).
	*/
	readonly pendingCount: number;

	/**
	Get or set the concurrency limit.
	*/
	concurrency: number;

	/**
	Discard pending promises that are waiting to run.

	This might be useful if you want to tear down the queue at the end of your program's lifecycle or discard any function calls referencing an intermediary state of your app.

	Note: This does not cancel promises that are already running.

	@param reason - Value to reject the discarded pending promises with. When provided (anything other than `undefined`, including `null` and other falsy values), every pending promise is rejected with this value verbatim, regardless of the `rejectOnClear` option. When omitted, the `rejectOnClear` option decides the behavior: if enabled, pending promises are rejected with an `AbortError`; otherwise they are discarded without settling.
	@returns The number of pending promises that were removed from the queue. Already-running promises are never counted or affected.
	*/
	clearQueue: (reason?: unknown) => number;

	/**
	Process an iterable or async iterable of inputs with limited concurrency.

	The mapper function receives the item value and its index.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables. Sync iterables retain the existing eager behavior.

	This is a convenience function for processing inputs that arrive in batches. For more complex use cases, see [p-map](https://github.com/sindresorhus/p-map).

	@param iterable - An iterable or async iterable containing an argument for the given function.
	@param mapperFunction - Promise-returning/async function.
	@returns A promise resolving to the mapper results in input (draw) order, regardless of completion order.
	*/
	map: <Input, ReturnType> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		mapperFunction: (input: Input, index: number) => PromiseLike<ReturnType> | ReturnType
	) => Promise<ReturnType[]>;

	/**
	Process an iterable or async iterable of inputs with limited concurrency, settling every result.

	Like {@link LimitFunction.map}, but individual mapper rejections never reject the returned promise. Each element is reported as a `PromiseSettledResult`, so the result mirrors `Promise.allSettled` while preserving input (draw) order.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. Sync iterables retain the eager behavior.

	@param iterable - An iterable or async iterable containing an argument for the given function.
	@param mapperFunction - Promise-returning/async function.
	@returns A promise resolving to one `PromiseSettledResult` per input, in input (draw) order.
	*/
	mapSettled: <Input, ReturnType> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		mapperFunction: (input: Input, index: number) => PromiseLike<ReturnType> | ReturnType
	) => Promise<Array<PromiseSettledResult<ReturnType>>>;

	/**
	Process an iterable or async iterable of inputs with limited concurrency, keeping only the items whose predicate resolves truthy.

	The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item is kept when the predicate's return value (awaited if a promise) is truthy, matching `Array.prototype.filter`.

	The resolved array contains the original input items (not the predicate's boolean), in input (draw) order regardless of the order in which the predicates complete.

	Like {@link LimitFunction.map} (and unlike {@link LimitFunction.mapSettled}), a predicate rejection is fatal: it rejects the returned promise with that reason and stops drawing new items. For an async iterable, the iterator's `return()` is called once for cleanup, matching `limit.map()`.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables. Sync iterables retain the eager behavior.

	@param iterable - An iterable or async iterable containing an argument for the given predicate.
	@param predicateFunction - Predicate function returning a boolean (or a promise for one).
	@returns A promise resolving to the kept input items in input (draw) order.
	*/
	filter: <Input> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
	) => Promise<Input[]>;

	/**
	Process an iterable or async iterable of inputs with limited concurrency, resolving to the first input item (in input/draw order) whose predicate resolves truthy.

	The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item matches when the predicate's return value (awaited if a promise) is truthy, matching `Array.prototype.find`.

	The resolved value is the original input item (not the predicate's boolean), chosen by the lowest input index — independent of the order in which predicates complete. Resolves to `undefined` when no item matches.

	Once the first-matching index is confirmed, no further items are drawn from the iterable and predicates that have not started are never started. Predicates already in flight are allowed to settle so they never surface as unhandled rejections; for an async iterable the iterator's `return()` is called once for cleanup.

	Like {@link LimitFunction.map}/{@link LimitFunction.filter} (and unlike {@link LimitFunction.mapSettled}), a predicate rejection is fatal before the call settles: it rejects the returned promise with that reason and stops drawing new items.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables.

	@param iterable - An iterable or async iterable containing an argument for the given predicate.
	@param predicateFunction - Predicate function returning a boolean (or a promise for one).
	@returns A promise resolving to the first matching input item, or `undefined`.
	*/
	find: <Input> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
	) => Promise<Input | undefined>;

	/**
	Returns a promise that resolves when the limiter becomes idle — no promises are currently running and none are waiting to run.

	If the limiter is already idle when this is called, the returned promise resolves immediately.
	*/
	onIdle: () => Promise<void>;

	/**
	Whether the limiter is currently idle — `true` when no promises are running and none are waiting to run.

	This is a read-only `O(1)` snapshot of the same idle state that `onIdle()` waits for.
	*/
	readonly isIdle: boolean;

	/**
	Whether the limiter is currently saturated — `true` when `activeCount` has reached the `concurrency` limit (no free slot), `false` while a slot is still available.

	This is a read-only `O(1)` snapshot that reads the live `concurrency`, so it is accurate synchronously right after a `concurrency` change. A limiter with infinite `concurrency` is never saturated.
	*/
	readonly isSaturated: boolean;

	/**
	Pause the limiter.

	Stops promoting pending tasks so no queued task starts until `resume()` is called.
	Tasks that are already running are not affected and will settle normally.
	Calling `pause()` while already paused is a no-op.
	*/
	pause: () => void;

	/**
	Resume a paused limiter.

	Promotes pending tasks up to the current `concurrency` limit, restoring normal scheduling.
	Calling `resume()` while not paused is a no-op.
	*/
	resume: () => void;

	/**
	Whether the limiter is currently paused — `true` after `pause()` and before `resume()`.

	This is a read-only `O(1)` snapshot. While paused, running tasks still settle but no
	pending task starts, so a paused limiter with pending tasks is never idle.
	*/
	readonly isPaused: boolean;

	/**
	Subscribe to limiter state changes.

	The listener is called with a frozen {@link LimiterSnapshot} on every state transition — enqueueing a task, promoting a queued task to running, a running task settling, `pause()`/`resume()`, `clearQueue()` (when the queue actually shrinks), and `concurrency` changes. Listeners are notified in subscription order.

	Subscribing does not emit an immediate snapshot; read `activeCount`/`pendingCount`/`concurrency` directly for the initial state. A listener that throws does not affect scheduling or the other listeners.

	@param listener - Called with the latest readonly snapshot on each transition.
	@returns An idempotent unsubscribe function. After it is called, the listener is never notified again; calling it more than once is safe.
	*/
	subscribe: (listener: (snapshot: Readonly<LimiterSnapshot>) => void) => () => void;

	/**
	@param fn - Promise-returning/async function.
	@param arguments - Any arguments to pass through to `fn`. Support for passing arguments on to the `fn` is provided in order to be able to avoid creating unnecessary closures. You probably don't need this optimization unless you're pushing a *lot* of functions.

	Warning: Avoid calling the same `limit` function inside a function that is already limited by it. This can create a deadlock where inner tasks never run. Use a separate limiter for inner tasks.

	@returns The promise returned by calling `fn(...arguments)`.
	*/
	<Arguments extends unknown[], ReturnType>(
		function_: (...arguments_: Arguments) => PromiseLike<ReturnType> | ReturnType,
		...arguments_: Arguments
	): Promise<ReturnType>;
};

/**
Run multiple promise-returning & async functions with limited concurrency.

@param concurrency - Concurrency limit. Minimum: `1`. You can pass a number or an options object with a `concurrency` property.
@returns A `limit` function.

@example
```
import pLimit from 'p-limit';

const limit = pLimit(1);

const input = [
	limit(() => fetchSomething('foo')),
	limit(() => fetchSomething('bar')),
	limit(() => doSomething())
];

// Only one promise is run at once
const result = await Promise.all(input);
console.log(result);
```

@example
```
import pLimit from 'p-limit';

const limit = pLimit({concurrency: 1});
```
*/
export default function pLimit(concurrency: number | Options): LimitFunction;

export type Options = {
	/**
	Concurrency limit.

	Minimum: `1`.
	*/
	readonly concurrency: number;

	/**
	Reject pending promises with an `AbortError` when `clearQueue()` is called.

	Default: `false`.

	This is recommended if you await the returned promises, for example with `Promise.all`, so pending tasks do not remain unresolved after `clearQueue()`.
	*/
	readonly rejectOnClear?: boolean;
};

/**
Returns a function with limited concurrency.

The returned function manages its own concurrent executions, allowing you to call it multiple times without exceeding the specified concurrency limit.

Ideal for scenarios where you need to control the number of simultaneous executions of a single function, rather than managing concurrency across multiple functions.

@param function_ - Promise-returning/async function.
@return Function with limited concurrency.

@example
```
import {limitFunction} from 'p-limit';

const limitedFunction = limitFunction(async () => {
	return doSomething();
}, {concurrency: 1});

const input = Array.from({length: 10}, limitedFunction);

// Only one promise is run at once.
await Promise.all(input);
```
*/
export type LimitedFunction<Arguments extends unknown[], ReturnType> = {
	/**
	The number of promises that are currently running.
	*/
	readonly activeCount: number;

	/**
	The number of promises that are waiting to run (i.e. their internal `fn` was not called yet).
	*/
	readonly pendingCount: number;

	/**
	Get or set the concurrency limit.
	*/
	concurrency: number;

	/**
	Discard pending promises that are waiting to run.

	This might be useful if you want to tear down the queue at the end of your program's lifecycle or discard any function calls referencing an intermediary state of your app.

	Note: This does not cancel promises that are already running.

	@param reason - Value to reject the discarded pending promises with. When provided (anything other than `undefined`, including `null` and other falsy values), every pending promise is rejected with this value verbatim, regardless of the `rejectOnClear` option. When omitted, the `rejectOnClear` option decides the behavior: if enabled, pending promises are rejected with an `AbortError`; otherwise they are discarded without settling.
	@returns The number of pending promises that were removed from the queue. Already-running promises are never counted or affected.
	*/
	clearQueue: (reason?: unknown) => number;

	/**
	Process an iterable or async iterable of inputs with limited concurrency, keeping only the items whose predicate resolves truthy.

	The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item is kept when the predicate's return value (awaited if a promise) is truthy, matching `Array.prototype.filter`.

	The resolved array contains the original input items (not the predicate's boolean), in input (draw) order regardless of the order in which the predicates complete.

	Like `map` (and unlike `mapSettled`), a predicate rejection is fatal: it rejects the returned promise with that reason and stops drawing new items. For an async iterable, the iterator's `return()` is called once for cleanup. Delegates to the underlying limiter.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. Sync iterables retain the eager behavior.

	@param iterable - An iterable or async iterable containing an argument for the given predicate.
	@param predicateFunction - Predicate function returning a boolean (or a promise for one).
	@returns A promise resolving to the kept input items in input (draw) order.
	*/
	filter: <Input> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
	) => Promise<Input[]>;

	/**
	Process an iterable or async iterable of inputs with limited concurrency, resolving to the first input item (in input/draw order) whose predicate resolves truthy.

	The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item matches when the predicate's return value (awaited if a promise) is truthy, matching `Array.prototype.find`.

	The resolved value is the original input item (not the predicate's boolean), chosen by the lowest input index — independent of the order in which predicates complete. Resolves to `undefined` when no item matches.

	Once the first-matching index is confirmed, no further items are drawn from the iterable and predicates that have not started are never started. Predicates already in flight are allowed to settle so they never surface as unhandled rejections; for an async iterable the iterator's `return()` is called once for cleanup. Delegates to the underlying limiter.

	Like `map` (and unlike `mapSettled`), a predicate rejection is fatal before the call settles: it rejects the returned promise with that reason and stops drawing new items.

	Async iterables are consumed lazily: the next value is only pulled when a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables.

	@param iterable - An iterable or async iterable containing an argument for the given predicate.
	@param predicateFunction - Predicate function returning a boolean (or a promise for one).
	@returns A promise resolving to the first matching input item, or `undefined`.
	*/
	find: <Input> (
		iterable: Iterable<Input> | AsyncIterable<Input>,
		predicateFunction: (input: Input, index: number) => PromiseLike<boolean> | boolean
	) => Promise<Input | undefined>;

	/**
	Returns a promise that resolves when the limiter becomes idle — no promises are currently running and none are waiting to run.

	If the limiter is already idle when this is called, the returned promise resolves immediately.
	*/
	onIdle: () => Promise<void>;

	/**
	Whether the limiter is currently idle — `true` when no promises are running and none are waiting to run.

	This is a read-only `O(1)` snapshot of the same idle state that `onIdle()` waits for.
	*/
	readonly isIdle: boolean;

	/**
	Whether the limiter is currently saturated — `true` when `activeCount` has reached the `concurrency` limit (no free slot), `false` while a slot is still available.

	This is a read-only `O(1)` snapshot that reads the live `concurrency`, so it is accurate synchronously right after a `concurrency` change. A limiter with infinite `concurrency` is never saturated.
	*/
	readonly isSaturated: boolean;

	/**
	Pause the limiter.

	Stops promoting pending tasks so no queued task starts until `resume()` is called.
	Tasks that are already running are not affected and will settle normally.
	Calling `pause()` while already paused is a no-op.
	*/
	pause: () => void;

	/**
	Resume a paused limiter.

	Promotes pending tasks up to the current `concurrency` limit, restoring normal scheduling.
	Calling `resume()` while not paused is a no-op.
	*/
	resume: () => void;

	/**
	Whether the limiter is currently paused — `true` after `pause()` and before `resume()`.

	This is a read-only `O(1)` snapshot. While paused, running tasks still settle but no
	pending task starts, so a paused limiter with pending tasks is never idle.
	*/
	readonly isPaused: boolean;

	/**
	Subscribe to limiter state changes.

	The listener is called with a frozen {@link LimiterSnapshot} on every state transition — enqueueing a task, promoting a queued task to running, a running task settling, `pause()`/`resume()`, `clearQueue()` (when the queue actually shrinks), and `concurrency` changes. Listeners are notified in subscription order. Delegates to the underlying limiter.

	Subscribing does not emit an immediate snapshot; read `activeCount`/`pendingCount`/`concurrency` directly for the initial state. A listener that throws does not affect scheduling or the other listeners.

	@param listener - Called with the latest readonly snapshot on each transition.
	@returns An idempotent unsubscribe function. After it is called, the listener is never notified again; calling it more than once is safe.
	*/
	subscribe: (listener: (snapshot: Readonly<LimiterSnapshot>) => void) => () => void;

	/**
	Call the limited function.

	@param arguments - Arguments to pass through to the wrapped function.
	@returns The promise returned by calling the wrapped function with `arguments`.
	*/
	(...arguments_: Arguments): Promise<ReturnType>;
};

export function limitFunction<Arguments extends unknown[], ReturnType>(
	function_: (...arguments_: Arguments) => PromiseLike<ReturnType>,
	options: Options
): LimitedFunction<Arguments, ReturnType>;
