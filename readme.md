# p-limit

> Run multiple promise-returning & async functions with limited concurrency

*Works in Node.js and browsers.*

## Install

```sh
npm install p-limit
```

## Usage

```js
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

## API

### pLimit(concurrency) <sup>default export</sup>

Returns a `limit` function.

#### concurrency

Type: `number | object`\
Minimum: `1`

Concurrency limit.

You can pass a number or an options object with a `concurrency` property.

#### rejectOnClear

Type: `boolean`\
Default: `false`

Reject pending promises with an `AbortError` when `clearQueue()` is called.
This is recommended if you await the returned promises, for example with `Promise.all`, so pending tasks do not remain unresolved after `clearQueue()`.

```js
import pLimit from 'p-limit';

const limit = pLimit({concurrency: 1});
```

### limit(fn, ...args)

Returns the promise returned by calling `fn(...args)`.

#### fn

Type: `Function`

Promise-returning/async function.

#### args

Any arguments to pass through to `fn`.

Support for passing arguments on to the `fn` is provided in order to be able to avoid creating unnecessary closures. You probably don't need this optimization unless you're pushing a *lot* of functions.

Warning: Avoid calling the same `limit` function inside a function that is already limited by it. This can create a deadlock where inner tasks never run. Use a separate limiter for inner tasks.

### limit.map(iterable, mapperFunction)

Process an iterable or async iterable of inputs with limited concurrency.

The mapper function receives the item value and its index.

Returns a promise that resolves to the mapper results in input (draw) order, regardless of the order in which they complete.

Async iterables are consumed lazily: the next value is only pulled once a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables without pre-loading them into memory. Sync iterables keep the existing eager behavior.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

async function * pages() {
	let cursor;
	do {
		const page = await fetchPage(cursor);
		cursor = page.nextCursor;
		yield page.url;
	} while (cursor);
}

// Only two pages are fetched and processed at a time; the generator is
// pulled lazily as slots free up.
const results = await limit.map(pages(), async url => fetch(url));
```

