// 동시성 프리셋 비교 데모 — 순수 리듀서 단위 테스트 (F68F701A7A-47)
//
// plan §11(line 205) AC: "상태 전이 리듀서가 DOM 없이 단위 테스트로
// waiting → running → complete 를 검증한다 (테스트 대상: test/demo-concurrency-presets.test.js)."
//
// main.js 는 `typeof document !== 'undefined'` 가드로 브라우저 코드를 감싸므로
// node 에서 import 해도 DOM 바인딩이 실행되지 않는다. 또한 p-limit 코어(../index.js)는
// 런타임 동적 import 이므로 이 테스트는 yocto-queue 설치 없이도 리듀서만 검증한다.
//
// 아래는 F68F701A7A-50(tester) 회귀 가드 추가분이다. 위 리듀서 단위 테스트는 dev(F68F701A7A-47)가
// 이미 작성했으므로 중복하지 않고, dev 가 정적으로 검증하지 못한 실 브라우저 렌더/클릭 인터랙션
// (§11: `/demo/concurrency-presets` 렌더 + idle→running→complete 상태 전이)만 e2e-runner 로 검증한다.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
	ITEM_STATE,
	PANEL_STATE,
	PRESET_CONCURRENCIES,
	FIXTURE,
	createItems,
	applyTransition,
	computePanelState,
	describeProgress,
} from '../demo/concurrency-presets/main.js';

test('상태 상수는 계약(§5) 값으로 동결되어 있다', () => {
	assert.deepEqual(ITEM_STATE, {WAITING: 'waiting', RUNNING: 'running', COMPLETE: 'complete'});
	assert.deepEqual(PANEL_STATE, {IDLE: 'idle', RUNNING: 'running', COMPLETE: 'complete'});
	assert.deepEqual(PRESET_CONCURRENCIES, [1, 2, 4]);
	assert.ok(Object.isFrozen(ITEM_STATE));
	assert.ok(Object.isFrozen(PANEL_STATE));
	assert.ok(Object.isFrozen(PRESET_CONCURRENCIES));
});

test('FIXTURE 는 결정론적(고정 항목·고정 지연)이며 동결되어 있다', () => {
	assert.equal(FIXTURE.length, 6);
	assert.ok(Object.isFrozen(FIXTURE));
	for (const item of FIXTURE) {
		assert.ok(Object.isFrozen(item));
		assert.equal(typeof item.id, 'string');
		assert.equal(typeof item.label, 'string');
		assert.equal(typeof item.delay, 'number');
	}
});

test('createItems: 기본 fixture 로부터 모든 항목을 waiting 으로 만든다', () => {
	const items = createItems();
	assert.equal(items.length, FIXTURE.length);
	assert.ok(items.every(item => item.state === ITEM_STATE.WAITING));
	assert.deepEqual(
		items.map(item => item.id),
		FIXTURE.map(item => item.id),
	);
	// id·label·delay 가 fixture 로부터 그대로 전달된다.
	assert.equal(items[0].label, FIXTURE[0].label);
	assert.equal(items[0].delay, FIXTURE[0].delay);
});

test('createItems: 원본 fixture 를 변경하지 않는다(불변)', () => {
	const custom = [{id: 'a', label: 'A', delay: 10}];
	const snapshot = JSON.stringify(custom);
	const items = createItems(custom);
	items[0].state = ITEM_STATE.COMPLETE; // 반환값 변경이 원본에 영향 없어야 한다.
	assert.equal(JSON.stringify(custom), snapshot);
	assert.equal(custom[0].state, undefined);
});

test('createItems: 빈 fixture 는 빈 목록을 반환한다', () => {
	assert.deepEqual(createItems([]), []);
});

test('applyTransition: 지정 항목만 새 상태로 전이하고 새 배열을 반환한다', () => {
	const items = createItems([
		{id: 'a', label: 'A', delay: 10},
		{id: 'b', label: 'B', delay: 20},
	]);
	const next = applyTransition(items, 'a', ITEM_STATE.RUNNING);

	// 새 배열·새 항목 객체(불변).
	assert.notEqual(next, items);
	assert.notEqual(next[0], items[0]);
	assert.equal(next[0].state, ITEM_STATE.RUNNING);
	// 매칭되지 않는 항목은 그대로.
	assert.equal(next[1].state, ITEM_STATE.WAITING);
	// 원본 배열은 변경되지 않는다.
	assert.equal(items[0].state, ITEM_STATE.WAITING);
});

test('applyTransition: 존재하지 않는 id 는 아무 항목도 바꾸지 않는다', () => {
	const items = createItems([{id: 'a', label: 'A', delay: 10}]);
	const next = applyTransition(items, 'nope', ITEM_STATE.COMPLETE);
	assert.deepEqual(
		next.map(item => item.state),
		items.map(item => item.state),
	);
});

