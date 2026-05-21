const DEFAULT_REACTION_THRESHOLD = 2;

function reactionThreshold(env = process.env) {
  const value = Number(env.GAME_SIGNAL_REACTION_THRESHOLD);

  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_REACTION_THRESHOLD;
  }

  return Math.floor(value);
}

function autoPublishEnabled(env = process.env) {
  return String(env.GAME_SIGNAL_AUTO_PUBLISH || '').toLowerCase() === 'true';
}

function hasMetReactionThreshold(count, env = process.env) {
  return Number(count) >= reactionThreshold(env);
}

module.exports = {
  DEFAULT_REACTION_THRESHOLD,
  autoPublishEnabled,
  hasMetReactionThreshold,
  reactionThreshold
};
