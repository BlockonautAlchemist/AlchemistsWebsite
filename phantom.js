// The Alchemists - Phantom wallet connect (Phase 1: UI + basic connection only).
// Uses Phantom's injected provider at window.phantom.solana. No transactions, no auth.

(function () {
  const PHANTOM_INSTALL_URL = 'https://phantom.app/';
  const ERROR_DISPLAY_MS = 3200;

  // Multiple wallet UIs may exist on the page (desktop navbar + mobile menu).
  // We drive every matching element from a single set of handlers so the
  // connection logic is never duplicated.
  const connectBtns = Array.from(document.querySelectorAll('[data-phantom-connect]'));
  const statusEls = Array.from(document.querySelectorAll('[data-phantom-status]'));
  const addressEls = Array.from(document.querySelectorAll('[data-phantom-address]'));
  const disconnectBtns = Array.from(document.querySelectorAll('[data-phantom-disconnect]'));

  if (!connectBtns.length || !statusEls.length || !addressEls.length || !disconnectBtns.length) return;

  const wrappers = connectBtns
    .map((btn) => btn.closest('.phantom-wallet'))
    .filter(Boolean);
  const errorEls = new Map();
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

  function setConnecting(isLoading) {
    connectBtns.forEach((btn) => {
      btn.disabled = isLoading;
      btn.textContent = isLoading ? 'Connecting…' : 'Connect Wallet';
    });
  }

  function renderConnected(address) {
    if (!address) return;
    addressEls.forEach((el) => {
      el.textContent = shortenAddress(address);
      el.setAttribute('title', address);
    });
    connectBtns.forEach((btn) => {
      btn.hidden = true;
    });
    statusEls.forEach((el) => {
      el.hidden = false;
      el.classList.add('is-connected');
    });
    clearError();
  }

  function renderDisconnected() {
    addressEls.forEach((el) => {
      el.textContent = '';
      el.removeAttribute('title');
    });
    statusEls.forEach((el) => {
      el.hidden = true;
      el.classList.remove('is-connected');
    });
    connectBtns.forEach((btn) => {
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Connect Wallet';
    });
  }

  function showError(message) {
    wrappers.forEach((wrapper) => {
      let errorEl = errorEls.get(wrapper);
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'phantom-error';
        errorEl.setAttribute('role', 'status');
        wrapper.appendChild(errorEl);
        errorEls.set(wrapper, errorEl);
      }
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    });
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(clearError, ERROR_DISPLAY_MS);
  }

  function clearError() {
    errorEls.forEach((errorEl) => {
      errorEl.classList.remove('is-visible');
    });
  }

  async function handleConnectClick() {
    const p = getProvider();
    if (!p) {
      window.open(PHANTOM_INSTALL_URL, '_blank', 'noopener,noreferrer');
      showError('Phantom not detected. Install it to connect.');
      return;
    }
    setConnecting(true);
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
      // Always clear the loading state. On success the buttons are hidden, so
      // this just wipes the stale "Connecting…" text; on failure/rejection it
      // restores them to their normal Connect Wallet state.
      setConnecting(false);
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

  connectBtns.forEach((btn) => btn.addEventListener('click', handleConnectClick));
  disconnectBtns.forEach((btn) => btn.addEventListener('click', handleDisconnectClick));

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
