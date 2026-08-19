const { ApiError } = require('../vision-forge/errors');

const BEEHIIV_PUBLICATION_ID = 'pub_ac645e3b-db53-41ca-aed1-e4345b35721d';
const BEEHIIV_SUBSCRIPTIONS_URL = `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`;
const NEWSLETTER_FALLBACK_URL = 'https://spawncamper9000.beehiiv.com/?modal=signup';
const DEFAULT_REFERRING_SITE = 'https://www.gamingalchemists.com/terminal';
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeNewsletterEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateNewsletterEmail(value) {
  const email = normalizeNewsletterEmail(value);

  if (
    !email
    || email.length > MAX_EMAIL_LENGTH
    || /[\u0000-\u001f\u007f]/.test(email)
    || !EMAIL_PATTERN.test(email)
  ) {
    throw new ApiError(400, 'Enter a valid email address.');
  }

  return email;
}

function terminalReferringSite() {
  const configuredSiteUrl = process.env.SITE_URL;
  if (!configuredSiteUrl) return DEFAULT_REFERRING_SITE;

  try {
    return new URL('/terminal', configuredSiteUrl.endsWith('/') ? configuredSiteUrl : `${configuredSiteUrl}/`).toString();
  } catch (error) {
    return DEFAULT_REFERRING_SITE;
  }
}

function buildBeehiivSubscriptionPayload(email, { referringSite = terminalReferringSite() } = {}) {
  return {
    email,
    reactivate_existing: false,
    send_welcome_email: true,
    utm_source: 'gamingalchemists_terminal',
    utm_medium: 'terminal_sidebar',
    utm_campaign: 'deeper_intel_signup',
    utm_content: 'terminal_sidebar_cta',
    referring_site: referringSite
  };
}

async function readBeehiivJson(response) {
  if (!response || typeof response.json !== 'function') return {};

  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

async function createBeehiivSubscription(email, {
  apiKey = process.env.BEEHIIV_API_KEY,
  fetchImpl = globalThis.fetch
} = {}) {
  const normalizedEmail = validateNewsletterEmail(email);

  if (!apiKey) {
    throw new ApiError(503, 'Newsletter signup is not configured yet. Use the hosted signup link.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new ApiError(503, 'Newsletter signup is not available in this runtime. Use the hosted signup link.');
  }

  let response;
  try {
    response = await fetchImpl(BEEHIIV_SUBSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(buildBeehiivSubscriptionPayload(normalizedEmail))
    });
  } catch (error) {
    throw new ApiError(502, 'Newsletter signup could not reach Beehiiv. Use the hosted signup link.');
  }

  const payload = await readBeehiivJson(response);
  if (!response.ok) {
    throw new ApiError(502, 'Beehiiv rejected the signup. Use the hosted signup link.', {
      upstream_status: response.status
    });
  }

  return {
    status: (payload && payload.data && payload.data.status) || 'subscribed'
  };
}

module.exports = {
  BEEHIIV_PUBLICATION_ID,
  BEEHIIV_SUBSCRIPTIONS_URL,
  NEWSLETTER_FALLBACK_URL,
  buildBeehiivSubscriptionPayload,
  createBeehiivSubscription,
  normalizeNewsletterEmail,
  validateNewsletterEmail
};
