import {expectType, expectError} from 'tsd';
import pLimit, {
	limitFunction,
	definePreset,
	UnknownPresetError,
	type LimitFunction,
} from './index.js';

const limit = pLimit(1);
const limitWithRejectOnClear = pLimit({concurrency: 1, rejectOnClear: true});

const input = [
	limit(async () => 'foo'),
	limit(async () => 'bar'),
	limit(async () => undefined),
];

expectType<Promise<Array<string | undefined>>>(Promise.all(input));

expectType<Promise<string>>(limit((_a: string) => '', 'test'));
expectType<Promise<string>>(limit(async (_a: string, _b: number) => '', 'test', 1));

expectType<number>(limit.activeCount);
expectType<number>(limit.pendingCount);

expectType<number>(limit.clearQueue());
expectType<number>(limitWithRejectOnClear.clearQueue());

// `clearQueue` accepts an optional `reason` of any type and returns the removed count.
expectType<number>(limit.clearQueue(new Error('reason')));
expectType<number>(limit.clearQueue('reason'));
expectType<number>(limit.clearQueue({code: 'CANCELLED'}));
expectType<number>(limit.clearQueue(null));
expectType<number>(limit.clearQueue(undefined));

expectType<Promise<void>>(limit.onIdle());

expectType<boolean>(limit.isIdle);

expectType<boolean>(limit.isSaturated);

expectType<void>(limit.pause());
expectType<void>(limit.resume());
expectType<boolean>(limit.isPaused);

// LimitFunction should require a Promise-returning function
const lf = limitFunction(async (_a: string) => 'ok', {concurrency: 1});
expectType<Promise<string>>(lf('input'));
expectType<Promise<void>>(lf.onIdle());
expectType<boolean>(lf.isIdle);
expectType<boolean>(lf.isSaturated);
expectType<void>(lf.pause());
expectType<void>(lf.resume());
expectType<boolean>(lf.isPaused);
expectType<number>(lf.clearQueue());
expectType<number>(lf.clearQueue(new Error('reason')));

expectError(limitFunction((_a: string) => 'x', {concurrency: 1}));
expectError(pLimit({concurrency: 1, rejectOnClear: 'nope'}));

// LimitFunction.map accepts iterables
expectType<Promise<string[]>>(limit.map(new Set(['a', 'b', 'c']), async x => x + x));
expectType<Promise<number[]>>(limit.map([1, 2, 3].values(), async x => x * 2));

// [T1] LimitFunction.mapSettled resolves to input-ordered PromiseSettledResult entries
expectType<Promise<Array<PromiseSettledResult<number>>>>(limit.mapSettled([1], async n => n));

// [T2] mapSettled accepts an async iterable with the same settled return type
async function * asyncSource(): AsyncGenerator<number> {
	yield 1;
}

expectType<Promise<Array<PromiseSettledResult<number>>>>(limit.mapSettled(asyncSource(), async n => n));

// [T3] the mapper's `index` parameter is inferred as `number`
const settledWithIndex = limit.mapSettled(['a', 'b'], async (value, index) => {
	expectType<number>(index);
	return value;
});
expectType<Promise<Array<PromiseSettledResult<string>>>>(settledWithIndex);

// [T4] LimitFunction.filter resolves to the original input element type, in input order
expectType<Promise<number[]>>(limit.filter([1, 2, 3], async n => n > 1));
expectType<Promise<string[]>>(limit.filter(new Set(['a', 'b']), value => value !== 'a'));
expectType<Promise<number[]>>(limit.filter([1, 2, 3].values(), n => n > 1));

// [T5] filter accepts an async iterable with the same element return type
expectType<Promise<number[]>>(limit.filter(asyncSource(), async n => n > 0));

// [T6] filter accepts both sync and async (PromiseLike<boolean>) predicates
expectType<Promise<number[]>>(limit.filter([1, 2, 3], n => n > 1));

// [T7] the predicate's `index` parameter is inferred as `number`
const filteredWithIndex = limit.filter(['a', 'b'], async (value, index) => {
	expectType<string>(value);
	expectType<number>(index);
	return index > 0;
});
expectType<Promise<string[]>>(filteredWithIndex);

// [T8] limitFunction() returns a filter delegating with the same typing
const limitedForFilter = limitFunction(async (n: number) => n, {concurrency: 1});
expectType<Promise<number[]>>(limitedForFilter.filter([1, 2, 3], async n => n > 1));

// [T9] a predicate returning a non-boolean is a type error
expectError(limit.filter([1, 2, 3], async n => n));

// [T10] LimitFunction.find resolves to the original element type or undefined, from sync/async iterables
expectType<Promise<number | undefined>>(limit.find([1, 2, 3], async n => n > 1));
expectType<Promise<string | undefined>>(limit.find(new Set(['a', 'b']), value => value !== 'a'));
expectType<Promise<number | undefined>>(limit.find([1, 2, 3].values(), n => n > 1));

// [T11] find accepts an async iterable with the same element return type
expectType<Promise<number | undefined>>(limit.find(asyncSource(), async n => n > 0));

// [T12] find accepts both sync and async (PromiseLike<boolean>) predicates
expectType<Promise<number | undefined>>(limit.find([1, 2, 3], n => n > 1));

// [T13] the predicate's `value`/`index` parameters are inferred as the element type and `number`
const foundWithIndex = limit.find(['a', 'b'], async (value, index) => {
	expectType<string>(value);
	expectType<number>(index);
	return index > 0;
});
expectType<Promise<string | undefined>>(foundWithIndex);

// [T14] limitFunction() returns a find delegating with the same typing
const limitedForFind = limitFunction(async (n: number) => n, {concurrency: 1});
expectType<Promise<number | undefined>>(limitedForFind.find([1, 2, 3], async n => n > 1));

// [T15] a predicate returning a non-boolean is a type error
expectError(limit.find([1, 2, 3], async n => n));

// [P1] definePreset returns void
expectType<void>(definePreset('fast', 4));

// [P2] pLimit accepts a preset name string and returns a LimitFunction
expectType<LimitFunction>(pLimit('fast'));

// [P3] pLimit accepts a preset name via the options object
expectType<LimitFunction>(pLimit({concurrency: 'fast'}));

// [P4] usePreset returns void on both LimitFunction and LimitedFunction
expectType<void>(limit.usePreset('fast'));

// [P5] UnknownPresetError exposes a string presetName and a literal name
const presetError = new UnknownPresetError('fast');
expectType<string>(presetError.presetName);
expectType<'UnknownPresetError'>(presetError.name);

// [P6] limitFunction accepts a preset name and exposes usePreset
const limitedForPreset = limitFunction(async (_n: number) => _n, {concurrency: 'fast'});
expectType<void>(limitedForPreset.usePreset('fast'));

// [P7] a non-string preset name is a type error
expectError(definePreset(123, 4));

// [P8] numeric concurrency argument stays backward compatible
expectType<LimitFunction>(pLimit(2));
