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
  try {
    const response = await fetch(ART_MANIFEST_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.files) ? payload.files : [];
  } catch (error) {
    return [];
  }
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

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: COMMAND_CENTER_CANVAS.width,
    height: COMMAND_CENTER_CANVAS.height,
    backgroundColor: '#1e0729',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: COMMAND_CENTER_CANVAS.width,
      height: COMMAND_CENTER_CANVAS.height
    },
    scene: new CommandCenterScene({
      reducedMotion,
      artManifest,
      onReady(readyScene) {
        scene = readyScene;
        if (latestState) scene.updatePublicState(latestState);
      },
      onZoneInspect({ area, workflows }) {
        selectedAreaId = area.id;
        openZonePanel(area, workflows);
      },
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

  function setNetworkStatus(value, copy) {
    status.textContent = statusText(value);
    status.dataset.state = value;
    statusCopy.textContent = copy;
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

  function dockPanel(worldX, accent) {
    hud.dataset.edge = worldX < COMMAND_CENTER_CANVAS.width / 2 ? 'left' : 'right';
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
    hudTitle.textContent = area.label.toUpperCase();
    renderRows([
      ['STATUS', (group?.staleWorkflows?.length && displayState === 'idle' ? 'STALE' : visual.label).toUpperCase()],
      ['ACTIVITY', focus?.activity || 'No active workflow'],
      ['WORKFLOW', focus?.workflowLabel || '—'],
      ['STARTED', formatClock(focus?.startedAt || focus?.timestamp)],
      ['LAST EVENT', focus ? relativeTime(focus.timestamp) : '—'],
      ['LIVE HERE', `${live} of ${workflows.length || 0}`]
    ]);
    dockPanel(area.x, hexColor(area.color));
  }

  function openCamperPanel({ workflow, activeCount: liveCount, position, anim }) {
    const visual = visualForState(workflow?.displayState || 'idle');
    hudEyebrow.textContent = 'OPERATOR · INSPECT';
    hudTitle.textContent = 'SPAWNCAMPER9000';
    renderRows([
      ['STATUS', visual.label.toUpperCase()],
      ['WORKFLOW', workflow?.workflowLabel || 'None'],
      ['ACTIVITY', workflow?.activity || 'Standing by'],
      ['MODE', anim.replace(/_/g, ' ').toUpperCase()],
      ['POSITION', `${position.x},${position.y}`],
      ['ATTENDING', `${workflow ? 1 : 0} of ${liveCount} live workflow${liveCount === 1 ? '' : 's'}`]
    ]);
    dockPanel(position.x, hexColor(visual.tint));
  }

  function closePanel() {
    hud.hidden = true;
    selectedAreaId = '';
    scene?.clearInspection();
  }

  // Panel dismisses on any click outside. The world never pauses.
  document.addEventListener('pointerdown', (event) => {
    if (hud.hidden) return;
    if (hud.contains(event.target)) return;
    if (canvasHost.contains(event.target)) return;
    closePanel();
  });
  document.addEventListener('keydown', (event) => {
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
      ? `${active} CONCURRENT · ${focus.workflowLabel.toUpperCase()}`
      : state.overallStatus === 'offline'
        ? 'UPLINK OFFLINE · LAST KNOWN STATE'
        : 'NO WORKFLOWS · ROOM ALIVE, NOTHING OPERATIONAL';

    stripProgress.style.background = hexColor(visual.tint);
    stripProgress.style.width = `${Math.min(100, active * 25)}%`;

    // Up to 2 unattended workflows, dimmed.
    const unattended = state.workflows
      .filter((workflow) => workflow.isVisible && workflow !== focus)
      .slice(0, 2)
      .map((workflow) => {
        const item = el('li', 'mono');
        item.textContent = `▸ ${workflow.workflowLabel.toLowerCase()} · ${visualForState(workflow.displayState).label.toLowerCase()}`;
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
    selectedTitle.textContent = area.label;

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
      block.appendChild(el('h3', '', workflow.workflowLabel));
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
      item.appendChild(el('span', '', event.workflowLabel));
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

    renderRecentSignals(state);
    renderStrip(state);

    if (scene) scene.updatePublicState(state);

    const nextAreaId = selectedAreaId || state.primaryWorkflow?.areaId || 'central-operations';
    const selectedArea = areaById(nextAreaId);
    renderSelectedArea(selectedArea, workflowsForArea(state, selectedArea.id));
    if (!hud.hidden && selectedAreaId) {
      openZonePanel(selectedArea, workflowsForArea(state, selectedArea.id));
    }

    if (state.overallStatus !== 'offline') {
      setNetworkStatus(state.overallStatus, state.activeWorkflows.length
        ? `${state.activeWorkflows.length} active workflow${state.activeWorkflows.length === 1 ? '' : 's'}`
        : state.staleCount ? `${state.staleCount} stale workflow${state.staleCount === 1 ? '' : 's'}` : 'standing by');
    }
  }

  const client = createTelemetryClient({
    onState: renderState,
    onStatus({ status: networkStatus, error, lastGoodState }) {
      if (networkStatus === 'offline') {
        setNetworkStatus('offline', lastGoodState ? 'using last good state' : (error?.message || 'telemetry unavailable'));
        return;
      }
      if (networkStatus === 'syncing' && lastGoodState) {
        setNetworkStatus('syncing', 'refreshing telemetry');
        return;
      }
      setNetworkStatus(networkStatus, networkStatus === 'connecting' ? 'opening uplink' : 'telemetry live');
    }
  });

  window.addEventListener('pagehide', () => {
    client.stop();
    game.destroy(true);
  }, { once: true });

  client.start();
}
