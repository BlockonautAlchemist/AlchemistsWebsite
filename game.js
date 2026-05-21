// Published game signal renderer. Public data comes from the server route for the slug.

(function () {
  const shell = document.getElementById('game-shell');
  if (!shell) return;

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

  function slugFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts.at(-1) && parts.at(-1) !== 'game.html' ? parts.at(-1) : 'example-frontier';
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Game signal could not load.');
    }

    return data;
  }

  function normalizeList(items) {
    if (Array.isArray(items)) return items.filter(Boolean);
    if (typeof items === 'string' && items.trim()) return items.split(/\n+/).filter(Boolean);
    return [];
  }

  function bulletList(items) {
    const bullets = normalizeList(items);
    return bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function externalLink(signal) {
    if (!signal.game_url) return '';
    return `<a class="btn btn-ghost" href="${escapeHtml(signal.game_url)}" target="_blank" rel="noopener noreferrer">Open Game Link</a>`;
  }

  function textBlock(label, value) {
    if (!value) return '';

    return (
      '<section class="game-block">' +
        `<span class="game-block__label mono">${escapeHtml(label)}</span>` +
        `<p>${escapeHtml(value)}</p>` +
      '</section>'
    );
  }

  function listBlock(label, items) {
    const bullets = normalizeList(items);
    if (!bullets.length) return '';

    return (
      '<section class="game-block">' +
        `<span class="game-block__label mono">${escapeHtml(label)}</span>` +
        `<ul>${bulletList(bullets)}</ul>` +
      '</section>'
    );
  }

  function renderSignal(signal) {
    const refined = signal.refined || {};
    const title = refined.title || signal.title || signal.game_title;
    const interested = safeGet(`${INTEREST_PREFIX}${signal.slug}`) === 'true';
    const watchItems = normalizeList(refined.what_to_watch).length
      ? refined.what_to_watch
      : signal.what_to_watch;
    const nextStep = refined.next_step || 'Join the watchlist to help decide whether this game deserves deeper community review.';
    const tags = (Array.isArray(refined.tags) && refined.tags.length ? refined.tags : [signal.signal_type])
      .slice(0, 5)
      .map((tag) => `<span class="gs-pill">${escapeHtml(tag)}</span>`)
      .join('');

    shell.innerHTML =
      '<article class="game-detail">' +
        '<header class="game-detail__hero">' +
          '<div class="game-detail__copy">' +
            '<div class="game-detail__meta">' +
              `<span class="gs-pill gs-pill--yellow">${escapeHtml(signal.status_label || signal.status)}</span>` +
              (signal.sample_signal ? '<span class="gs-pill">Sample</span>' : '') +
              tags +
            '</div>' +
            `<h1 class="display">${escapeHtml(title)}</h1>` +
            `<p class="subtitle-font">${escapeHtml(refined.short_summary || signal.summary)}</p>` +
          '</div>' +
          '<aside class="game-detail__stats" aria-label="Signal stats">' +
            `<div><span class="mono">${Number(signal.interest_count || 0)}</span><small>Watching</small></div>` +
            `<div><span class="mono">${Number(signal.reaction_count || 0)}</span><small>Reactions</small></div>` +
            `<div><span class="mono">${Number(signal.threshold || 2)}</span><small>Threshold</small></div>` +
          '</aside>' +
        '</header>' +
        '<div class="game-detail__grid">' +
          '<div class="game-detail__body">' +
            '<section class="game-block">' +
              '<span class="game-block__label mono">Game Overview</span>' +
              `<p>${escapeHtml(refined.short_summary || signal.summary)}</p>` +
            '</section>' +
            '<section class="game-block">' +
              '<span class="game-block__label mono">Why Alchemists Should Watch</span>' +
              `<p>${escapeHtml(refined.why_it_matters || signal.summary || 'This signal gives members a concrete reason to watch this game.')}</p>` +
            '</section>' +
            '<section class="game-block">' +
              '<span class="game-block__label mono">What To Watch</span>' +
              `<ul>${bulletList(watchItems)}</ul>` +
            '</section>' +
          '</div>' +
          '<aside class="game-detail__side">' +
            textBlock('Member Interest', refined.possible_member_interest) +
            listBlock('Creator Angles', refined.creator_angles) +
            listBlock('Research Notes', refined.research_notes) +
            textBlock('Next Step', nextStep) +
            '<div class="game-actions">' +
              externalLink(signal) +
              `<button class="btn btn-primary" id="game-interest" type="button"${interested ? ' disabled' : ''}>${interested ? 'Watching' : 'Join Watchlist'}</button>` +
            '</div>' +
          '</aside>' +
        '</div>' +
      '</article>';

    const button = document.getElementById('game-interest');
    if (button) {
      button.addEventListener('click', () => registerInterest(signal.slug, button));
    }
  }

  async function registerInterest(slug, button) {
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      const data = await requestJson('/api/game-signals/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug })
      });
      safeSet(`${INTEREST_PREFIX}${slug}`, 'true');
      renderSignal(data.signal);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Join Watchlist';
    }
  }

  async function loadSignal() {
    const slug = slugFromPath();

    try {
      const data = await requestJson(`/api/game-signals?slug=${encodeURIComponent(slug)}`);
      renderSignal(data.signal);
      document.title = `${(data.signal.refined && data.signal.refined.title) || data.signal.title} - The Alchemists`;
    } catch (error) {
      shell.innerHTML =
        '<div class="game-error">' +
          '<span class="gs-panel-kicker mono">Signal Missing</span>' +
          '<h1 class="display">Game Signal Not Found</h1>' +
          '<p>The signal may still be under review or the local API may not be running.</p>' +
          '<a class="btn btn-primary" href="/game-signal-engine">Back To Signals</a>' +
        '</div>';
    }
  }

  loadSignal();
})();
