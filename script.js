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
