// Vision Forge chat client. All model and Discord secrets stay behind /api routes.

(function () {
  const refs = {
    app: document.getElementById('vf-app'),
    username: document.getElementById('vf-username'),
    honeypot: document.getElementById('vf-hp'),
    log: document.getElementById('vf-log'),
    chips: document.getElementById('vf-chips'),
    notice: document.getElementById('vf-notice'),
    composer: document.getElementById('vf-composer'),
    input: document.getElementById('vf-input'),
    send: document.getElementById('vf-send'),
    reset: document.getElementById('vf-reset'),
    previewPanel: document.getElementById('vf-preview-panel'),
    previewBody: document.getElementById('vf-preview-body'),
    status: document.getElementById('vf-status'),
    regenerate: document.getElementById('vf-regenerate'),
    copy: document.getElementById('vf-copy'),
    post: document.getElementById('vf-post')
  };

  if (!refs.app || !refs.composer) return;

  const STORAGE = {
    username: 'visionForge:username',
    messages: 'visionForge:messages'
  };
  const COOLDOWN_KEY = 'visionForgePostedUntil';
  const COOLDOWN_MS = 10 * 60 * 1000;

  const GREETING =
    "Got an idea for The Alchemists? Drop it below, even if it is rough. I'll help you shape it into a clear proposal, make sure it fits the community, and prepare it for the #vision-forge Discord channel where members can react, vote, and help build on it.";

  const REFINE_CHIPS = [
    { label: 'Tighten this idea', message: 'Tighten this idea — make it sharper and more focused.' },
    { label: 'Check alignment', message: 'How well does this align with The Alchemists vision? Be specific.' },
    { label: 'Suggest next steps', message: 'What are concrete next steps to move this idea forward?' },
    { label: 'Make it more useful to members', message: 'How can this be more useful and valuable to individual members?' }
  ];

  const state = {
    discordUsername: '',
    messages: [],
    isThinking: false,
    preview: null,
    previewToken: null,
    isPreviewStale: false,
    isGeneratingPreview: false,
    isPosting: false,
    postStatus: 'idle' // 'idle' | 'posted'
  };

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeClientText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeClientUsername(value) {
    return sanitizeClientText(value).replace(/[@#:`*~|>]/g, '');
  }

  function displayUsername(value) {
    const username = sanitizeClientUsername(value);
    return `@${username || 'unknown'}`;
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* storage unavailable — continue in-memory */
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* ignore */
    }
  }

  function cooldownRemaining() {
    const until = Number(safeGet(COOLDOWN_KEY) || 0);
    return Number.isFinite(until) ? Math.max(0, until - Date.now()) : 0;
  }

  /* ---------- persistence ---------- */

  function loadState() {
    state.discordUsername = sanitizeClientUsername(safeGet(STORAGE.username) || '');
    refs.username.value = state.discordUsername;

    let stored = [];
    try {
      const raw = safeGet(STORAGE.messages);
      stored = raw ? JSON.parse(raw) : [];
    } catch (error) {
      stored = [];
    }

    if (Array.isArray(stored) && stored.length) {
      state.messages = stored
        .filter((m) => m && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    }

    if (!state.messages.length) {
      state.messages = [{ role: 'assistant', content: GREETING }];
    }
  }

  function saveMessages() {
    safeSet(STORAGE.messages, JSON.stringify(state.messages.slice(-16)));
  }

  /* ---------- rendering ---------- */

  function renderMessages() {
    const fragment = document.createDocumentFragment();

    state.messages.forEach((message) => {
      fragment.appendChild(messageNode(message.role, message.content));
    });

    if (state.isThinking) {
      fragment.appendChild(thinkingNode());
    }

    refs.log.replaceChildren(fragment);
    refs.log.scrollTop = refs.log.scrollHeight;
  }

  function messageNode(role, content) {
    const node = document.createElement('div');
    node.className = `vf-msg vf-msg--${role === 'assistant' ? 'assistant' : 'user'}`;

    const label = document.createElement('span');
    label.className = 'vf-msg__role mono';
    label.textContent = role === 'assistant' ? 'AI Collaborator' : 'You';

    const body = document.createElement('p');
    body.className = 'vf-msg__body';
    body.textContent = content;

    node.append(label, body);
    return node;
  }

  function thinkingNode() {
    const node = document.createElement('div');
    node.className = 'vf-msg vf-msg--assistant vf-msg--thinking';
    node.innerHTML =
      '<span class="vf-msg__role mono">AI Collaborator</span>' +
      '<span class="vf-typing" aria-label="AI Collaborator is thinking"><i></i><i></i><i></i></span>';
    return node;
  }

  function renderChips() {
    const hasExchange =
      state.messages.length > 1 && state.messages[state.messages.length - 1].role === 'assistant';
    const busy = state.isThinking || state.isGeneratingPreview || state.isPosting;

    if (!hasExchange) {
      refs.chips.hidden = true;
      refs.chips.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    REFINE_CHIPS.forEach((chip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vf-chip';
      button.textContent = chip.label;
      button.disabled = busy;
      button.addEventListener('click', () => sendMessage(chip.message));
      fragment.appendChild(button);
    });

    const generate = document.createElement('button');
    generate.type = 'button';
    generate.className = 'vf-chip vf-chip--accent';
    generate.textContent = state.preview ? 'Regenerate Discord Post Preview' : 'Generate Discord Post Preview';
    generate.disabled = busy;
    generate.addEventListener('click', generatePreview);
    fragment.appendChild(generate);

    refs.chips.replaceChildren(fragment);
    refs.chips.hidden = false;
  }

  function showNotice(message, type) {
    refs.notice.textContent = message || '';
    refs.notice.className = 'vf-notice';
    if (message) {
      refs.notice.classList.add('is-visible');
      if (type) refs.notice.classList.add(`is-${type}`);
    }
  }

  function setBadge(text, variant) {
    refs.status.textContent = text;
    refs.status.className = 'vf-badge mono';
    if (variant) refs.status.classList.add(`is-${variant}`);
  }

  function section(label, value) {
    return (
      '<section class="vf-pv__section">' +
      `<span class="vf-pv__label mono">${escapeHtml(label)}</span>` +
      `<p class="vf-pv__text">${escapeHtml(value)}</p>` +
      '</section>'
    );
  }

  function bulletList(items) {
    const bullets = Array.isArray(items) ? items : [];
    return (
      '<section class="vf-pv__section">' +
      '<span class="vf-pv__label mono">How It Could Work</span>' +
      '<ul class="vf-pv__bullets">' +
      bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('') +
      '</ul>' +
      '</section>'
    );
  }

  function renderPreview() {
    const preview = state.preview;
    if (!preview) return;

    refs.previewPanel.hidden = false;
    refs.app.classList.add('has-preview');

    const posted = state.postStatus === 'posted';
    const stale = state.isPreviewStale;

    if (posted) {
      setBadge('Posted', 'posted');
    } else if (stale) {
      setBadge('Update Needed', 'stale');
    } else if (preview.can_post) {
      setBadge('Ready', 'ready');
    } else {
      setBadge(preview.relevance_status === 'Off Track' ? 'Off Track' : 'Needs Refinement', 'blocked');
    }

    const parts = [];

    if (stale && !posted) {
      parts.push(
        '<p class="vf-pv__stale">You’ve kept chatting. Regenerate the preview to include the latest conversation.</p>'
      );
    }

    const closingLines = Array.isArray(preview.closing_lines) ? preview.closing_lines : [];

    parts.push(
      '<article class="vf-discord-post">' +
        '<div class="vf-discord-post__channel mono"># VISION-FORGE</div>' +
        `<p class="vf-discord-post__byline">Idea from: ${escapeHtml(displayUsername(preview.submitted_by))}</p>` +
        `<h4>${escapeHtml(preview.title)}</h4>` +
        `<p class="vf-discord-post__hook">${escapeHtml(preview.hook)}</p>` +
        section('The Vision', preview.vision) +
        section('Why It Matters', preview.why_it_matters) +
        bulletList(preview.how_it_could_work) +
        section('Why It Fits The Alchemists', preview.why_it_fits_the_alchemists) +
        section('First Step', preview.first_step) +
        '<div class="vf-discord-post__closing">' +
        closingLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('') +
        '</div>' +
      '</article>'
    );

    if (!preview.can_post && Array.isArray(preview.suggested_tweaks) && preview.suggested_tweaks.length) {
      const items = preview.suggested_tweaks
        .map((tweak) => `<li>${escapeHtml(tweak)}</li>`)
        .join('');
      parts.push(
        '<div class="vf-pv__tweaks">' +
          '<span class="vf-pv__label mono">Suggested tweaks</span>' +
          `<ul>${items}</ul>` +
          '</div>'
      );
    }

    if (!preview.can_post && preview.posting_blocked_reason) {
      parts.push(`<p class="vf-pv__blocked">${escapeHtml(preview.posting_blocked_reason)}</p>`);
    }

    refs.previewBody.innerHTML = parts.join('');
    updateControls();
  }

  /* ---------- control state ---------- */

  function updateControls() {
    const busy = state.isThinking || state.isGeneratingPreview || state.isPosting;
    const remaining = cooldownRemaining();

    refs.send.disabled = busy;
    refs.input.disabled = state.isThinking;
    refs.regenerate.disabled = busy;
    if (refs.copy) refs.copy.disabled = busy || !state.preview || !state.preview.discord_post;

    const canPost =
      Boolean(state.preview) &&
      state.preview.can_post &&
      !state.isPreviewStale &&
      state.postStatus !== 'posted' &&
      remaining === 0 &&
      !busy;

    refs.post.disabled = !canPost;

    if (state.postStatus === 'posted') {
      refs.post.textContent = 'Posted';
    } else if (remaining > 0) {
      refs.post.textContent = `${Math.ceil(remaining / 60000)}m cooldown`;
    } else {
      refs.post.textContent = 'Post to #vision-forge';
    }
  }

  /* ---------- username ---------- */

  function syncUsername() {
    state.discordUsername = sanitizeClientUsername(refs.username.value);
    safeSet(STORAGE.username, state.discordUsername);
  }

  function requireUsername() {
    syncUsername();
    if (state.discordUsername.length < 2) {
      showNotice('Add your Discord username first.', 'error');
      refs.username.focus();
      return false;
    }
    return true;
  }

  /* ---------- networking ---------- */

  async function requestJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Vision Forge request failed. Try again.');
      error.data = data;
      throw error;
    }

    return data;
  }

  function chatPayload() {
    return {
      discord_username: state.discordUsername,
      messages: state.messages.slice(-16),
      website: refs.honeypot ? refs.honeypot.value : ''
    };
  }

  /* ---------- actions ---------- */

  function markPreviewStale() {
    if (state.preview && state.postStatus !== 'posted') {
      state.isPreviewStale = true;
      renderPreview();
    }
  }

  async function sendMessage(text) {
    const content = String(text || '').trim();
    if (!content || state.isThinking) return;
    if (!requireUsername()) return;

    showNotice('');
    state.messages.push({ role: 'user', content });
    state.isThinking = true;
    saveMessages();
    renderMessages();
    renderChips();
    updateControls();

    try {
      const data = await requestJson('/api/vision-forge/chat', chatPayload());
      state.messages.push({ role: 'assistant', content: data.reply });
      markPreviewStale();
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      state.isThinking = false;
      saveMessages();
      renderMessages();
      renderChips();
      updateControls();
    }
  }

  async function generatePreview() {
    if (state.isGeneratingPreview || state.isThinking) return;
    if (!requireUsername()) return;
    if (state.messages.filter((m) => m.role === 'user').length === 0) {
      showNotice('Share an idea in the chat first.', 'error');
      return;
    }

    showNotice('');
    state.isGeneratingPreview = true;
    refs.previewPanel.hidden = false;
    refs.app.classList.add('has-preview');
    setBadge('Generating', 'loading');
    refs.previewBody.innerHTML = '<p class="vf-pv__loading">Building a Discord-ready preview from your conversation…</p>';
    renderChips();
    updateControls();

    try {
      const data = await requestJson('/api/vision-forge/post-preview', chatPayload());
      state.preview = data.preview;
      state.previewToken = data.token;
      state.isPreviewStale = false;
      state.postStatus = 'idle';
      renderPreview();

      if (state.preview.can_post) {
        showNotice('Preview ready — you can post it to Discord.', 'success');
      }
    } catch (error) {
      state.preview = null;
      state.previewToken = null;
      setBadge('Failed', 'blocked');
      refs.previewBody.innerHTML = `<p class="vf-pv__blocked">${escapeHtml(error.message)}</p>`;
      showNotice(error.message, 'error');
    } finally {
      state.isGeneratingPreview = false;
      renderChips();
      updateControls();
    }
  }

  async function postToDiscord() {
    if (state.isPosting) return;
    if (!state.preview || !state.previewToken || !state.preview.can_post || state.isPreviewStale) return;

    if (cooldownRemaining() > 0) {
      updateControls();
      return;
    }

    showNotice('');
    state.isPosting = true;
    updateControls();

    try {
      const data = await requestJson('/api/vision-forge/post-to-discord', { token: state.previewToken });
      if (data.preview) state.preview = data.preview;
      state.postStatus = 'posted';
      safeSet(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
      renderPreview();
      showNotice(data.message || 'Your idea was posted to #vision-forge.', 'success');
    } catch (error) {
      if (error.data && error.data.preview) {
        state.preview = error.data.preview;
        renderPreview();
      }
      showNotice(error.message, 'error');
    } finally {
      state.isPosting = false;
      updateControls();
    }
  }

  async function copyFullPost() {
    if (!state.preview || !state.preview.discord_post) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(state.preview.discord_post);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = state.preview.discord_post;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      showNotice('Full Discord post copied.', 'success');
    } catch (error) {
      showNotice('Could not copy the post from this browser.', 'error');
    }
  }

  function startOver() {
    state.messages = [{ role: 'assistant', content: GREETING }];
    state.preview = null;
    state.previewToken = null;
    state.isPreviewStale = false;
    state.postStatus = 'idle';
    safeRemove(STORAGE.messages);
    saveMessages();

    refs.previewPanel.hidden = true;
    refs.app.classList.remove('has-preview');
    refs.previewBody.innerHTML = '';
    showNotice('');
    renderMessages();
    renderChips();
    updateControls();
    refs.input.focus();
  }

  /* ---------- composer ---------- */

  function autoResize() {
    refs.input.style.height = 'auto';
    refs.input.style.height = `${Math.min(refs.input.scrollHeight, 200)}px`;
  }

  function submitComposer() {
    const text = refs.input.value;
    if (!text.trim()) return;
    refs.input.value = '';
    autoResize();
    sendMessage(text);
  }

  /* ---------- events ---------- */

  refs.composer.addEventListener('submit', (event) => {
    event.preventDefault();
    submitComposer();
  });

  refs.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitComposer();
    }
  });

  refs.input.addEventListener('input', autoResize);
  refs.username.addEventListener('input', syncUsername);
  refs.reset.addEventListener('click', startOver);
  refs.regenerate.addEventListener('click', generatePreview);
  if (refs.copy) refs.copy.addEventListener('click', copyFullPost);
  refs.post.addEventListener('click', postToDiscord);

  window.addEventListener('storage', updateControls);
  setInterval(updateControls, 30000);

  /* ---------- init ---------- */

  loadState();
  renderMessages();
  renderChips();
  updateControls();
  autoResize();
})();
