const STATUS_LABELS = Object.freeze({
  active: 'Active',
  complete: 'Complete',
  connecting: 'Connecting',
  error: 'Error',
  idle: 'Idle',
  live: 'Live',
  offline: 'Offline',
  stale: 'Stale',
  syncing: 'Syncing',
  warning: 'Warning'
});

const ART_MANIFEST_URL = '/assets/command-center/manifest.json';

if (typeof document !== 'undefined') {
  initCommandCenter().catch((error) => {
    const status = document.getElementById('cc-status');
    const statusCopy = document.getElementById('cc-status-copy');
    const strip = document.getElementById('cc-strip-state');
    if (status) {
      status.textContent = 'Offline';
      status.dataset.state = 'offline';
    }
    if (statusCopy) statusCopy.textContent = error?.message || 'visualization unavailable';
    if (strip) strip.textContent = 'OFFLINE';
  });
}

// Section 08 swap seam: the scene only requests pixel art the manifest lists, so a
// whitebox build makes zero failed requests. Adding a filename here is the whole
// migration step for a generated asset.
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
  const canvasHost = document.getElementById('cc-canvas');
  const frame = document.getElementById('cc-frame');
  const hud = document.getElementById('cc-hud');
  const hudEyebrow = document.getElementById('cc-hud-eyebrow');
  const hudTitle = document.getElementById('cc-hud-title');
  const hudRows = document.getElementById('cc-hud-rows');
  const status = document.getElementById('cc-status');
  const statusCopy = document.getElementById('cc-status-copy');
  const updatedAt = document.getElementById('cc-updated-at');
  const activeCount = document.getElementById('cc-active-count');
  const staleCount = document.getElementById('cc-stale-count');
  const selectedTitle = document.getElementById('cc-area-title');
  const selectedBody = document.getElementById('cc-area-body');
  const recentList = document.getElementById('cc-recent-list');
  const stripState = document.getElementById('cc-strip-state');
  const stripCaption = document.getElementById('cc-strip-caption');
  const stripProgress = document.getElementById('cc-strip-progress');
  const stripUnattended = document.getElementById('cc-strip-unattended');

  if (
    !canvasHost || !frame || !hud || !hudEyebrow || !hudTitle || !hudRows
    || !status || !statusCopy || !updatedAt || !activeCount || !staleCount
    || !selectedTitle || !selectedBody || !recentList
    || !stripState || !stripCaption || !stripProgress || !stripUnattended
  ) return;

  const [
    artManifest,
    { default: Phaser },
    { CommandCenterScene },
    { COMMAND_CENTER_CANVAS, areaById },
    { createTelemetryClient },
    { visualForState }
  ] = await Promise.all([
    loadArtManifest(),
    import('phaser'),
    import('./src/command-center/CommandCenterScene.mjs'),
    import('./src/command-center/sceneConfig.mjs'),
    import('./src/command-center/telemetryClient.mjs'),
    import('./src/command-center/visualMappings.mjs')
  ]);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene = null;
  let latestState = null;
  let selectedAreaId = '';
  let connectionStatus = 'connecting';
  const lifecycle = new AbortController();
  const listen = (target, event, handler) => target.addEventListener(event, handler, { signal: lifecycle.signal });
  let layoutFrame = 0, boundsFrame = 0;
  let destroyed = false;
  let accessibleSignature = '';
  let networkSignature = '';

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: COMMAND_CENTER_CANVAS.width,
    height: COMMAND_CENTER_CANVAS.height,
    backgroundColor: '#1e0729',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: COMMAND_CENTER_CANVAS.width,
      height: COMMAND_CENTER_CANVAS.height
    },
    scene: new CommandCenterScene({
      reducedMotion,
      artManifest,
      onReady(readyScene) {
        scene = readyScene;
        scheduleLayout();
        if (latestState) scene.updatePublicState(latestState);
      },
      onZoneInspect({ area, workflows }) {
        selectedAreaId = area.id;
        openZonePanel(area, workflows);
      },
      onInspectDismiss: closePanel,
      onCamperInspect(details) {
        selectedAreaId = '';
        openCamperPanel(details);
      }
    })
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function hexColor(value) {
    return `#${value.toString(16).padStart(6, '0')}`;
  }

  function formatTime(value) {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return 'No heartbeat';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit'
    }).format(new Date(timestamp));
  }

  function formatClock(value) {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return '—';
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
  }

  function relativeTime(value) {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return 'recent';
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  function statusText(value) {
    return STATUS_LABELS[value] || value;
  }

  function workflowDisplayName(workflow) {
    return workflow?.machineName || workflow?.workflowLabel || 'Unknown';
  }

  function displayNameForArea(area) {
    return area.label;
  }

  function setNetworkStatus(value, copy) {
    const signature = `${value}:${copy}`;
    if (signature === networkSignature) return;
    networkSignature = signature;
    status.textContent = statusText(value);
    status.dataset.state = value;
    statusCopy.textContent = copy;
    const visibleConnection = document.getElementById('cc-connection');
    if (visibleConnection) {
      visibleConnection.textContent = `● ${statusText(value)} telemetry`;
      visibleConnection.dataset.state = value;
    }
    if (scene) {
      scene.connectionHealth = value;
      scene.setOpsReadout({ status: value === 'offline' ? 'offline' : latestState?.overallStatus || 'idle',
        active: latestState?.activeWorkflows.length || 0, stale: latestState?.staleCount || 0 });
    }
  }

  // -------------------------------------------------------------------------
  // Read-only inspection panel (design section 06). 320px, docked to the world
  // edge nearest the object, never centred, never modal, no controls of any kind.
  // -------------------------------------------------------------------------

  function renderRows(rows) {
    // Max 6 label/value rows, mono, 11px.
    hudRows.replaceChildren(...rows.slice(0, 6).flatMap(([label, value]) => {
      const term = el('dt', 'mono', label);
      const detail = el('dd', 'mono', value);
      return [term, detail];
    }));
  }

  function dockPanel(worldX, accent, bounds) {
    const canvas = game.canvas.getBoundingClientRect(), frameBox = frame.getBoundingClientRect();
    const camera = scene?.cameras.main;
    const ratio = canvas.width / (scene?.scale.width || COMMAND_CENTER_CANVAS.width);
    const right = canvas.left - frameBox.left + ((bounds ? bounds.x + bounds.width : worldX) - (camera?.scrollX || 0)) * ratio;
    const left = canvas.left - frameBox.left + ((bounds?.x || worldX) - (camera?.scrollX || 0)) * ratio;
    const panelWidth = Math.min(320, frameBox.width - 24);
    const preferred = frameBox.width - right >= panelWidth + 24 ? right + 12 : left - panelWidth - 12;
    hud.style.left = `${Math.max(12, Math.min(frameBox.width - panelWidth - 12, preferred))}px`;
    hud.style.right = 'auto';
    hud.style.maxHeight = `${Math.max(80, frameBox.height - 24)}px`;
    hud.dataset.edge = preferred >= right ? 'left' : 'right';
    hud.style.setProperty('--cc-hud-accent', accent);
    hud.hidden = false;
  }

  function openZonePanel(area, workflows = []) {
    const group = latestState?.areaGroups?.find((entry) => entry.id === area.id);
    const displayState = group?.displayState || 'idle';
    const visual = visualForState(displayState);
    const focus = group?.displayWorkflow || null;
    const live = workflows.filter((workflow) => workflow.isVisible).length;

    hudEyebrow.textContent = `ZONE ${area.zoneNumber} · INSPECT`;
    hudTitle.textContent = displayNameForArea(area).toUpperCase();
    renderRows([
      ['STATUS', (group?.staleWorkflows?.length && displayState === 'idle' ? 'STALE' : visual.label).toUpperCase()],
      ['ACTIVITY', focus?.activity || 'No active workflow'],
      ['WORKFLOW', focus?.workflowLabel || '—'],
      ['STARTED', formatClock(focus?.startedAt || focus?.timestamp)],
      ['LAST EVENT', focus ? relativeTime(focus.timestamp) : '—'],
      ['LIVE HERE', `${live} of ${workflows.length || 0}`]
    ]);
    dockPanel(area.x, hexColor(area.color), scene?.zoneObjects.get(area.id)?.area.bounds);
  }

  function openCamperPanel({ workflow, activeCount: liveCount, position, anim, attended }) {
    const visual = visualForState(workflow?.displayState || 'idle');
    hudEyebrow.textContent = 'OPERATOR · INSPECT';
    hudTitle.textContent = 'SPAWNCAMPER9000';
    renderRows([
      ['STATUS', visual.label.toUpperCase()],
      ['MACHINE', attended ? areaById(attended).label : 'In transit / standing by'],
      ['ACTIVITY', workflow?.activity || 'Standing by'],
      ['MODE', anim.replace(/_/g, ' ').toUpperCase()],
      ['POSITION', `${position.x},${position.y}`],
      ['ATTENDING', `${attended ? 1 : 0} of ${liveCount} live workflow${liveCount === 1 ? '' : 's'}`]
    ]);
    dockPanel(position.x, hexColor(visual.tint));
  }

  function closePanel() {
    hud.hidden = true;
    selectedAreaId = '';
    scene?.clearInspection();
  }

  // Panel dismisses on any click outside. The world never pauses.
  listen(document, 'pointerdown', (event) => {
    if (hud.hidden) return;
    if (hud.contains(event.target)) return;
    if (canvasHost.contains(event.target)) return;
    closePanel();
  });
  listen(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !hud.hidden) closePanel();
  });

  // -------------------------------------------------------------------------
  // In-world strip (design section 10). One strip, never cards.
  // -------------------------------------------------------------------------

  function renderStrip(state) {
    const focus = state.primaryWorkflow;
    const visual = visualForState(focus?.displayState || 'idle');
    const active = state.activeWorkflows.length;

    stripState.textContent = (focus ? visual.label : state.overallStatus === 'offline' ? 'Offline' : 'Idle').toUpperCase();
    stripCaption.textContent = focus
      ? `${active} CONCURRENT · ${workflowDisplayName(focus).toUpperCase()}`
      : state.overallStatus === 'offline'
        ? 'UPLINK OFFLINE · LAST KNOWN STATE'
        : 'NO WORKFLOWS · ROOM ALIVE, NOTHING OPERATIONAL';

    stripProgress.style.background = hexColor(visual.tint);
    stripProgress.style.width = focus ? '100%' : '0%';
    stripProgress.parentElement.setAttribute('aria-hidden', 'true');

    // Up to 2 unattended workflows, dimmed.
    const unattended = state.workflows
      .filter((workflow) => workflow.isVisible && workflow !== focus)
      .slice(0, 2)
      .map((workflow) => {
        const item = el('li', 'mono');
        item.textContent = `▸ ${workflowDisplayName(workflow).toLowerCase()} · ${visualForState(workflow.displayState).label.toLowerCase()}`;
        return item;
      });
    stripUnattended.replaceChildren(...unattended);
  }

  // -------------------------------------------------------------------------
  // Accessible mirror of the same sanitized state. A canvas is opaque to
  // assistive tech, so this region carries what the room shows visually.
  // -------------------------------------------------------------------------

  function workflowsForArea(state, areaId) {
    const group = state.areaGroups.find((areaGroup) => areaGroup.id === areaId);
    if (group) return group.workflows;
    return state.workflows.filter((workflow) => workflow.areaId === areaId);
  }

  function renderSelectedArea(area, workflows = []) {
    selectedTitle.textContent = displayNameForArea(area);

    const visible = workflows
      .filter((workflow) => workflow.isVisible || workflow.isStale || workflow.isComplete)
      .slice(0, 4);

    if (!visible.length) {
      selectedBody.replaceChildren(el('p', 'mono', 'area idle'));
      return;
    }

    selectedBody.replaceChildren(...visible.map((workflow) => {
      const visual = visualForState(workflow.displayState);
      const block = el('article');
      block.appendChild(el('h3', '', workflowDisplayName(workflow)));
      block.appendChild(el('p', '', `${workflow.isStale ? 'Stale' : visual.label}: ${workflow.activity}`));
      block.appendChild(el('span', 'mono', `${workflow.state} · ${relativeTime(workflow.timestamp)}`));
      if (workflow.publicUrl) {
        const link = el('a', 'mono', 'open public artifact');
        link.href = workflow.publicUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        block.appendChild(link);
      }
      return block;
    }));
  }

  function renderRecentSignals(state) {
    const items = state.recentHistory.slice(0, 6).map((event) => {
      const visual = visualForState(event.state);
      const item = el('li');
      item.appendChild(el('span', '', workflowDisplayName(event)));
      item.appendChild(el('span', 'mono', visual.label));
      item.appendChild(el('span', 'mono', relativeTime(event.timestamp)));
      return item;
    });

    if (!items.length) {
      recentList.replaceChildren(el('li', 'mono', 'no recent signals'));
      return;
    }
    recentList.replaceChildren(...items);
  }

  function renderState(state) {
    latestState = state;

    activeCount.textContent = String(state.activeWorkflows.length);
    staleCount.textContent = String(state.staleCount);
    updatedAt.textContent = formatTime(state.fetchedAt);

    const signature = JSON.stringify([state.overallStatus, state.workflows.map(w => [w.agent,w.workflow,w.displayState,w.activity,w.areaId,w.isStale]),
      state.primaryWorkflow?.workflow, selectedAreaId, state.recentHistory.slice(0,6).map(e=>[e.workflow,e.state,e.activity])]);
    const accessibleChanged = signature !== accessibleSignature;
    accessibleSignature = signature;
    if (accessibleChanged) { renderRecentSignals(state); renderStrip(state); }

    if (scene) scene.updatePublicState(state);

    const nextAreaId = selectedAreaId || state.primaryWorkflow?.areaId || 'central-operations';
    const selectedArea = areaById(nextAreaId);
    if (accessibleChanged) renderSelectedArea(selectedArea, workflowsForArea(state, selectedArea.id));
    if (!hud.hidden && selectedAreaId) {
      openZonePanel(selectedArea, workflowsForArea(state, selectedArea.id));
    }


  }

  const client = createTelemetryClient({
    onState: renderState,
    onStatus({ status: networkStatus, error, lastGoodState }) {
      if (networkStatus === 'syncing' && lastGoodState) return;
      connectionStatus = networkStatus;
      canvasHost.setAttribute('aria-label', `SpawnCamper9000 facility. Connection ${networkStatus}. ${latestState?.activeWorkflows.length || 0} active workflows.`);
      if (networkStatus === 'offline') {
        setNetworkStatus('offline', lastGoodState ? 'using last good state' : (error?.message || 'telemetry unavailable'));
        return;
      }
      if (networkStatus === 'syncing' && lastGoodState) {
        // Keep the established connection indication during routine polling.
        return;
      }
      setNetworkStatus(networkStatus, networkStatus === 'connecting' ? 'opening uplink' : 'telemetry live');
    }
  });

  // -------------------------------------------------------------------------
  // Fullscreen (native Fullscreen API). The console — bar, world frame and strip
  // — goes fullscreen as one unit so the toggle and the inspection panel stay
  // reachable. document.fullscreenElement is the only source of truth: the label
  // and the layout attribute are re-derived from it on every fullscreenchange,
  // so an Esc exit lands in exactly the same place a button exit does.
  // -------------------------------------------------------------------------

  const world = document.getElementById('cc-world');
  const fullscreenButton = document.getElementById('cc-fullscreen');
  const requestFullscreen = world && (world.requestFullscreen || world.webkitRequestFullscreen);
  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;

  if (
    world && fullscreenButton && requestFullscreen && exitFullscreen
    && (document.fullscreenEnabled || document.webkitFullscreenEnabled)
  ) {
    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

    const syncFullscreen = () => {
      const active = fullscreenElement() === world;
      world.dataset.fullscreen = active ? 'true' : 'false';
      fullscreenButton.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
      // The canvas element box just changed size; refresh Phaser's cached bounds
      // on the next frame so zone and camper hit-testing stays aligned.
      scheduleLayout();
    };

    listen(fullscreenButton, 'click', () => {
      const active = fullscreenElement() === world;
      const result = active ? exitFullscreen.call(document) : requestFullscreen.call(world);
      // Safari returns undefined; a denied request must never reject unhandled.
      Promise.resolve(result).catch(syncFullscreen);
    });

    listen(document, 'fullscreenchange', syncFullscreen);
    listen(document, 'webkitfullscreenchange', syncFullscreen);
    fullscreenButton.hidden = false;
    syncFullscreen();
  }

  // One calculation owns the visible canvas box in every viewport mode.
  function scheduleLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      if (destroyed || !scene) return;
      scene.configureViewport();
      const width = scene.scale.width, height = scene.scale.height;
      const fullscreen = world?.dataset.fullscreen === 'true';
      const availableWidth = frame.clientWidth;
      const availableHeight = fullscreen ? frame.clientHeight
        : Math.min(availableWidth * height / width, scene.phoneViewport ? Math.max(300, innerHeight * .6) : Infinity);
      if (!fullscreen) canvasHost.style.height = `${availableHeight}px`;
      else canvasHost.style.height = '100%';
      const scale = Math.min(availableWidth / width, availableHeight / height);
      canvasHost.style.setProperty('--canvas-width', `${width * scale}px`);
      canvasHost.style.setProperty('--canvas-height', `${height * scale}px`);
      cancelAnimationFrame(boundsFrame);
      boundsFrame = requestAnimationFrame(() => {
        if (destroyed) return;
        game.scale.refresh();
        if (selectedAreaId && !hud.hidden) openZonePanel(areaById(selectedAreaId), workflowsForArea(latestState, selectedAreaId));
      });
    });
  }
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(frame);
  listen(window, 'resize', scheduleLayout);
  listen(window, 'pagehide', (event) => {
    client.stop();
    cancelAnimationFrame(layoutFrame); cancelAnimationFrame(boundsFrame);
    if (event.persisted) { game.loop.sleep(); return; }
    destroyed = true;
    observer.disconnect(); lifecycle.abort(); client.destroy(); game.destroy(true);
  });
  listen(window, 'pageshow', (event) => {
    if (!event.persisted || destroyed) return;
    game.loop.wake(); client.start(); scheduleLayout();
  });
  scheduleLayout();
  client.start();
}