This is a convenience function for processing inputs that arrive in batches. For more complex use cases, see [p-map](https://github.com/sindresorhus/p-map).

### limit.activeCount

The number of promises that are currently running.

### limit.pendingCount

The number of promises that are waiting to run (i.e. their internal `fn` was not called yet).

### limit.clearQueue(reason?)

Discard pending promises that are waiting to run.

Returns the number of pending promises that were removed from the queue. Promises that are already running are never counted or affected.

This might be useful if you want to tear down the queue at the end of your program's lifecycle or discard any function calls referencing an intermediary state of your app.

Note: This does not cancel promises that are already running.

#### reason

Type: `unknown`\
Optional.

Value to reject the discarded pending promises with.

When a `reason` is provided (anything other than `undefined` — including `null` and other falsy values), every pending promise is rejected with that value as-is, regardless of the `rejectOnClear` option:

```js
import pLimit from 'p-limit';

const limit = pLimit(1);

const running = limit(() => doSomething());
const pending = limit(() => doSomethingElse());

// Rejects `pending` with the given reason and returns the number removed.
const removed = limit.clearQueue(new Error('Cancelled'));
//=> 1
```

When `reason` is omitted, the `rejectOnClear` option decides the behavior: if enabled, pending promises are rejected with an `AbortError`; otherwise they are discarded without settling.

Awaiting the returned promises (for example with `Promise.all`) is recommended when you reject on clear, so pending tasks do not remain unresolved after `clearQueue()`.

### limit.concurrency

Get or set the concurrency limit.

### limit.onIdle()

Returns a promise that resolves when the limiter becomes idle — no promises are currently running and none are waiting to run.

If the limiter is already idle when this is called, the returned promise resolves immediately. This is event-driven (no polling or timers), so it also accounts for pending tasks discarded by `clearQueue()` and in-progress `limit.map()` calls.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

for (const url of urls) {
	limit(() => fetch(url));
}

// Resolves once every queued and running task has settled.
await limit.onIdle();
console.log('All done');
```

Note: If a running task never settles, the limiter never becomes idle and the returned promise never resolves — the same caveat as awaiting the task promises directly.

### limit.isIdle

Type: `boolean`

Whether the limiter is currently idle — `true` when no promises are running and none are waiting to run.

This is a read-only `O(1)` snapshot of the same idle state that `onIdle()` waits for, so it also accounts for in-progress `limit.map()` calls. Use it for a synchronous check; use `onIdle()` to await the transition.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

console.log(limit.isIdle);
//=> true

limit(() => fetch('https://example.com'));

console.log(limit.isIdle);
//=> false
```

### limit.isSaturated

Type: `boolean`

Whether the limiter is currently saturated — `true` when the number of running promises has reached the `concurrency` limit (no free slot), `false` while a slot is still available.

This is a read-only `O(1)` snapshot that reads the live `concurrency`, so it is accurate synchronously right after a `concurrency` change. A limiter with infinite `concurrency` is never saturated.

```js
import pLimit from 'p-limit';

const limit = pLimit(1);

console.log(limit.isSaturated);
//=> false

limit(() => fetch('https://example.com'));

console.log(limit.isSaturated);
//=> true
```

### limit.pause()

Pause the limiter.

Stops promoting pending tasks, so no queued task starts until `resume()` is called. Tasks that are already running are not affected and settle normally. Calling `pause()` while already paused is a no-op.

Useful for backpressure — for example, pausing new work while an external system signals a rate limit, without cancelling in-flight requests.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

for (const url of urls) {
	limit(() => fetch(url));
}

// Stop starting new requests; in-flight ones keep going.
limit.pause();
```

Note: `pause()` does not cancel running tasks. To discard queued-but-not-started tasks, use `clearQueue(reason)`.

### limit.resume()

Resume a paused limiter.

Promotes pending tasks up to the current `concurrency` limit, restoring normal scheduling. Calling `resume()` while not paused is a no-op.

```js
// Later, once there is capacity again:
limit.resume();
```

### limit.isPaused

Type: `boolean`

Whether the limiter is currently paused — `true` after `pause()` and before `resume()`.

This is a read-only `O(1)` snapshot. While paused, running tasks still settle but no pending task starts, so a paused limiter with pending tasks is never idle.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

console.log(limit.isPaused);
//=> false

limit.pause();

console.log(limit.isPaused);
//=> true
```

### limitFunction(fn, options) <sup>named export</sup>

Returns a function with limited concurrency.

The returned function manages its own concurrent executions, allowing you to call it multiple times without exceeding the specified concurrency limit.

Ideal for scenarios where you need to control the number of simultaneous executions of a single function, rather than managing concurrency across multiple functions.

```js
import {limitFunction} from 'p-limit';

const limitedFunction = limitFunction(async () => {
	return doSomething();
}, {concurrency: 1});

const input = Array.from({length: 10}, limitedFunction);

// Only one promise is run at once.
await Promise.all(input);
```

#### fn

Type: `Function`

Promise-returning/async function.

#### options

Type: `object`

#### concurrency

Type: `number`\
Minimum: `1`

Concurrency limit.

#### rejectOnClear

Type: `boolean`\
Default: `false`

Reject pending promises with an `AbortError` when `clearQueue()` is called.
This is recommended if you await the returned promises, for example with `Promise.all`, so pending tasks do not remain unresolved after `clearQueue()`.

The returned function also exposes the same control and observation surface as `limit`: `.activeCount`, `.pendingCount`, `.concurrency` (get/set), `.clearQueue()`, `.onIdle()`, `.isIdle`, `.isSaturated`, `.pause()`, `.resume()`, and `.isPaused`.

```js
import {limitFunction} from 'p-limit';

const limitedFunction = limitFunction(async () => {
	return doSomething();
}, {concurrency: 2});

const promises = Array.from({length: 5}, limitedFunction);

console.log(limitedFunction.activeCount);
//=> 2
console.log(limitedFunction.pendingCount);
//=> 3

// Raise the limit; queued calls are promoted up to the new limit.
limitedFunction.concurrency = 4;

// Discard any calls still waiting to run.
limitedFunction.clearQueue();

await Promise.allSettled(promises);
```

## Recipes

See [recipes.md](recipes.md) for common use cases and patterns.

## FAQ

### How is this different from the [`p-queue`](https://github.com/sindresorhus/p-queue) package?

This package is only about limiting the number of concurrent executions (with basic controls such as `pause()`/`resume()` and introspection), while `p-queue` is a fully featured queue implementation with lots of different options, priorities, and scheduling.

## Related

- [p-throttle](https://github.com/sindresorhus/p-throttle) - Throttle promise-returning & async functions
- [p-debounce](https://github.com/sindresorhus/p-debounce) - Debounce promise-returning & async functions
- [p-map](https://github.com/sindresorhus/p-map) - Run promise-returning & async functions concurrently with different inputs
- [p-all](https://github.com/sindresorhus/p-all) - Run promise-returning & async functions concurrently with optional limited concurrency
- [More…](https://github.com/sindresorhus/promise-fun)
