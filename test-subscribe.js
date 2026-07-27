// 구독 API × Inspector demo 통합 회귀 가드 (F68F701A7A-80)
// tester 고유 영역만 검증한다:
//   - pLimit.subscribe() 계약(enqueue/start/settle, pause/resume, clearQueue, concurrency,
//     unsubscribe, listener 예외 격리)이 demo/inspector.js의 실제 DOM 배선에 그대로 전파되는가 (AC1/AC2)
//   - 실 브라우저에서 Inspector가 polling 없이 실시간 갱신되는가 (AC3, e2e-runner)
// subscribe() 자체의 내부 발화 순서/타이밍 단위 테스트는 tests/demo-subscribe.test.js(dev)가
// 이미 포괄적으로 검증했으므로 여기서는 재작성하지 않는다(중복 금지).
// 실행: `node --test test-subscribe.js`
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {initInspector, STATUS_TEXT} from './demo/inspector.js';

// brix-flow-test-scope-guard — focused scope일 때 자기 module 외에는 e2e 시나리오를 skip.
const _BRIX_MY_MODULE = 'demo';
const _brixOutOfScope
	= process.env.BRIX_TEST_SCOPE === 'focused'
	&& Boolean(process.env.BRIX_TEST_MODULE)
	&& process.env.BRIX_TEST_MODULE !== _BRIX_MY_MODULE;

// 수동으로 해소 시점을 제어하는 태스크(전이를 결정적으로 관찰하기 위함).
function deferred() {
	let resolve;
	const promise = new Promise(innerResolve => {
		resolve = innerResolve;
	});
	return {promise, resolve};
}

// initInspector가 기대하는 DOM 표면(getElementById/addEventListener/textContent/dataset/disabled)만
// 흉내 내는 최소 stub. 실 브라우저 렌더링/CSS는 별도 e2e-runner 시나리오가 검증한다.
function createStubElement() {
	const listeners = {};
	return {
		textContent: '',
		disabled: false,
		dataset: {},
		addEventListener(type, handler) {
			(listeners[type] ??= []).push(handler);
		},
		click() {
			for (const handler of listeners.click ?? []) {
				handler();
			}
		},
	};
}

const INSPECTOR_ELEMENT_IDS = [
	'inspector-root',
	'inspector-status-badge',
	'inspector-active-count',
	'inspector-pending-count',
	'inspector-concurrency-value',
	'inspector-enqueue',
	'inspector-clear',
	'inspector-pause',
	'inspector-resume',
];

function createStubDocument() {
	const elements = new Map(INSPECTOR_ELEMENT_IDS.map(id => [id, createStubElement()]));
	return {
		getElementById: id => elements.get(id),
		el: Object.fromEntries(elements),
	};
}

test('STATUS_TEXT는 계약된 4개 상태 라벨을 그대로 노출한다', () => {
	assert.deepEqual(Object.keys(STATUS_TEXT).sort(), ['active', 'idle', 'paused', 'saturated']);
	assert.equal(STATUS_TEXT.idle, 'Idle');
	assert.equal(STATUS_TEXT.active, 'Running');
	assert.equal(STATUS_TEXT.saturated, 'Saturated');
	assert.equal(STATUS_TEXT.paused, 'Paused');
});

test('initInspector: enqueue→start→settle 전이마다 배지·active·pending이 실시간 갱신된다 (AC1)', async () => {
	const doc = createStubDocument();
	const task = deferred();
	const controller = initInspector(doc, {concurrency: 1, makeTask: () => () => task.promise});

	assert.equal(doc.el['inspector-status-badge'].textContent, 'Idle');
	assert.equal(doc.el['inspector-concurrency-value'].textContent, '1');

	doc.el['inspector-enqueue'].click(); // enqueue → start(동기 promotion) → saturated
	assert.equal(doc.el['inspector-status-badge'].textContent, 'Saturated');
	assert.equal(doc.el['inspector-status-badge'].dataset.status, 'saturated');
	assert.equal(doc.el['inspector-active-count'].textContent, '1');
	assert.equal(doc.el['inspector-pause'].disabled, false);
	assert.equal(doc.el['inspector-resume'].disabled, true);

	task.resolve();
	await controller.limit.onIdle();

	assert.equal(doc.el['inspector-status-badge'].textContent, 'Idle');
	assert.equal(doc.el['inspector-active-count'].textContent, '0');
});

test('initInspector: pause/resume 클릭이 배지 텍스트와 pause/resume 버튼 활성 상태를 전환한다 (AC1)', async () => {
	const doc = createStubDocument();
	const task = deferred();
	const controller = initInspector(doc, {concurrency: 1, makeTask: () => () => task.promise});

	doc.el['inspector-pause'].click();
	assert.equal(doc.el['inspector-status-badge'].textContent, 'Paused');
	assert.equal(doc.el['inspector-pause'].disabled, true);
	assert.equal(doc.el['inspector-resume'].disabled, false);

	doc.el['inspector-resume'].click();
	assert.equal(doc.el['inspector-status-badge'].textContent, 'Idle');
	assert.equal(doc.el['inspector-pause'].disabled, false);
	assert.equal(doc.el['inspector-resume'].disabled, true);

	task.resolve();
	await controller.limit.onIdle();
});

