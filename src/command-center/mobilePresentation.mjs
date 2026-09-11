// Presentation only: one set of live nodes, restored to their desktop slots.
export const MOBILE_QUERY = '(max-width: 760px), (max-width: 1000px) and (max-height: 500px) and (orientation: landscape) and (hover: none) and (pointer: coarse)';

export function createMobilePresentation() {
  const byId = (id) => document.getElementById(id);
  const media = matchMedia(MOBILE_QUERY);
  const lifecycle = new AbortController();
  const hud = byId('cc-hud');
  const details = byId('cc-telemetry-details');
  const slots = new Map();
  const copy = document.querySelector('.cc-room__copy');
  const disclosure = document.querySelector('.cc-disclosure');
  const summary = document.querySelector('.cc-summary');
  const strip = byId('cc-strip');
  const movable = [copy, disclosure, summary, strip, byId('cc-newsletter'), hud, byId('cc-fullscreen')];
  movable.forEach((node) => {
    const slot = document.createComment('responsive slot');
    node.before(slot);
    slots.set(node, slot);
  });
  const restore = (node) => slots.get(node).after(node);
  let onLayout = () => {};
  let expanded = false;
  function reconcile() {
    const active = document.activeElement;
    document.body.classList.toggle('cc-mobile', media.matches);
    if (media.matches) {
      byId('cc-about').append(copy, disclosure);
      details.append(summary, strip);
      byId('cc-recent-work').after(byId('cc-newsletter'));
      byId('cc-mobile-room-tools').append(byId('cc-fullscreen'));
      if (expanded) document.querySelector('.cc-world__body').append(hud);
      else byId('cc-directory-grid').after(hud);
    } else movable.forEach(restore);
    if (active instanceof HTMLElement && active.getClientRects().length) active.focus({ preventScroll: true });
    onLayout();
  }
  media.addEventListener('change', reconcile, { signal: lifecycle.signal });
  const filter = byId('cc-filter-toggle');
  filter.addEventListener('click', () => {
    const open = filter.getAttribute('aria-expanded') !== 'true';
    filter.setAttribute('aria-expanded', String(open));
    byId('cc-history-controls').classList.toggle('is-open', open);
  }, { signal: lifecycle.signal });
  reconcile();
  return {
    get active() { return media.matches; },
    connect(callback) { onLayout = callback; },
    expand(value) { if (expanded === value) return; expanded = value; reconcile(); },
    selection(machineId) {
      byId('cc-full-facility').hidden = !machineId;
      document.querySelectorAll('[data-machine-id]').forEach((node) => {
        node.setAttribute('aria-pressed', String(node.dataset.machineId === machineId));
      });
      byId('cc-focus-machine').hidden = !machineId;
      byId('cc-machine-work').hidden = !machineId;
    },
    render(view, { updated, latest, timestamp }) {
      byId('cc-mobile-state').textContent = `● ${view.liveFeed.stateLabel}`;
      byId('cc-mobile-state').dataset.state = view.connection === 'connected' ? view.taskState : 'unknown';
      byId('cc-mobile-connection').textContent = `● ${view.connectionLabel.toUpperCase()}`;
      byId('cc-mobile-connection').dataset.state = view.connection;
      byId('cc-mobile-task').textContent = view.taskLabel.toUpperCase();
      byId('cc-mobile-count').textContent = `${view.currentTaskCount} ACTIVE`;
      byId('cc-mobile-updated').textContent = `UPDATED ${updated}`;
      byId('cc-mobile-updated').dateTime = timestamp || '';
      byId('cc-mobile-latest').textContent = latest;
      byId('cc-mobile-latest').title = latest;
    },
    destroy() { lifecycle.abort(); }
  };
}
