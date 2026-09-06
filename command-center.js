const ART_MANIFEST_URL = '/assets/command-center/manifest.json';
const HISTORY_ENDPOINT = '/api/command-center/history';
const AGENT = 'spawncamper9000';

if (typeof document !== 'undefined') {
  initCommandCenter().catch((error) => {
    const status = document.getElementById('cc-status');
    const copy = document.getElementById('cc-status-copy');
    if (status) { status.textContent = 'Disconnected'; status.dataset.state = 'disconnected'; }
    if (copy) copy.textContent = error?.message || 'Current activity cannot be confirmed.';
  });
}

async function loadArtManifest() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(ART_MANIFEST_URL, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.files) ? payload.files : [];
  } catch (error) {
    return [];
  } finally { clearTimeout(timeout); }
}

async function initCommandCenter() {
  const byId = (id) => document.getElementById(id);
  const canvasHost = byId('cc-canvas');
  const frame = byId('cc-frame');
  const hud = byId('cc-hud');
  if (!canvasHost || !frame || !hud) return;

  const [
    artManifest,
    { default: Phaser },
    { CommandCenterScene },
    { COMMAND_CENTER_CANVAS, areaById },
    { createTelemetryClient },
    { visualForState },
    { COMMAND_CENTER_MACHINES, machineForWorkflow, machineById, workflowLabelFor },
    { presentCommandCenterState, TASK_LABELS }
  ] = await Promise.all([
    loadArtManifest(), import('phaser'), import('./src/command-center/CommandCenterScene.mjs'),
    import('./src/command-center/sceneConfig.mjs'), import('./src/command-center/telemetryClient.mjs'),
    import('./src/command-center/visualMappings.mjs'), import('./src/command-center/machineConfig.mjs'),
    import('./src/command-center/presentationModel.mjs')
  ]);

  const refs = Object.fromEntries([
    'cc-hud-eyebrow', 'cc-hud-title', 'cc-hud-purpose', 'cc-hud-rows', 'cc-hud-runs', 'cc-hud-close',
    'cc-status', 'cc-status-copy', 'cc-task-state', 'cc-current-step', 'cc-updated-at',
    'cc-active-count', 'cc-stale-count', 'cc-latest-complete', 'cc-connection', 'cc-live-status',
    'cc-crt-heading', 'cc-crt-summary', 'cc-crt-detail', 'cc-crt-time', 'cc-strip-state',
    'cc-strip-caption', 'cc-strip-progress', 'cc-strip-unattended', 'cc-directory-grid',
    'cc-history-machine', 'cc-history-status', 'cc-history-message', 'cc-recent-list',
    'cc-load-earlier', 'cc-new-work'
  ].map((id) => [id.replace(/^cc-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), byId(id)]));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lifecycle = new AbortController();
  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: lifecycle.signal });
  let scene = null;
  let latestState = null;
  let presentation = null;
  let connectionStatus = 'connecting';
  let selectedAreaId = '';
  let selectedKind = '';
  let returnFocus = null;
  let narrationSignature = '';
  let liveSignature = '';
  let layoutFrame = 0;
  let boundsFrame = 0;
  let destroyed = false;
  const history = { runs: [], cursor: null, loading: false, error: '', initialized: false, newestId: '' };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: COMMAND_CENTER_CANVAS.width,
    height: COMMAND_CENTER_CANVAS.height,
    backgroundColor: '#1e0729',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER, width: COMMAND_CENTER_CANVAS.width, height: COMMAND_CENTER_CANVAS.height },
    scene: new CommandCenterScene({
      reducedMotion,
      artManifest,
      onReady(readyScene) {
        scene = readyScene;
        scheduleLayout();
        if (latestState) scene.updatePublicState(latestState);
      },
      onZoneInspect({ area, workflows }) {
        if (!returnFocus?.isConnected) returnFocus = document.querySelector(`[data-machine-id="${machineForArea(area.id)?.id || ''}"]`);
        openZonePanel(area, workflows);
      },
      onCamperInspect(details) { openCamperPanel(details); }
    })
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const parsedTime = (value) => Date.parse(value);
  function absoluteTime(value) {
    if (!Number.isFinite(parsedTime(value))) return 'Time unavailable';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric',
      minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    }).format(new Date(value));
  }
  function shortTime(value) {
    if (!Number.isFinite(parsedTime(value))) return 'No heartbeat';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }
  function relativeTime(value) {
    const timestamp = parsedTime(value);
    if (!Number.isFinite(timestamp)) return 'time unavailable';
    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const [amount, unit] = abs < 60 ? [seconds, 'second']
      : abs < 3600 ? [Math.round(seconds / 60), 'minute']
        : abs < 86400 ? [Math.round(seconds / 3600), 'hour'] : [Math.round(seconds / 86400), 'day'];
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
  }
  function timeNode(value, className = '') {
    const node = el('time', className, relativeTime(value));
    if (Number.isFinite(parsedTime(value))) node.dateTime = new Date(value).toISOString();
    node.title = absoluteTime(value);
    return node;
  }
  const canonicalWorkflowLabel = (workflow) => workflow
    ? workflowLabelFor(workflow.workflow, workflow.workflowLabel)
    : '';
  const workflowName = (workflow) => workflow?.taskTitle || canonicalWorkflowLabel(workflow) || workflow?.machineName || 'Public task';
  const machineForArea = (areaId) => COMMAND_CENTER_MACHINES.find((machine) => machine.areaId === areaId) || null;

  function renderRows(rows) {
    refs.hudRows.replaceChildren(...rows.filter(([, value]) => value !== '' && value !== null && value !== undefined).flatMap(([label, value]) => {
      const term = el('dt', 'mono', label);
      const detail = el('dd', 'mono');
      detail.append(value instanceof Node ? value : document.createTextNode(String(value)));
      return [term, detail];
    }));
  }

  function matchingRuns(machine) {
    if (!machine) return [];
    return history.runs.filter((run) => machineForWorkflow(run.workflow)?.id === machine.id).slice(0, 3);
  }

  function openInspector({ eyebrow, title, purpose, rows, runs = [], accent = '#5cfbf7', areaId = '', kind = 'machine' }) {
    const wasHidden = hud.hidden;
    selectedAreaId = areaId;
    selectedKind = kind;
    refs.hudEyebrow.textContent = eyebrow;
    refs.hudTitle.textContent = title;
    refs.hudPurpose.textContent = purpose;
    renderRows(rows);
    refs.hudRuns.replaceChildren();
    if (runs.length) {
      const heading = el('h3', 'mono', 'Recent matching runs');
      const list = el('ul');
      runs.forEach((run) => {
        const item = el('li');
        item.append(`${workflowName(run)} · `, timeNode(run.updatedAt));
        list.append(item);
      });
      refs.hudRuns.append(heading, list);
    }
    hud.style.setProperty('--cc-hud-accent', accent);
    hud.hidden = false;
    if (wasHidden) refs.hudClose.focus({ preventScroll: true });
  }

  function openZonePanel(area, workflows = []) {
    const machine = machineForArea(area.id);
    const group = latestState?.areaGroups?.find((entry) => entry.id === area.id);
    const focus = group?.displayWorkflow || workflows.find((workflow) => workflow.isVisible) || null;
    const latestRun = machine ? matchingRuns(machine)[0] : null;
    const outputLink = latestRun?.publicUrl || focus?.publicUrl;
    const link = outputLink ? el('a', '', 'View public output') : null;
    if (link) { link.href = outputLink; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    openInspector({
      eyebrow: machine ? 'Machine guide' : 'Facility status',
      title: machine?.name || 'Central Operations',
      purpose: machine?.purpose || 'SpawnCamper9000’s between-task home and public status console. It does not run a workflow.',
      areaId: area.id,
      accent: `#${area.color.toString(16).padStart(6, '0')}`,
      rows: machine ? [
        ['INPUT', machine.input], ['WORK', machine.work], ['OUTPUT', machine.output],
        ['CURRENT USE', focus ? `${TASK_LABELS[focus.taskState]} · ${focus.activity}` : 'Not in public use'],
        ['LATEST TASK', latestRun ? workflowName(latestRun) : ''], ['LATEST OUTCOME', latestRun?.outcome || ''],
        ['LATEST TIME', latestRun ? absoluteTime(latestRun.updatedAt) : ''], ['PUBLIC OUTPUT', link]
      ] : [
        ['CONNECTION', presentation?.connectionLabel], ['TASK STATE', presentation?.taskLabel],
        ['CURRENT TASKS', presentation?.currentTaskCount], ['UPDATED', presentation ? absoluteTime(presentation.timestamp) : '']
      ],
      runs: matchingRuns(machine)
    });
  }

  function openCamperPanel({ workflow, activeCount: liveCount, attended }) {
    const outputLink = workflow?.publicUrl ? el('a', '', 'View public output') : null;
    if (outputLink) { outputLink.href = workflow.publicUrl; outputLink.target = '_blank'; outputLink.rel = 'noopener noreferrer'; }
    openInspector({
      eyebrow: 'Operator status', title: 'SpawnCamper9000', kind: 'operator',
      purpose: 'The Alchemists’ AI operator for public research, tool and workflow evaluation, and community-content preparation.',
      rows: [
        ['STATUS', presentation?.taskLabel || 'Status unknown'],
        ['MACHINE', attended ? areaById(attended).label : 'Central Operations / in transit'],
        ['CURRENT STEP', workflow?.activity || ''], ['CURRENT TASKS', liveCount],
        ['LATEST OUTCOME', workflow?.outcome || ''], ['PUBLIC OUTPUT', outputLink]
      ]
    });
  }

  function closePanel({ restore = true } = {}) {
    if (hud.hidden) return;
    hud.hidden = true;
    selectedAreaId = '';
    selectedKind = '';
    scene?.clearInspection();
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  listen(refs.hudClose, 'click', () => closePanel());
  listen(document, 'keydown', (event) => { if (event.key === 'Escape' && !hud.hidden) { event.preventDefault(); closePanel(); } });

  function buildDirectory() {
    const fragment = document.createDocumentFragment();
    COMMAND_CENTER_MACHINES.forEach((machine) => {
      const button = el('button', 'cc-machine-button');
      button.type = 'button';
      button.dataset.machineId = machine.id;
      button.append(el('strong', '', machine.name), el('span', '', machine.purpose));
      const highlight = (active) => {
        button.dataset.highlighted = active ? 'true' : 'false';
        scene?.highlightArea?.(machine.areaId, active);
      };
      listen(button, 'pointerenter', () => highlight(true));
      listen(button, 'pointerleave', () => highlight(false));
      listen(button, 'focus', () => highlight(true));
      listen(button, 'blur', () => highlight(false));
      listen(button, 'click', () => {
        returnFocus = button;
        if (scene) scene.inspectArea(machine.areaId);
        else openZonePanel(areaById(machine.areaId), []);
      });
      fragment.append(button);
      const option = el('option', '', machine.name); option.value = machine.id; refs.historyMachine.append(option);
    });
    refs.directoryGrid.replaceChildren(fragment);
  }

  function renderStrip() {
    if (!presentation || !latestState) return;
    const focus = presentation.focus;
    const visual = visualForState(focus?.displayState || 'idle');
    refs.stripState.textContent = presentation.taskLabel.toUpperCase();
    refs.stripCaption.textContent = presentation.currentTaskCount
      ? `${presentation.currentTaskCount} CURRENT · ${workflowName(focus).toUpperCase()}` : 'BETWEEN TASKS · CENTRAL OPERATIONS';
    refs.stripProgress.style.background = `#${visual.tint.toString(16).padStart(6, '0')}`;
    refs.stripProgress.style.width = presentation.currentTaskCount ? '100%' : '0%';
    refs.stripProgress.parentElement.setAttribute('aria-hidden', 'true');
    refs.stripUnattended.replaceChildren(...presentation.currentTasks.filter((workflow) => workflow !== focus).slice(0, 3).map((workflow) =>
      el('li', 'mono', `▸ ${workflowName(workflow)} · ${TASK_LABELS[workflow.taskState]}`)));
  }

  function renderPresentation() {
    if (!latestState) return;
    presentation = presentCommandCenterState(latestState, { connection: connectionStatus });
    latestState.presentation = presentation;
    refs.status.textContent = presentation.connectionLabel;
    refs.status.dataset.state = presentation.connection;
    refs.statusCopy.textContent = presentation.narration;
    refs.taskState.textContent = presentation.taskLabel;
    refs.currentStep.textContent = presentation.step;
    refs.currentStep.hidden = !presentation.step;
    refs.updatedAt.textContent = shortTime(presentation.timestamp);
    refs.updatedAt.dateTime = Number.isFinite(parsedTime(presentation.timestamp)) ? new Date(presentation.timestamp).toISOString() : '';
    refs.updatedAt.title = absoluteTime(presentation.timestamp);
    refs.activeCount.textContent = String(presentation.currentTaskCount);
    refs.staleCount.textContent = String(latestState.staleCount || 0);
    const completed = presentation.latestCompleted || history.runs.find((run) => run.taskState === 'completed');
    refs.latestComplete.textContent = completed ? `${workflowName(completed)} · ${relativeTime(completed.timestamp || completed.updatedAt)}` : 'No completed public task yet';
    refs.connection.textContent = `● ${presentation.connectionLabel}`;
    refs.connection.dataset.state = presentation.connection;
    canvasHost.setAttribute('aria-label', `SpawnCamper9000 facility. ${presentation.connectionLabel}. ${presentation.taskLabel}. ${presentation.currentTaskCount} current public tasks.`);
    renderStrip();

    if (presentation.meaningfulSignature !== narrationSignature) {
      narrationSignature = presentation.meaningfulSignature;
      refs.crtHeading.textContent = presentation.taskLabel;
      refs.crtSummary.textContent = presentation.narration;
      refs.crtDetail.textContent = presentation.step;
      refs.crtDetail.hidden = !presentation.step;
      refs.crtTime.textContent = shortTime(presentation.timestamp);
      refs.crtTime.dateTime = refs.updatedAt.dateTime;
      refs.crtTime.title = refs.updatedAt.title;
    }
    const nextLive = `${presentation.connectionLabel}. ${presentation.taskLabel}. ${presentation.narration} ${presentation.step}`.trim();
    if (nextLive !== liveSignature) { liveSignature = nextLive; refs.liveStatus.textContent = nextLive; }
    scene?.updatePublicState(latestState);
    if (!hud.hidden && selectedAreaId) openZonePanel(areaById(selectedAreaId), latestState.areaGroups?.find((group) => group.id === selectedAreaId)?.workflows || []);
  }

  function renderState(state) {
    const previousTerminalIds = new Set((latestState?.recentHistory || []).filter((event) => ['complete', 'error'].includes(event.state)).map((event) => event.id || event.eventId));
    latestState = state;
    if (history.initialized && state.recentHistory.some((event) => ['complete', 'error'].includes(event.state)
      && !previousTerminalIds.has(event.id || event.eventId)
      && !history.runs.some((run) => run.events.some((known) => (known.id || known.eventId) === (event.id || event.eventId))))) {
      refs.newWork.hidden = false;
    }
    renderPresentation();
  }

  function runCard(run) {
    const machine = machineForWorkflow(run.workflow);
    const item = el('li', 'cc-run'); item.dataset.state = run.taskState;
    const head = el('div', 'cc-run__head');
    const titleWrap = el('div');
    titleWrap.append(el('h3', '', run.taskTitle || canonicalWorkflowLabel(run) || machine?.name || 'Public task'));
    titleWrap.append(el('p', 'cc-run__machine mono', machine?.name || canonicalWorkflowLabel(run)));
    const status = el('span', 'cc-run__state mono', TASK_LABELS[run.taskState] || 'Unknown');
    head.append(titleWrap, status); item.append(head);
    const meta = el('p', 'cc-run__meta mono'); meta.append(`${run.totalEventCount} event${run.totalEventCount === 1 ? '' : 's'} · `, timeNode(run.updatedAt)); item.append(meta);
    if (run.outcome) item.append(el('p', 'cc-run__outcome', run.outcome));
    const actions = el('div', 'cc-run__actions mono');
    if (run.publicUrl) { const link = el('a', '', 'View public output'); link.href = run.publicUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link); }
    const details = el('details');
    const summary = el('summary', 'mono', 'Task details');
    const list = el('ol', 'cc-run__events');
    if (run.omittedEventCount) list.append(el('li', 'mono', `${run.omittedEventCount} earlier event${run.omittedEventCount === 1 ? '' : 's'} omitted from expanded details.`));
    run.events.forEach((event) => {
      const eventItem = el('li');
      const label = el('strong', '', `${event.state.replaceAll('_', ' ')}${event.occurrenceCount > 1 ? ` ×${event.occurrenceCount}` : ''}`);
      const at = timeNode(event.lastTimestamp || event.timestamp, 'mono');
      const absolute = el('span', 'mono', ` · ${absoluteTime(event.lastTimestamp || event.timestamp)}`);
      eventItem.append(label, ` — ${event.activity} · `, at, absolute);
      list.append(eventItem);
    });
    details.append(summary, list); actions.append(details); item.append(actions);
    return item;
  }

  function renderHistory() {
    const machineFilter = refs.historyMachine.value;
    const statusFilter = refs.historyStatus.value;
    const filtered = history.runs.filter((run) => {
      const machine = machineForWorkflow(run.workflow);
      return (machineFilter === 'all' || machine?.id === machineFilter)
        && (statusFilter === 'all' || run.taskState === statusFilter);
    });
    refs.recentList.replaceChildren(...filtered.map(runCard));
    if (history.loading) refs.historyMessage.textContent = history.runs.length ? 'Loading earlier work…' : 'Loading recent public work…';
    else if (history.error) refs.historyMessage.textContent = history.runs.length ? `Earlier work unavailable: ${history.error}` : `Recent work unavailable: ${history.error}`;
    else if (!history.runs.length) refs.historyMessage.textContent = 'No public work has been recorded yet.';
    else if (!filtered.length) refs.historyMessage.textContent = 'No loaded work matches these filters.';
    else refs.historyMessage.textContent = `${filtered.length} public run${filtered.length === 1 ? '' : 's'} shown.`;
    refs.loadEarlier.hidden = !history.cursor || history.loading;
    refs.loadEarlier.disabled = history.loading;
  }

  async function loadHistory({ reset = false } = {}) {
    if (history.loading) return;
    history.loading = true; history.error = ''; renderHistory();
    try {
      const url = new URL(HISTORY_ENDPOINT, location.origin);
      url.searchParams.set('agent', AGENT); url.searchParams.set('limit', '8');
      if (!reset && history.cursor) url.searchParams.set('cursor', history.cursor);
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`request failed (${response.status})`);
      const payload = await response.json();
      if (payload?.success !== true || !Array.isArray(payload.runs)) throw new Error('malformed history response');
      history.runs = reset ? payload.runs : [...history.runs, ...payload.runs.filter((run) => !history.runs.some((known) => known.id === run.id))];
      history.cursor = payload.nextCursor || null;
      history.initialized = true;
      history.newestId = history.runs[0]?.id || '';
      refs.newWork.hidden = true;
    } catch (error) { history.error = error.message || 'request failed'; }
    finally { history.loading = false; renderHistory(); renderPresentation(); }
  }

  buildDirectory();
  listen(refs.historyMachine, 'change', renderHistory);
  listen(refs.historyStatus, 'change', renderHistory);
  listen(refs.loadEarlier, 'click', () => loadHistory());
  listen(refs.newWork, 'click', () => loadHistory({ reset: true }));

  const client = createTelemetryClient({
    endpoint: '/api/command-center/state', agent: AGENT,
    onState: renderState,
    onStatus({ status: networkStatus, error, lastGoodState }) {
      if (networkStatus === 'syncing' && lastGoodState) return;
      connectionStatus = networkStatus;
      if (networkStatus === 'offline' && !lastGoodState && latestState) latestState.message = error?.message || 'Telemetry unavailable';
      renderPresentation();
    }
  });

  const world = byId('cc-world');
  const fullscreenButton = byId('cc-fullscreen');
  const requestFullscreen = world && (world.requestFullscreen || world.webkitRequestFullscreen);
  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
  if (world && fullscreenButton && requestFullscreen && exitFullscreen && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
    const syncFullscreen = () => { const active = fullscreenElement() === world; world.dataset.fullscreen = String(active); fullscreenButton.textContent = active ? 'Exit fullscreen' : 'Fullscreen'; scheduleLayout(); };
    listen(fullscreenButton, 'click', () => Promise.resolve(fullscreenElement() === world ? exitFullscreen.call(document) : requestFullscreen.call(world)).catch(syncFullscreen));
    listen(document, 'fullscreenchange', syncFullscreen); listen(document, 'webkitfullscreenchange', syncFullscreen);
    fullscreenButton.hidden = false; syncFullscreen();
  }

  function scheduleLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      if (destroyed || !scene) return;
      scene.configureViewport();
      const width = scene.scale.width; const height = scene.scale.height;
      const fullscreen = world?.dataset.fullscreen === 'true';
      const availableWidth = frame.clientWidth;
      const availableHeight = fullscreen ? frame.clientHeight : Math.min(availableWidth * height / width, scene.phoneViewport ? Math.max(300, innerHeight * .6) : Infinity);
      canvasHost.style.height = fullscreen ? '100%' : `${availableHeight}px`;
      const scale = Math.min(availableWidth / width, availableHeight / height);
      canvasHost.style.setProperty('--canvas-width', `${width * scale}px`); canvasHost.style.setProperty('--canvas-height', `${height * scale}px`);
      cancelAnimationFrame(boundsFrame); boundsFrame = requestAnimationFrame(() => { if (!destroyed) game.scale.refresh(); });
    });
  }
  const observer = new ResizeObserver(scheduleLayout); observer.observe(frame);
  listen(window, 'resize', scheduleLayout);
  listen(window, 'pagehide', (event) => {
    client.stop(); cancelAnimationFrame(layoutFrame); cancelAnimationFrame(boundsFrame);
    if (event.persisted) { game.loop.sleep(); return; }
    destroyed = true; observer.disconnect(); lifecycle.abort(); client.destroy(); game.destroy(true);
  });
  listen(window, 'pageshow', (event) => { if (event.persisted && !destroyed) { game.loop.wake(); client.start(); scheduleLayout(); } });
  scheduleLayout();
  client.start();
  loadHistory();
}
