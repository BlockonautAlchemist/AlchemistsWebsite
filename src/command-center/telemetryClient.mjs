import { fallbackCommandCenterState, normalizePublicState, validPublicPayload } from './stateModel.mjs';

/** One owner per request, plus a clock that keeps expiry moving during outages. */
export function createTelemetryClient({
  endpoint = '/api/command-center/state', agent = 'spawncamper9000',
  baseIntervalMs = 5000, hiddenIntervalMs = 60000, maxBackoffMs = 60000,
  timeoutMs = 10000, historyLimit = 30, onState = () => {}, onStatus = () => {},
  fetchImpl = globalThis.fetch, clock = () => Date.now(), timers = globalThis,
  documentRef = globalThis.document, origin = globalThis.location?.origin || 'http://localhost'
} = {}) {
  let running = false, disposed = false, generation = 0, request = null;
  let pollTimer, expiryTimer, backoffMs = 0, rawState = null, lastGoodState = null;
  let serverTime = 0, receivedTime = 0, publishedSignature = '';
  const visible = () => documentRef?.visibilityState !== 'hidden';
  const alignedNow = () => serverTime + Math.max(0, clock() - receivedTime);
  const clearPoll = () => { timers.clearTimeout(pollTimer); pollTimer = undefined; };
  function publish() {
    if (!running || !rawState) return;
    const next = normalizePublicState(rawState, alignedNow(), { previousState: lastGoodState, agent });
    const signature = JSON.stringify(next);
    lastGoodState = next;
    if (signature !== publishedSignature) { publishedSignature = signature; onState(next); }
  }
  function scheduleExpiry() {
    timers.clearTimeout(expiryTimer);
    if (!running) return;
    expiryTimer = timers.setTimeout(() => { publish(); scheduleExpiry(); }, 250);
  }
  function schedulePoll() {
    clearPoll();
    if (!running) return;
    pollTimer = timers.setTimeout(poll, Math.max(visible() ? baseIntervalMs : hiddenIntervalMs, backoffMs));
  }
  function cancelRequest() {
    generation += 1;
    if (request) { timers.clearTimeout(request.timeout); request.controller.abort(); request.cancel?.(); request = null; }
  }
  async function poll() {
    if (!running) return;
    clearPoll();
    cancelRequest();
    const own = { generation, controller: new AbortController() };
    request = own;
    const current = () => running && request === own && generation === own.generation;
    onStatus({ status: lastGoodState ? 'syncing' : 'connecting', lastGoodState });
    try {
      const url = new URL(endpoint, origin);
      url.searchParams.set('historyLimit', String(historyLimit));
      if (agent) url.searchParams.set('agent', agent);
      // Race the whole response, including JSON parsing. Aborting fetch alone is
      // insufficient for transports that ignore AbortSignal or stall in body reads.
      const payload = await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: own.controller.signal });
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          const body = await response.json();
          if (!validPublicPayload(body)) throw new Error('Malformed telemetry snapshot');
          return body;
        })(),
        new Promise((_, reject) => {
          own.cancel = () => reject(new Error('Telemetry request superseded'));
          own.timeout = timers.setTimeout(() => {
            own.controller.abort(); reject(new Error('Telemetry request timed out'));
          }, timeoutMs);
        })
      ]);
      if (!current()) return;
      const timestamp = Date.parse(payload.fetchedAt);
      if (rawState && timestamp < Date.parse(rawState.fetchedAt)) throw new Error('Older telemetry snapshot ignored');
      // A cached snapshot must not rewind the expiry clock.
      serverTime = rawState ? Math.max(alignedNow(), timestamp) : timestamp;
      receivedTime = clock();
      rawState = payload;
      backoffMs = 0;
      publish();
      onStatus({ status: 'live', state: lastGoodState });
    } catch (error) {
      if (!current()) return;
      backoffMs = Math.min(backoffMs ? backoffMs * 1.8 : 2000, maxBackoffMs);
      onStatus({ status: 'offline', error, lastGoodState });
      if (!lastGoodState) onState(fallbackCommandCenterState({ message: error.message, now: clock() }));
    } finally {
      timers.clearTimeout(own.timeout);
      if (current()) { request = null; schedulePoll(); }
    }
  }
  function handleVisibility() {
    if (!running) return;
    publish();
    if (visible()) poll(); else schedulePoll();
  }
  return {
    start() {
      if (running || disposed) return;
      running = true;
      documentRef?.addEventListener('visibilitychange', handleVisibility);
      publish(); scheduleExpiry(); poll();
    },
    stop() {
      running = false; clearPoll(); cancelRequest(); timers.clearTimeout(expiryTimer);
      documentRef?.removeEventListener('visibilitychange', handleVisibility);
    },
    refresh: poll,
    destroy() { this.stop(); disposed = true; }
  };
}
