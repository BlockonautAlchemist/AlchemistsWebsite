const VISION_CONTEXT = `The Alchemists is a community of gamers, creators, developers, networkers, researchers, strategists, supporters, and curious builders. Gaming brought the guild together; members use their strengths to create opportunities, help each other succeed, support games and partners, and strive to do good.`;

const ALIGNMENT_CATEGORIES = [
  'game testing and feedback',
  'community events and campaigns',
  'creator and content support',
  'AI, tech, tooling, and experimental builds',
  'partnership support',
  'member education and skill growth',
  'research, strategy, and opportunity discovery'
].join(', ');

function historyText(history) {
  if (!history.length) return 'No prior coaching notes.';

  return history
    .map((item) => `${item.role === 'assistant' ? 'Coach' : 'Member'}: ${item.content}`)
    .join('\n');
}

function buildCoachMessages(payload) {
  return [
    {
      role: 'system',
      content: `${VISION_CONTEXT}

You are Vision Forge, a strategic idea coach for The Alchemists. Help members turn rough ideas into practical community proposals. Keep replies concise, direct, and useful.

When an idea fits The Alchemists, ask sharp follow-up questions and help clarify:
- who benefits
- community value
- individual member value
- concrete next step

When an idea is off-track, politely explain why it does not yet connect to the guild and suggest 1-3 ways to reshape it. Do not promise that Discord posting is available unless the idea has a clear Alchemists connection.

Relevant alignment categories: ${ALIGNMENT_CATEGORIES}.`
    },
    {
      role: 'user',
      content: `Member Discord username: ${payload.username}

Core idea:
${payload.idea}

Prior coaching history:
${historyText(payload.history)}

Latest member message:
${payload.message}

Respond as the Vision Forge coach.`
    }
  ];
}

function buildPreviewMessages(payload) {
  return [
    {
      role: 'system',
      content: `${VISION_CONTEXT}

You create Discord-ready proposal previews for Vision Forge. Score alignment with The Alchemists from 1 to 5.

Alignment guide:
1 = unrelated or self-serving with no guild connection
2 = weak connection, unclear member/community benefit
3 = plausible guild connection but needs refinement
4 = strong fit with clear community and member value
5 = excellent fit with specific next action and obvious guild benefit

Use relevance_status exactly as one of: Strong Fit, Needs Refinement, Off Track.
Set clear_connection true only when the idea clearly involves The Alchemists, its members, partner games, gaming community activity, creative/building support, education, research, or opportunity creation.
For off-track or weak ideas, include 1-3 suggested_tweaks that would make the connection clearer.
Return only JSON that matches the requested schema.`
    },
    {
      role: 'user',
      content: `Member Discord username: ${payload.username}

Core idea:
${payload.idea}

Coaching notes:
${historyText(payload.history)}

Create the Discord preview.`
    }
  ];
}

module.exports = {
  buildCoachMessages,
  buildPreviewMessages
};
