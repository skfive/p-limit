import {expectType, expectError} from 'tsd';
import pLimit, {limitFunction} from './index.js';

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

// LimitFunction should require a Promise-returning function
const lf = limitFunction(async (_a: string) => 'ok', {concurrency: 1});
expectType<Promise<string>>(lf('input'));
expectType<Promise<void>>(lf.onIdle());
expectType<boolean>(lf.isIdle);
expectType<number>(lf.clearQueue());
expectType<number>(lf.clearQueue(new Error('reason')));

expectError(limitFunction((_a: string) => 'x', {concurrency: 1}));
expectError(pLimit({concurrency: 1, rejectOnClear: 'nope'}));

// LimitFunction.map accepts iterables
expectType<Promise<string[]>>(limit.map(new Set(['a', 'b', 'c']), async x => x + x));
expectType<Promise<number[]>>(limit.map([1, 2, 3].values(), async x => x * 2));
