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

Type: `number | string | object`\
Minimum: `1`

Concurrency limit.

You can pass a number, a registered preset name (see [`definePreset`](#definepresetname-concurrency-named-export)), or an options object with a `concurrency` property. A string is always treated as a preset name — it is never parsed as a number — so an unregistered name throws an [`UnknownPresetError`](#unknownpreseterror-named-export).

#### rejectOnClear

Type: `boolean`\
Default: `false`

Reject pending promises with an `AbortError` when `clearQueue()` is called.
This is recommended if you await the returned promises, for example with `Promise.all`, so pending tasks do not remain unresolved after `clearQueue()`.

```js
import pLimit from 'p-limit';

const limit = pLimit({concurrency: 1});
```

### definePreset(name, concurrency) <sup>named export</sup>

Register a named concurrency preset so limiters can be created or switched by a meaningful name instead of a repeated number.

The registry is module-global (shared by every limiter created from the same module) and starts empty — there are no built-in presets.

Returns `undefined`.

```js
import pLimit, {definePreset} from 'p-limit';

definePreset('fast', 8);

const limit = pLimit('fast');
console.log(limit.concurrency);
//=> 8
```

#### name

Type: `string`

A non-empty preset name.

#### concurrency

Type: `number`\
Minimum: `1`

Concurrency value for the preset — a positive integer or `Infinity`, the same rule as [`pLimit`](#plimitconcurrency-default-export).

Registering an existing name **overwrites** it. Limiters created earlier keep the concurrency they captured at creation time, so overwriting a name does not retroactively change them.

Throws a `TypeError` when `name` is not a non-empty string, or when `concurrency` is not a positive integer / `Infinity`. A rejected registration leaves any existing value for `name` unchanged.

### UnknownPresetError <sup>named export</sup>

Error thrown when a preset name is looked up (`pLimit(name)`, `pLimit({concurrency: name})`, or [`limit.usePreset(name)`](#limitusepresetname)) but no preset with that name has been registered.

- `error.name` is `'UnknownPresetError'`.
- `error.presetName` is the preset name that failed to resolve.

```js
import pLimit, {UnknownPresetError} from 'p-limit';

try {
	pLimit('missing');
} catch (error) {
	console.log(error instanceof UnknownPresetError);
	//=> true
	console.log(error.presetName);
	//=> 'missing'
}
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

### limit.mapSettled(iterable, mapperFunction)

Like [`limit.map()`](#limitmapiterable-mapperfunction), but every input settles: an individual mapper rejection **never** rejects the returned promise. Each element is reported as a `PromiseSettledResult`, so the result mirrors [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) while preserving input (draw) order, regardless of the order in which the mappers complete.

Each result entry is either `{status: 'fulfilled', value}` or `{status: 'rejected', reason}`. The `reason` is the thrown value verbatim, so you never need to wrap the mapper in `try`/`catch` to collect partial failures.

Async iterables are consumed lazily: the next value is only pulled once a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables without pre-loading them into memory. Sync iterables keep the eager behavior.

Only a failure of the input iterable itself (an `iterator.next()` rejection) rejects the returned promise; in that case the iterator's `return()` is called once for cleanup, matching `limit.map()`.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

const results = await limit.mapSettled([1, 2, 3], async n => {
	if (n === 2) {
		throw new Error('boom');
	}

	return n * 10;
});
//=> [
//   {status: 'fulfilled', value: 10},
//   {status: 'rejected', reason: Error('boom')},
//   {status: 'fulfilled', value: 30}
// ]
```

### limit.filter(iterable, predicateFunction)

Process an iterable or async iterable of inputs with limited concurrency, keeping only the items whose predicate resolves truthy.

The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item is kept when the predicate's return value (awaited if it is a promise) is truthy, matching [`Array.prototype.filter()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter).

Returns a promise that resolves to the original input items (not the predicate's boolean), in input (draw) order, regardless of the order in which the predicates complete.

Like [`limit.map()`](#limitmapiterable-mapperfunction) (and unlike [`limit.mapSettled()`](#limitmapsettlediterable-mapperfunction)), a predicate rejection is fatal: it rejects the returned promise with that reason and stops drawing new items. For an async iterable, the iterator's `return()` is called once for cleanup, matching `limit.map()`.

Async iterables are consumed lazily: the next value is only pulled once a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables without pre-loading them into memory. Sync iterables keep the existing eager behavior.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

// Keep only the URLs that respond OK; at most two HEAD requests run at a time.
const reachable = await limit.filter(urls, async url => (await fetch(url, {method: 'HEAD'})).ok);
```

This is a convenience function for processing inputs that arrive in batches. For more complex use cases, see [p-filter](https://github.com/sindresorhus/p-filter).

### limit.find(iterable, predicateFunction)

Process an iterable or async iterable of inputs with limited concurrency, resolving to the first input item whose predicate resolves truthy.

The predicate function receives the item value and its index, and may be synchronous or asynchronous. An item matches when the predicate's return value (awaited if it is a promise) is truthy, matching [`Array.prototype.find()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find).

Returns a promise that resolves to the original input item (not the predicate's boolean), chosen by the **lowest input (draw) index**, regardless of the order in which the predicates complete. Resolves to `undefined` when no item matches.

Unlike [`limit.map()`](#limitmapiterable-mapperfunction)/[`limit.filter()`](#limitfilteriterable-predicatefunction) (which consume the whole input), `find` stops early: once the first-matching index is confirmed, no further items are drawn from the iterable and predicates that have not started are never started. Predicates already in flight are allowed to settle so they never surface as unhandled rejections; for an async iterable the iterator's `return()` is called once for cleanup.

Like [`limit.map()`](#limitmapiterable-mapperfunction) (and unlike [`limit.mapSettled()`](#limitmapsettlediterable-mapperfunction)), a predicate rejection is fatal: it rejects the returned promise with that reason and stops drawing new items.

Both sync and async iterables are consumed lazily: the next value is only pulled once a concurrency slot frees up, so at most `concurrency` items are drawn but not yet settled at any time. This makes it safe to pass infinite or streaming async iterables, and lets the early exit skip items after the match.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

// Resolve to the first URL that responds OK; at most two HEAD requests run at a
// time, and no further requests are made once a match is confirmed.
const firstReachable = await limit.find(urls, async url => (await fetch(url, {method: 'HEAD'})).ok);
```

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

### limit.usePreset(name)

Switch the limiter's concurrency to a [registered preset](#definepresetname-concurrency-named-export).

Looks up `name` in the preset registry and assigns its value exactly like `limit.concurrency = value`, so waiting tasks are promoted up to the new limit the same way a numeric change would promote them.

Returns `undefined`.

Throws an [`UnknownPresetError`](#unknownpreseterror-named-export) when `name` is not registered. The lookup happens before the assignment, so a failed switch leaves the current `concurrency` unchanged and does not disturb running or queued tasks.

```js
import pLimit, {definePreset} from 'p-limit';

definePreset('fast', 8);
definePreset('slow', 2);

const limit = pLimit('fast'); // concurrency === 8

// Later, dial the limit down under load:
limit.usePreset('slow'); // concurrency === 2
```

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

### limit.snapshot()

Read a synchronous, side-effect-free snapshot of the limiter's current state.

Returns a fresh frozen object captured at the moment of the call — useful for reading several coherent values at once (logging, dashboards, debugging) without subscribing. The returned object is a plain frozen value, not a live reference: later state changes are not reflected, so call `snapshot()` again to re-read. Calling it does not affect scheduling, execution order, settlement, or timing.

The snapshot has the following shape:

- `activeCount` (`number`) — promises currently running.
- `pendingCount` (`number`) — promises waiting to run.
- `concurrency` (`number`) — the current concurrency limit (may be `Infinity`).
- `isPaused` (`boolean`) — whether the limiter is paused (`true` after `pause()` and before `resume()`).
- `status` (`'idle' | 'active' | 'saturated' | 'paused'`) — the derived status (see below).

The `status` is derived from the other fields by a **fixed priority order** — the first matching row wins:

| Priority | `status` | Condition (given no higher row matched) |
| --- | --- | --- |
| 1 (highest) | `'paused'` | The limiter is paused (`isPaused` is `true`). |
| 2 | `'saturated'` | Every slot is occupied (`activeCount >= concurrency`). A limiter with infinite `concurrency` is never saturated. |
| 3 | `'active'` | At least one task is running but a slot is still free (`activeCount > 0`). |
| 4 (lowest) | `'idle'` | Nothing is running (`activeCount === 0`). |

`pendingCount` does **not** affect `status`: a limiter with queued-but-not-started tasks and nothing running (and not paused) is still `'idle'`, so do not read `'idle'` as "the queue is empty". This is the same derived `status` reported to [`subscribe()`](#limitsubscribelistener) listeners, so both surfaces always agree for a given moment.

```js
import pLimit from 'p-limit';

const limit = pLimit(1);

console.log(limit.snapshot());
//=> {activeCount: 0, pendingCount: 0, concurrency: 1, isPaused: false, status: 'idle'}

limit(() => doSomething());

console.log(limit.snapshot());
//=> {activeCount: 1, pendingCount: 0, concurrency: 1, isPaused: false, status: 'saturated'}
```

### limit.subscribe(listener)

Subscribe to limiter state changes.

The `listener` is called with a frozen snapshot on every state transition — enqueueing a task, promoting a queued task to running, a running task settling, `pause()`/`resume()`, `clearQueue()` (only when the queue actually shrinks), and `concurrency` changes. Listeners are notified in subscription order.

Subscribing does not emit an immediate snapshot; read `activeCount`/`pendingCount`/`concurrency` directly for the initial state. A listener that throws does not affect scheduling or the other listeners.

Returns an idempotent unsubscribe function. After it is called, the listener is never notified again; calling it more than once is safe.

The snapshot is a frozen object with the following shape:

- `activeCount` (`number`) — promises currently running.
- `pendingCount` (`number`) — promises waiting to run.
- `concurrency` (`number`) — the current concurrency limit (may be `Infinity`).
- `status` (`'idle' | 'active' | 'saturated' | 'paused'`) — the derived status, chosen by the fixed priority order `paused` > `saturated` > `active` > `idle`.

```js
import pLimit from 'p-limit';

const limit = pLimit(2);

const unsubscribe = limit.subscribe(snapshot => {
	console.log(snapshot.status, snapshot.activeCount, snapshot.pendingCount);
});

limit(() => doSomething());
//=> 'active' 1 0

// Later, stop receiving updates:
unsubscribe();
```

#### listener

Type: `Function`

Called with the latest readonly snapshot on each state transition.

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

Type: `number | string`\
Minimum: `1`

Concurrency limit. May be a number or a registered preset name (see [`definePreset`](#definepresetname-concurrency-named-export)).

#### rejectOnClear

Type: `boolean`\
Default: `false`

Reject pending promises with an `AbortError` when `clearQueue()` is called.
This is recommended if you await the returned promises, for example with `Promise.all`, so pending tasks do not remain unresolved after `clearQueue()`.

The returned function also exposes the same control and observation surface as `limit`: `.activeCount`, `.pendingCount`, `.concurrency` (get/set), `.usePreset()`, `.clearQueue()`, `.onIdle()`, `.isIdle`, `.isSaturated`, `.pause()`, `.resume()`, and `.isPaused`.

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

## Real-time Inspector demo

The `demo/` directory contains a real-time **Inspector** that observes a running
limiter — its active/pending counts, concurrency, and derived status — and lets
you drive state transitions (enqueue / clear queue / pause / resume).

The Inspector renders four derived states. Each state is shown with **color and
an explicit on-screen text label** (never color alone), so it stays legible for
color-blind users and screen readers:

| status | On-screen label | Meaning |
| --- | --- | --- |
| `idle` | **Idle** | No task running and none waiting. |
| `active` | **Running** | At least one task running, a free slot remains. |
| `saturated` | **Saturated** | Running tasks reached the concurrency limit (no free slot). Infinite concurrency is never saturated. |
| `paused` | **Paused** | Paused via `pause()`; running tasks still settle, no queued task starts. |

Accessibility and responsive contract:

- The status badge is an `aria-live="polite"` region, so status text changes are
  announced to screen readers.
- Every control (enqueue / clear queue / pause / resume) has an explicit
  `aria-label` and is reachable in keyboard Tab order.
- After cancelling (`clearQueue()`) or a task failure, pending calls are
  discarded and any running task still settles; once the limiter drains, the
  display converges to its initial values (`Idle` + zero counts) and the enqueue
  control is usable again.
- Pausing is different: while paused the badge stays `Paused` even after counts
  reach zero — the paused state takes priority over the derived idle state — so
  the display only leaves `Paused` after `resume()` (which re-promotes queued
  calls up to the concurrency limit).
- Below 480px, the controls stack vertically; no content overflows at ≥ 320px.

The full visual specification — concrete colors, typography, layout, and the
state-transition flows — lives in
[`docs/design/inspector-contract.md`](docs/design/inspector-contract.md), with a
visual mockup at `docs/design/mockups/inspector-F68F701A7A-76.html`.

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
