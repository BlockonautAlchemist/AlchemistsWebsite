// Alchemist Streamers Hub - cinematic carousel client.
//
// The approved registry renders immediately, then /api/streamers layers Twitch
// status (and a recent VOD per creator) onto the same frontend shape without
// changing the backend contract.
//
// Rendering model: one persistent "stage card" per streamer. Navigation only
// re-assigns CSS position classes (active / prev / next / far / hidden) so the
// browser can transition transform + opacity + filter for a seamless slide.
// Only the ACTIVE card mounts media (a live Twitch embed, a recent-VOD poster,
// or a branded fallback) — side cards never load an iframe.

import alchemistStreamers from './src/data/streamers.json';
import {
  baselineFromRegistry,
  buildTwitchEmbedUrl,
  monogram,
  relativeTimeLabel,
  selectActiveStreamer,
  sortStreamers,
  twitchVideoId,
  viewerCountLabel
} from './src/streamers/viewModel.mjs';

const API_URL = '/api/streamers';
const REFRESH_MS = 90 * 1000;
const ROTATION_MS = 8 * 1000;
const TRANSITION_MS = 520;
const SWIPE_THRESHOLD = 48;
const LOGO_MARK = 'assets/logo-mark.png';

if (typeof document !== 'undefined') {
  initStreamersHub();
}

