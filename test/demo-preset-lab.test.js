// F68F701A7A-74 — 프리셋 비교 UI 브라우저 회귀 검증
// 검증 대상: demo/index.html, demo/preset-lab.css, demo/preset-lab.js (F68F701A7A-71)
// 계약: docs/plans/implementation-plan.md §3~§5, §9 (frozen)
//
// 이 파일은 프로젝트의 기존 테스트 프레임워크인 AVA로 작성한다.
// (AVA v6 기본 파일 glob에 `test/**/*.js`가 포함되어 있어, node:test로 작성하면
//  `npm test`의 ava 실행이 이 파일을 함께 수집해 시그니처 불일치로 깨진다.)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {runPreset, PRESETS, STATUS} from '../demo/preset-lab.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Brix-flow-test-scope-guard — focused scope일 때 다른 module 시나리오 skip.
const _BRIX_MY_MODULE = 'demo-preset-lab';
const _brixOutOfScope = process.env.BRIX_TEST_SCOPE === 'focused' && Boolean(process.env.BRIX_TEST_MODULE) && process.env.BRIX_TEST_MODULE !== _BRIX_MY_MODULE;

function skipIfOutOfScope(t) {
	if (_brixOutOfScope) {
		t.pass(`out-of-scope skip (BRIX_TEST_MODULE=${process.env.BRIX_TEST_MODULE})`);
		return true;
	}

	return false;
}

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
};

// ServeRoot(레포 루트) 아래 정적 파일만 노출. demo/, node_modules/yocto-queue, index.js를
// 모두 같은 origin에서 서빙해야 demo/index.html의 importmap·상대 import가 그대로 동작한다.
function startStaticServer(serveRoot) {
	const root = path.resolve(serveRoot);
	const server = http.createServer(async (request, response) => {
		const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
		const resolved = path.resolve(root, `.${urlPath}`);
		if (resolved !== root && !resolved.startsWith(root + path.sep)) {
			response.writeHead(403).end('forbidden');
			return;
		}

		const target = urlPath.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
		try {
			const buffer = await fs.promises.readFile(target);
			const type = MIME_TYPES[path.extname(target)] || 'application/octet-stream';
			response.writeHead(200, {'Content-Type': type}).end(buffer);
		} catch {
			response.writeHead(404).end('not found');
		}
	});
	return new Promise(resolve => {
		// 0.0.0.0 바인딩 필수 — e2e-runner 컨테이너가 hostname으로 도달.
		server.listen(0, '0.0.0.0', () => resolve({server, port: server.address().port}));
	});
}

let _server;
let _port;

test.before(async () => {
	if (_brixOutOfScope) {
		return;
	}

	const started = await startStaticServer(REPO_ROOT);
	_server = started.server;
	_port = started.port;
});

test.after.always(() => {
	if (_server) {
		_server.close();
	}
});

// ---------------------------------------------------------------------------
// §9-1 — runPreset()은 DOM과 분리된 순수 오케스트레이션(개발자 주석 참고)이라
// 헤드리스로 concurrency(§3 frozen: 1/2/4)별 최대 동시 실행 수·완료 순서를 고정한다.
// 태스크 지연을 동일하게 주면(실제 UI도 TASK_DELAY_MS로 전 태스크 동일 지연) 완료 순서는
// 제출 순서(0..N-1)로 수렴한다 — concurrency=1은 알고리즘상 항상 그렇고,
// concurrency=2/4는 동일 지연 tie-break(Node 타이머는 동일 지연에 대해 FIFO)로 보장된다.
// ---------------------------------------------------------------------------

async function measurePreset(concurrency) {
	const batchSize = 8;
	const order = [];
	const result = await runPreset({
		concurrency,
		batchSize,
		makeTask: index => new Promise(resolve => {
			setTimeout(() => resolve(index), 5);
		}),
		onTaskComplete({index}) {
			order.push(index);
		},
	});
	return {maxActive: result.maxActive, order};
}

// ---------------------------------------------------------------------------
// §9-3,4,5,6 — 실 브라우저 E2E: 정적 가드로 검증 불가능한 인터랙션
// (클릭/키보드/상태 전이/실시간 카운터)을 e2e-runner로 검증한다.
// ---------------------------------------------------------------------------