test('applyTransition: waiting → running → complete 전이 시퀀스(§5.2 계약)', () => {
	let items = createItems([{id: 'a', label: 'A', delay: 10}]);
	assert.equal(items[0].state, ITEM_STATE.WAITING);

	items = applyTransition(items, 'a', ITEM_STATE.RUNNING);
	assert.equal(items[0].state, ITEM_STATE.RUNNING);

	items = applyTransition(items, 'a', ITEM_STATE.COMPLETE);
	assert.equal(items[0].state, ITEM_STATE.COMPLETE);
});

test('computePanelState: 모두 waiting 이면 idle(초기/초기화 직후)', () => {
	const presets = PRESET_CONCURRENCIES.map(() => createItems());
	assert.equal(computePanelState(presets), PANEL_STATE.IDLE);
});

test('computePanelState: 하나라도 running 이면 running', () => {
	const preset = applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.RUNNING);
	assert.equal(computePanelState([preset, createItems(), createItems()]), PANEL_STATE.RUNNING);
});

test('computePanelState: 일부만 complete 이고 나머지가 waiting 이면 running', () => {
	const preset = applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.COMPLETE);
	assert.equal(computePanelState([preset, createItems(), createItems()]), PANEL_STATE.RUNNING);
});

test('computePanelState: 모든 프리셋의 모든 항목이 complete 이면 complete', () => {
	const complete = () => FIXTURE.reduce(
		(items, item) => applyTransition(items, item.id, ITEM_STATE.COMPLETE),
		createItems(),
	);
	const presets = PRESET_CONCURRENCIES.map(() => complete());
	assert.equal(computePanelState(presets), PANEL_STATE.COMPLETE);
});

test('computePanelState: 빈 항목(fixture 0개)은 complete(§10 edge case)', () => {
	assert.equal(computePanelState([]), PANEL_STATE.COMPLETE);
	assert.equal(computePanelState([[], [], []]), PANEL_STATE.COMPLETE);
});

test('describeProgress: idle 상태는 준비 안내 문구', () => {
	assert.equal(
		describeProgress([], PANEL_STATE.IDLE),
		'실행 준비됨. 실행 버튼을 누르세요.',
	);
});

test('describeProgress: complete 상태는 완료 안내 문구', () => {
	assert.equal(
		describeProgress([], PANEL_STATE.COMPLETE),
		'모든 프리셋 실행이 완료되었습니다.',
	);
});

test('describeProgress: running 상태는 프리셋별 완료/실행/대기 개수를 요약한다', () => {
	const items = applyTransition(
		applyTransition(createItems(), FIXTURE[0].id, ITEM_STATE.COMPLETE),
		FIXTURE[1].id,
		ITEM_STATE.RUNNING,
	);
	const presets = [{concurrency: 1, items}];
	const summary = describeProgress(presets, PANEL_STATE.RUNNING);

	assert.ok(summary.startsWith('실행 중 —'));
	// 6개 중 1 complete, 1 running, 나머지 4 waiting.
	assert.ok(summary.includes('동시성 1: 완료 1, 실행 1, 대기 4'));
});

// ---------------------------------------------------------------------------
// 아래부터 tester(F68F701A7A-50) 회귀 가드: 실 브라우저 렌더 + 클릭 인터랙션.
// 위 리듀서 테스트는 순수 함수만 검증하므로, DOM 바인딩(bootstrap/render/run)이
// 실제로 idle → running → complete 를 화면에 반영하는지는 e2e-runner 로만 확인 가능하다.
// ---------------------------------------------------------------------------

// 확장자 → MIME 타입. `<script type="module">` 은 strict MIME 검사를 요구하므로
// .js 를 text/plain 등으로 응답하면 브라우저가 모듈 로드를 거부한다.
const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

// serveRoot(repo root) 아래의 정적 파일만 노출하는 self-contained 서버.
// listen(0) 으로 포트를 자동 할당해 병렬 tester 간 포트 충돌을 피한다(e2e-runner-ci-guard skill).
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
		fs.readFile(target, (err, buf) => {
			if (err) {
				res.writeHead(404).end('not found');
				return;
			}

			const contentType = MIME_TYPES[path.extname(target)] ?? 'application/octet-stream';
			res.writeHead(200, {'Content-Type': contentType}).end(buf);
		});
	});
	return new Promise(resolve => {
		server.listen(0, '0.0.0.0', () => resolve({server, port: server.address().port}));
	});
}

// e2e-runner 도달성 확인 — 못 닿으면 fail 이 아니라 skip (CI 결정성 가드).
async function checkE2eRunnerHealth() {
	try {
		const probe = await fetch('http://e2e-runner:3030/health', {signal: AbortSignal.timeout(2000)});
		return probe.ok;
	} catch {
		return false;
	}
}

