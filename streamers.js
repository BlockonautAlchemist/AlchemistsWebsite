// Alchemist Streamers Hub — client.
//
// Renders the streamer roster and live status. The approved registry is bundled in
// (single source of truth: src/data/streamers.json) so the page renders immediately
// and still works when /api/streamers is unreachable (e.g. plain `vite` dev with no
// serverless functions). Live status is layered on top from /api/streamers.
//
// Cards are built with the DOM API (createElement / textContent) rather than HTML
// strings so Twitch-provided text (stream titles, game names) can never inject markup.
//
// TODO(v2): outbound clicks are tagged with data-streamer / data-action attributes so
//   an analytics provider (none exists in the project yet) can later track partner
//   proof — watch-throughs, stream hours, clips, VODs, and event participation.

import alchemistStreamers from './src/data/streamers.json';
import {
  baselineFromRegistry,
  sortStreamers,
  formatViewers,
  monogram
} from './src/streamers/viewModel.mjs';

const API_URL = '/api/streamers';
const REFRESH_MS = 90 * 1000;
const THUMB_WIDTH = 440;
const THUMB_HEIGHT = 248;

// --- Browser-only rendering --------------------------------------------------
// Guarded so static analysis and non-browser tools can load the module safely.
if (typeof document !== 'undefined') {
  initStreamersHub();
}

function initStreamersHub() {
  const liveGrid = document.getElementById('sh-live-grid');
  const offlineGrid = document.getElementById('sh-offline-grid');
  const liveEmpty = document.getElementById('sh-live-empty');
  const notice = document.getElementById('sh-notice');
  const updated = document.getElementById('sh-updated');

  if (!liveGrid || !offlineGrid) return;

  let refreshTimer = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function watchLink(streamer, { live }) {
    const a = el('a', `btn ${live ? 'btn-primary' : 'btn-purple'} sh-card__cta`, live ? 'Watch Live' : 'Watch on Twitch');
    a.href = streamer.twitchUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('data-streamer', streamer.twitchUsername);
    a.setAttribute('data-action', live ? 'watch-live' : 'watch-twitch');
    return a;
  }

  function tagList(games) {
    const wrap = el('ul', 'sh-tags');
    games.slice(0, 4).forEach((game) => {
      const li = el('li', 'sh-tag', game);
      wrap.appendChild(li);
    });
    return wrap;
  }

  function avatar(streamer) {
    if (streamer.avatarUrl) {
      const img = el('img', 'sh-card__avatar');
      img.src = streamer.avatarUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      return img;
    }
    return el('span', 'sh-card__avatar sh-card__avatar--mono', monogram(streamer.displayName));
  }

  function liveCard(streamer) {
    const card = el('article', 'sh-card sh-card--live');
    card.setAttribute('data-streamer', streamer.twitchUsername);

    const media = el('a', 'sh-card__media');
    media.href = streamer.twitchUrl;
    media.target = '_blank';
    media.rel = 'noopener noreferrer';
    media.setAttribute('data-streamer', streamer.twitchUsername);
    media.setAttribute('data-action', 'watch-live');
    media.setAttribute('aria-label', `Watch ${streamer.displayName} live on Twitch`);

    if (streamer.thumbnailUrl) {
      const thumb = el('img', 'sh-card__thumb');
      thumb.src = streamer.thumbnailUrl;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.width = THUMB_WIDTH;
      thumb.height = THUMB_HEIGHT;
      media.appendChild(thumb);
    } else {
      media.appendChild(el('div', 'sh-card__thumb sh-card__thumb--placeholder'));
    }

    const badge = el('span', 'sh-live-badge');
    badge.appendChild(el('span', 'sh-live-badge__dot'));
    badge.appendChild(el('span', null, 'LIVE'));
    media.appendChild(badge);

    const viewers = formatViewers(streamer.viewerCount);
    if (viewers) {
      const v = el('span', 'sh-viewers mono');
      v.appendChild(el('span', 'sh-viewers__dot'));
      v.appendChild(el('span', null, `${viewers} watching`));
      media.appendChild(v);
    }
    card.appendChild(media);

    const body = el('div', 'sh-card__body');
    const nameRow = el('div', 'sh-card__avatar-row');
    nameRow.appendChild(avatar(streamer));
    nameRow.appendChild(el('h3', 'sh-card__name display', streamer.displayName));
    body.appendChild(nameRow);

    if (streamer.streamTitle) body.appendChild(el('p', 'sh-card__title', streamer.streamTitle));
    if (streamer.gameName) {
      const game = el('p', 'sh-card__game mono');
      game.appendChild(el('span', 'sh-card__game-label', 'Playing'));
      game.appendChild(el('span', null, streamer.gameName));
      body.appendChild(game);
    }
    body.appendChild(watchLink(streamer, { live: true }));
    card.appendChild(body);
    return card;
  }

  function offlineCard(streamer) {
    const card = el('article', 'sh-card sh-card--offline');
    card.setAttribute('data-streamer', streamer.twitchUsername);

    const head = el('div', 'sh-card__avatar-row');
    head.appendChild(avatar(streamer));
    const heading = el('div', 'sh-card__heading');
    heading.appendChild(el('h3', 'sh-card__name display', streamer.displayName));
    const discord = el('p', 'sh-card__discord mono');
    discord.appendChild(el('span', 'sh-card__discord-mark', '@'));
    discord.appendChild(el('span', null, streamer.discordName));
    heading.appendChild(discord);
    head.appendChild(heading);
    card.appendChild(head);

    if (streamer.bio) card.appendChild(el('p', 'sh-card__bio', streamer.bio));
    if (streamer.preferredGames.length) card.appendChild(tagList(streamer.preferredGames));
    card.appendChild(watchLink(streamer, { live: false }));
    return card;
  }

  function render(streamers) {
    const sorted = sortStreamers(streamers);
    const live = sorted.filter((s) => s.isLive);
    const offline = sorted.filter((s) => !s.isLive);

    liveGrid.replaceChildren(...live.map(liveCard));
    offlineGrid.replaceChildren(...offline.map(offlineCard));

    if (liveEmpty) liveEmpty.hidden = live.length > 0;
  }

  function showNotice(reason) {
    if (!notice) return;
    if (!reason) {
      notice.hidden = true;
      notice.textContent = '';
      return;
    }
    const messages = {
      'missing-twitch-credentials':
        'Live status is off in this environment (Twitch isn’t configured here). Showing every Alchemist creator — visit their channels on Twitch.',
      'twitch-unavailable':
        'Live status couldn’t be loaded right now. Showing every Alchemist creator — visit their channels on Twitch.'
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

      render(data.streamers);
      showNotice(data.degraded ? data.reason : null);
      setUpdated(new Date(data.fetchedAt || Date.now()));
    } catch (error) {
      // Network error or no /api in this environment: keep the bundled roster visible.
      console.warn('[streamers] live status unavailable:', error.message);
      showNotice('twitch-unavailable');
    }
  }

  function startTimer() {
    stopTimer();
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  function stopTimer() {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // Render the bundled roster immediately (offline) so there is no empty flash,
  // then layer live status on top.
  render(baselineFromRegistry(alchemistStreamers));
  if (updated) updated.textContent = 'Checking live status…';
  refresh();
  startTimer();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  window.addEventListener('beforeunload', stopTimer);
}
