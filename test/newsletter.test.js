const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const newsletterHandler = require('../api/newsletter/subscribe');
const {
  BEEHIIV_SUBSCRIPTIONS_URL,
  NEWSLETTER_FALLBACK_URL,
  buildBeehiivSubscriptionPayload,
  normalizeNewsletterEmail,
  validateNewsletterEmail
} = require('../server/newsletter/beehiiv');

const originalBeehiivApiKey = process.env.BEEHIIV_API_KEY;
const originalSiteUrl = process.env.SITE_URL;
const originalFetch = global.fetch;

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test.afterEach(() => {
  restoreEnv('BEEHIIV_API_KEY', originalBeehiivApiKey);
  restoreEnv('SITE_URL', originalSiteUrl);
  global.fetch = originalFetch;
});

async function invokeNewsletterHandler({ method = 'POST', body, headers = {} } = {}) {
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.payload = payload;
    }
  };

  await newsletterHandler({
    method,
    url: '/api/newsletter/subscribe',
    headers,
    body,
    on() {},
    destroy() {}
  }, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.payload ? JSON.parse(response.payload) : {}
  };
}

function mockBeehiivFetch(responsePayload, { ok = true, status = 200, calls = [] } = {}) {
  global.fetch = async (url, options) => {
    calls.push({
      url: String(url),
      method: options.method,
      headers: options.headers,
      body: JSON.parse(options.body)
    });

    return {
      ok,
      status,
      json: async () => responsePayload
    };
  };

  return calls;
}

test('normalizes and validates newsletter email addresses', () => {
  assert.equal(normalizeNewsletterEmail('  Reader@Example.COM  '), 'reader@example.com');
  assert.equal(validateNewsletterEmail('Reader@Example.COM'), 'reader@example.com');
  assert.throws(() => validateNewsletterEmail('not-an-email'), /valid email/);
  assert.throws(() => validateNewsletterEmail('reader@example'), /valid email/);
  assert.throws(() => validateNewsletterEmail(`${'x'.repeat(250)}@example.com`), /valid email/);
});

test('newsletter API rejects invalid email before calling Beehiiv', async () => {
  process.env.BEEHIIV_API_KEY = 'test-secret';
  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  const result = await invokeNewsletterHandler({
    body: { email: 'bad-email' }
  });

  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, {
    ok: false,
    error: 'Enter a valid email address.',
    fallbackUrl: NEWSLETTER_FALLBACK_URL
  });
});

test('newsletter API rejects unsupported methods', async () => {
  const result = await invokeNewsletterHandler({ method: 'GET' });

  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.allow, 'POST, OPTIONS');
  assert.equal(result.body.ok, false);
  assert.equal(result.body.fallbackUrl, NEWSLETTER_FALLBACK_URL);
});

test('newsletter API returns fallback when Beehiiv key is missing', async () => {
  delete process.env.BEEHIIV_API_KEY;
  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  const result = await invokeNewsletterHandler({
    body: { email: 'reader@example.com' }
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    ok: false,
    error: 'Newsletter signup is not configured yet. Use the hosted signup link.',
    fallbackUrl: NEWSLETTER_FALLBACK_URL
  });
});

