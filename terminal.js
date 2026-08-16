import {
  TERMINAL_CATEGORIES,
  categoryLabel,
  compactSignalTags,
  normalizeSignalsPayload,
  relativeSignalTime,
  signalProvenanceParts,
  terminalChannelState,
  terminalSignalsUrl,
  terminalUrlWithChannel
} from './src/terminal/viewModel.mjs';

if (typeof document !== 'undefined') {
  initTerminal();
}

function initTerminal() {
  const filterHost = document.getElementById('terminal-filters');
  const list = document.getElementById('terminal-list');
  const empty = document.getElementById('terminal-empty');
  const notice = document.getElementById('terminal-notice');
  const status = document.getElementById('terminal-status');
  const refresh = document.getElementById('terminal-refresh');

  if (!filterHost || !list || !empty || !notice || !status || !refresh) return;

  const initialChannelState = terminalChannelState(window.location.search);

  const state = {
    channel: initialChannelState.channel,
    filterNotice: initialChannelState.isUnknownChannel
      ? 'Unknown channel filter ignored.'
      : initialChannelState.hasDeprecatedCategory
        ? 'Deprecated category filter ignored.'
        : '',
    loading: false,
    abortController: null
  };

  if (initialChannelState.isUnknownChannel || initialChannelState.hasDeprecatedCategory) {
    window.history.replaceState({}, '', terminalUrlWithChannel(window.location.href, state.channel));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setNotice(message) {
    notice.hidden = !message;
    notice.textContent = message || '';
  }

  function updateStatus(text, stateName = '') {
    status.textContent = text;
    status.classList.toggle('is-syncing', stateName === 'syncing');
    status.classList.toggle('is-offline', stateName === 'offline');
  }

  function setActiveFilter() {
    filterHost.querySelectorAll('button[data-category]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.channel));
    });
  }

  function renderFilters() {
    const filters = [
      ['', 'ALL'],
      ...TERMINAL_CATEGORIES.map((category) => [category, categoryLabel(category)])
    ];

    filterHost.replaceChildren(...filters.map(([value, label]) => {
      const button = el('button', 'terminal-filter mono', label);
      button.type = 'button';
      button.dataset.category = value;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (state.channel === value) return;
        state.channel = value;
        window.history.replaceState({}, '', terminalUrlWithChannel(window.location.href, value));
        setActiveFilter();
        loadSignals();
      });
      return button;
    }));

    setActiveFilter();
  }

  function renderMeta(signal) {
    const meta = el('div', 'terminal-card__meta');
    meta.appendChild(el('span', 'terminal-card__category mono', categoryLabel(signal.category)));
    meta.appendChild(el('span', 'terminal-card__time mono', `· ${relativeSignalTime(signal.discoveredAt)}`));

    return meta;
  }

  function renderChips(values, className) {
    const wrap = el('div', className);
    values.forEach((value) => {
      wrap.appendChild(el('span', `${className}-chip mono`, value));
    });
    return wrap;
  }

  function renderSignal(signal) {
    const article = el('article', 'terminal-card');
    article.dataset.category = signal.category || '';

    article.appendChild(renderMeta(signal));
    article.appendChild(el('h3', 'display', signal.headline || 'Untitled signal'));
    article.appendChild(el('p', 'terminal-card__summary', signal.summary || ''));

    const take = el('div', 'terminal-card__take');
    take.appendChild(el('span', 'terminal-card__take-label mono', 'THE ALCHEMIST PLAY'));
    take.appendChild(el('p', '', signal.alchemistTake || ''));
    article.appendChild(take);

    const sourceRow = el('div', 'terminal-card__source-row');
    const source = el('a', 'terminal-card__source mono', `SOURCE · ${signal.sourceName || 'Source'} ↗`);
    source.href = signal.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    sourceRow.appendChild(source);

    const provenanceParts = signalProvenanceParts(signal);
    if (provenanceParts.length) {
      sourceRow.appendChild(el('div', 'terminal-card__provenance mono', provenanceParts.join(' · ')));
    }

    article.appendChild(sourceRow);

    const secondary = el('div', 'terminal-card__secondary');

    const strengths = Array.isArray(signal.relevantStrengths) ? signal.relevantStrengths : [];
    if (strengths.length) {
      const shownStrengths = strengths.slice(0, 3);
      const hiddenStrengths = strengths.length - shownStrengths.length;
      if (hiddenStrengths > 0) shownStrengths.push(`+${hiddenStrengths}`);
      secondary.appendChild(renderChips(shownStrengths, 'terminal-card__strengths'));
    }

    const tags = compactSignalTags(signal, 5);
    if (tags.length) {
      secondary.appendChild(renderChips(tags, 'terminal-card__tags'));
    }

    if (secondary.childElementCount > 0) article.appendChild(secondary);

    return article;
  }

  function renderSignals(signals) {
    list.replaceChildren(...signals.map(renderSignal));
    empty.hidden = signals.length > 0;
  }

  async function loadSignals() {
    if (state.abortController) state.abortController.abort();

    state.abortController = new AbortController();
    state.loading = true;
    refresh.disabled = true;
    updateStatus('Syncing', 'syncing');
    setNotice(state.filterNotice);
    state.filterNotice = '';

    const url = terminalSignalsUrl(window.location.origin, {
      channel: state.channel,
      limit: 50
    });

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: state.abortController.signal
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || `Request failed (${response.status})`);
      }

      const signals = normalizeSignalsPayload(payload);
      renderSignals(signals);

      const label = signals.length === 1 ? '1 signal' : `${signals.length} signals`;
      updateStatus(`Live · ${label}`, 'live');
    } catch (error) {
      if (error.name === 'AbortError') return;

      console.warn('[terminal] signal feed unavailable:', error.message);
      renderSignals([]);
      updateStatus('Offline', 'offline');
      setNotice('Signal feed unavailable.');
    } finally {
      state.loading = false;
      refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', () => {
    if (!state.loading) loadSignals();
  });

  renderFilters();
  loadSignals();
}
