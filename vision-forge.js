// Vision Forge client behavior. All model and Discord secrets stay behind /api routes.

(function () {
  const form = document.getElementById('vision-forge-form');
  if (!form) return;

  const refs = {
    username: document.getElementById('vf-username'),
    idea: document.getElementById('vf-idea'),
    chatLog: document.getElementById('vf-chat-log'),
    chatCount: document.getElementById('vf-chat-count'),
    chatSubmit: document.getElementById('vf-chat-submit'),
    generate: document.getElementById('vf-generate'),
    post: document.getElementById('vf-post'),
    preview: document.getElementById('vf-preview'),
    previewStatus: document.getElementById('vf-preview-status'),
    alert: document.getElementById('vf-alert')
  };

  const COOLDOWN_MS = 10 * 60 * 1000;
  const COOLDOWN_KEY = 'visionForgePostedUntil';

  let history = [];
  let currentPreview = null;
  let isBusy = false;

  function sanitizeClientText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cooldownUntil() {
    const stored = Number(window.localStorage.getItem(COOLDOWN_KEY) || 0);
    return Number.isFinite(stored) ? stored : 0;
  }

  function cooldownRemaining() {
    return Math.max(0, cooldownUntil() - Date.now());
  }

  function cooldownLabel(ms) {
    const minutes = Math.ceil(ms / 60000);
    return `${minutes}m cooldown`;
  }

  function setBusy(nextBusy) {
    isBusy = nextBusy;
    refs.chatSubmit.disabled = nextBusy;
    refs.generate.disabled = nextBusy;
    updatePostButton();
  }

  function updatePostButton() {
    const remaining = cooldownRemaining();
    const hasPreview = Boolean(currentPreview);
    const canPost = hasPreview && currentPreview.can_post && remaining === 0 && !isBusy;

    refs.post.disabled = !canPost;

    if (remaining > 0) {
      refs.post.textContent = cooldownLabel(remaining);
      return;
    }

    refs.post.textContent = 'Post Idea to Discord';
  }

  function showAlert(message, type) {
    refs.alert.textContent = message || '';
    refs.alert.className = 'vf-alert';

    if (!message) return;

    refs.alert.classList.add('is-visible');
    if (type) refs.alert.classList.add(`is-${type}`);
  }

  function setStatus(text, state) {
    refs.previewStatus.textContent = text;
    refs.previewStatus.className = 'vf-preview__status mono';
    if (state) refs.previewStatus.classList.add(`is-${state}`);
  }

  function getPayload(message) {
    const formData = new FormData(form);

    return {
      username: refs.username.value,
      idea: refs.idea.value,
      message: message || '',
      history: history.slice(-10),
      honeypot: formData.get('website') || ''
    };
  }

  function validateBase() {
    const username = sanitizeClientText(refs.username.value);
    const idea = sanitizeClientText(refs.idea.value);

    if (username.length < 2) {
      showAlert('Add your Discord username before using Vision Forge.', 'error');
      refs.username.focus();
      return false;
    }

    if (idea.length < 20) {
      showAlert('Share at least 20 characters so Vision Forge has enough idea context.', 'error');
      refs.idea.focus();
      return false;
    }

    return true;
  }

  async function requestJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Vision Forge request failed.');
      error.data = data;
      throw error;
    }

    return data;
  }

  function addChatMessage(role, content, options = {}) {
    const node = document.createElement('div');
    node.className = `vf-message vf-message--${role}`;
    if (options.pending) node.classList.add('vf-message--pending');

    const label = document.createElement('span');
    label.className = 'mono';
    label.textContent = role === 'assistant' ? 'Coach' : 'You';

    const body = document.createElement('p');
    body.textContent = content;

    node.append(label, body);
    refs.chatLog.appendChild(node);
    refs.chatLog.scrollTop = refs.chatLog.scrollHeight;

    return node;
  }

  function updateChatCount() {
    const count = history.length;
    refs.chatCount.textContent = `${count} ${count === 1 ? 'note' : 'notes'}`;
  }

  function rememberExchange(userMessage, assistantReply) {
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantReply });
    history = history.slice(-10);
    updateChatCount();
  }

  async function askCoach() {
    if (!validateBase() || isBusy) return;

    const message = refs.idea.value.trim();
    showAlert('');
    addChatMessage('user', message);
    const pending = addChatMessage('assistant', 'Thinking through the guild connection...', { pending: true });
    setBusy(true);

    try {
      const data = await requestJson('/api/vision-forge/chat', getPayload(message));
      pending.remove();
      addChatMessage('assistant', data.reply);
      rememberExchange(message, data.reply);
      currentPreview = null;
      setStatus('Preview stale', 'blocked');
      renderPreviewState(
        'stale',
        'Preview is stale',
        'Generate a new Discord preview after reviewing the coach response.'
      );
      updatePostButton();
    } catch (error) {
      pending.remove();
      showAlert(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderPreviewState(state, title, body) {
    refs.preview.innerHTML = `
      <div class="vf-preview__empty vf-preview__empty--${escapeHtml(state)}">
        <span class="vf-kicker mono">${escapeHtml(state)}</span>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(body)}</p>
      </div>
    `;
  }

  function supportField(label, value) {
    return `
      <div class="vf-preview__support-item">
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(value)}</p>
      </div>
    `;
  }

  function renderPreview(preview) {
    const state = preview.can_post ? 'ready' : 'blocked';
    setStatus(preview.can_post ? 'Ready to post' : 'Needs refinement', state);

    refs.preview.innerHTML = `
      <div class="vf-preview__card">
        <div class="vf-discord-post">
          <div class="vf-discord-post__meta mono">
            <span># vision-forge</span>
            <span>By ${escapeHtml(preview.submitted_by)}</span>
          </div>
          <h4>${escapeHtml(preview.title)}</h4>
          <p>${escapeHtml(preview.summary)}</p>
        </div>

        <div class="vf-preview__support">
          ${supportField('Alignment score', `${preview.alignment_score}/5`)}
          ${supportField('Relevance status', preview.relevance_status)}
          ${supportField('Suggested next step', preview.suggested_next_step)}
          ${supportField('Community value summary', preview.community_value)}
        </div>
      </div>
    `;

    if (preview.can_post) {
      showAlert('Preview is eligible for manual Discord posting.', 'success');
    } else {
      showAlert(preview.posting_blocked_reason || 'Refine the Alchemists connection before posting.', 'error');
    }

    updatePostButton();
  }

  async function generatePreview() {
    if (!validateBase() || isBusy) return;

    showAlert('');
    setStatus('Generating', 'loading');
    renderPreviewState(
      'generating',
      'Building Discord preview',
      'Checking Alchemists alignment, community value, and posting eligibility.'
    );
    setBusy(true);

    try {
      const data = await requestJson('/api/vision-forge/post-preview', getPayload(''));
      currentPreview = data.preview;
      renderPreview(currentPreview);
    } catch (error) {
      currentPreview = null;
      setStatus('Preview failed', 'blocked');
      renderPreviewState(
        'failed',
        'Preview failed',
        'Vision Forge could not generate a preview from this request.'
      );
      showAlert(error.message, 'error');
      updatePostButton();
    } finally {
      setBusy(false);
    }
  }

  async function postToDiscord() {
    if (!validateBase() || isBusy || !currentPreview || !currentPreview.can_post) return;

    const remaining = cooldownRemaining();
    if (remaining > 0) {
      showAlert(`Posting is cooling down for ${cooldownLabel(remaining)}.`, 'error');
      updatePostButton();
      return;
    }

    showAlert('');
    setBusy(true);

    try {
      const data = await requestJson('/api/vision-forge/post-to-discord', getPayload(''));
      currentPreview = data.preview;
      window.localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
      renderPreview(currentPreview);
      showAlert('Idea posted to Discord.', 'success');
    } catch (error) {
      if (error.data && error.data.preview) {
        currentPreview = error.data.preview;
        renderPreview(currentPreview);
      }

      showAlert(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  refs.chatSubmit.addEventListener('click', askCoach);
  refs.generate.addEventListener('click', generatePreview);
  refs.post.addEventListener('click', postToDiscord);

  refs.idea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      askCoach();
    }
  });

  refs.idea.addEventListener('input', () => {
    if (!currentPreview) return;
    currentPreview = null;
    setStatus('Preview stale', 'blocked');
    renderPreviewState(
      'stale',
      'Preview is stale',
      'Generate a new Discord preview from the updated idea.'
    );
    updatePostButton();
  });

  window.addEventListener('storage', updatePostButton);
  setInterval(updatePostButton, 30000);
  updatePostButton();
})();
