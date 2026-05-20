const { ApiError } = require('./errors');
const { sanitizeText } = require('./validation');

const THREAD_PROMPT = 'Reply with feedback, improvements, or ways you could help bring this idea to life.';

function formatDiscordMessage(preview) {
  const lines = [
    '## Vision Forge Submission',
    '',
    `**Title:** ${preview.title}`,
    `**Submitted by:** ${preview.submitted_by}`,
    `**Category:** ${preview.category}`,
    `**Alignment:** ${preview.relevance_status} (${preview.alignment_score}/5)`,
    '',
    `**Summary**\n${preview.summary}`,
    '',
    `**Why It Matters**\n${preview.why_it_matters}`,
    '',
    `**Community Value**\n${preview.community_value}`,
    '',
    `**Individual Member Value**\n${preview.individual_member_value}`,
    '',
    `**Suggested Next Step**\n${preview.suggested_next_step}`,
    '',
    `**Thread Prompt**\n${THREAD_PROMPT}`
  ];

  return sanitizeText(lines.join('\n'), 1900, { preserveNewlines: true });
}

async function postToDiscord(preview) {
  const webhookUrl = process.env.DISCORD_VISION_FORGE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new ApiError(503, 'Discord posting is not configured yet. Add DISCORD_VISION_FORGE_WEBHOOK_URL in Vercel Environment Variables.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: 'Vision Forge',
      content: formatDiscordMessage(preview),
      allowed_mentions: {
        parse: []
      }
    })
  }).catch(() => {
    throw new ApiError(502, 'Vision Forge could not reach the Discord webhook. Try again shortly.');
  });

  if (!response.ok) {
    throw new ApiError(502, 'Discord rejected the Vision Forge post. Check the webhook URL and channel permissions.', {
      discord_status: response.status
    });
  }
}

module.exports = {
  THREAD_PROMPT,
  formatDiscordMessage,
  postToDiscord
};
