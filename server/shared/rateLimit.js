const { ApiError } = require('./errors');

const buckets = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length) {
    return forwardedFor[0].split(',')[0].trim();
  }

  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function pruneOldEntries(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function enforceRateLimit(req, namespace, options) {
  const now = Date.now();
  const windowMs = options.windowMs;
  const limit = options.limit;
  const clientIp = getClientIp(req);
  const key = `${namespace}:${clientIp}`;

  pruneOldEntries(now);

  const bucket = buckets.get(key) || {
    hits: 0,
    resetAt: now + windowMs
  };

  if (bucket.resetAt <= now) {
    bucket.hits = 0;
    bucket.resetAt = now + windowMs;
  }

  if (bucket.hits >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new ApiError(429, 'Too many requests. Try again shortly.', {
      retry_after_seconds: retryAfterSeconds
    });
  }

  bucket.hits += 1;
  buckets.set(key, bucket);
}

function resetRateLimitsForTests() {
  buckets.clear();
}

module.exports = {
  enforceRateLimit,
  getClientIp,
  resetRateLimitsForTests
};
