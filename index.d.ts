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