function initStreamersHub() {
  const carousel = document.getElementById('sh-carousel');
  const viewport = document.getElementById('sh-carousel-viewport');
  const track = document.getElementById('sh-carousel-track');
  const prevButton = document.getElementById('sh-carousel-prev');
  const nextButton = document.getElementById('sh-carousel-next');
  const notice = document.getElementById('sh-notice');
  const updated = document.getElementById('sh-updated');

  if (!carousel || !viewport || !track || !prevButton || !nextButton) return;

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    roster: [],
    cards: [],
    activeIndex: 0,
    stageKey: '',
    manualSelection: false,
    rotationPaused: false,
    isAnimating: false,
    refreshTimer: null,
    rotationTimer: null,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    didDrag: false
  };

  let heightObserver = null;

  // -------------------------------------------------------------- helpers ---
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function loginOf(streamer) {
    return String((streamer && streamer.twitchUsername) || '').trim().toLowerCase();
  }

  function activeStreamer() {
    return state.roster[state.activeIndex] || null;
  }

  function currentActiveLogin() {
    return loginOf(state.roster[state.activeIndex]);
  }

  function displayHandle(streamer) {
    return `@${streamer.twitchUsername}`;
  }

  function statusText(streamer) {
    if (streamer.isLive) return streamer.streamTitle || `${streamer.displayName} is live now`;
    if (streamer.latestVideoUrl) return 'Catch the latest stream replay.';
    return 'Offline — follow for the next stream.';
  }

  function getEmbedParent() {
    return window.location && window.location.hostname ? window.location.hostname : '';
  }

  function canEmbedTwitch() {
    return Boolean(getEmbedParent());
  }

  // ------------------------------------------------------ shared visuals ---
  function createAvatar(streamer, className, { lazy = true } = {}) {
    if (streamer.avatarUrl) {
      const img = el('img', className);
      img.src = streamer.avatarUrl;
      img.alt = '';
      img.decoding = 'async';
      if (lazy) img.loading = 'lazy';
      return img;
    }
    return el('span', `${className} ${className}--mono`, monogram(streamer.displayName));
  }

  function createBrandArt(streamer, modifier = '') {
    const art = el('div', `sh-brand-art${modifier ? ` ${modifier}` : ''}`);

    if (streamer.avatarUrl) {
      const avatar = el('img', 'sh-brand-art__avatar');
      avatar.src = streamer.avatarUrl;
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
      art.appendChild(avatar);
    } else {
      const logo = el('img', 'sh-brand-art__logo');
      logo.src = LOGO_MARK;
      logo.alt = '';
      logo.loading = 'lazy';
      logo.decoding = 'async';
      art.appendChild(logo);
    }

    art.appendChild(el('span', 'sh-brand-art__mono display', monogram(streamer.displayName)));
    return art;
  }

  function createPreviewVisual(streamer, { compact = false } = {}) {
    const visual = el('div', compact ? 'sh-preview-visual sh-preview-visual--compact' : 'sh-preview-visual');

    if (streamer.thumbnailUrl) {
      const img = el('img', 'sh-preview-visual__image');
      img.src = streamer.thumbnailUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      visual.appendChild(img);
    } else {
      visual.appendChild(createBrandArt(streamer, compact ? 'sh-brand-art--compact' : ''));
    }

    visual.appendChild(el('span', 'sh-preview-visual__shade'));
    return visual;
  }

  function createStatusBadge(streamer) {
    const badge = el('span', `sh-status-badge mono${streamer.isLive ? ' is-live' : ''}`);
    badge.appendChild(el('span', 'sh-status-badge__dot'));
    badge.appendChild(document.createTextNode(streamer.isLive ? 'LIVE' : 'OFFLINE'));
    return badge;
  }

  function makeEmbedIframe(src, title, fallbackFactory) {
    const iframe = el('iframe', 'sh-media__iframe');
    iframe.title = title;
    iframe.src = src;
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'eager';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.addEventListener('error', () => {
      const parent = iframe.parentNode;
      if (parent) parent.replaceChildren(fallbackFactory());
    });
    return iframe;
  }

  // -------------------------------------------------------- media content ---
  function createLiveIframe(streamer) {
    const src = buildTwitchEmbedUrl({
      channel: streamer.twitchUsername,
      parent: getEmbedParent(),
      autoplay: true,
      muted: true
    });
    if (!src) return createFallback(streamer, { mode: 'live' });
    return makeEmbedIframe(src, `${streamer.displayName} Twitch player`, () => createFallback(streamer, { mode: 'live' }));
  }

  function createVodPoster(streamer, card) {
    const wrap = el('div', 'sh-vod');

    if (streamer.latestVideoThumbnailUrl) {
      const img = el('img', 'sh-vod__image');
      img.src = streamer.latestVideoThumbnailUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      wrap.appendChild(img);
    } else {
      wrap.appendChild(createBrandArt(streamer));
    }

    wrap.appendChild(el('span', 'sh-vod__shade'));

    const content = el('div', 'sh-vod__content');
    content.appendChild(el('span', 'sh-vod__kicker mono', 'Latest stream'));
    const title = el('p', 'sh-vod__title display', streamer.latestVideoTitle || streamer.displayName);
    title.title = title.textContent;
    content.appendChild(title);
    const when = relativeTimeLabel(streamer.latestVideoCreatedAt);
    if (when) content.appendChild(el('span', 'sh-vod__meta mono', when));

    const play = el('button', 'sh-vod__play');
    play.type = 'button';
    play.setAttribute('aria-label', `Play ${streamer.displayName}'s latest stream`);
    play.appendChild(el('span', 'sh-vod__play-icon', '▶'));
    play.appendChild(el('span', 'sh-vod__play-label', 'Play recent stream'));
    play.addEventListener('click', (event) => {
      event.stopPropagation();
      state.manualSelection = true;
      stopRotation();
      const id = twitchVideoId(streamer.latestVideoUrl);
      const src = id && canEmbedTwitch()
        ? buildTwitchEmbedUrl({ video: id, parent: getEmbedParent(), autoplay: true, muted: true })
        : null;
      if (!src) {
        window.open(streamer.latestVideoUrl || streamer.twitchUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      card.media.replaceChildren(
        makeEmbedIframe(src, `${streamer.displayName} recent stream`, () => createVodPoster(streamer, card))
      );
    });
    content.appendChild(play);

    wrap.appendChild(content);
    return wrap;
  }

  function createFallback(streamer, { mode = 'offline' } = {}) {
    const live = mode === 'live';
    const wrap = el('div', `sh-fallback${live ? ' sh-fallback--live' : ''}`);
    wrap.appendChild(createBrandArt(streamer));
    wrap.appendChild(el('span', 'sh-fallback__glow'));

    const content = el('div', 'sh-fallback__content');
    content.appendChild(el('span', 'sh-fallback__kicker mono', live ? 'Live now on Twitch' : 'Alchemist creator'));
    const title = el('p', 'sh-fallback__title display', live ? (streamer.streamTitle || streamer.displayName) : streamer.displayName);
    title.title = title.textContent;
    content.appendChild(title);
    content.appendChild(el(
      'p',
      'sh-fallback__copy',
      live ? 'This stream is live — tap to watch on Twitch.' : 'Latest content coming soon. Follow for the next stream.'
    ));

    if (streamer.twitchUrl) {
      const cta = el('a', 'btn btn-primary', 'Watch on Twitch');
      cta.href = streamer.twitchUrl;
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
      cta.setAttribute('data-action', 'watch-twitch');
      content.appendChild(cta);
    }

    wrap.appendChild(content);
    return wrap;
  }

  function createSidePreview(streamer) {
    const frag = document.createDocumentFragment();
    frag.appendChild(createPreviewVisual(streamer, { compact: true }));

    const overlay = el('div', 'sh-card__media-name');
    const name = el('span', 'sh-card__media-name-text display', streamer.displayName);
    name.title = streamer.displayName;
    overlay.appendChild(name);
    overlay.appendChild(createStatusBadge(streamer));
    frag.appendChild(overlay);
    return frag;
  }

  // ----------------------------------------------------------- card build ---
  function createCard(streamer) {
    const node = el('article', 'sh-card');
    node.setAttribute('data-login', loginOf(streamer));
    node.setAttribute('role', 'group');

    const media = el('div', 'sh-card__media');
    node.appendChild(media);

    const info = el('div', 'sh-card__info');

    const id = el('div', 'sh-card__id');
    const avatarHost = el('span', 'sh-card__avatar-host');
    id.appendChild(avatarHost);
    const idtext = el('div', 'sh-card__idtext');
    const name = el('h2', 'sh-card__name display');
    const handle = el('p', 'sh-card__handle mono');
    idtext.appendChild(name);
    idtext.appendChild(handle);
    id.appendChild(idtext);
    const badgeHost = el('span', 'sh-card__badge-host');
    id.appendChild(badgeHost);
    info.appendChild(id);

    const title = el('p', 'sh-card__title');
    info.appendChild(title);

    const viewers = el('p', 'sh-card__viewers mono');
    info.appendChild(viewers);

    const actions = el('div', 'sh-card__actions');
    const watch = el('a', 'btn btn-primary', 'Watch on Twitch');
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    watch.setAttribute('data-action', 'watch-twitch');
    actions.appendChild(watch);
    info.appendChild(actions);

    node.appendChild(info);

    const card = { node, media, avatarHost, name, handle, badgeHost, title, viewers, watch, mediaKey: null };

    node.addEventListener('click', () => {
      if (state.didDrag) return;
      const index = state.cards.indexOf(card);
      if (index < 0 || index === state.activeIndex) return; // active card: let inner controls work
      selectStreamer(loginOf(state.roster[index]), { manual: true });
    });

    return card;
  }

  function updateCardData(card, streamer) {
    card.node.setAttribute('data-login', loginOf(streamer));
    card.avatarHost.replaceChildren(createAvatar(streamer, 'sh-card__avatar', { lazy: false }));
    card.name.textContent = streamer.displayName;
    card.handle.textContent = displayHandle(streamer);
    card.badgeHost.replaceChildren(createStatusBadge(streamer));

    const text = statusText(streamer);
    card.title.textContent = text;
    card.title.title = text;

    const viewers = streamer.isLive ? viewerCountLabel(streamer) : null;
    card.viewers.textContent = viewers || '';
    card.viewers.hidden = !viewers;

    card.watch.href = streamer.twitchUrl;
    card.watch.setAttribute('data-login', loginOf(streamer));
  }

  // What the active card's media depends on — used to skip needless rebuilds
  // (and avoid tearing down a mounted live iframe on every layout pass).
  function mediaKey(streamer, isActive) {
    return [
      isActive ? 'A' : 'S',
      streamer.isLive ? 'L' : 'O',
      streamer.thumbnailUrl || '',
      streamer.latestVideoUrl || '',
      streamer.avatarUrl || ''
    ].join('|');
  }

  function setCardMedia(card, streamer, isActive) {
    if (!isActive) {
      card.media.replaceChildren(createSidePreview(streamer));
      return;
    }
    if (streamer.isLive) {
      card.media.replaceChildren(
        canEmbedTwitch() ? createLiveIframe(streamer) : createFallback(streamer, { mode: 'live' })
      );
      return;
    }
    if (streamer.latestVideoUrl) {
      card.media.replaceChildren(createVodPoster(streamer, card));
      return;
    }
    card.media.replaceChildren(createFallback(streamer, { mode: 'offline' }));
  }

  // ------------------------------------------------------------ the stage ---
  function buildStage() {
    track.replaceChildren();
    state.cards = state.roster.map((streamer) => {
      const card = createCard(streamer);
      track.appendChild(card.node);
      updateCardData(card, streamer);
      return card;
    });
    observeActiveHeight();
  }

  function renderEmpty() {
    if (heightObserver) heightObserver.disconnect();
    track.style.height = '';
    track.replaceChildren();

    const node = el('article', 'sh-card is-active');
    const media = el('div', 'sh-card__media');
    const wrap = el('div', 'sh-fallback');
    wrap.appendChild(createBrandArt({ displayName: 'Alchemists' }));
    wrap.appendChild(el('span', 'sh-fallback__glow'));
    const content = el('div', 'sh-fallback__content');
    content.appendChild(el('span', 'sh-fallback__kicker mono', 'Streamers Hub'));
    content.appendChild(el('p', 'sh-fallback__title display', 'No creators found'));
    content.appendChild(el('p', 'sh-fallback__copy', 'Join the Discord to find Alchemist creators.'));
    const cta = el('a', 'btn btn-primary', 'Join the Discord');
    cta.href = 'https://discord.com/invite/WaReRAXHHE';
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.setAttribute('data-action', 'join-discord');
    content.appendChild(cta);
    wrap.appendChild(content);
    media.appendChild(wrap);
    node.appendChild(media);
    track.appendChild(node);

    prevButton.disabled = true;
    nextButton.disabled = true;
  }

  function wrapOffset(delta, n) {
    let d = ((delta % n) + n) % n; // 0..n-1
    if (d > n / 2) d -= n;
    return d;
  }

  function classForOffset(d) {
    if (d === 0) return 'is-active';
    if (d === 1) return 'is-next';
    if (d === -1) return 'is-prev';
    if (d === 2) return 'is-far-next';
    if (d === -2) return 'is-far-prev';
    return 'is-hidden';
  }

  function layoutStage() {
    const n = state.cards.length;
    if (!n) return;

    state.cards.forEach((card, i) => {
      const d = wrapOffset(i - state.activeIndex, n);
      const cls = classForOffset(d);
      const isActive = cls === 'is-active';

      card.node.className = `sh-card ${cls}`;
      card.node.setAttribute('aria-hidden', String(!isActive));
      if (isActive) card.node.setAttribute('aria-current', 'true');
      else card.node.removeAttribute('aria-current');

      const streamer = state.roster[i];
      const key = mediaKey(streamer, isActive);
      if (card.mediaKey !== key) {
        setCardMedia(card, streamer, isActive);
        card.mediaKey = key;
      }
    });

    prevButton.disabled = n < 2;
    nextButton.disabled = n < 2;

    const active = activeStreamer();
    if (active) {
      carousel.setAttribute('aria-label', `Featured Alchemist streamers, ${active.displayName} selected`);
    }

    requestAnimationFrame(setStageHeight);
  }

  function observeActiveHeight() {
    if (heightObserver) heightObserver.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    heightObserver = new ResizeObserver(() => setStageHeight());
    state.cards.forEach((card) => heightObserver.observe(card.node));
  }

  function setStageHeight() {
    const card = state.cards[state.activeIndex];
    if (!card) return;
    const height = card.node.offsetHeight;
    if (height) track.style.height = `${height}px`;
  }

  // -------------------------------------------------------- data + layout ---
  function setRoster(streamers) {
    const nextRoster = sortStreamers(Array.isArray(streamers) ? streamers : []);

    if (!nextRoster.length) {
      state.roster = [];
      state.cards = [];
      state.stageKey = '';
      renderEmpty();
      syncRotation();
      return;
    }

    const preferred = state.manualSelection ? currentActiveLogin() : null;
    const selected = selectActiveStreamer(nextRoster, preferred);
    const selectedLogin = selected ? loginOf(selected) : loginOf(nextRoster[0]);
    const nextKey = nextRoster.map(loginOf).join('|');

    state.roster = nextRoster;

    // Suppress transitions for data-driven updates (initial load, live refreshes);
    // only user navigation should animate.
    track.classList.add('sh-stage--no-anim');

    if (nextKey !== state.stageKey) {
      buildStage();
      state.stageKey = nextKey;
    } else {
      nextRoster.forEach((streamer, i) => updateCardData(state.cards[i], streamer));
    }

    state.activeIndex = Math.max(0, state.roster.findIndex((streamer) => loginOf(streamer) === selectedLogin));
    layoutStage();

    requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove('sh-stage--no-anim')));
    syncRotation();
  }

  // ----------------------------------------------------------- navigation ---
  function commitActive(targetIndex, { manual = false } = {}) {
    const n = state.cards.length;
    if (n < 2) return;
    const idx = ((targetIndex % n) + n) % n;
    if (idx === state.activeIndex) return;
    if (state.isAnimating) return; // debounce rapid input during a slide

    if (manual) {
      state.manualSelection = true;
      stopRotation();
    }

    state.activeIndex = idx;
    layoutStage();
    syncRotation();
    if (!reducedMotion) lockTransition();
  }

  function lockTransition() {
    state.isAnimating = true;
    const card = state.cards[state.activeIndex];
    let timer = null;

    const finish = () => {
      if (timer) window.clearTimeout(timer);
      if (card) card.node.removeEventListener('transitionend', onEnd);
      state.isAnimating = false;
    };
    const onEnd = (event) => {
      if (event.propertyName === 'transform') finish();
    };

    if (card) card.node.addEventListener('transitionend', onEnd);
    timer = window.setTimeout(finish, TRANSITION_MS + 120);
  }

  function moveActive(delta, options = {}) {
    commitActive(state.activeIndex + delta, options);
  }

  function selectStreamer(login, options = {}) {
    const index = state.roster.findIndex((streamer) => loginOf(streamer) === login);
    if (index < 0) return;
    commitActive(index, options);
  }

  // ------------------------------------------------------------- rotation ---
  function canRotate() {
    const active = activeStreamer();
    return !reducedMotion
      && !state.manualSelection
      && !state.rotationPaused
      && !document.hidden
      && state.roster.length > 1
      && !(active && active.isLive);
  }

  function startRotation() {
    stopRotation();
    if (!canRotate()) return;
    state.rotationTimer = window.setInterval(() => {
      if (canRotate()) moveActive(1);
    }, ROTATION_MS);
  }

  function stopRotation() {
    if (state.rotationTimer) {
      window.clearInterval(state.rotationTimer);
      state.rotationTimer = null;
    }
  }

  function syncRotation() {
    startRotation();
  }

  function setRotationPaused(paused) {
    state.rotationPaused = paused;
    syncRotation();
  }

  // ----------------------------------------------------------- status UI ---
  function showNotice(reason) {
    if (!notice) return;
    if (!reason) {
      notice.hidden = true;
      notice.textContent = '';
      return;
    }

    const messages = {
      'missing-twitch-credentials':
        'Live status is off in this environment because Twitch is not configured here. Showing every Alchemist creator.',
      'twitch-unavailable':
        'Live status could not be loaded right now. Showing every Alchemist creator with Twitch links.'
    };

    notice.textContent = messages[reason] || messages['twitch-unavailable'];
    notice.hidden = false;
  }

  function setUpdated(date) {
    if (!updated) return;
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updated.textContent = `Live status updated ${time}`;
  }

  async function refresh() {
    try {
      const res = await fetch(API_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (!data || !Array.isArray(data.streamers)) throw new Error('Malformed response');

      setRoster(data.streamers);
      showNotice(data.degraded ? data.reason : null);
      setUpdated(new Date(data.fetchedAt || Date.now()));
    } catch (error) {
      console.warn('[streamers] live status unavailable:', error.message);
      showNotice('twitch-unavailable');
    }
  }

  function startRefreshTimer() {
    stopRefreshTimer();
    state.refreshTimer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  function stopRefreshTimer() {
    if (state.refreshTimer) {
      window.clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  // ------------------------------------------------------------- controls ---
  function handleCarouselKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    if (state.roster.length < 2) return;
    event.preventDefault();

    if (event.key === 'Home') {
      selectStreamer(loginOf(state.roster[0]), { manual: true });
      return;
    }
    if (event.key === 'End') {
      selectStreamer(loginOf(state.roster[state.roster.length - 1]), { manual: true });
      return;
    }
    moveActive(event.key === 'ArrowRight' ? 1 : -1, { manual: true });
  }

  function handlePointerDown(event) {
    if (!event.isPrimary || state.roster.length < 2) return;
    state.dragPointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.didDrag = false;
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (state.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      state.didDrag = true;
      carousel.classList.add('is-dragging');
    }
  }

  function handlePointerEnd(event) {
    if (state.dragPointerId !== event.pointerId) return;
    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;
    const didSwipe = Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy);

    state.dragPointerId = null;
    carousel.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);

    if (didSwipe) moveActive(dx < 0 ? 1 : -1, { manual: true });
    window.setTimeout(() => { state.didDrag = false; }, 0);
  }

  prevButton.addEventListener('click', () => moveActive(-1, { manual: true }));
  nextButton.addEventListener('click', () => moveActive(1, { manual: true }));
  carousel.addEventListener('keydown', handleCarouselKeydown);
  carousel.addEventListener('pointerenter', () => setRotationPaused(true));
  carousel.addEventListener('pointerleave', () => setRotationPaused(false));
  carousel.addEventListener('focusin', () => setRotationPaused(true));
  carousel.addEventListener('focusout', (event) => {
    if (!carousel.contains(event.relatedTarget)) setRotationPaused(false);
  });
  viewport.addEventListener('pointerdown', handlePointerDown);
  viewport.addEventListener('pointermove', handlePointerMove);
  viewport.addEventListener('pointerup', handlePointerEnd);
  viewport.addEventListener('pointercancel', handlePointerEnd);
  window.addEventListener('resize', () => setStageHeight());

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
    syncRotation();
  });

  window.addEventListener('beforeunload', () => {
    stopRefreshTimer();
    stopRotation();
    if (heightObserver) heightObserver.disconnect();
  });

  setRoster(baselineFromRegistry(alchemistStreamers));
  if (updated) updated.textContent = 'Checking live status...';
  refresh();
  startRefreshTimer();
}