test('initInspector: 큐 비우기 클릭 시 pending이 0이 되고 clear 버튼이 비활성화된다 (AC1 clearQueue)', async () => {
	const doc = createStubDocument();
	const task = deferred();
	const controller = initInspector(doc, {concurrency: 1, makeTask: () => () => task.promise});

	doc.el['inspector-enqueue'].click(); // 실행 중 1건 (concurrency=1 slot 점유)
	doc.el['inspector-enqueue'].click(); // 대기 1건
	assert.equal(doc.el['inspector-pending-count'].textContent, '1');
	assert.equal(doc.el['inspector-clear'].disabled, false);

	doc.el['inspector-clear'].click();
	assert.equal(doc.el['inspector-pending-count'].textContent, '0');
	assert.equal(doc.el['inspector-clear'].disabled, true);

	task.resolve();
	await controller.limit.onIdle();
});

test('initInspector: concurrency 값(Infinity 포함)이 화면 텍스트에 그대로 반영된다 (AC1)', () => {
	const doc = createStubDocument();
	initInspector(doc, {concurrency: Number.POSITIVE_INFINITY, makeTask: () => () => Promise.resolve()});
	assert.equal(doc.el['inspector-concurrency-value'].textContent, '∞');
});

test('initInspector: controller.unsubscribe() 이후에는 배지가 더 이상 갱신되지 않는다 (AC1 unsubscribe)', async () => {
	const doc = createStubDocument();
	const task = deferred();
	const controller = initInspector(doc, {concurrency: 1, makeTask: () => () => task.promise});

	controller.unsubscribe();
	doc.el['inspector-enqueue'].click(); // limiter는 내부적으로 saturated로 전이하지만 render는 더 이상 호출되지 않는다.

	assert.equal(doc.el['inspector-status-badge'].textContent, 'Idle');
	assert.equal(controller.limit.activeCount, 1, 'limiter 자체 실행/정산은 unsubscribe와 무관하게 계속된다');

	task.resolve();
	await controller.limit.onIdle();
});

test('initInspector: 다른 listener의 예외가 Inspector 렌더링과 limiter 실행에 영향을 주지 않는다 (AC2)', async () => {
	const doc = createStubDocument();
	const task = deferred();
	const controller = initInspector(doc, {concurrency: 1, makeTask: () => () => task.promise});

	controller.limit.subscribe(() => {
		throw new Error('external listener boom');
	});

	doc.el['inspector-enqueue'].click();
	assert.equal(
		doc.el['inspector-status-badge'].textContent,
		'Saturated',
		'Inspector 자신의 render listener는 다른 listener의 예외에 영향받지 않는다',
	);

	task.resolve();
	await controller.limit.onIdle();
	assert.equal(doc.el['inspector-status-badge'].textContent, 'Idle');
});

// ---------------------------------------------------------------------------
// 브라우저 E2E: 실 Inspector demo(demo/index.html)의 실시간 갱신을 e2e-runner로 검증한다 (AC3).
// ---------------------------------------------------------------------------

// 확장자 → Content-Type. 브라우저의 module script strict MIME 검사(text/javascript 필요)와
// CSS 로드를 위해 필수 — 헤더 없이 서빙하면 "Expected a JavaScript-or-Wasm module script" 로 실패한다.
const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

// serveRoot(repo root) 아래 파일만 노출하는 self-contained 정적 서버. demo/index.html의
// importmap이 "../node_modules/yocto-queue/index.js"를 가리키므로 serve root는 repo root여야
// /demo/*와 /node_modules/*를 모두 같은 origin에서 서빙할 수 있다.
function startStaticServer(serveRoot) {
	const root = path.resolve(serveRoot);
	const server = http.createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
		const resolved = path.resolve(root, `.${urlPath}`);
		if (resolved !== root && !resolved.startsWith(root + path.sep)) {
			res.writeHead(403).end('forbidden');
			return;
		}

		const target = urlPath.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
		fs.readFile(target, (error, buffer) => {
			if (error) {
				res.writeHead(404).end('not found');
				return;
			}

			const contentType = MIME_TYPES[path.extname(target)] || 'application/octet-stream';
			res.writeHead(200, {'Content-Type': contentType}).end(buffer);
		});
	});
	return new Promise(resolve => {
		// 0.0.0.0 바인딩 필수 — e2e-runner 컨테이너가 hostname으로 도달.
		server.listen(0, '0.0.0.0', () => resolve({server, port: server.address().port}));
	});
}

