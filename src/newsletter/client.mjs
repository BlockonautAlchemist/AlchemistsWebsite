export const NEWSLETTER_SUBSCRIBE_URL = '/api/newsletter/subscribe';
export const NEWSLETTER_FALLBACK_URL = 'https://spawncamper9000.beehiiv.com/?modal=signup';

export function normalizeNewsletterEmail(value) {
  return String(value || '').trim();
}

export function isValidNewsletterEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function initNewsletterSignup({
  panel,
  form,
  emailInput,
  submitButton,
  status,
  fallbackLink
}) {
  if (!panel || !form || !emailInput || !submitButton || !status || !fallbackLink) return;
  if (panel.dataset.newsletterInitialized === 'true') return;
  panel.dataset.newsletterInitialized = 'true';

  const defaultSubmitText = submitButton.textContent;
  const state = { submitting: false };

  function setStatus(message, stateName = 'idle', {
    showFallback = false,
    fallbackUrl = NEWSLETTER_FALLBACK_URL
  } = {}) {
    status.hidden = !message;
    status.textContent = message || '';
    status.dataset.state = stateName;
    panel.dataset.state = stateName;

    fallbackLink.href = fallbackUrl || NEWSLETTER_FALLBACK_URL;
    fallbackLink.hidden = !showFallback;
  }

  function setSubmitting(isSubmitting) {
    state.submitting = isSubmitting;
    emailInput.disabled = isSubmitting;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? '[ connecting ... ]' : defaultSubmitText;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.submitting) return;

    const email = normalizeNewsletterEmail(emailInput.value);
    if (!isValidNewsletterEmail(email)) {
      setStatus('ERR: enter a valid email address.', 'error');
      emailInput.focus();
      return;
    }

    setSubmitting(true);
    setStatus('CONNECTING: opening deeper intel route...', 'loading');

    try {
      const response = await fetch(NEWSLETTER_SUBSCRIBE_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.ok !== true) {
        const error = new Error(payload.error || 'Newsletter signup failed.');
        error.fallbackUrl = payload.fallbackUrl;
        throw error;
      }

      setStatus('CONNECTED: check your inbox for the next signal.', 'success');
      form.reset();
    } catch (error) {
      setStatus(error.message || 'ERR: signup link failed open.', 'error', {
        showFallback: true,
        fallbackUrl: error.fallbackUrl || NEWSLETTER_FALLBACK_URL
      });
    } finally {
      setSubmitting(false);
    }
  });
}
