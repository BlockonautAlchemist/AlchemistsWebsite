const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_ENDPOINT = 'http://127.0.0.1:3000/api/command-center/telemetry';
const DEFAULT_FIXTURE = path.resolve(__dirname, '../fixtures/command-center/replay.json');
const DEFAULT_DELAY_MS = 750;

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requiredSecret() {
  const secret = process.env.COMMAND_CENTER_INGEST_SECRET;
  if (!secret) {
    throw new Error('COMMAND_CENTER_INGEST_SECRET is required to replay Command Center telemetry.');
  }

  return secret;
}

function timestampForRun(startedAt, offsetSeconds) {
  return new Date(startedAt + Number(offsetSeconds || 0) * 1000).toISOString();
}

function replayPayload(entry, { runId, startedAt }) {
  const {
    offsetSeconds,
    eventId,
    ...payload
  } = entry;
  const timestamp = timestampForRun(startedAt, offsetSeconds);

  return {
    agent: 'spawncamper9000',
    ...payload,
    eventId: `${runId}:${eventId || payload.workflow}`,
    timestamp,
    startedAt: payload.startedAt || timestamp
  };
}

async function postTelemetry(endpoint, secret, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.success !== true) {
    throw new Error(body.error || `Telemetry POST failed with ${response.status}`);
  }

  return body;
}

async function main() {
  const endpoint = argValue('--endpoint', process.env.COMMAND_CENTER_INGEST_URL || DEFAULT_ENDPOINT);
  const fixturePath = path.resolve(argValue('--fixture', DEFAULT_FIXTURE));
  const delayMs = Number(argValue('--delay-ms', process.env.COMMAND_CENTER_REPLAY_DELAY_MS || DEFAULT_DELAY_MS));
  const secret = requiredSecret();
  const runId = argValue('--run-id', `replay-${Date.now()}`);
  const startedAt = Date.now();
  const raw = await fs.readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(raw);

  if (!Array.isArray(fixture)) {
    throw new Error('Command Center replay fixture must be a JSON array.');
  }

  for (const entry of fixture) {
    const payload = replayPayload(entry, { runId, startedAt });
    const result = await postTelemetry(endpoint, secret, payload);
    console.log(`${result.status}: ${payload.workflow} -> ${payload.state}`);

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
