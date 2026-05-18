// The Alchemists - lightweight client behavior for static hosting.

(function () {
  document.documentElement.classList.add('js');

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = media.matches;
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');

  function closeNav() {
    if (!toggle || !links) return;
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNav();
    });

    document.addEventListener('click', (event) => {
      if (!links.classList.contains('is-open')) return;
      if (event.target === toggle || toggle.contains(event.target)) return;
      if (links.contains(event.target)) return;
      closeNav();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) closeNav();
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;

      const target = document.getElementById(href.slice(1));
      if (!target) return;

      event.preventDefault();
      closeNav();
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  });

  const tickers = Array.from(document.querySelectorAll('[data-ticker]'));

  function setupTicker(ticker) {
    const track = ticker.querySelector('.ticker__track');
    const sourceGroup = track ? track.querySelector('.ticker__group:not([data-ticker-clone])') : null;

    if (!track || !sourceGroup) return;

    ticker.classList.remove('is-ready');
    track.querySelectorAll('[data-ticker-clone]').forEach((clone) => clone.remove());

    const groupWidth = sourceGroup.getBoundingClientRect().width;
    const tickerWidth = ticker.getBoundingClientRect().width;

    if (!groupWidth || !tickerWidth) return;

    const groupCount = Math.max(2, Math.ceil(tickerWidth / groupWidth) + 2);

    for (let index = 1; index < groupCount; index += 1) {
      const clone = sourceGroup.cloneNode(true);
      clone.dataset.tickerClone = 'true';
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }

    ticker.style.setProperty('--ticker-offset', `${-groupWidth}px`);
    ticker.style.setProperty('--ticker-duration', `${Math.max(28, groupWidth / 28).toFixed(2)}s`);
    ticker.classList.add('is-ready');
  }

  function initTickers() {
    if (!tickers.length) return;

    let frameId = 0;

    function refreshTickers() {
      tickers.forEach(setupTicker);
    }

    function scheduleRefresh() {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(refreshTickers);
    }

    refreshTickers();
    window.addEventListener('resize', scheduleRefresh);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleRefresh).catch(() => {});
    }
  }

  initTickers();

  const constellationStage = document.querySelector('.constellation__stage');

  if (constellationStage) {
    const strengthCards = Array.from(constellationStage.querySelectorAll('[data-strength-card]'));
    const strengthLines = Array.from(constellationStage.querySelectorAll('[data-strength-line]'));
    const mascot = constellationStage.querySelector('.constellation__mascot');

    function setActiveStrength(key) {
      const hasActive = Boolean(key);

      constellationStage.classList.toggle('is-strength-active', hasActive);
      if (mascot) mascot.classList.toggle('is-active', hasActive);

      strengthCards.forEach((card) => {
        card.classList.toggle('is-active', card.dataset.strengthCard === key);
      });

      strengthLines.forEach((line) => {
        line.classList.toggle('is-active', line.dataset.strengthLine === key);
      });
    }

    strengthCards.forEach((card) => {
      card.addEventListener('pointerenter', () => setActiveStrength(card.dataset.strengthCard));
      card.addEventListener('pointerleave', () => setActiveStrength(''));
    });
  }

  [
    ['.strength-card[data-reveal]', 70],
    ['.pillar[data-reveal]', 85],
    ['.opp[data-reveal]', 75],
    ['.value[data-reveal]', 65]
  ].forEach(([selector, step]) => {
    document.querySelectorAll(selector).forEach((el, index) => {
      el.style.setProperty('--reveal-delay', `${Math.min(index * step, 420)}ms`);
    });
  });

  const numberFormatter = new Intl.NumberFormat('en-US');
  const statEls = Array.from(document.querySelectorAll('[data-count-to]'));

  function finalStatValue(el) {
    const value = Number(el.dataset.countTo || 0);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    return `${prefix}${numberFormatter.format(value)}${suffix}`;
  }

  function setFinalStat(el) {
    el.textContent = finalStatValue(el);
  }

  function animateStat(el) {
    if (el.dataset.counted === 'true') return;
    el.dataset.counted = 'true';

    const target = Number(el.dataset.countTo || 0);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const duration = 950;
    const startTime = performance.now();

    function frame(now) {
      const progress = Math.min(Math.max((now - startTime) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      el.textContent = `${prefix}${numberFormatter.format(value)}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        setFinalStat(el);
      }
    }

    el.textContent = `${prefix}0${suffix}`;
    requestAnimationFrame(frame);
  }

  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));

  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
    statEls.forEach(setFinalStat);
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.18
  });

  revealEls.forEach((el) => revealObserver.observe(el));

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateStat(entry.target);
      statObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.5
  });

  statEls.forEach((el) => statObserver.observe(el));
})();
