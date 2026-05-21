const {
  assertMethod,
  handleOptions,
  readJsonBody,
  sendError,
  sendJson
} = require('../../server/shared/http');
const { enforceRateLimit } = require('../../server/shared/rateLimit');
const { postSignalToDiscord } = require('../../server/game-signals/discord');
const { refineSignalWithAI } = require('../../server/game-signals/refinement');
const {
  createSubmittedSignal,
  updateSignal
} = require('../../server/game-signals/storage');
const { reactionThreshold } = require('../../server/game-signals/threshold');
const { validateGameSignalSubmission } = require('../../server/game-signals/validation');

function aiWarning(error) {
  return error && error.statusCode === 503
    ? 'Signal saved. AI refinement is not configured yet.'
    : 'Signal saved. AI refinement could not complete yet.';
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, ['POST'])) return;

  try {
    assertMethod(req, 'POST');
    enforceRateLimit(req, 'game-signal-submit', {
      limit: 4,
      windowMs: 60 * 1000
    });

    const body = await readJsonBody(req);
    const submission = validateGameSignalSubmission(body);
    const warnings = [];
    let aiResult = null;

    try {
      aiResult = await refineSignalWithAI(submission);
    } catch (aiError) {
      if (aiError.statusCode === 400) throw aiError;
      warnings.push(aiWarning(aiError));
    }

    let signal = createSubmittedSignal(submission, {
      threshold: reactionThreshold()
    });

    if (aiResult) {
      signal = updateSignal(signal.slug, {
        title: aiResult.refined.title,
        status: 'ai_refined',
        refined: aiResult.refined,
        ai: {
          model: aiResult.model,
          refined_at: new Date().toISOString(),
          error: ''
        }
      });

      try {
        const discordResult = await postSignalToDiscord(signal);
        if (discordResult.posted) {
          signal = updateSignal(signal.slug, {
            discord: {
              posted_at: new Date().toISOString(),
              error: ''
            }
          });
        }
      } catch (discordError) {
        warnings.push(discordError.message);
        signal = updateSignal(signal.slug, {
          discord: {
            error: discordError.message
          }
        });
      }
    } else {
      signal = updateSignal(signal.slug, {
        ai: {
          error: warnings[0] || ''
        }
      });
    }

    sendJson(res, warnings.length ? 202 : 201, {
      ok: true,
      signal,
      warnings
    });
  } catch (error) {
    sendError(res, error, {
      fallbackMessage: 'Game Signal Engine could not save this signal.'
    });
  }
};