async function runBrowserScenario(t, {label, scriptText, timeoutMs = 15_000}) {
	if (skipIfOutOfScope(t)) {
		return;
	}

	// 1. 명시적 CI 결정성 가드 — 페르소나가 직접 이 env를 set하지 않는다(worker 실행 시 의무 호출).
	if (process.env.BRIX_E2E_SKIP === '1') {
		t.pass('BRIX_E2E_SKIP=1 — CI 결정성 가드');
		return;
	}

	// 2. e2e-runner 도달성 사전 확인 — 못 닿으면 skip(=pass), fail 아님(CI에는 컨테이너 없음이 정상).
	let reachable = true;
	try {
		const probe = await fetch('http://e2e-runner:3030/health', {signal: AbortSignal.timeout(2000)});
		reachable = probe.ok;
	} catch {
		reachable = false;
	}

	if (!reachable) {
		t.pass('e2e-runner 도달 불가 — CI 환경 정상(skip)');
		return;
	}

	// 3. worker 주입 식별자는 읽기 전용 — 도달 가능한데 없으면 환경 결함이므로 명확히 실패시킨다.
	const runId = process.env.BRIX_RUN_ID;
	const jiraKey = process.env.BRIX_JIRA_KEY;
	if (!runId || !jiraKey) {
		throw new Error('worker-injected run identity(BRIX_RUN_ID/BRIX_JIRA_KEY)가 없습니다');
	}

	const host = process.env.BRIX_PERSONA_HOST || 'worker';
	const url = `http://${host}:${_port}/demo/`;

	const response = await fetch('http://e2e-runner:3030/run', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Brix-Run-Id': runId,
			'X-Brix-Jira-Key': jiraKey,
		},
		body: JSON.stringify({
			url, label, scriptText, timeoutMs,
		}),
		signal: AbortSignal.timeout(timeoutMs + 10_000),
	});
	const json = await response.json();
	t.true(response.ok && json.passed === true, `e2e 실패(${label}): ${json.stdout || json.error || 'unknown'}`);
}

test('AC1 — 느림(concurrency=1) 최대 동시 실행 수=1·완료 순서 고정', async t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	const {maxActive, order} = await measurePreset(PRESETS.slow.concurrency);
	t.is(maxActive, 1);
	t.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('AC1 — 균형(concurrency=2) 최대 동시 실행 수=2·완료 순서 고정', async t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	const {maxActive, order} = await measurePreset(PRESETS.balanced.concurrency);
	t.is(maxActive, 2);
	t.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('AC1 — 빠름(concurrency=4) 최대 동시 실행 수=4·완료 순서 고정', async t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	const {maxActive, order} = await measurePreset(PRESETS.fast.concurrency);
	t.is(maxActive, 4);
	t.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('§3 — 프리셋 값 1/2/4 고정 (frozen invariant)', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	t.is(PRESETS.slow.concurrency, 1);
	t.is(PRESETS.balanced.concurrency, 2);
	t.is(PRESETS.fast.concurrency, 4);
});

test('§5.3 — 상태 모델 4개(idle/running/complete/error)가 화면 텍스트를 노출', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	for (const key of ['idle', 'running', 'complete', 'error']) {
		t.truthy(STATUS[key] && STATUS[key].name, `STATUS.${key}.name 누락`);
	}
});

// ---------------------------------------------------------------------------
// §9-1,2,7 — 정적 가드: HTML id / CSS class / design token / 접근성 속성 존재.
// 위치·라인 의존 없이 존재 여부만 검증(다른 Epic이 같은 섹션에 라인을 추가해도 안전).
// ---------------------------------------------------------------------------

const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'demo/index.html'), 'utf8');
const presetCss = fs.readFileSync(path.join(REPO_ROOT, 'demo/preset-lab.css'), 'utf8');

test('§5.1 — DOM ID 9개 존재 (frozen selector)', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	for (const id of [
		'preset-lab',
		'preset-slow',
		'preset-balanced',
		'preset-fast',
		'preset-run',
		'active-count',
		'pending-count',
		'result-table',
		'status-message',
	]) {
		t.true(indexHtml.includes(`id="${id}"`), `#${id} 누락`);
	}
});

test('§5.2 — CSS class 존재 (BEM, frozen)', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	for (const cls of [
		'preset-lab',
		'preset-lab__controls',
		'preset-lab__preset',
		'preset-lab__preset--active',
		'preset-lab__run',
		'preset-lab__metrics',
		'preset-lab__result',
	]) {
		t.true(indexHtml.includes(cls) || presetCss.includes(cls), `.${cls} 누락`);
	}
});

test('§5.4 — design token 5개 존재 (frozen 이름)', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	for (const token of [
		'--color-preset-active',
		'--color-preset-idle',
		'--color-metric-value',
		'--space-preset-gap',
		'--font-metric-size',
	]) {
		t.true(presetCss.includes(token), `${token} 누락`);
	}
});

test('§5.5 — 접근성 속성 존재 (aria-live·aria-label·aria-pressed)', t => {
	if (skipIfOutOfScope(t)) {
		return;
	}

	t.true(
		indexHtml.includes('aria-label="선택한 프리셋으로 동시성 데모 실행"'),
		'#preset-run aria-label 누락',
	);
	for (const id of ['active-count', 'pending-count', 'status-message']) {
		const hasAriaLive = new RegExp(`id="${id}"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="${id}"`).test(indexHtml);
		t.true(hasAriaLive, `#${id} aria-live 누락`);
	}

	t.true(indexHtml.includes('aria-pressed="false"'), '프리셋 control 초기 aria-pressed 누락');
});

