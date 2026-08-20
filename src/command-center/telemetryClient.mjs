import {
  fallbackCommandCenterState,
  normalizePublicState
} from './stateModel.mjs';

const DEFAULT_ENDPOINT = '/api/command-center/state';

function visibleDelay({ visible, baseIntervalMs, hiddenIntervalMs, backoffMs }) {
  if (!visible) return Math.max(hiddenIntervalMs, backoffMs);
  return Math.max(baseIntervalMs, backoffMs);
}

function nextBackoff(current, maxBackoffMs) {
  if (!current) return 2000;
  return Math.min(current * 1.8, maxBackoffMs);
}

function jitter(ms) {
  return Math.round(ms * (0.86 + Math.random() * 0.28));
}

export function createTelemetryClient({
  endpoint = DEFAULT_ENDPOINT,
  baseIntervalMs = 5000,
  hiddenIntervalMs = 60000,
  maxBackoffMs = 60000,
  historyLimit = 30,
  onState = () => {},
  onStatus = () => {}
} = {}) {
  let running = false;
  let timer = 0;
  let controller = null;
  let backoffMs = 0;
  let lastGoodState = null;

  function clearTimer() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
  }

  function isVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  function stateUrl() {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set('historyLimit', String(historyLimit));
    return url;
  }

  function schedule() {
    if (!running) return;

    clearTimer();
    const delay = visibleDelay({
      visible: isVisible(),
      baseIntervalMs,
      hiddenIntervalMs,
      backoffMs
    });

    timer = window.setTimeout(() => {
      poll();
    }, jitter(delay));
  }

  async function poll({ manual = false } = {}) {
    if (!running && !manual) return;

    if (controller) controller.abort();
    controller = new AbortController();
    onStatus({ status: lastGoodState ? 'syncing' : 'connecting', lastGoodState });

    try {
      const response = await fetch(stateUrl(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || `Request failed (${response.status})`);
      }

      const normalized = normalizePublicState(payload);
      lastGoodState = normalized;
      backoffMs = 0;
      onState(normalized);
      onStatus({ status: 'live', state: normalized });
    } catch (error) {
      if (error.name === 'AbortError') return;

      backoffMs = nextBackoff(backoffMs, maxBackoffMs);
      onStatus({ status: 'offline', error, lastGoodState });

      if (!lastGoodState) {
        onState(fallbackCommandCenterState({
          message: error.message || 'Telemetry unavailable'
        }));
      }
    } finally {
      controller = null;
      if (running) schedule();
    }
  }

  function start() {
    if (running) return;
    running = true;
    onStatus({ status: 'connecting', lastGoodState });
    poll();
  }

  function stop() {
    running = false;
    clearTimer();
    if (controller) controller.abort();
    controller = null;
  }

  function refresh() {
    clearTimer();
    return poll({ manual: true });
  }

  function handleVisibilityChange() {
    if (!running) return;
    if (isVisible()) refresh();
    else schedule();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    refresh,
    start,
    stop
  };
}
