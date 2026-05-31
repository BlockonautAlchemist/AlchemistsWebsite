// The Alchemists - Phantom wallet connect (Phase 1: UI + basic connection only).
// Uses Phantom's injected provider at window.phantom.solana. No transactions, no auth.

(function () {
  const PHANTOM_INSTALL_URL = 'https://phantom.app/';
  const ERROR_DISPLAY_MS = 3200;

  const connectBtn = document.getElementById('phantom-connect');
  const statusEl = document.getElementById('phantom-status');
  const addressEl = document.getElementById('phantom-address');
  const disconnectBtn = document.getElementById('phantom-disconnect');

  if (!connectBtn || !statusEl || !addressEl || !disconnectBtn) return;

  const wrapper = connectBtn.closest('.phantom-wallet') || statusEl.parentElement;
  let errorEl = null;
  let errorTimer = null;
  let provider = null;
  let eventsBound = false;

  function getProvider() {
    if (provider) return provider;
    const injected = window.phantom && window.phantom.solana;
    if (injected && injected.isPhantom) {
      provider = injected;
      bindProviderEvents();
      return provider;
    }
    return null;
  }

  function bindProviderEvents() {
    if (!provider || eventsBound) return;
    eventsBound = true;
    provider.on('connect', (publicKey) => {
      renderConnected(publicKey ? publicKey.toString() : safePublicKey());
    });
    provider.on('disconnect', () => {
      renderDisconnected();
    });
    provider.on('accountChanged', (publicKey) => {
      if (publicKey) {
        renderConnected(publicKey.toString());
      } else {
        // Account was disconnected from the wallet side; user may need to reconnect manually.
        renderDisconnected();
      }
    });
  }

  function safePublicKey() {
    try {
      return provider && provider.publicKey ? provider.publicKey.toString() : '';
    } catch (_err) {
      return '';
    }
  }

  function shortenAddress(addr) {
    if (!addr || addr.length < 10) return addr || '';
    return addr.slice(0, 4) + '…' + addr.slice(-4);
  }

  function renderConnected(address) {
    if (!address) return;
    addressEl.textContent = shortenAddress(address);
    addressEl.setAttribute('title', address);
    connectBtn.hidden = true;
    statusEl.hidden = false;
    statusEl.classList.add('is-connected');
    clearError();
  }

  function renderDisconnected() {
    addressEl.textContent = '';
    addressEl.removeAttribute('title');
    statusEl.hidden = true;
    statusEl.classList.remove('is-connected');
    connectBtn.hidden = false;
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Wallet';
  }

  function showError(message) {
    if (!wrapper) return;
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'phantom-error';
      errorEl.setAttribute('role', 'status');
      wrapper.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.classList.add('is-visible');
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(clearError, ERROR_DISPLAY_MS);
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.classList.remove('is-visible');
  }

  async function handleConnectClick() {
    const p = getProvider();
    if (!p) {
      window.open(PHANTOM_INSTALL_URL, '_blank', 'noopener,noreferrer');
      showError('Phantom not detected. Install it to connect.');
      return;
    }
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting…';
    try {
      const res = await p.connect();
      const pk = (res && res.publicKey ? res.publicKey : p.publicKey);
      renderConnected(pk ? pk.toString() : '');
    } catch (err) {
      // Phantom uses code 4001 for user rejection; some versions also throw with message "User rejected the request."
      const rejected = err && (err.code === 4001 || /reject/i.test(err.message || ''));
      if (rejected) {
        showError('Connection cancelled.');
      } else {
        console.error('[phantom] connect failed', err);
        showError("Couldn't connect — try again.");
      }
      renderDisconnected();
    } finally {
      // Always clear the loading state. On success the button is hidden, so
      // this just wipes the stale "Connecting…" text; on failure/rejection it
      // restores the button to its normal Connect Wallet state.
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect Wallet';
    }
  }

  async function handleDisconnectClick() {
    const p = getProvider();
    if (!p) {
      renderDisconnected();
      return;
    }
    try {
      await p.disconnect();
    } catch (err) {
      console.error('[phantom] disconnect failed', err);
    } finally {
      renderDisconnected();
    }
  }

  async function eagerReconnect() {
    const p = getProvider();
    if (!p) return;
    try {
      const res = await p.connect({ onlyIfTrusted: true });
      const pk = (res && res.publicKey ? res.publicKey : p.publicKey);
      if (pk) renderConnected(pk.toString());
    } catch (_err) {
      // Not trusted yet — user hasn't approved on this origin. Stay disconnected silently.
    }
  }

  connectBtn.addEventListener('click', handleConnectClick);
  disconnectBtn.addEventListener('click', handleDisconnectClick);

  // Phantom injects asynchronously — wait for load event if it isn't there yet.
  if (window.phantom && window.phantom.solana) {
    eagerReconnect();
  } else {
    window.addEventListener('load', eagerReconnect, { once: true });
  }

  // TODO(phase-2 auth): Sign-In With Solana (SIWS)
  // 1. After provider.connect(), POST publicKey to /api/auth/nonce
  //    → backend returns a one-time nonce string bound to that pubkey.
  // 2. Build a human-readable message including: domain, pubkey, nonce,
  //    issuedAt, statement. Pass it to provider.signMessage(encodedMsg, 'utf8').
  // 3. POST { publicKey, message, signature } to /api/auth/verify
  //    → backend uses tweetnacl / @solana/web3.js to verify the signature,
  //    confirms the nonce hasn't been used, then issues a session
  //    (HTTP-only cookie or JWT).
  // 4. Gated features call /api/me (or check the cookie) before showing
  //    private content — never trust window.phantom.solana.publicKey on its
  //    own; the signature is what proves ownership.
  // 5. On disconnect: clear the server session as well as the wallet
  //    (DELETE /api/auth/session).
})();
