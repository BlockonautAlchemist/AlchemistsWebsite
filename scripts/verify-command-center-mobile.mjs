import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.CC_TEST_ORIGIN || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Mobile fixtures require a local server.');
const evidence = process.env.CC_EVIDENCE_DIR || '/tmp/cc-mobile-evidence';
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CC_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const errors = [], measurements = [];
const now = new Date().toISOString();
let state = { success: true, fetchedAt: now, workflows: [], recentHistory: [] };
let offline = false;
const runs = Array.from({ length: 9 }, (_, index) => ({
  id: `mobile-${index}`, runId: `mobile-${index}`, agent: 'spawncamper9000', workflow: index % 2 ? 'github' : 'social-x',
  taskTitle: index % 2 ? 'Repository investigation' : 'X Post (PM)', taskState: 'completed', state: 'complete',
  startedAt: now, updatedAt: now, outcome: 'Published a source-backed public result.', publicUrl: 'https://example.com/public-result',
  totalEventCount: 5, omittedEventCount: 0,
  events: ['Starting task', 'Selecting candidate', 'Fact checking', 'Publishing result', 'Completed'].map((activity, eventIndex) => ({
    eventId: `${index}-${eventIndex}`, state: eventIndex === 4 ? 'complete' : 'researching', activity, timestamp: now, lastTimestamp: now, occurrenceCount: 1
  }))
}));