test('newsletter API sends the expected Beehiiv subscription request', async () => {
  process.env.BEEHIIV_API_KEY = 'beehiiv-secret';
  process.env.SITE_URL = 'https://www.gamingalchemists.com';
  const calls = mockBeehiivFetch({ data: { status: 'validating' } });

  const result = await invokeNewsletterHandler({
    body: { email: '  Reader@Example.COM  ' }
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    ok: true,
    status: 'validating',
    fallbackUrl: NEWSLETTER_FALLBACK_URL
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, BEEHIIV_SUBSCRIPTIONS_URL);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer beehiiv-secret');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers.Accept, 'application/json');
  assert.deepEqual(calls[0].body, {
    email: 'reader@example.com',
    reactivate_existing: false,
    send_welcome_email: true,
    utm_source: 'gamingalchemists_terminal',
    utm_medium: 'terminal_sidebar',
    utm_campaign: 'deeper_intel_signup',
    utm_content: 'terminal_sidebar_cta',
    referring_site: 'https://www.gamingalchemists.com/terminal'
  });
});

test('newsletter API maps Beehiiv rejections to fallback errors', async () => {
  process.env.BEEHIIV_API_KEY = 'beehiiv-secret';
  const calls = mockBeehiivFetch({ message: 'rate limited' }, { ok: false, status: 429 });

  const result = await invokeNewsletterHandler({
    body: { email: 'reader@example.com' }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.statusCode, 502);
  assert.deepEqual(result.body, {
    ok: false,
    error: 'Beehiiv rejected the signup. Use the hosted signup link.',
    fallbackUrl: NEWSLETTER_FALLBACK_URL
  });
});

test('newsletter API does not leak Beehiiv secrets in browser code or responses', async () => {
  process.env.BEEHIIV_API_KEY = 'beehiiv-secret-never-leak';
  mockBeehiivFetch({ message: 'beehiiv-secret-never-leak' }, { ok: false, status: 401 });

  const result = await invokeNewsletterHandler({
    body: { email: 'reader@example.com' }
  });

  const responseText = JSON.stringify(result.body);
  const terminalJs = fs.readFileSync(`${__dirname}/../terminal.js`, 'utf8');
  const terminalHtml = fs.readFileSync(`${__dirname}/../terminal.html`, 'utf8');

  assert.doesNotMatch(responseText, /beehiiv-secret-never-leak/);
  assert.doesNotMatch(terminalJs, /BEEHIIV_API_KEY|beehiiv-secret-never-leak/);
  assert.doesNotMatch(terminalHtml, /BEEHIIV_API_KEY|beehiiv-secret-never-leak/);
});

test('newsletter payload helper keeps Beehiiv mutations limited to subscriptions', () => {
  const payload = buildBeehiivSubscriptionPayload('reader@example.com', {
    referringSite: 'https://example.com/terminal'
  });

  assert.equal(payload.email, 'reader@example.com');
  assert.equal(payload.reactivate_existing, false);
  assert.equal(payload.send_welcome_email, true);
  assert.equal(payload.referring_site, 'https://example.com/terminal');
  assert.equal(Object.hasOwn(payload, 'custom_fields'), false);
  assert.equal(Object.hasOwn(payload, 'newsletter_list_ids'), false);
  assert.equal(Object.hasOwn(payload, 'automation_ids'), false);
});

test('terminal page exposes newsletter CTA after the readout with accessible hooks', () => {
  const html = fs.readFileSync(`${__dirname}/../terminal.html`, 'utf8');
  const css = fs.readFileSync(`${__dirname}/../terminal.css`, 'utf8');

  const readoutStart = html.indexOf('<dl class="terminal-readout');
  const readoutEnd = html.indexOf('</dl>', readoutStart) + '</dl>'.length;
  const newsletterStart = html.indexOf('<section class="terminal-newsletter"', readoutEnd);

  assert.notEqual(readoutStart, -1);
  assert.ok(newsletterStart > readoutEnd);
  assert.equal(html.slice(readoutEnd, newsletterStart).trim(), '');
  assert.match(html, /\/\/ DEEPER INTEL/);
  assert.match(html, /GO BEYOND THE TERMINAL/);
  assert.match(html, /Get the deeper intel behind the signals\./);
  assert.match(html, /id="terminal-newsletter-form"[\s\S]+novalidate/);
  assert.match(html, /for="terminal-newsletter-email">Email address<\/label>/);
  assert.match(html, /id="terminal-newsletter-email"[\s\S]+type="email"[\s\S]+autocomplete="email"/);
  assert.match(html, /id="terminal-newsletter-status"[\s\S]+role="status"[\s\S]+aria-live="polite"/);
  assert.match(html, new RegExp(NEWSLETTER_FALLBACK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /\.terminal-newsletter\b/);
  assert.match(css, /\.terminal-newsletter__status\[data-state="success"\]/);
  assert.match(css, /\.terminal-newsletter__status\[data-state="error"\]/);
});
