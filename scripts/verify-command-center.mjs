import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.CC_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Fixtures require a local server.');
const evidence = process.env.CC_EVIDENCE_DIR || '/tmp/cc-hardening-evidence';
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CC_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const errors = [], results = [];
const state = (station, mode = 'coding', suffix = '') => ({ success: true, fetchedAt: new Date().toISOString(), workflows: station ? [{
  agent: 'spawncamper9000', workflow: 'ai-news', workflowLabel: 'AI News', eventId: `fixture-${station}-${mode}-${suffix}`,
  state: mode, activity: `Inspect ${station}`, timestamp: new Date().toISOString(),
  startedAt: '2026-09-05T00:00:00Z', ttlSeconds: 900, context: { station }
}] : [], recentHistory: [] });
let fixture = state(null), offline = false;
async function pageFor({ failedAssets = [], ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'warning' && /not supported/.test(message.text())) errors.push(message.text()); });
  for (const asset of failedAssets) await page.route(`**/${asset}`, route => route.abort());
  await page.route('**/api/command-center/state*', route => offline
    ? route.fulfill({ status: 503, json: { success: false } }) : route.fulfill({ json: fixture }));
  // Instrument only the intercepted local script response; no production hook.
  await page.route('**/command-center.js*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('  client.start();', '  window.__ccTest = { game, client };\n  client.start();').replace('onStatus({ status: networkStatus, error, lastGoodState }) {', 'onStatus({ status: networkStatus, error, lastGoodState }) { window.__lastTelemetryError = error?.message;');
    await route.fulfill({ response, body });
  });
  await page.goto(`${origin}/command-center`);
  await page.waitForFunction(() => window.__ccTest?.game.scene.scenes[0]?.locomotion && document.querySelector('canvas')?.clientWidth > 0);
  return page;
}
const get = page => page.evaluate(() => {
  const s = window.__ccTest.game.scene.scenes[0], c = document.querySelector('canvas').getBoundingClientRect();
  return { position: { x: s.camperRig.x, y: s.camperRig.y }, move: s.locomotion.state,
    animation: s.camperBody.anims.currentAnim?.key, attendance: s.camperStationZoneId,
    fetchedAt: s.latestState?.fetchedAt, error: window.__lastTelemetryError, primary: s.latestState?.primaryWorkflow?.areaId, health: document.querySelector('#cc-status-copy').textContent,
    canvas: { width: c.width, height: c.height }, logical: { width: s.scale.width, height: s.scale.height },
    machines: [...s.propArtByZone].map(([id, entries]) => [id, entries.some(({ object }) => object.anims.isPlaying)]) };
});
const refresh = async (page, next) => { fixture = next; await page.evaluate(() => window.__ccTest.client.refresh());
  if (next.workflows[0] && (await get(page)).primary !== next.workflows[0].context.station) console.log('REFRESH MISMATCH', next, await get(page));
};
const settle = page => page.waitForFunction(() => !window.__ccTest.game.scene.scenes[0].locomotion.state.moving, {}, { timeout: 15000 });
const aspect = (at, label) => assert.ok(Math.abs(at.canvas.width / at.canvas.height - at.logical.width / at.logical.height) < .002, label);
try {
  const page = await pageFor();
  const areas = await page.evaluate(async () => (await import('/src/command-center/sceneConfig.mjs')).COMMAND_CENTER_AREAS);
  await refresh(page, state('scanner-bench')); await page.waitForTimeout(100);
  let at = await get(page); assert.match(at.animation, /camper_walk_/); assert.equal(at.attendance, '');
  const generation = at.move.generation;
  await refresh(page, state('scanner-bench', 'coding', 'heartbeat'));
  assert.equal((await get(page)).move.generation, generation);
  await settle(page); at = await get(page);
  assert.equal(at.animation, 'camper_operate_back'); assert.equal(at.attendance, 'scanner-bench');
  assert.ok(at.machines.find(([id]) => id === 'scanner-bench')[1]);
  results.push('rendered walking arrival and duplicate heartbeat');
  for (const mode of ['waiting', 'complete', 'warning', 'error']) {
    await refresh(page, state('scanner-bench', mode)); at = await get(page);
    assert.equal(at.animation, 'camper_idle'); assert.ok(at.machines.every(([, playing]) => !playing)); assert.equal(at.attendance, '');
  }
  results.push('waiting, completion, warning and error release operation');
  for (const area of areas) {
    await refresh(page, state(area.id)); await page.waitForTimeout(100);
    await page.locator('#cc-frame').screenshot({ path: `${evidence}/approach-${area.id}.png` });
    await settle(page); at = await get(page);
    console.log(area.id, JSON.stringify({ position: at.position, destination: at.move.destination, failed: at.move.failed }));
    assert.deepEqual(at.position, area.destination); assert.equal(at.animation, 'camper_operate_back');
    await page.locator('#cc-frame').screenshot({ path: `${evidence}/station-${area.id}.png` });
    const point = await page.evaluate(id => {
      const s = window.__ccTest.game.scene.scenes[0], a = s.zoneObjects.get(id).area.bounds, c = s.game.canvas.getBoundingClientRect();
      return { x: c.left + (a.x + a.width * .3 - s.cameras.main.scrollX) * c.width / s.scale.width,
        y: c.top + (a.y + a.height * .25 - s.cameras.main.scrollY) * c.height / s.scale.height };
    }, area.id);
    await page.mouse.click(point.x, point.y); await page.waitForTimeout(30);
    assert.equal(await page.locator('#cc-hud').isVisible(), true, `inspection ${area.id}`);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#cc-hud').isVisible(), false);
  }
  results.push('all 13 stations: rendered endpoint, animation, hit target, screenshot');
  await page.evaluate(() => window.__ccTest.game.scene.scenes[0].inspectArea('scanner-bench'));
  const floor = await page.evaluate(() => {
    const s = window.__ccTest.game.scene.scenes[0], r = s.game.canvas.getBoundingClientRect();
    return { x: r.left + 420 * r.width / s.scale.width, y: r.top + 490 * r.height / s.scale.height };
  });
  await page.mouse.click(floor.x, floor.y); assert.equal(await page.locator('#cc-hud').isVisible(), false);
  results.push('empty floor and Escape dismiss inspection');
  for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[3440,1440],[850,900],[390,844]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(180);
    aspect(await get(page), `${width}x${height}`);
    await page.locator('#cc-frame').screenshot({ path: `${evidence}/viewport-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 850, height: 900 }); await page.waitForTimeout(150);
  await refresh(page, state('github-code')); const before = await get(page);
  await page.locator('#cc-fullscreen').click(); await page.waitForTimeout(150); at = await get(page);
  assert.equal(await page.evaluate(() => document.fullscreenElement?.id), 'cc-world');
  assert.equal(at.move.generation, before.move.generation); aspect(at, 'native fullscreen');
  await page.screenshot({ path: `${evidence}/fullscreen.png` });
  await page.evaluate(() => document.exitFullscreen()); await settle(page);
  await page.evaluate(() => document.documentElement.style.zoom = '1.25'); await page.waitForTimeout(180);
  aspect(await get(page), '125% CSS zoom'); await page.evaluate(() => document.documentElement.style.zoom = '');
  results.push('viewport matrix, 125% CSS zoom and native fullscreen during travel');
  await refresh(page, state('scanner-bench', 'warning')); await settle(page);
  const pulse = await page.evaluate(() => {
    const s = window.__ccTest.game.scene.scenes[0], o = s.zoneObjects.get('scanner-bench');
    window.__pulse = s.tweens.getTweensOf(o.glow)[0]; return [o.glow.scaleX, o.glowBase.x];
  });
  assert.ok(pulse[0] >= pulse[1] * .99 && pulse[0] <= pulse[1] * 1.07);
  await refresh(page, state('scanner-bench', 'warning', 'heartbeat'));
  assert.equal(await page.evaluate(() => {
    const s = window.__ccTest.game.scene.scenes[0];
    return window.__pulse === s.tweens.getTweensOf(s.zoneObjects.get('scanner-bench').glow)[0];
  }), true);
  offline = true; await page.evaluate(() => window.__ccTest.client.refresh());
  assert.equal(await page.locator('#cc-status').textContent(), 'Offline'); offline = false;
  results.push('effect phase and connection health');
  const soak = await page.evaluate(async () => {
    const s = window.__ccTest.game.scene.scenes[0], { normalizePublicState } = await import('/src/command-center/stateModel.mjs');
    window.__ccTest.client.stop();
    const counts = () => ({ objects: s.children.length, tweens: s.tweens.getTweens().length,
      timers: s.time._active.length + s.time._pendingInsertion.length, listeners: s.scale.listenerCount('resize') });
    const getDelta = s.tweens.getDelta; s.tweens.getDelta = () => 2000;
    const run = () => { for (let i = 0; i < 300; i++) {
      const mode = ['coding','waiting','complete','warning','error'][i % 5], station = [...s.zoneObjects.keys()][i % 13];
      s.updatePublicState(normalizePublicState({ success: true, fetchedAt: new Date().toISOString(), workflows: [{
        agent: 'spawncamper9000', workflow: 'fixture', state: mode, activity: 'Soak', eventId: `${Date.now()}-${i}`,
        timestamp: new Date().toISOString(), ttlSeconds: 900, context: { station }
      }], recentHistory: [] }));
      s.update(s.time.now, 20000); s.time.preUpdate(); s.time.update(s.time.now + 2000, 2000);
      s.tweens.tick();
    } };
    run(); const first = counts(); run(); const last = counts(); s.tweens.getDelta = getDelta;
    return { first, last, acknowledgements: s.completeKeys.size };
  });
  assert.ok(soak.last.objects <= soak.first.objects + 15, JSON.stringify(soak));
  assert.ok(soak.last.tweens <= soak.first.tweens + 15, JSON.stringify(soak));
  assert.equal(soak.first.listeners, soak.last.listeners); assert.ok(soak.acknowledgements <= 128);
  results.push({ soak }); console.log('SOAK', JSON.stringify(soak));
  await page.evaluate(() => {
    window.__savedGame = window.__ccTest.game;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  assert.equal(await page.evaluate(() => window.__savedGame === window.__ccTest.game && document.querySelectorAll('#cc-canvas canvas').length === 1), true);
  results.push('persisted pagehide/pageshow restore one game');
  fixture = state('agent-lab');
  const reduced = await pageFor({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await refresh(reduced, state('github-code')); at = await get(reduced);
  assert.deepEqual(at.position, { x: 132, y: 468 }); assert.equal(at.move.moving, false);
  assert.ok(at.machines.every(([, playing]) => !playing)); results.push('reduced motion restoration and relocation');
  fixture = state('scanner-bench');
  const fallback = await pageFor({ failedAssets: ['spawncamper_walk_left_sheet.png', 'anim_tool_scanner_sheet.png'] });
  await refresh(fallback, state('github-code')); await settle(fallback);
  assert.equal((await get(fallback)).animation, 'camper_operate_back');
  assert.equal(await fallback.evaluate(() => window.__ccTest.game.scene.scenes[0].fallbackGroups.has('scanner-bench')), true);
  results.push('individual character and machine texture failure fallbacks');
  await reduced.goto('about:blank'); await reduced.goBack();
  await reduced.waitForFunction(() => window.__ccTest?.game.scene.scenes[0]?.locomotion);
  assert.equal(await reduced.locator('#cc-canvas canvas').count(), 1);
  results.push('native back navigation restores one functioning canvas');
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${evidence}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors, evidence }, null, 2));
} finally { await browser.close(); }
