// Run against `npm run dev -- --host 127.0.0.1 --port 4173`.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
let playwright;
try { playwright = await import('playwright'); }
catch {
  const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!runtime) throw new Error('Install Playwright or select the Codex primary runtime');
  playwright = createRequire(`${runtime}/package.json`)('playwright');
}
const base = process.env.HUE_TEST_URL || 'http://127.0.0.1:4173';
const dev = process.env.HUE_TEST_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* Server starting. */ }
  if (i === 99) { dev?.kill(); throw new Error('Vite did not start'); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const reports = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await mkdir('.test-output/m1', { recursive: true });
try {
  await page.goto(base); await page.waitForSelector('html[data-state=ready]');
  const storeReport = await page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const { prepareCommit, hashText } = await import('/src/local-store/command.ts');
    const { Session } = await import('/src/app/session.ts');
    const { levels } = await import('/src/domain/levels.ts');
    const { fingerprintPayload } = await import('/src/domain/workspace.ts');
    const check = (value, message) => { if (!value) throw new Error(message); };
    const name = `m1-test-${crypto.randomUUID()}`, a = await openIndexedDb(name), b = await openIndexedDb(name);
    const fact = id => ({ id, destination: { kind: 'guest', vaultId: 'test' }, payloadJson: JSON.stringify({ id }) });
    const command = (id, revision, facts = [fact(id)]) => prepareCommit({ operationId: id, vaultId: 'test', expectedRevision: revision,
      nextSnapshotJson: JSON.stringify({ value: id }), facts });
    const first = await command('first', 0); await a.commit(first);
    check((await a.commit(first)).appliedRevision === 1, 'Idempotent receipt');
    let mismatch = false;
    try { await a.commit(await prepareCommit({ ...first, nextSnapshotJson: '{"value":"changed"}' })); } catch (e) { mismatch = e.code === 'OPERATION_MISMATCH'; }
    check(mismatch, 'Operation payload mismatch rejected');
    const commands = await Promise.all([command('race-a', 1), command('race-b', 1)]);
    const race = await Promise.allSettled([a.commit(commands[0]), b.commit(commands[1])]);
    check(race.filter(r => r.status === 'fulfilled').length === 1, 'Transactional CAS permits one writer');
    check((await a.load('test')).localRevision === 2 && (await a.listFacts('test')).length === 2, 'CAS authority');
    const before = await a.load('test'); let aborted = false;
    try { await a.commit(await command('abort', 2, [fact('fresh-fact'), fact('first')])); } catch { aborted = true; }
    check(aborted && JSON.stringify(await a.load('test')) === JSON.stringify(before), 'Snapshot rollback');
    check(await a.readOperation('test', 'abort') === null && (await a.listFacts('test')).length === 2, 'Ledger and all facts rollback');
    a.close(); b.close();
    const reopened = await openIndexedDb(name); check((await reopened.load('test')).localRevision === 2, 'Database reopen'); reopened.close();
    const fingerprints = new Map(await Promise.all(levels.map(async l => [l.id, await hashText(fingerprintPayload(l))])));
    const real = await openIndexedDb(`m1-session-${crypto.randomUUID()}`);
    let fault = 'none', committedId, readsFail = false;
    const faulty = { ...real,
      async commit(c) {
        committedId = c.operationId;
        if (fault === 'before') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        const receipt = await real.commit(c);
        if (fault === 'after-unreadable') readsFail = true;
        if (fault.startsWith('after')) throw new Error('Bridge response lost');
        return receipt;
      },
      async readOperation(v, id) { if (readsFail) throw new Error('Database unavailable'); return real.readOperation(v, id); },
    };
    const session = new Session(faulty, fingerprints); await session.load();
    fault = 'after'; await session.act({ kind: 'help', attemptId: session.state.attempts[levels[0].id].attemptId });
    check(session.state.attempts[levels[0].id].assistsUsed === 1 && session.revision === 2, 'Lost reply resolved from ledger');
    fault = 'after-unreadable'; let unresolved = false;
    try { await session.act({ kind: 'pin' }); } catch { unresolved = true; }
    const pendingId = session.pending.operationId;
    check(unresolved && session.revision === 2, 'Unknown result never acknowledged');
    readsFail = false; fault = 'none'; await session.resolvePending();
    check(session.revision === 3 && session.pending === null && pendingId === committedId, 'Same operation recovers without replay effects');
    fault = 'before'; let rejected = false;
    try { await session.act({ kind: 'swap', from: 1, to: 2, attemptId: session.state.attempts[levels[0].id].attemptId }); } catch { rejected = true; }
    const retryId = session.pending.operationId;
    check(rejected && session.state.attempts[levels[0].id].moves === 0 && session.revision === 3, 'Quota error keeps last authority');
    fault = 'none'; await session.resolvePending();
    check(committedId === retryId && session.revision === 4 && session.state.completed.length === 1, 'Retry identity and one completion');
    check((await real.listFacts('guest-local-v1')).length === 4, 'No duplicate facts'); real.close();
    return ['idempotence', 'payload mismatch', 'CAS with two connections', 'atomic rollback', 'reopen', 'lost bridge reply', 'unreadable ledger recovery', 'quota/retry identity'];
  });
  reports.push(...storeReport);
  const readState = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts'); const store = await openIndexedDb();
    const row = await store.load('guest-local-v1'); store.close(); return { ...JSON.parse(row.snapshotJson), revision: row.localRevision };
  });
  const center = async index => {
    const box = await page.locator('#board-region canvas').boundingBox();
    const state = await readState();
    const definitions = JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json', 'utf8')).levels;
    const level = definitions.find(l => l.id === state.activeLevelId);
    return { x: box.x + (index % level.width + .5) * box.width / level.width,
      y: box.y + 4 + (Math.floor(index / level.width) + .5) * (box.height - 8) / level.height };
  };
  const tap = async index => { const p = await center(index); await page.mouse.click(p.x, p.y); };
  const idle = () => page.waitForFunction(() => document.querySelector('#hue-app')?.dataset.busy === 'false');
  const before = await readState();
  await tap(0); await idle(); await tap(1); await tap(1); await idle();
  assert.equal((await readState()).attempts[before.activeLevelId].moves, 0); reports.push('pin and deselect no-op');
  await page.locator('#help').click(); await page.waitForSelector('#hue-app[data-layer=help]');
  const helped = await readState(); assert.equal(helped.attempts[helped.activeLevelId].assistsUsed, 1);
  await page.reload(); await page.waitForSelector('html[data-state=ready]');
  assert.equal(await page.locator('#hue-app').getAttribute('data-layer'), 'none');
  assert.equal((await readState()).attempts[helped.activeLevelId].assisted, true); reports.push('help durably recorded before preview, preview not restored');
  const source = await center(1), target = await center(2);
  await page.mouse.move(source.x, source.y); await page.mouse.down();
  await page.mouse.move(target.x, target.y); await page.mouse.up(); await idle();
  await page.waitForSelector('#hue-app[data-layer=result]');
  let state = await readState(); assert.equal(state.completed.length, 1); assert.equal(state.attempts[state.activeLevelId].moves, 1);
  const completedRevision = state.revision;
  await page.reload(); await page.waitForSelector('#hue-app[data-layer=result]');
  state = await readState(); assert.equal(state.revision, completedRevision); assert.equal(state.completed.length, 1);
  reports.push('real drag win and reload without duplicate reward');
  await page.getByRole('button', { name: 'Дальше', exact: true }).click(); await idle();
  assert.equal((await readState()).activeLevelId, 'gradient-002');
  await page.locator('#restart').click(); await page.getByRole('button', { name: 'Продолжить попытку' }).click();
  assert.equal((await readState()).activeLevelId, 'gradient-002'); reports.push('next and restart confirmation');
  // Real two-tab writes share IndexedDB. The losing action is discarded rather than rebased.
  const tab = await context.newPage(); await tab.goto(base); await tab.waitForSelector('html[data-state=ready]');
  const twoTab = await Promise.all([page, tab].map((p, i) => p.evaluate(async i => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts'); const { prepareCommit } = await import('/src/local-store/command.ts');
    const store = await openIndexedDb(); const old = await store.load('guest-local-v1');
    window.__race = { store, c: await prepareCommit({ operationId: `two-tab-${i}`, vaultId: 'guest-local-v1', expectedRevision: old.localRevision, nextSnapshotJson: old.snapshotJson, facts: [] }) };
    return old.localRevision;
  }, i)));
  assert.equal(twoTab[0], twoTab[1]);
  const outcomes = await Promise.all([page, tab].map(p => p.evaluate(async () => { try { await window.__race.store.commit(window.__race.c); return 'ok'; } catch (e) { return e.code; } finally { window.__race.store.close(); delete window.__race; } })));
  assert.deepEqual(outcomes.sort(), ['CONFLICT', 'ok']); await tab.close(); reports.push('actual two-tab CAS');
  await page.reload(); await page.waitForSelector('html[data-state=ready]');
  // Cancel paths use real pointer capture. No canceled gesture may reach storage.
  const unchanged = (await readState()).revision;
  let p1 = await center(1), p2 = await center(2);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y);
  await page.setViewportSize({ width: 400, height: 844 }); await page.mouse.up(); await idle();
  assert.equal((await readState()).revision, unchanged); reports.push('resize cancels captured drag');
  p1 = await center(1); p2 = await center(2);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y);
  await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
  await page.mouse.up(); await idle(); assert.equal((await readState()).revision, unchanged); reports.push('pointercancel rejects late release');
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await idle();
  assert.equal((await readState()).revision, unchanged); reports.push('background cancels captured drag');
  // A second pointer is ignored; its cancel must not cancel the first pointer.
  p1 = await center(1); p2 = await center(2);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down();
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, button: 0, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2 }));
  });
  await page.evaluate(p => document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: p.x, clientY: p.y })), p2);
  await page.mouse.up(); await idle();
  assert.equal((await readState()).attempts['gradient-002'].moves, 1); reports.push('final pointerup coordinates and ignored second pointer');
  const restart = async () => {
    await page.locator('#restart').click(); await page.getByRole('button', { name: 'Начать заново', exact: true }).click(); await idle();
  };
  await restart();
  const canvas = page.locator('#board-region canvas'); await canvas.focus();
  await canvas.press('ArrowRight'); await canvas.press('Enter'); await canvas.press('ArrowRight'); await canvas.press('Enter'); await idle();
  assert.equal((await readState()).attempts['gradient-002'].moves, 1); reports.push('keyboard swap');
  await restart();
  const fixtures = JSON.parse(await readFile('docs/spec/prototype/validation-0.1.json', 'utf8'));
  for (let ordinal = 2; ordinal <= 5; ordinal++) {
    const state = await readState(); const row = fixtures.rows.find(r => r.id === state.activeLevelId);
    for (const [from, to] of row.legal_optimal_witness) { await tap(from); await tap(to); await idle(); }
    const played = (await readState()).attempts[state.activeLevelId];
    assert(played.completed, JSON.stringify({ ordinal, levelId: state.activeLevelId, moves: played.moves, board: played.board }));
    await page.waitForSelector('#hue-app[data-layer=result]');
    if (ordinal === 5) await page.screenshot({ path: '.test-output/m1/win.png' });
    await page.getByRole('button', { name: 'Дальше', exact: true }).click(); await idle();
  }
  state = await readState(); assert.equal(state.completed.length, 5); assert.equal(state.rights.length, 5);
  reports.push('first five through actual UI, unique completions and rights');
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const r = document.querySelector('#board-region').getBoundingClientRect();
      return { width: r.width, height: r.height, overflow: document.documentElement.scrollWidth > innerWidth, bottom: document.querySelector('footer').getBoundingClientRect().bottom, viewport: innerHeight };
    });
    assert(layout.width > 250 && layout.height > 160 && !layout.overflow && layout.bottom <= layout.viewport + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-output/m1/gameplay.png' }); reports.push('320px, portrait and landscape layout');
  assert.deepEqual(errors, []);
  await writeFile('.test-output/m1/browser.json', JSON.stringify({ browser: 'Chromium', passed: reports, pageErrors: errors, limits: ['No physical Android', 'No hosted Yandex SDK', 'No production cloud/ads'] }, null, 2));
  console.log(`PASS: ${reports.length} browser scenarios; no page errors.`);
} finally { await context.close(); await browser.close(); dev?.kill(); }