async function callE2eRunner({url, label, scriptText, timeoutMs}) {
	const runId = process.env.BRIX_RUN_ID;
	const jiraKey = process.env.BRIX_JIRA_KEY;
	if (!runId || !jiraKey) {
		throw new Error('worker-injected run identity(BRIX_RUN_ID/BRIX_JIRA_KEY) missing');
	}

	const res = await fetch('http://e2e-runner:3030/run', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Brix-Run-Id': runId,
			'X-Brix-Jira-Key': jiraKey,
		},
		body: JSON.stringify({url, label, scriptText, timeoutMs}),
	});
	const body = await res.json();
	return body;
}

test('E2E — /demo/concurrency-presets 초기 렌더: idle 상태·마크업 계약', async t => {
	if (process.env.BRIX_E2E_SKIP === '1') {
		t.skip('BRIX_E2E_SKIP=1 — CI 결정성 가드');
		return;
	}

	const healthy = await checkE2eRunnerHealth();
	if (!healthy) {
		t.skip('e2e-runner 도달 불가 (CI 환경 정상)');
		return;
	}

	const {server, port} = await startStaticServer('.');
	t.after(() => server.close());

	const host = process.env.BRIX_PERSONA_HOST || 'worker';
	const url = `http://${host}:${port}/demo/concurrency-presets/`;

	const result = await callE2eRunner({
		url,
		label: '동시성 프리셋 초기 렌더 — idle 상태·마크업 계약',
		scriptText: `
			const state0 = await page.evaluate(() => document.getElementById('concurrency-presets-root')?.dataset.state);
			if (state0 !== 'idle') throw new Error('초기 root data-state 는 idle 이어야 함, got ' + state0);

			await page.getByRole('button', { name: '실행' }).waitFor({ state: 'visible' });
			await page.getByRole('button', { name: '초기화' }).waitFor({ state: 'visible' });

			const itemCount = await page.evaluate(() => document.querySelectorAll('#timeline-preset-1 .concurrency-presets__item').length);
			if (itemCount !== 6) throw new Error('preset-1 타임라인 항목 6개 기대, got ' + itemCount);

			const status = await page.evaluate(() => document.querySelector('.concurrency-presets__status')?.textContent);
			if (!status || !status.includes('실행 준비됨')) throw new Error('초기 상태 안내 문구 불일치: ' + status);
		`,
		timeoutMs: 20000,
	});

	assert.equal(result.ok, true, `e2e-runner 호출 실패: ${result.stdout ?? ''}`);
	assert.equal(result.passed, true, `초기 렌더 시나리오 실패: ${result.stdout ?? ''}`);
});

test('E2E — /demo/concurrency-presets 실행 클릭: idle→running→complete 상태 전이', async t => {
	if (process.env.BRIX_E2E_SKIP === '1') {
		t.skip('BRIX_E2E_SKIP=1 — CI 결정성 가드');
		return;
	}

	const healthy = await checkE2eRunnerHealth();
	if (!healthy) {
		t.skip('e2e-runner 도달 불가 (CI 환경 정상)');
		return;
	}

	const {server, port} = await startStaticServer('.');
	t.after(() => server.close());

	const host = process.env.BRIX_PERSONA_HOST || 'worker';
	const url = `http://${host}:${port}/demo/concurrency-presets/`;

	const result = await callE2eRunner({
		url,
		label: '동시성 프리셋 실행 클릭 — idle→running→complete 전이',
		scriptText: `
			await page.getByRole('button', { name: '실행' }).click();

			await page.waitForFunction(
				() => document.getElementById('concurrency-presets-root')?.dataset.state === 'running',
				null,
				{ timeout: 5000 },
			);
			const runningState = await page.evaluate(() => document.getElementById('concurrency-presets-root')?.dataset.state);
			if (runningState !== 'running') throw new Error('클릭 후 running 기대, got ' + runningState);

			await page.waitForFunction(
				() => document.getElementById('concurrency-presets-root')?.dataset.state === 'complete',
				null,
				{ timeout: 10000 },
			);
			const completeState = await page.evaluate(() => document.getElementById('concurrency-presets-root')?.dataset.state);
			if (completeState !== 'complete') throw new Error('실행 완료 후 complete 기대, got ' + completeState);

			const runDisabled = await page.evaluate(() => document.getElementById('preset-run')?.disabled);
			if (runDisabled) throw new Error('완료 후 실행 버튼이 다시 활성화되어야 함');

			const statusText = await page.evaluate(() => document.querySelector('.concurrency-presets__status')?.textContent);
			if (!statusText || !statusText.includes('완료')) throw new Error('완료 안내 문구 불일치: ' + statusText);
		`,
		timeoutMs: 20000,
	});

	assert.equal(result.ok, true, `e2e-runner 호출 실패: ${result.stdout ?? ''}`);
	assert.equal(result.passed, true, `실행 전이 시나리오 실패: ${result.stdout ?? ''}`);
});