async function runInspectorE2e(t, {label, scriptText}) {
	if (process.env.BRIX_E2E_SKIP === '1') {
		t.skip('BRIX_E2E_SKIP=1 — CI 결정성 가드');
		return;
	}

	let probe;
	try {
		probe = await fetch('http://e2e-runner:3030/health', {
			signal: AbortSignal.timeout(2000),
		});
	} catch (error) {
		t.skip(`e2e-runner 도달 불가 (${error.message}) — skip`);
		return;
	}

	if (!probe.ok) {
		t.skip(`e2e-runner unhealthy (${probe.status}) — skip`);
		return;
	}

	const {server, port} = await startStaticServer('.');
	t.after(() => server.close());

	const host = process.env.BRIX_PERSONA_HOST || 'worker';
	const url = `http://${host}:${port}/demo/`;

	const runId = process.env.BRIX_RUN_ID;
	const jiraKey = process.env.BRIX_JIRA_KEY;
	if (!runId || !jiraKey) {
		throw new Error('worker-injected run identity(BRIX_RUN_ID/BRIX_JIRA_KEY)가 없습니다');
	}

	const response = await fetch('http://e2e-runner:3030/run', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Brix-Run-Id': runId,
			'X-Brix-Jira-Key': jiraKey,
		},
		body: JSON.stringify({
			url, label, scriptText, timeoutMs: 30_000,
		}),
	});

	const result = await response.json();
	assert.equal(result.ok, true, `e2e-runner 호출 실패 [${label}]: ${result.stdout ?? ''}`);
	assert.equal(result.passed, true, `E2E 시나리오 실패 [${label}]: ${result.stdout ?? ''}`);
}

test(
	'[E2E] Inspector 작업 추가 → 상태 배지·active count가 실시간(polling 없이) 갱신된다',
	{skip: _brixOutOfScope},
	async t => runInspectorE2e(t, {
		label: 'Inspector 작업 추가 → 상태 배지 실시간 갱신',
		scriptText: `
			const before = await page.locator('#inspector-status-badge').innerText();
			if (before !== 'Idle') throw new Error('초기 배지 상태가 Idle이 아님: ' + before);
			await page.locator('#inspector-enqueue').click();
			await page.waitForTimeout(200);
			const after = await page.locator('#inspector-status-badge').innerText();
			const active = await page.locator('#inspector-active-count').innerText();
			if (after === 'Idle') throw new Error('작업 추가 후 배지가 갱신되지 않음: ' + after);
			if (active !== '1') throw new Error('active count가 1이 아님: ' + active);
		`,
	}),
);

test(
	'[E2E] Inspector 일시정지/재개 → 배지 텍스트와 pause/resume 버튼 활성 상태가 전환된다',
	{skip: _brixOutOfScope},
	async t => runInspectorE2e(t, {
		label: 'Inspector 일시정지/재개 → 배지 및 버튼 상태 전환',
		scriptText: `
			await page.locator('#inspector-pause').click();
			await page.waitForTimeout(100);
			const badge = await page.locator('#inspector-status-badge').innerText();
			if (badge !== 'Paused') throw new Error('일시정지 후 배지가 Paused가 아님: ' + badge);
			const pauseDisabled = await page.locator('#inspector-pause').isDisabled();
			const resumeDisabled = await page.locator('#inspector-resume').isDisabled();
			if (!pauseDisabled) throw new Error('paused 상태에서 pause 버튼이 비활성화되지 않음');
			if (resumeDisabled) throw new Error('paused 상태에서 resume 버튼이 활성화되지 않음');

			await page.locator('#inspector-resume').click();
			await page.waitForTimeout(100);
			const badgeAfter = await page.locator('#inspector-status-badge').innerText();
			if (badgeAfter === 'Paused') throw new Error('재개 후에도 배지가 Paused임');
			const resumeDisabledAfter = await page.locator('#inspector-resume').isDisabled();
			if (!resumeDisabledAfter) throw new Error('재개 후 resume 버튼이 비활성화되지 않음');
		`,
	}),
);

test(
	'[E2E] Inspector 큐 비우기 → pending count가 0이 되고 clear 버튼이 비활성화된다',
	{skip: _brixOutOfScope},
	async t => runInspectorE2e(t, {
		label: 'Inspector 큐 비우기 → pending 0 및 clear 버튼 비활성화',
		scriptText: `
			for (let i = 0; i < 5; i++) {
				await page.locator('#inspector-enqueue').click();
			}
			await page.waitForTimeout(200);
			const pendingBefore = await page.locator('#inspector-pending-count').innerText();
			if (pendingBefore === '0') throw new Error('clear 전 pending이 0임(대기 항목이 만들어지지 않음): ' + pendingBefore);
			const clearDisabledBefore = await page.locator('#inspector-clear').isDisabled();
			if (clearDisabledBefore) throw new Error('pending > 0인데 clear 버튼이 비활성화됨');

			await page.locator('#inspector-clear').click();
			await page.waitForTimeout(100);
			const pendingAfter = await page.locator('#inspector-pending-count').innerText();
			if (pendingAfter !== '0') throw new Error('clear 후 pending이 0이 아님: ' + pendingAfter);
			const clearDisabledAfter = await page.locator('#inspector-clear').isDisabled();
			if (!clearDisabledAfter) throw new Error('clear 후 clear 버튼이 비활성화되지 않음');
		`,
	}),
);
