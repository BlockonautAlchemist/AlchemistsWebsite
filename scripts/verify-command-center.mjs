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
  runId: `run-${station}`, taskTitle: `Inspect ${station}`, state: mode, activity: `Inspect ${station}`, timestamp: new Date().toISOString(),
  startedAt: '2026-09-05T00:00:00Z', ttlSeconds: 900, context: { station }, outcome: mode === 'complete' ? 'Inspection complete' : null
}] : [], recentHistory: [] });
let fixture = state(null), offline = false, newsletterMode = 'success', releaseNewsletter = null;
const newsletterRequests = [];
const runFixture = (index, taskState = index % 3 === 0 ? 'failed' : 'completed') => {
  const timestamp = new Date(Date.now() - index * 60000).toISOString();
  return { id: `history-${index}`, runId: `history-run-${index}`, agent: 'spawncamper9000',
    workflow: index % 2 ? 'github' : 'ai-news', workflowLabel: index % 2 ? 'GitHub' : 'AI News',
    taskTitle: `Public task ${index}`, outcome: taskState === 'completed' ? `Finding ${index}` : null,
    state: taskState === 'failed' ? 'error' : 'complete', taskState, startedAt: timestamp, updatedAt: timestamp,
    publicUrl: index === 1 ? 'https://example.com/public-result' : null, totalEventCount: index === 2 ? 3 : 1,
    omittedEventCount: 0, events: [{ id: `history-event-${index}`, eventId: `history-event-${index}`,
      state: taskState === 'failed' ? 'error' : 'complete', activity: `Event ${index}`, timestamp,
      lastTimestamp: timestamp, occurrenceCount: index === 2 ? 3 : 1, context: {} }] };
};
const allRuns = Array.from({ length: 9 }, (_, index) => runFixture(index));
async function pageFor({ failedAssets = [], historyMode = 'normal', ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'warning' && /not supported/.test(message.text())) errors.push(message.text()); });
  for (const asset of failedAssets) await page.route(`**/${asset}`, route => route.abort());
  await page.route('**/api/command-center/state*', route => offline
    ? route.fulfill({ status: 503, json: { success: false } }) : route.fulfill({ json: fixture }));
  await page.route('**/api/command-center/history*', async route => {
    const earlier = new URL(route.request().url()).searchParams.has('cursor');
    if (historyMode === 'loading') await new Promise(resolve => setTimeout(resolve, 3000));
    if (historyMode === 'error' || (historyMode === 'pagination-error' && earlier)) return route.fulfill({ status: 503, json: { success: false } });
    if (historyMode === 'empty') return route.fulfill({ json: { success: true, fetchedAt: new Date().toISOString(), runs: [], nextCursor: null } });
    return route.fulfill({ json: { success: true, fetchedAt: new Date().toISOString(),
      runs: earlier ? allRuns.slice(8) : allRuns.slice(0, 8), nextCursor: earlier ? null : 'fixture-cursor' } });
  });
  await page.route('**/api/newsletter/subscribe', async route => {
    newsletterRequests.push(route.request().postDataJSON());
    if (newsletterMode === 'loading') await new Promise(resolve => { releaseNewsletter = resolve; });
    if (newsletterMode === 'error') {
      await route.fulfill({ status: 503, json: {
        ok: false,
        error: 'Newsletter signup is temporarily unavailable.',
        fallbackUrl: 'https://spawncamper9000.beehiiv.com/?modal=signup'
      } });
      return;
    }
    await route.fulfill({ json: { ok: true, status: 'subscribed' } });
  });
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
  const crt = s.componentObjects.get('anim_ops_screens');
  return { position: { x: s.camperRig.x, y: s.camperRig.y }, move: s.locomotion.state,
    animation: s.camperBody.anims.currentAnim?.key, attendance: s.camperStationZoneId,
    fetchedAt: s.latestState?.fetchedAt, error: window.__lastTelemetryError, primary: s.latestState?.primaryWorkflow?.areaId,
    crt: { target: s.opsReadoutTarget, visible: s.opsReadoutVisible, typing: Boolean(s.opsTypingEvent),
      cursorTimer: Boolean(s.opsCursorEvent), masked: crt?.parts?.lines?.style?.fixedWidth === crt?.spec?.w - 12 },
    feed: [...document.querySelectorAll('#cc-activity-feed li span')].map((node) => node.textContent),
    canvas: { width: c.width, height: c.height }, logical: { width: s.scale.width, height: s.scale.height },
    machines: [...s.propArtByZone].map(([id, entries]) => [id, entries.some(({ object }) => object.anims.isPlaying)]) };
});
const refresh = async (page, next) => {
  const currentTime = Date.parse((await get(page)).fetchedAt) || 0;
  if (Date.parse(next.fetchedAt) <= currentTime) next.fetchedAt = new Date(currentTime + 1).toISOString();
  fixture = next; await page.evaluate(() => window.__ccTest.client.refresh());
  if (next.workflows[0] && (await get(page)).primary !== next.workflows[0].context.station) console.log('REFRESH MISMATCH', next, await get(page));
};
const settle = page => page.waitForFunction(() => !window.__ccTest.game.scene.scenes[0].locomotion.state.moving, {}, { timeout: 15000 });
const aspect = (at, label) => assert.ok(Math.abs(at.canvas.width / at.canvas.height - at.logical.width / at.logical.height) < .002, label);
try {
  const page = await pageFor();
  await page.waitForFunction(() => document.querySelectorAll('#cc-recent-list > li').length === 8);
  const areas = await page.evaluate(async () => (await import('/src/command-center/sceneConfig.mjs')).COMMAND_CENTER_AREAS);
  await refresh(page, state('scanner-bench')); await page.waitForTimeout(100);
  let at = await get(page); assert.match(at.animation, /camper_walk_/); assert.equal(at.attendance, '');
  const generation = at.move.generation;
  await page.waitForFunction(() => {
    const scene = window.__ccTest.game.scene.scenes[0];
    return scene.opsReadoutVisible === scene.opsReadoutTarget && !scene.opsTypingEvent;
  });
  const beforeHeartbeat = await get(page);
  await refresh(page, state('scanner-bench', 'coding', 'heartbeat'));
  assert.equal((await get(page)).move.generation, generation);
  const afterHeartbeat = await get(page);
  assert.equal(afterHeartbeat.crt.target, beforeHeartbeat.crt.target);
  assert.equal(afterHeartbeat.crt.visible, beforeHeartbeat.crt.visible);
  assert.equal(afterHeartbeat.crt.typing, false);
  assert.equal(afterHeartbeat.crt.masked, true);
  assert.equal(await page.locator('#cc-crt').count(), 0);
  await settle(page); at = await get(page);
  assert.equal(at.animation, 'camper_operate_back'); assert.equal(at.attendance, 'scanner-bench');
  assert.ok(at.machines.find(([id]) => id === 'scanner-bench')[1]);
  results.push('rendered walking arrival, masked Phaser CRT and duplicate heartbeat');

  const liveFeedFixture = state('opportunity-radar', 'researching', 'live-feed');
  const liveWorkflow = liveFeedFixture.workflows[0];
  liveWorkflow.workflow = 'opportunity-scout';
  liveWorkflow.workflowLabel = 'AI Opportunity Scout';
  liveWorkflow.taskTitle = 'AI Opportunity Scout';
  const activities = [
    'Starting AI Opportunity Scout',
    'Loading the scout brief',
    'Searching: AI game development tools new release 2026 September',
    'Searching: AI game development tools new release 2026 September',
    'Searching: autonomous NPC AI persistent memory games 2026',
    'Searching: GitHub trending game AI-assisted coding',
    'Opening public source pages',
    'Reading github.com'
  ];
  liveFeedFixture.recentHistory = activities.map((activity, index) => ({
    ...liveWorkflow,
    eventId: `live-feed-${index}`,
    activity,
    timestamp: new Date(Date.now() - (activities.length - index) * 1000).toISOString()
  }));
  Object.assign(liveWorkflow, liveFeedFixture.recentHistory.at(-1));
  await refresh(page, liveFeedFixture);
  await page.waitForFunction(() => document.querySelectorAll('#cc-activity-feed li').length === 6);
  assert.equal(await page.locator('#cc-feed-workflow').textContent(), 'AI OPPORTUNITY SCOUT');
  assert.equal(await page.locator('#cc-feed-state').textContent(), 'RESEARCHING');
  const feed = (await get(page)).feed;
  assert.equal(feed[0], 'Loading the scout brief');
  assert.equal(feed.at(-1), 'Reading github.com');
  assert.equal(feed.filter((activity) => activity.startsWith('Searching: AI game development')).length, 1);
  await page.screenshot({ path: `${evidence}/live-activity-feed.png`, fullPage: false });
  await page.waitForFunction(() => {
    const scene = window.__ccTest.game.scene.scenes[0];
    return scene.opsReadoutVisible === scene.opsReadoutTarget && !scene.opsTypingEvent;
  });
  await page.locator('#cc-frame').screenshot({ path: `${evidence}/live-activity-crt.png` });
  results.push('live current-run activity feed, six-event rollup and heartbeat compaction');
  await refresh(page, state('scanner-bench'));
  await settle(page);
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
  await page.mouse.click(floor.x, floor.y); assert.equal(await page.locator('#cc-hud').isVisible(), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#cc-hud').isVisible(), false);
  results.push('empty floor preserves inspection; Escape dismisses');

  const machineButton = page.locator('[data-machine-id="tool-scanner"]');
  await machineButton.focus();
  assert.equal(await machineButton.getAttribute('data-highlighted'), 'true');
  await machineButton.press('Enter');
  assert.equal(await page.locator('#cc-hud').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cc-hud-close');
  await page.locator('#cc-hud-close').click();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.machineId), 'tool-scanner');
  const firstMachine = page.locator('.cc-machine-button').first();
  await firstMachine.focus();
  const keyboardMachines = [];
  for (let index = 0; index < 12; index++) {
    keyboardMachines.push(await page.evaluate(() => document.activeElement?.dataset.machineId));
    if (index < 11) await page.keyboard.press('Tab');
  }
  assert.equal(new Set(keyboardMachines).size, 12);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
  results.push('machine directory keyboard activation and focus restoration');

  const newsletterInput = page.locator('#cc-newsletter-email');
  const newsletterSubmit = page.locator('#cc-newsletter-submit');
  const newsletterStatus = page.locator('#cc-newsletter-status');
  const requestsBeforeValidation = newsletterRequests.length;
  await newsletterInput.fill('not-an-email');
  await newsletterSubmit.click();
  assert.match(await newsletterStatus.textContent(), /enter a valid email address/i);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cc-newsletter-email');
  assert.equal(newsletterRequests.length, requestsBeforeValidation);

  newsletterMode = 'loading';
  await newsletterInput.fill('reader@example.com');
  await page.locator('#cc-newsletter-form').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector('#cc-newsletter-submit')?.disabled);
  await page.locator('#cc-newsletter-form').evaluate(form => form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(30);
  assert.equal(newsletterRequests.length, requestsBeforeValidation + 1);
  assert.match(await newsletterStatus.textContent(), /opening deeper intel route/i);
  releaseNewsletter();
  await page.waitForFunction(() => document.querySelector('#cc-newsletter-status')?.dataset.state === 'success');
  assert.deepEqual(newsletterRequests.at(-1), { email: 'reader@example.com' });
  assert.equal(await newsletterInput.inputValue(), '');
  assert.equal(await newsletterSubmit.isEnabled(), true);

  newsletterMode = 'error';
  await newsletterInput.fill('reader@example.com');
  await newsletterSubmit.click();
  await page.waitForFunction(() => document.querySelector('#cc-newsletter-status')?.dataset.state === 'error');
  assert.equal(await page.locator('#cc-newsletter-fallback').isVisible(), true);
  assert.equal(await page.locator('#cc-newsletter-fallback').getAttribute('href'), 'https://spawncamper9000.beehiiv.com/?modal=signup');
  newsletterMode = 'success';
  results.push('newsletter validation, loading lock, success reset and hosted fallback');
  await page.evaluate(() => {
    const panel = document.querySelector('#cc-newsletter');
    const status = document.querySelector('#cc-newsletter-status');
    const fallback = document.querySelector('#cc-newsletter-fallback');
    document.querySelector('#cc-newsletter-form')?.reset();
    if (panel) panel.dataset.state = 'idle';
    if (status) { status.hidden = true; status.textContent = ''; status.dataset.state = 'idle'; }
    if (fallback) fallback.hidden = true;
  });

  await page.locator('#cc-recent-list details').first().locator('summary').click();
  assert.match(await page.locator('#cc-recent-list details').first().innerText(), /Event 0/);
  await page.locator('#cc-history-status').selectOption('completed');
  assert.equal(await page.locator('#cc-recent-list > li').count(), 5);
  await page.locator('#cc-load-earlier').click();
  await page.waitForFunction(() => document.querySelector('#cc-history-message')?.textContent.includes('6 public runs'));
  await page.locator('#cc-history-status').selectOption('all');
  assert.equal(await page.locator('#cc-recent-list > li').count(), 9);
  const completedState = state('scanner-bench', 'complete', 'new-work');
  completedState.recentHistory = completedState.workflows;
  await refresh(page, completedState);
  assert.equal(await page.locator('#cc-new-work').isVisible(), true);
  results.push('history expansion, filtering, pagination, and stable new-work notice');
  for (const [width, height] of [[1280,720],[1440,900],[1920,1080],[3440,1440],[850,900],[390,844]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(180);
    aspect(await get(page), `${width}x${height}`);
    const newsletterLayout = await page.evaluate(() => {
      const directory = document.querySelector('#cc-machine-directory').getBoundingClientRect();
      const newsletter = document.querySelector('#cc-newsletter').getBoundingClientRect();
      const history = document.querySelector('#cc-recent-work').getBoundingClientRect();
      const content = document.querySelector('.cc-newsletter__content').getBoundingClientRect();
      const uplink = document.querySelector('.cc-newsletter__uplink').getBoundingClientRect();
      const field = document.querySelector('.cc-newsletter__field').getBoundingClientRect();
      const submit = document.querySelector('.cc-newsletter__submit').getBoundingClientRect();
      return {
        order: [directory.bottom, newsletter.top, newsletter.bottom, history.top],
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        columns: content.right <= uplink.left + 1,
        stackedPanel: uplink.top >= content.bottom - 1,
        stackedControls: submit.top >= field.bottom - 1,
        fieldHeight: field.height,
        submitHeight: submit.height
      };
    });
    assert.ok(newsletterLayout.order[0] <= newsletterLayout.order[1] + 1, JSON.stringify(newsletterLayout));
    if (width > 760) assert.ok(newsletterLayout.order[2] <= newsletterLayout.order[3] + 1, JSON.stringify(newsletterLayout));
    else assert.ok(newsletterLayout.order[3] < newsletterLayout.order[1], JSON.stringify(newsletterLayout));
    assert.ok(newsletterLayout.overflow <= 0, JSON.stringify(newsletterLayout));
    assert.ok(newsletterLayout.fieldHeight >= 44 && newsletterLayout.submitHeight >= 44, JSON.stringify(newsletterLayout));
    if (width > 760) assert.equal(newsletterLayout.columns, true, JSON.stringify(newsletterLayout));
    if (width <= 760) assert.equal(newsletterLayout.stackedPanel, true, JSON.stringify(newsletterLayout));
    if (width <= 460) assert.equal(newsletterLayout.stackedControls, true, JSON.stringify(newsletterLayout));
    await page.locator('#cc-frame').screenshot({ path: `${evidence}/viewport-${width}x${height}.png` });
    if (width === 1440) await page.screenshot({ path: `${evidence}/page-${width}x${height}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: `${evidence}/page-${width}x${height}.png`, fullPage: true });
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
  assert.equal(await page.locator('#cc-status').textContent(), 'Disconnected'); offline = false;
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
  const reduced = await pageFor({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, hasTouch: true });
  await refresh(reduced, state('github-code')); at = await get(reduced);
  assert.deepEqual(at.position, { x: 132, y: 468 }); assert.equal(at.move.moving, false);
  assert.equal(at.crt.visible, at.crt.target); assert.equal(at.crt.typing, false); assert.equal(at.crt.cursorTimer, false);
  assert.ok(at.machines.every(([, playing]) => !playing)); results.push('reduced motion restoration and relocation');
  const mobileButton = reduced.locator('[data-machine-id="repo-forge"]');
  await mobileButton.tap();
  const mobilePlacement = await reduced.evaluate(() => {
    const frame = document.querySelector('#cc-frame').getBoundingClientRect();
    const inspector = document.querySelector('#cc-hud').getBoundingClientRect();
    const undersized = [...document.querySelectorAll('button, select')].filter(element => {
      const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 44;
    }).map(element => element.id || element.textContent.trim());
    return { frameBottom: frame.bottom, inspectorTop: inspector.top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, undersized };
  });
  assert.ok(mobilePlacement.inspectorTop >= mobilePlacement.frameBottom - 1, JSON.stringify(mobilePlacement));
  assert.ok(mobilePlacement.overflow <= 0, JSON.stringify(mobilePlacement));
  assert.deepEqual(mobilePlacement.undersized, [], JSON.stringify(mobilePlacement));
  await reduced.keyboard.press('Escape');
  results.push('mobile stacked inspector and no horizontal overflow');
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
  const loading = await pageFor({ historyMode: 'loading' });
  assert.match(await loading.locator('#cc-history-message').textContent(), /Loading/);
  const empty = await pageFor({ historyMode: 'empty' });
  await empty.waitForFunction(() => document.querySelector('#cc-history-message')?.textContent.includes('No public work'));
  const unavailable = await pageFor({ historyMode: 'error' });
  await unavailable.waitForFunction(() => document.querySelector('#cc-history-message')?.textContent.includes('unavailable'));
  const paginationError = await pageFor({ historyMode: 'pagination-error' });
  await paginationError.waitForFunction(() => document.querySelectorAll('#cc-recent-list > li').length === 8);
  await paginationError.locator('#cc-load-earlier').click();
  await paginationError.waitForFunction(() => document.querySelector('#cc-history-message')?.textContent.includes('Earlier work unavailable'));
  assert.equal(await paginationError.locator('#cc-recent-list > li').count(), 8);
  results.push('history loading, empty, unavailable, and pagination-error states');
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${evidence}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors, evidence }, null, 2));
} finally { await browser.close(); }
