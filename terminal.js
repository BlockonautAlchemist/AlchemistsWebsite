import {
  TERMINAL_CATEGORIES,
  TERMINAL_SORT_OPTIONS,
  categoryLabel,
  compactSignalTags,
  normalizeTerminalSearchQuery,
  normalizeSignalsPayload,
  relativeSignalTime,
  signalProvenanceParts,
  terminalFeedState,
  terminalSignalsUrl,
  terminalUrlWithState
} from './src/terminal/viewModel.mjs';

const TERMINAL_INITIAL_VISIBLE_LIMIT = 12;
const TERMINAL_PAGE_SIZE = 12;
const TERMINAL_MAX_VISIBLE_LIMIT = 60;
const TERMINAL_DESKTOP_SEARCH_DELAY = 300;
const TERMINAL_MOBILE_SEARCH_DELAY = 450;

if (typeof document !== 'undefined') {
  initTerminal();
  initDecodeLines();
}

// Text-decode effect for decorative readout lines. Targets are aria-hidden,
// so the transient garbage characters are never exposed to assistive tech.
function initDecodeLines() {
  const targets = Array.from(document.querySelectorAll('[data-scramble]'));
  if (!targets.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const GLYPHS = '01<>[]{}/\\|=+*#%$&@';

  targets.forEach((node) => {
    const final = node.textContent;
    let frame = 0;

    function tick() {
      const revealed = Math.floor(frame / 2);

      if (revealed > final.length) {
        node.textContent = final;
        return;
      }

      node.textContent = final
        .split('')
        .map((char, index) => (
          index < revealed || char === ' '
            ? char
            : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        ))
        .join('');

      frame += 1;
      window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  });
}

function initTerminal() {
  const filterHost = document.getElementById('terminal-filters');
  const list = document.getElementById('terminal-list');
  const empty = document.getElementById('terminal-empty');
  const notice = document.getElementById('terminal-notice');
  const status = document.getElementById('terminal-status');
  const refresh = document.getElementById('terminal-refresh');
  const sortHost = document.getElementById('terminal-sort');
  const searchForm = document.getElementById('terminal-search-form');
  const searchInput = document.getElementById('terminal-search');
  const searchClear = document.getElementById('terminal-search-clear');
  const searchSummary = document.getElementById('terminal-search-summary');
  const emptyKicker = document.getElementById('terminal-empty-kicker');
  const emptyTitle = document.getElementById('terminal-empty-title');
  const emptyCopy = document.getElementById('terminal-empty-copy');
  const loadMore = document.getElementById('terminal-load-more');

  if (
    !filterHost
    || !list
    || !empty
    || !notice
    || !status
    || !refresh
    || !sortHost
    || !searchForm
    || !searchInput
    || !searchClear
    || !searchSummary
    || !emptyKicker
    || !emptyTitle
    || !emptyCopy
    || !loadMore
  ) return;

  const initialFeedState = terminalFeedState(window.location.search);
  const initialNotices = [];
  if (initialFeedState.isUnknownChannel) initialNotices.push('WARN: unknown channel filter dropped.');
  if (initialFeedState.hasDeprecatedCategory) initialNotices.push('WARN: deprecated category filter dropped.');
  if (initialFeedState.isUnknownSort) initialNotices.push('WARN: unknown sort dropped.');

  const state = {
    channel: initialFeedState.channel,
    sort: initialFeedState.sort,
    q: initialFeedState.q,
    filterNotice: initialNotices.join(' '),
    loading: false,
    abortController: null,
    debounceTimer: null,
    requestSequence: 0,
    visibleLimit: TERMINAL_INITIAL_VISIBLE_LIMIT,
    hasMore: false,
    isComposing: false
  };

  if (
    initialFeedState.isUnknownChannel
    || initialFeedState.hasDeprecatedCategory
    || initialFeedState.isUnknownSort
    || initialFeedState.isNoncanonicalSort
    || initialFeedState.isNoncanonicalQuery
  ) {
    window.history.replaceState({}, '', terminalUrlWithState(window.location.href, {
      channel: state.channel,
      sort: state.sort,
      q: state.q
    }));
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

  function updateUrl() {
    window.history.replaceState({}, '', terminalUrlWithState(window.location.href, {
      channel: state.channel,
      sort: state.sort,
      q: state.q
    }));
  }

  function setSearchUi({ syncInput = true } = {}) {
    if (syncInput && searchInput.value !== state.q) searchInput.value = state.q;
    searchClear.hidden = !state.q;
    searchSummary.hidden = !state.q;
    searchSummary.textContent = state.q ? `RESULTS FOR "${state.q.toUpperCase()}"` : '';
  }

  function setActiveFilter() {
    filterHost.querySelectorAll('button[data-category]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.channel));
    });
  }

  function setActiveSort() {
    sortHost.querySelectorAll('button[data-sort]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.sort === state.sort));
    });
  }

  function setLoadMoreUi() {
    loadMore.hidden = !state.hasMore;
    loadMore.disabled = state.loading || state.visibleLimit >= TERMINAL_MAX_VISIBLE_LIMIT;
  }

  function resetPaging() {
    state.visibleLimit = TERMINAL_INITIAL_VISIBLE_LIMIT;
    state.hasMore = false;
    setLoadMoreUi();
  }

  function searchDebounceDelay() {
    if (typeof window.matchMedia !== 'function') return TERMINAL_DESKTOP_SEARCH_DELAY;

    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches
      ? TERMINAL_MOBILE_SEARCH_DELAY
      : TERMINAL_DESKTOP_SEARCH_DELAY;
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
        resetPaging();
        updateUrl();
        setActiveFilter();
        loadSignals();
      });
      return button;
    }));

    setActiveFilter();
  }

  function renderSorts() {
    sortHost.replaceChildren(...TERMINAL_SORT_OPTIONS.map((option) => {
      const button = el('button', 'terminal-sort__button mono', option.label);
      button.type = 'button';
      button.dataset.sort = option.value;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (state.sort === option.value) return;
        state.sort = option.value;
        resetPaging();
        updateUrl();
        setActiveSort();
        loadSignals();
      });
      return button;
    }));

    setActiveSort();
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

  function renderEmptyState() {
    if (state.q) {
      emptyKicker.textContent = 'ERR 404';
      emptyTitle.textContent = `ERR: no signals matched query "${state.q}".`;
      emptyCopy.textContent = 'try broader terms, or clear the channel filter.';
      return;
    }

    emptyKicker.textContent = 'IDLE';
    emptyTitle.textContent = 'awaiting first transmission...';
    emptyCopy.textContent = 'no signals in local store. stand by.';
  }

  function renderSignals(signals) {
    const visibleSignals = signals.slice(0, state.visibleLimit);
    state.hasMore = signals.length > visibleSignals.length && state.visibleLimit < TERMINAL_MAX_VISIBLE_LIMIT;

    list.replaceChildren(...visibleSignals.map(renderSignal));
    empty.hidden = visibleSignals.length > 0;
    if (!visibleSignals.length) renderEmptyState();
    setLoadMoreUi();

    return visibleSignals.length;
  }

  function renderFeedFailure() {
    list.replaceChildren();
    empty.hidden = true;
    state.hasMore = false;
    setLoadMoreUi();
  }

  function cancelActiveRequest() {
    if (!state.abortController) return;

    state.abortController.abort();
    state.abortController = null;
    state.requestSequence += 1;
    state.loading = false;
    refresh.disabled = false;
    setLoadMoreUi();
  }

  async function loadSignals() {
    if (state.debounceTimer) {
      window.clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }

    if (state.abortController) state.abortController.abort();

    const requestId = state.requestSequence + 1;
    const abortController = new AbortController();
    state.requestSequence = requestId;
    state.abortController = abortController;
    state.loading = true;
    refresh.disabled = true;
    setLoadMoreUi();
    updateStatus('Syncing', 'syncing');
    setNotice(state.filterNotice);
    state.filterNotice = '';
    const requestLimit = Math.min(state.visibleLimit + 1, TERMINAL_MAX_VISIBLE_LIMIT);

    const url = terminalSignalsUrl(window.location.origin, {
      channel: state.channel,
      sort: state.sort,
      q: state.q,
      limit: requestLimit
    });

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: abortController.signal
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || `Request failed (${response.status})`);
      }

      if (requestId !== state.requestSequence) return;

      const signals = normalizeSignalsPayload(payload);
      const visibleCount = renderSignals(signals);

      if (state.q) {
        updateStatus('Live · Search results', 'live');
      } else {
        const label = visibleCount === 1 ? '1 signal' : `${visibleCount} signals`;
        updateStatus(`Live · ${label}`, 'live');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (requestId !== state.requestSequence) return;

      console.warn('[terminal] signal feed unavailable:', error.message);
      renderFeedFailure();
      updateStatus('Offline', 'offline');
      setNotice('ERR: signal feed unreachable. connection dropped.');
    } finally {
      if (requestId === state.requestSequence) {
        state.loading = false;
        refresh.disabled = false;
        if (state.abortController === abortController) state.abortController = null;
        setLoadMoreUi();
      }
    }
  }

  function scheduleLoadSignals(delay = TERMINAL_DESKTOP_SEARCH_DELAY) {
    if (state.debounceTimer) window.clearTimeout(state.debounceTimer);

    if (delay <= 0) {
      state.debounceTimer = null;
      loadSignals();
      return;
    }

    state.debounceTimer = window.setTimeout(() => {
      state.debounceTimer = null;
      loadSignals();
    }, delay);
  }

  function applySearch(value, { immediate = false } = {}) {
    const nextQuery = normalizeTerminalSearchQuery(value);
    const changed = state.q !== nextQuery;
    state.q = nextQuery;
    updateUrl();
    setSearchUi({ syncInput: immediate });

    if (!changed && !immediate) return;
    if (changed) {
      cancelActiveRequest();
      resetPaging();
    }
    scheduleLoadSignals(immediate ? 0 : searchDebounceDelay());
  }

  function clearSearch() {
    const hadSearch = Boolean(state.q || searchInput.value);
    if (!hadSearch) return;

    state.q = '';
    resetPaging();
    updateUrl();
    setSearchUi();
    loadSignals();
    searchInput.focus();
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.isComposing) return;
    applySearch(searchInput.value, { immediate: true });
  });

  searchInput.addEventListener('input', () => {
    if (state.isComposing) return;
    applySearch(searchInput.value);
  });

  searchInput.addEventListener('compositionstart', () => {
    state.isComposing = true;
  });

  searchInput.addEventListener('compositionend', () => {
    state.isComposing = false;
    applySearch(searchInput.value);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (state.q || searchInput.value)) {
      event.preventDefault();
      clearSearch();
    }
  });

  searchClear.addEventListener('click', () => {
    clearSearch();
  });

  refresh.addEventListener('click', () => {
    if (!state.loading) loadSignals();
  });

  loadMore.addEventListener('click', () => {
    if (state.loading || !state.hasMore) return;

    state.visibleLimit = Math.min(
      state.visibleLimit + TERMINAL_PAGE_SIZE,
      TERMINAL_MAX_VISIBLE_LIMIT
    );
    loadSignals();
  });

  renderFilters();
  renderSorts();
  setSearchUi();
  setLoadMoreUi();
  loadSignals();
}