test('AC2 — 느림(1) 프리셋 실행: running/complete 상태 텍스트·카운터·재사용 가능', async t => {
	await runBrowserScenario(t, {
		label: '느림(1) 프리셋 실행 — running/complete 상태·카운터·재사용',
		scriptText: `
			await page.locator('#preset-slow').click();
			const pressed = await page.locator('#preset-slow').getAttribute('aria-pressed');
			if (pressed !== 'true') throw new Error('aria-pressed 전이 실패: ' + pressed);

			await page.locator('#preset-run').click();
			await page.waitForFunction(
				() => document.getElementById('status-message').dataset.state === 'running',
				undefined,
				{timeout: 3000},
			);
			const runningText = await page.evaluate(() => document.getElementById('status-message').textContent);
			if (!runningText.includes('실행 중')) throw new Error('running 상태 텍스트 누락: ' + runningText);

			await page.waitForFunction(
				() => document.getElementById('status-message').dataset.state === 'complete',
				undefined,
				{timeout: 10000},
			);
			const active = await page.evaluate(() => document.getElementById('active-count').textContent);
			const pending = await page.evaluate(() => document.getElementById('pending-count').textContent);
			if (active !== '0' || pending !== '0') {
				throw new Error('완료 후 카운터 미초기화: active=' + active + ' pending=' + pending);
			}

			const completeText = await page.evaluate(() => document.getElementById('status-message').textContent);
			if (!completeText.includes('완료')) throw new Error('complete 상태 텍스트 누락: ' + completeText);

			const rows = await page.evaluate(() => document.querySelectorAll('#result-table tbody tr').length);
			if (rows !== 8) throw new Error('결과 표 행 수 불일치(기대 8): ' + rows);

			const runDisabled = await page.evaluate(() => document.getElementById('preset-run').disabled);
			if (runDisabled) throw new Error('complete 후 실행 control 재사용 불가');
		`,
	});
});

test('AC2 — 빠름(4) 프리셋 실행: activeCount 최대 4·pendingCount 관찰', async t => {
	await runBrowserScenario(t, {
		label: '빠름(4) 프리셋 실행 — activeCount 최대치·pendingCount 관찰',
		scriptText: `
			await page.locator('#preset-fast').click();
			await page.locator('#preset-run').click();

			let maxActive = 0;
			let sawPending = false;
			const deadline = Date.now() + 4000;
			while (Date.now() < deadline) {
				const active = Number(await page.evaluate(() => document.getElementById('active-count').textContent));
				const pending = Number(await page.evaluate(() => document.getElementById('pending-count').textContent));
				if (active > maxActive) maxActive = active;
				if (pending > 0) sawPending = true;
				const state = await page.evaluate(() => document.getElementById('status-message').dataset.state);
				if (state === 'complete') break;
				await new Promise(resolve => setTimeout(resolve, 30));
			}

			if (maxActive !== 4) throw new Error('최대 activeCount 불일치(기대 4): ' + maxActive);
			if (!sawPending) throw new Error('pendingCount가 관찰되지 않음(배치8·동시4에서 대기 발생 기대)');

			await page.waitForFunction(
				() => document.getElementById('status-message').dataset.state === 'complete',
				undefined,
				{timeout: 8000},
			);
		`,
	});
});

test('AC2/AC3 — 키보드 Tab/Enter 프리셋 선택·실행 + idle 초기 카운터·재사용 확인', async t => {
	await runBrowserScenario(t, {
		label: '키보드 Tab/Enter 인터랙션 — idle 초기값·aria-pressed·재사용',
		scriptText: `
			const initialActive = await page.evaluate(() => document.getElementById('active-count').textContent);
			const initialPending = await page.evaluate(() => document.getElementById('pending-count').textContent);
			if (initialActive !== '0' || initialPending !== '0') {
				throw new Error('idle 초기 카운터 불일치: ' + initialActive + '/' + initialPending);
			}

			const initialState = await page.evaluate(() => document.getElementById('status-message').dataset.state);
			if (initialState !== 'idle') throw new Error('idle 초기 상태 불일치: ' + initialState);

			await page.locator('#preset-balanced').focus();
			await page.keyboard.press('Enter');
			const pressed = await page.locator('#preset-balanced').getAttribute('aria-pressed');
			if (pressed !== 'true') throw new Error('키보드 Enter로 aria-pressed 전이 실패: ' + pressed);

			await page.locator('#preset-run').focus();
			await page.keyboard.press('Enter');
			await page.waitForFunction(
				() => document.getElementById('status-message').dataset.state === 'complete',
				undefined,
				{timeout: 10000},
			);

			const runDisabledAfter = await page.evaluate(() => document.getElementById('preset-run').disabled);
			if (runDisabledAfter) throw new Error('완료 후 실행 control이 비활성 상태로 남아 재사용 불가');
		`,
	});
});
