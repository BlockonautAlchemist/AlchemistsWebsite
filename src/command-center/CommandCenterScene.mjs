import Phaser from 'phaser';
import {
  COMMAND_CENTER_ASSETS,
  COMMAND_CENTER_CANVAS,
  COMMAND_CENTER_STATIONS,
  stationById,
  stationIdForWorkflow
} from './sceneConfig.mjs';
import { visualForState } from './visualMappings.mjs';

const DEPTH = Object.freeze({
  background: 0,
  station: 20,
  packet: 45,
  agent: 60,
  bubble: 80
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CommandCenterScene extends Phaser.Scene {
  constructor(options = {}) {
    super({ key: 'CommandCenterScene' });
    this.options = options;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.stationObjects = new Map();
    this.packetObjects = [];
    this.latestState = null;
    this.selectedStationId = '';
  }

  preload() {
    COMMAND_CENTER_ASSETS.forEach((asset) => {
      if (asset.type === 'svg') {
        this.load.svg(asset.key, asset.url, {
          width: asset.width,
          height: asset.height
        });
      } else {
        this.load.image(asset.key, asset.url);
      }
    });
  }

  create() {
    this.cameras.main.setBounds(0, 0, COMMAND_CENTER_CANVAS.width, COMMAND_CENTER_CANVAS.height);
    this.cameras.main.setBackgroundColor('#111513');

    this.add
      .image(0, 0, 'cc-background')
      .setOrigin(0)
      .setDisplaySize(COMMAND_CENTER_CANVAS.width, COMMAND_CENTER_CANVAS.height)
      .setDepth(DEPTH.background);

    this.createStations();
    this.createAgent();
    this.setBubble('Awaiting telemetry heartbeat', 0xaeb8b0);
    this.moveAgentTo(COMMAND_CENTER_CANVAS.idlePoint, true);
    this.applyStationStates(new Map());

    if (typeof this.options.onReady === 'function') {
      this.options.onReady(this);
    }
  }

  createStations() {
    COMMAND_CENTER_STATIONS.forEach((station) => {
      const glow = this.add
        .ellipse(station.x, station.y + 8, station.hitArea.width, station.hitArea.height, 0x78f4c2, 0.1)
        .setDepth(DEPTH.station - 2)
        .setVisible(false);

      const sprite = this.add
        .image(station.x, station.y, 'cc-station')
        .setDisplaySize(96, 96)
        .setDepth(DEPTH.station)
        .setTint(0x839088);

      const label = this.add
        .text(station.x, station.y + 62, station.label.toUpperCase(), {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '14px',
          color: '#dbe8df',
          align: 'center'
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.station + 1);

      const status = this.add
        .text(station.x, station.y + 80, 'IDLE', {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11px',
          color: '#93a39a',
          align: 'center'
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.station + 1);

      const zone = this.add
        .zone(station.x, station.y + 10, station.hitArea.width, station.hitArea.height)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', () => {
        this.inspectStation(station.id);
      });

      zone.on('pointerover', () => {
        sprite.setScale(1.05);
      });

      zone.on('pointerout', () => {
        sprite.setScale(1);
      });

      this.stationObjects.set(station.id, {
        glow,
        label,
        sprite,
        station,
        status,
        workflows: []
      });
    });
  }

  createAgent() {
    const shadow = this.add.ellipse(0, 38, 60, 16, 0x000000, 0.35);
    const sprite = this.add.image(0, 0, 'cc-agent').setDisplaySize(82, 82);
    const badge = this.add
      .text(0, 48, 'SPAWNCAMPER9000', {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
        color: '#f8f0dc',
        align: 'center'
      })
      .setOrigin(0.5);

    this.agentContainer = this.add
      .container(COMMAND_CENTER_CANVAS.idlePoint.x, COMMAND_CENTER_CANVAS.idlePoint.y, [shadow, sprite, badge])
      .setDepth(DEPTH.agent);
    this.agentSprite = sprite;

    const bubbleBg = this.add
      .rectangle(0, -86, 360, 64, 0x0f1512, 0.92)
      .setStrokeStyle(2, 0x78f4c2, 0.8)
      .setOrigin(0.5);
    const bubbleText = this.add
      .text(0, -86, '', {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '15px',
        color: '#eaf6ed',
        align: 'center',
        wordWrap: { width: 320 }
      })
      .setOrigin(0.5);

    this.bubbleContainer = this.add
      .container(COMMAND_CENTER_CANVAS.idlePoint.x, COMMAND_CENTER_CANVAS.idlePoint.y, [bubbleBg, bubbleText])
      .setDepth(DEPTH.bubble);
    this.bubbleBg = bubbleBg;
    this.bubbleText = bubbleText;
  }

  updatePublicState(state) {
    this.latestState = state;
    const stationWorkflows = new Map();

    (state.workflows || []).forEach((workflow) => {
      const stationId = stationIdForWorkflow(workflow);
      const list = stationWorkflows.get(stationId) || [];
      list.push(workflow);
      stationWorkflows.set(stationId, list);
    });

    this.applyStationStates(stationWorkflows);

    const primary = state.primaryWorkflow;
    if (primary) {
      const station = stationById(stationIdForWorkflow(primary));
      this.moveAgentTo(station.destination);
      this.setAgentVisual(primary.displayState);
      this.setBubble(primary.activity, visualForState(primary.displayState).tint);
    } else if (state.overallStatus === 'offline') {
      this.moveAgentTo(COMMAND_CENTER_CANVAS.idlePoint);
      this.setAgentVisual('warning');
      this.setBubble('Telemetry uplink offline', 0xffcf5a);
    } else {
      this.moveAgentTo(COMMAND_CENTER_CANVAS.idlePoint);
      this.setAgentVisual('idle');
      this.setBubble('Standing by', 0xaeb8b0);
    }

    this.rebuildPackets(stationWorkflows);
  }

  setAgentVisual(state) {
    const visual = visualForState(state);
    this.agentSprite.setTint(visual.tint);

    if (this.reducedMotion) return;

    this.tweens.killTweensOf(this.agentSprite);
    const shouldBob = ['typing', 'thinking', 'celebrate_small', 'error'].includes(visual.agentMode);

    if (!shouldBob) {
      this.agentSprite.setY(0);
      return;
    }

    this.tweens.add({
      targets: this.agentSprite,
      y: visual.agentMode === 'celebrate_small' ? -8 : -4,
      duration: visual.agentMode === 'error' ? 180 : 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  moveAgentTo(point, immediate = false) {
    const x = clamp(point.x, 80, COMMAND_CENTER_CANVAS.width - 80);
    const y = clamp(point.y, 110, COMMAND_CENTER_CANVAS.height - 78);

    this.tweens.killTweensOf(this.agentContainer);
    this.tweens.killTweensOf(this.bubbleContainer);

    if (immediate || this.reducedMotion) {
      this.agentContainer.setPosition(x, y);
      this.bubbleContainer.setPosition(x, y);
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.agentContainer.x, this.agentContainer.y, x, y);
    const duration = clamp(distance * 3.2, 520, 1800);

    this.tweens.add({
      targets: [this.agentContainer, this.bubbleContainer],
      x,
      y,
      duration,
      ease: 'Sine.easeInOut'
    });
  }

  setBubble(text, tint) {
    const safeText = String(text || 'Standing by').slice(0, 150);
    this.bubbleText.setText(safeText);
    this.bubbleBg.setStrokeStyle(2, tint, 0.82);
  }

  applyStationStates(stationWorkflows) {
    this.stationObjects.forEach((object, stationId) => {
      const workflows = stationWorkflows.get(stationId) || [];
      const visibleWorkflow = workflows.find((workflow) => workflow.isVisible);
      const visual = visualForState(visibleWorkflow ? visibleWorkflow.displayState : 'idle');

      object.workflows = workflows;
      object.sprite.setTint(visual.stationTint);
      object.glow
        .setVisible(Boolean(visibleWorkflow))
        .setFillStyle(visual.stationTint, visual.severity === 'error' ? 0.24 : 0.14);
      object.label.setColor(visibleWorkflow ? '#ffffff' : '#dbe8df');
      object.status
        .setText(visibleWorkflow ? visual.label.toUpperCase() : 'IDLE')
        .setColor(visibleWorkflow ? '#ffffff' : '#93a39a');

      this.tweens.killTweensOf([object.glow, object.sprite]);
      object.glow.setScale(1);
      object.sprite.setScale(1);

      if (!this.reducedMotion && visual.pulse && visibleWorkflow) {
        this.tweens.add({
          targets: object.glow,
          scaleX: 1.12,
          scaleY: 1.12,
          alpha: 0.75,
          duration: visual.severity === 'error' ? 360 : 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }

  rebuildPackets(stationWorkflows) {
    this.packetObjects.forEach((packet) => {
      this.tweens.killTweensOf(packet);
      packet.destroy();
    });
    this.packetObjects = [];

    if (this.reducedMotion) return;

    stationWorkflows.forEach((workflows, stationId) => {
      const visible = workflows.filter((workflow) => workflow.isActive);
      if (!visible.length) return;

      const station = stationById(stationId);
      const route = station.packetRoute || [{ x: 640, y: 360 }, { x: station.x, y: station.y }];
      const visual = visualForState(visible[0].displayState);

      visible.slice(0, 3).forEach((_workflow, index) => {
        const packet = this.add
          .image(route[0].x, route[0].y, 'cc-packet')
          .setDisplaySize(20, 20)
          .setDepth(DEPTH.packet)
          .setTint(visual.tint)
          .setAlpha(0.92);
        this.packetObjects.push(packet);

        this.tweens.add({
          targets: packet,
          x: route[1].x,
          y: route[1].y,
          alpha: 0.2,
          duration: 1200 + index * 220,
          delay: index * 260,
          repeat: -1,
          ease: 'Sine.easeInOut',
          onRepeat: () => {
            packet.setPosition(route[0].x, route[0].y);
            packet.setAlpha(0.92);
          }
        });
      });
    });
  }

  inspectStation(stationId) {
    this.selectedStationId = stationId;
    const object = this.stationObjects.get(stationId);
    if (!object) return;

    this.options.onStationInspect?.({
      station: object.station,
      workflows: object.workflows
    });

    if (this.reducedMotion) return;

    this.tweens.add({
      targets: object.sprite,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeOut'
    });
  }
}
