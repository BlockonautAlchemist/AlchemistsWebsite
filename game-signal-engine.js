// Game Signal Engine client. AI, Discord, publishing, and reaction counts stay server-side.

(function () {
  const refs = {
    form: document.getElementById('signal-form'),
    submit: document.getElementById('signal-submit-button'),
    notice: document.getElementById('signal-notice'),
    list: document.getElementById('signal-list'),
    refresh: document.getElementById('signal-refresh')
  };

  if (!refs.form || !refs.list) return;

  const INTEREST_PREFIX = 'gameSignalInterest:';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* storage unavailable */
    }
  }

  function setNotice(message, type) {
    refs.notice.textContent = message || '';
    refs.notice.className = 'gs-form__notice';
    if (message) {
      refs.notice.classList.add('is-visible');
      if (type) refs.notice.classList.add(`is-${type}`);
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Game Signal Engine request failed.');
      error.data = data;
      throw error;
    }

    return data;
  }

  function signalSummary(signal) {
    const refined = signal.refined || {};
    return refined.short_summary || refined.why_it_matters || signal.summary || 'Community-submitted game signal.';
  }

  function signalTags(signal) {
    const refined = signal.refined || {};
    const tags = Array.isArray(refined.tags) && refined.tags.length
      ? refined.tags
      : [signal.signal_type];

    return tags.slice(0, 4);
  }

  function renderSignal(signal) {
    const interested = safeGet(`${INTEREST_PREFIX}${signal.slug}`) === 'true';
    const title = (signal.refined && signal.refined.title) || signal.title || signal.game_title;
    const tags = signalTags(signal)
      .map((tag) => `<span class="gs-pill">${escapeHtml(tag)}</span>`)
      .join('');

    return (
      `<article class="gs-signal-card" data-slug="${escapeHtml(signal.slug)}">` +
        '<div class="gs-signal-card__meta">' +
          `<span class="gs-pill gs-pill--yellow">${escapeHtml(signal.status_label || signal.status)}</span>` +
          (signal.sample_signal ? '<span class="gs-pill">Sample</span>' : '') +
          tags +
        '</div>' +
        `<h4>${escapeHtml(title)}</h4>` +
        `<p>${escapeHtml(signalSummary(signal))}</p>` +
        '<div class="gs-signal-card__stats mono">' +
          `<span>${Number(signal.interest_count || 0)} watching</span>` +
          `<span>${Number(signal.reaction_count || 0)} reactions</span>` +
          `<span>threshold ${Number(signal.threshold || 2)}</span>` +
        '</div>' +
        '<div class="gs-signal-card__actions">' +
          `<a class="btn btn-ghost" href="${escapeHtml(signal.public_path || `/games/${signal.slug}`)}">Open Game Page</a>` +
          `<button class="gs-interest" type="button" data-interest="${escapeHtml(signal.slug)}"${interested ? ' disabled' : ''}>${interested ? 'Watching' : 'Join Watchlist'}</button>` +
        '</div>' +
      '</article>'
    );
  }

  function renderSignals(signals) {
    if (!Array.isArray(signals) || !signals.length) {
      refs.list.innerHTML = '<p class="gs-empty">No game signals yet.</p>';
      return;
    }

    refs.list.innerHTML = signals.map(renderSignal).join('');
  }

  async function loadSignals() {
    refs.refresh.disabled = true;

    try {
      const data = await requestJson('/api/game-signals');
      renderSignals(data.signals);
    } catch (error) {
      refs.list.innerHTML =
        '<p class="gs-empty">Signals could not load in this environment. Run the Vercel dev server to use the live signal desk.</p>';
    } finally {
      refs.refresh.disabled = false;
    }
  }

  function formPayload() {
    const data = new FormData(refs.form);
    return {
      submitted_by: data.get('submitted_by'),
      game_title: data.get('game_title'),
      game_url: data.get('game_url'),
      signal_type: data.get('signal_type'),
      summary: data.get('summary'),
      what_to_watch: data.get('what_to_watch'),
      notes: data.get('notes'),
      website: data.get('website')
    };
  }

  async function submitSignal(event) {
    event.preventDefault();
    setNotice('');
    refs.submit.disabled = true;
    refs.submit.textContent = 'Submitting...';

    try {
      const data = await requestJson('/api/game-signals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPayload())
      });
      const warning = Array.isArray(data.warnings) && data.warnings.length
        ? ` ${data.warnings[0]}`
        : '';

      setNotice(`Game signal saved.${warning}`, data.warnings && data.warnings.length ? 'error' : 'success');
      refs.form.reset();
      await loadSignals();
    } catch (error) {
      setNotice(error.message, 'error');
    } finally {
      refs.submit.disabled = false;
      refs.submit.textContent = 'Submit Game Signal';
    }
  }

  async function registerInterest(slug, button) {
    if (!slug || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      const data = await requestJson('/api/game-signals/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug })
      });
      safeSet(`${INTEREST_PREFIX}${slug}`, 'true');

      const card = refs.list.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
      if (card && data.signal) {
        card.outerHTML = renderSignal(data.signal);
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Join Watchlist';
      setNotice(error.message, 'error');
    }
  }

  refs.form.addEventListener('submit', submitSignal);
  refs.refresh.addEventListener('click', loadSignals);
  refs.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-interest]');
    if (!button) return;
    registerInterest(button.dataset.interest, button);
  });

  loadSignals();
})();