async function pageFor({ native = true, rejectNative = false, reducedMotion = 'no-preference' } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion });
  page.on('pageerror', (error) => errors.push(error.message));
  if (!native) await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false });
    Object.defineProperty(document, 'webkitFullscreenEnabled', { value: false });
  });
  if (rejectNative) await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('Fullscreen denied')); });
  await page.route('**/api/command-center/state*', (route) => route.fulfill({ status: offline ? 503 : 200, json: offline ? { success: false } : state }));
  await page.route('**/api/command-center/history*', (route) => {
    const earlier = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { success: true, fetchedAt: now, runs: earlier ? runs.slice(8) : runs.slice(0, 8), nextCursor: earlier ? null : 'earlier' } });
  });
  await page.route('**/api/newsletter/subscribe', (route) => route.fulfill({ status: 503, json: { ok: false, error: 'Temporarily unavailable.', fallbackUrl: 'https://spawncamper9000.beehiiv.com/?modal=signup' } }));
  await page.route('**/command-center.js*', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('  client.start();', '  window.__ccTest = { game, client }; window.__originalGame = game;\n  client.start();');
    await route.fulfill({ response, body });
  });
  await page.goto(`${origin}/command-center`);
  await page.waitForFunction(() => window.__ccTest?.game.scene.scenes[0]?.locomotion && document.querySelectorAll('#cc-recent-list > li').length === 8);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function measure(page) {
  return page.evaluate(() => {
    const scene = window.__ccTest.game.scene.scenes[0];
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return { viewport: [innerWidth, innerHeight], mobile: document.body.classList.contains('cc-mobile'),
      canvas: box('canvas'), frame: box('#cc-frame'), hud: box('.cc-mobile-hud'), directory: box('#cc-machine-directory'),
      history: box('#cc-recent-work'), newsletter: box('#cc-newsletter'),
      logical: [scene.scale.width, scene.scale.height], camera: [scene.cameras.main.scrollX, scene.cameras.main.scrollY, scene.cameras.main.zoom],
      sameGame: window.__originalGame === window.__ccTest.game, canvases: document.querySelectorAll('canvas').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      columns: getComputedStyle(document.querySelector('#cc-directory-grid')).gridTemplateColumns.split(' ').length,
      rows: [...document.querySelectorAll('.cc-run')].map((row) => row.getBoundingClientRect().height)
    };
  });
}
function fullRoom(at) {
  assert.deepEqual(at.logical, [960, 528]); assert.deepEqual(at.camera, [0, 0, 1]);
  assert.ok(Math.abs(at.canvas.width / at.canvas.height - 960 / 528) < .002);
  assert.equal(at.sameGame, true); assert.equal(at.canvases, 1); assert.equal(at.overflow, 0);
  if (at.mobile) {
    assert.ok(at.canvas.top >= at.frame.top - .02 && at.canvas.bottom <= at.frame.bottom + .02, 'No vertical clipping');
    assert.ok(at.canvas.left >= at.frame.left - .02 && at.canvas.right <= at.frame.right + .02, 'No horizontal clipping');
  }
}
try {
  const page = await pageFor();
  const touchSession = await page.context().newCDPSession(page);
  for (const [width, height] of [[320,568],[375,567],[375,667],[390,664],[390,844],[393,852],[430,932],[667,375],[844,390],[932,430],[760,900],[761,900],[768,1024],[850,900],[1024,768],[1440,900],[1920,1080]]) {
    await page.setViewportSize({ width, height });
    // Chromium's full-page capture resets touch emulation when restoring the
    // viewport. Reapply the device capability before checking media queries.
    await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(150);
    const at = await measure(page); fullRoom(at);
    if (width === 844 || width === 932) {
      assert.equal(at.mobile, true, 'Rotated phones retain the compact layout');
    }
    if (at.mobile) {
      assert.equal(at.columns, 2);
      assert.ok(at.newsletter.top >= at.history.bottom);
      if (height > width && width <= 430) assert.ok(at.hud.bottom <= height, `fold: ${JSON.stringify(at)}`);
      assert.ok(at.rows.every((height) => height < 170));
    } else assert.ok(at.newsletter.bottom <= at.history.top);
    measurements.push(at);
    if ([320,390,430,768,1440].includes(width)) await page.screenshot({ path: `${evidence}/page-${width}x${height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.locator('#nav-toggle').click();
  await page.waitForFunction(() => {
    const menu = document.querySelector('#nav-links').getBoundingClientRect();
    const nav = document.querySelector('.nav').getBoundingClientRect();
    return Math.abs(menu.top - nav.bottom) <= 1;
  });
  const menu = await page.locator('#nav-links').boundingBox();
  const nav = await page.locator('.nav').boundingBox();
  assert.ok(Math.abs(menu.y - nav.y - nav.height) <= 1, 'Menu anchors immediately below the compact header');
  await page.keyboard.press('Escape');
  const hudHeight = (await measure(page)).hud.height;
  for (const [mode, expected, expired] of [['coding','WORKING'], ['waiting','WAITING'], ['warning','NEEDS ATTENTION'], ['complete','COMPLETED'], ['error','FAILED'], ['coding','STATUS UNKNOWN',true]]) {
    const timestamp = new Date(Date.now() - (expired ? 3000 : 0)).toISOString();
    state = { success:true, fetchedAt:new Date().toISOString(), workflows:[{agent:'spawncamper9000',workflow:'github',runId:'mobile-active',eventId:`event-${mode}-${Boolean(expired)}`,taskTitle:'Public repository investigation',activity:'Reviewing the public repository',state:mode,timestamp,startedAt:now,ttlSeconds:expired ? 1 : 900}],recentHistory:[] };
    await page.evaluate(() => window.__ccTest.client.refresh());
    await page.waitForFunction((label) => document.querySelector('#cc-mobile-task').textContent === label, expected);
    assert.equal((await measure(page)).hud.height,hudHeight);
    if (expired) assert.match(await page.locator('[data-machine-id="repo-forge"] .cc-machine-state').textContent(), /Status unknown/);
  }
  state = { success:true, fetchedAt:new Date().toISOString(), workflows:[],recentHistory:[] };
  await page.evaluate(() => window.__ccTest.client.refresh());
  const machine = page.locator('[data-machine-id="repo-forge"]');
  await machine.click();
  assert.equal(await page.locator('#cc-hud').evaluate((node) => node.previousElementSibling.id), 'cc-directory-grid');
  await page.locator('#cc-focus-machine').click();
  assert.equal(await page.evaluate(() => window.__ccTest.game.scene.scenes[0].selectedZoneId), 'github-code');
  fullRoom(await measure(page));
  await page.locator('#cc-full-facility').click();
  assert.equal(await page.locator('#cc-hud').isVisible(), false);
  await machine.click(); await page.locator('#cc-machine-work').click();
  assert.equal(await page.locator('#cc-history-machine').inputValue(), 'repo-forge');
  assert.equal(await page.locator('.cc-run').count(), 4);
  await page.locator('#cc-filter-toggle').click();
  await page.locator('#cc-history-machine').selectOption('all');
  await page.locator('.cc-run__toggle').first().click();
  assert.equal(await page.locator('.cc-run details').first().evaluate((node) => node.open), true);
  assert.equal(await page.locator('.cc-run__events').first().locator('li').count(), 5);
  await page.locator('#cc-load-earlier').click();
  await page.waitForFunction(() => document.querySelectorAll('.cc-run').length === 9);
  assert.equal(await page.locator('.cc-run details').first().evaluate((node) => node.open), true);
  await page.locator('#cc-telemetry-details > summary').click();
  assert.equal(await page.locator('.cc-summary').isVisible(), true);
  await page.locator('#cc-telemetry-details > summary').click();
  await page.locator('#cc-fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement?.id === 'cc-world');
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(150);
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.waitForFunction(() => document.body.classList.contains('cc-mobile'));
  fullRoom(await measure(page));
  await page.screenshot({ path: `${evidence}/native-landscape.png` });
  await page.locator('#cc-fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  const fallback = await pageFor({ native: false, reducedMotion: 'reduce' });
  await fallback.locator('#cc-fullscreen').click();
  assert.equal(await fallback.locator('#cc-world').getAttribute('data-expanded'), 'true');
  await fallback.setViewportSize({ width: 844, height: 390 }); await fallback.waitForTimeout(150);
  fullRoom(await measure(fallback));
  await fallback.evaluate(() => window.__ccTest.game.scene.scenes[0].inspectArea('github-code'));
  assert.equal(await fallback.locator('#cc-hud').isVisible(), true);
  await fallback.waitForTimeout(150); fullRoom(await measure(fallback));
  await fallback.screenshot({ path: `${evidence}/fallback-inspector.png` });
  await fallback.keyboard.press('Escape');
  assert.equal(await fallback.locator('#cc-world').getAttribute('data-expanded'), 'false');
  assert.equal(await fallback.locator('[inert]').count(), 0);
  await fallback.setViewportSize({ width: 390, height: 844 });
  const before = await measure(fallback);
  offline = true; await fallback.evaluate(() => window.__ccTest.client.refresh());
  await fallback.waitForFunction(() => document.querySelector('#cc-mobile-connection').textContent.includes('DISCONNECTED'));
  assert.equal((await measure(fallback)).hud.height, before.hud.height);
  offline = false; await fallback.evaluate(() => window.__ccTest.client.refresh());
  await fallback.locator('#cc-newsletter-email').fill('mobile@example.com');
  await fallback.locator('#cc-newsletter-submit').click();
  await fallback.locator('#cc-newsletter-fallback').waitFor({ state: 'visible' });
  const rejected = await pageFor({ rejectNative: true });
  await rejected.locator('#cc-fullscreen').click();
  await rejected.waitForFunction(() => document.querySelector('#cc-world').dataset.expanded === 'true');
  fullRoom(await measure(rejected));
  await rejected.locator('#cc-fullscreen').click();
  assert.equal(await rejected.locator('#cc-world').getAttribute('data-expanded'), 'false');
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${evidence}/measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify({ passed: true, viewports: measurements.length, evidence }));
} finally { await browser.close(); }
