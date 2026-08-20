import Phaser from 'phaser';
import { CommandCenterScene } from './src/command-center/CommandCenterScene.mjs';
import { COMMAND_CENTER_CANVAS, stationById } from './src/command-center/sceneConfig.mjs';
import { createTelemetryClient } from './src/command-center/telemetryClient.mjs';
import { visualForState } from './src/command-center/visualMappings.mjs';

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

if (typeof document !== 'undefined') {
  initCommandCenter();
}

function initCommandCenter() {
  const canvasHost = document.getElementById('cc-canvas');
  const status = document.getElementById('cc-status');
  const statusCopy = document.getElementById('cc-status-copy');
  const updatedAt = document.getElementById('cc-updated-at');
  const activeCount = document.getElementById('cc-active-count');
  const staleCount = document.getElementById('cc-stale-count');
  const workflowList = document.getElementById('cc-workflow-list');
  const historyList = document.getElementById('cc-history-list');
  const selectedTitle = document.getElementById('cc-selected-title');
  const selectedBody = document.getElementById('cc-selected-body');

  if (
    !canvasHost
    || !status
    || !statusCopy
    || !updatedAt
    || !activeCount
    || !staleCount
    || !workflowList
    || !historyList
    || !selectedTitle
    || !selectedBody
  ) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene = null;
  let latestState = null;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: COMMAND_CENTER_CANVAS.width,
    height: COMMAND_CENTER_CANVAS.height,
    backgroundColor: '#111513',
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
      onReady(readyScene) {
        scene = readyScene;
        if (latestState) scene.updatePublicState(latestState);
      },
      onStationInspect({ station, workflows }) {
        renderSelectedStation(station, workflows);
      }
    })
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatTime(value) {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return 'No heartbeat';

    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
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

  function renderCounters(state) {
    activeCount.textContent = String(state.activeWorkflows.length);
    staleCount.textContent = String(state.staleCount);
    updatedAt.textContent = formatTime(state.fetchedAt);
  }

  function renderWorkflowCard(workflow) {
    const visual = visualForState(workflow.displayState);
    const button = el('button', 'cc-workflow', '');
    button.type = 'button';
    button.dataset.state = visual.severity;
    button.style.setProperty('--workflow-color', `#${visual.tint.toString(16).padStart(6, '0')}`);

    const head = el('span', 'cc-workflow__head');
    head.appendChild(el('span', 'cc-workflow__label', workflow.workflowLabel));
    head.appendChild(el('span', 'cc-workflow__state mono', visual.label));

    const activity = el('span', 'cc-workflow__activity', workflow.activity);
    const meta = el('span', 'cc-workflow__meta mono');
    const station = stationById(workflow.stationId);
    meta.textContent = `${station.label} · ${relativeTime(workflow.timestamp)}`;

    button.append(head, activity, meta);
    button.addEventListener('click', () => {
      renderSelectedStation(station, [workflow]);
      if (scene) scene.inspectStation(station.id);
    });

    return button;
  }

  function renderWorkflows(state) {
    const workflows = state.workflows;

    if (!workflows.length) {
      const empty = el('p', 'cc-empty mono', 'awaiting first workflow heartbeat');
      workflowList.replaceChildren(empty);
      return;
    }

    workflowList.replaceChildren(...workflows.map(renderWorkflowCard));
  }

  function renderHistory(state) {
    const items = state.recentHistory.slice(0, 8).map((event) => {
      const item = el('li', 'cc-history__item');
      const visual = visualForState(event.state);
      item.style.setProperty('--history-color', `#${visual.tint.toString(16).padStart(6, '0')}`);
      item.appendChild(el('span', 'cc-history__label', event.workflowLabel));
      item.appendChild(el('span', 'cc-history__state mono', visual.label));
      item.appendChild(el('span', 'cc-history__time mono', relativeTime(event.timestamp)));
      return item;
    });

    if (!items.length) {
      historyList.replaceChildren(el('li', 'cc-empty mono', 'no recent events'));
      return;
    }

    historyList.replaceChildren(...items);
  }

  function renderSelectedStation(station, workflows = []) {
    selectedTitle.textContent = station.label;

    if (!workflows.length) {
      selectedBody.replaceChildren(el('p', 'cc-selected__empty mono', 'station idle'));
      return;
    }

    selectedBody.replaceChildren(...workflows.slice(0, 4).map((workflow) => {
      const block = el('article', 'cc-selected__workflow');
      const visual = visualForState(workflow.displayState);
      block.style.setProperty('--selected-color', `#${visual.tint.toString(16).padStart(6, '0')}`);
      block.appendChild(el('h3', '', workflow.workflowLabel));
      block.appendChild(el('p', '', workflow.activity));

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

  function renderState(state) {
    latestState = state;
    renderCounters(state);
    renderWorkflows(state);
    renderHistory(state);

    if (scene) scene.updatePublicState(state);

    const selectedStation = state.primaryWorkflow
      ? stationById(state.primaryWorkflow.stationId)
      : stationById('uplink');
    const selectedWorkflows = selectedStation
      ? state.workflows.filter((workflow) => workflow.stationId === selectedStation.id)
      : [];
    renderSelectedStation(selectedStation, selectedWorkflows);

    if (state.overallStatus !== 'offline') {
      setNetworkStatus(state.overallStatus, state.activeWorkflows.length
        ? `${state.activeWorkflows.length} active workflow${state.activeWorkflows.length === 1 ? '' : 's'}`
        : 'standing by');
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
