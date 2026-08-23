import Phaser from 'phaser';
import {
  COMMAND_CENTER_AREAS,
  COMMAND_CENTER_BUDGET,
  COMMAND_CENTER_CAMERA,
  COMMAND_CENTER_CANVAS,
  COMMAND_CENTER_COMPONENTS,
  COMMAND_CENTER_CONDUITS,
  COMMAND_CENTER_ENVIRONMENT,
  COMMAND_CENTER_FOREGROUND,
  COMMAND_CENTER_PALETTE as P,
  COMMAND_CENTER_PROPS,
  areaById
} from './sceneConfig.mjs';
import {
  CAMPER_SHEETS,
  camperFrameOrderFor,
  camperSheetFor,
  camperStaticFrameFor,
  createCamperVisuals
} from './camperSheets.mjs';
import {
  PROP_SHEETS,
  ensurePropAnimation,
  isAnimatedProp,
  propAnchorFor,
  propShadowFor,
  propPlaybackFor,
  propsToPreload,
  queuePropArt,
  replacedComponentKeys,
  replacedWhiteboxKeys
} from './propSheets.mjs';
import { COMMAND_CENTER_TIMINGS, visualForState } from './visualMappings.mjs';
import { routeThroughWalkGraph } from './walkGraph.mjs';

// Section 11 scene graph. L4 sits above L3 because every anchor is south of its
// machine, so the camper is always nearer the camera than the screen he works at.
// L6 always wins — that is the whole depth system.
const DEPTH = Object.freeze({
  env: 0,
  props: 10,
  anim: 20,
  camper: 25,
  fx: 30,
  fore: 40,
  hud: 100
});

const MONO = 'JetBrains Mono, ui-monospace, monospace';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexColor(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function latestWorkflowKey(workflow) {
  if (!workflow) return '';
  return `${workflow.workflow}:${workflow.displayState}:${workflow.eventId || workflow.id || workflow.timestamp || ''}`;
}

export class CommandCenterScene extends Phaser.Scene {
  constructor(options = {}) {
    super({ key: 'CommandCenterScene' });
    this.options = options;
    this.reducedMotion = Boolean(options.reducedMotion);
    this.artManifest = new Set(options.artManifest || []);
    this.zoneObjects = new Map();
    this.propObjects = new Map();
    // Animated machine art indexed by the zone it stands in, so the station seam
    // can wake or freeze one machine without searching the whole registry.
    this.propArtByZone = new Map();
    // The zone SpawnCamper is currently working at, '' when he is travelling or
    // idling at home. The only thing that grants a machine its loop.
    this.camperStationZoneId = '';
    this.pendingCamperZoneId = '';
    this.replacedComponents = new Set();
    this.componentObjects = new Map();
    this.conduitObjects = new Map();
    this.packetPool = [];
    this.completeKeys = new Set();
    this.latestState = null;
    this.selectedZoneId = '';
    this.phoneViewport = false;
    this.lastFocusAt = 0;
    this.focusZoneId = '';
  }

  hasArt(path) {
    return this.artManifest.has(path);
  }

  preload() {
    // Section 08 swap seam: art is queued only when the manifest says the file
    // exists, so the whitebox build makes zero failed requests.
    const queue = (entry) => {
      if (!entry.art || !this.hasArt(entry.art)) return;
      this.load.image(entry.key, entry.art);
    };
    // L1 first: the shell is one full-canvas image, not a per-entry registry.
    queue(COMMAND_CENTER_ENVIRONMENT);
    // L6 occluders are plain images and stay on their own seam — they are not
    // machine art and never became part of the prop registry.
    COMMAND_CENTER_FOREGROUND.forEach(queue);
    // L2/L3 machine art. Exactly two shapes exist: a static prop is one image,
    // a full animated object is one spritesheet. There is no third "overlay"
    // asset, and nothing is loaded twice when two instances share a file.
    propsToPreload(this.artManifest).forEach((entry) => queuePropArt(entry, this.load));
    // L4 character sheets ride the same seam. Each entry carries the frame size
    // its file was actually exported at — nothing is forced onto a shared grid.
    CAMPER_SHEETS.forEach((sheet) => {
      if (!this.hasArt(sheet.art)) return;
      this.load.spritesheet(sheet.key, sheet.art, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight
      });
    });
  }

  create() {
    this.cameras.main.setBounds(0, 0, COMMAND_CENTER_CANVAS.width, COMMAND_CENTER_CANVAS.height);
    this.cameras.main.setBackgroundColor(hexColor(P.bg1));
    this.cameras.main.roundPixels = true;

    this.buildEnvironment();
    this.buildProps();
    this.buildComponents();
    this.buildCamper();
    this.buildConduits();
    this.buildForeground();
    this.buildInteraction();

    this.configureViewport();
    this.scale.on('resize', () => this.configureViewport());

    this.startAmbient();
    this.applyAreaGroups([]);
    this.setOpsReadout({ status: 'connecting', active: 0, stale: 0 });

    this.bindVisibility();

    if (typeof this.options.onReady === 'function') this.options.onReady(this);
  }

  bindVisibility() {
    if (typeof document === 'undefined') return;
    // Section 11 budget: a tab left open overnight must cost nothing.
    this.visibilityHandler = () => {
      if (document.hidden) this.scene.pause();
      else this.scene.resume();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    });
  }

  // -------------------------------------------------------------------------
  // Viewport / camera (section 10)
  // -------------------------------------------------------------------------

  configureViewport() {
    const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const portrait = typeof window === 'undefined'
      ? false
      : window.matchMedia('(orientation: portrait)').matches;
    const phone = width <= COMMAND_CENTER_CAMERA.phoneMaxWidth && portrait;

    if (phone === this.phoneViewport && this.viewportReady) return;
    this.phoneViewport = phone;
    this.viewportReady = true;

    const view = phone ? COMMAND_CENTER_CAMERA.focusWindow : COMMAND_CENTER_CANVAS;
    this.scale.resize(view.width, view.height);
    // Camera zoom stays integer: a fractional world zoom kills the pixel grid.
    // Presentation scale is handled by CSS on the canvas element instead.
    this.cameras.main.setZoom(COMMAND_CENTER_CAMERA.baseZoom);
    this.cameras.main.setBounds(0, 0, COMMAND_CENTER_CANVAS.width, COMMAND_CENTER_CANVAS.height);

    if (phone) this.focusCamera(COMMAND_CENTER_CAMERA.idleFocus, true);
    else this.cameras.main.centerOn(COMMAND_CENTER_CANVAS.width / 2, COMMAND_CENTER_CANVAS.height / 2);
  }

  focusCamera(point, immediate = false) {
    if (!this.phoneViewport) return;
    const camera = this.cameras.main;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (immediate || this.reducedMotion) {
      camera.centerOn(x, y);
      return;
    }
    // Never snap-cut between zones.
    camera.pan(x, y, COMMAND_CENTER_CAMERA.focusLerpMs, 'Sine.easeOut');
  }

  focusZone(zoneId) {
    if (!this.phoneViewport || !zoneId) return;
    const now = this.time.now;
    // Hold at least 8s before moving again.
    if (zoneId === this.focusZoneId) return;
    if (now - this.lastFocusAt < COMMAND_CENTER_CAMERA.focusHoldMs) return;
    const area = areaById(zoneId);
    this.focusZoneId = zoneId;
    this.lastFocusAt = now;
    this.focusCamera({ x: area.x, y: area.y + 60 });
  }

  update() {
    const camera = this.cameras.main;
    // Round scroll to integers every frame (section 01).
    camera.scrollX = Math.round(camera.scrollX);
    camera.scrollY = Math.round(camera.scrollY);
  }

  // -------------------------------------------------------------------------
  // L1 · static environment
  // -------------------------------------------------------------------------

  buildEnvironment() {
    const env = COMMAND_CENTER_ENVIRONMENT;
    const { width, height, wallBandHeight, tileSize } = COMMAND_CENTER_CANVAS;

    // Section 08 swap seam for L1. env_floor_wall.png is the permanent
    // architectural shell: one opaque 960x528 image covering the whole canvas.
    // The whitebox below is the fallback and is never removed — an absent or
    // unlisted file still draws the scale-true floor and walls.
    this.envArtLoaded = this.textures.exists(env.key);

    if (this.envArtLoaded) {
      const texture = this.textures.get(env.key);
      const nearest = Phaser.Textures?.FilterMode?.NEAREST;
      if (texture && typeof texture.setFilter === 'function' && nearest !== undefined) {
        texture.setFilter(nearest);
      }
      // Native size at scene origin: no resize, no display size, no fractional scale.
      this.add.image(0, 0, env.key).setOrigin(0, 0).setDepth(DEPTH.env);
    } else {
      const g = this.add.graphics().setDepth(DEPTH.env);

      // Floor: 24px tile grid with a 1px seam, exactly as the design draws it.
      g.fillStyle(env.floorFill, 1);
      g.fillRect(0, wallBandHeight, width, height - wallBandHeight);
      g.fillStyle(env.floorTileFill, 1);
      for (let x = tileSize - 1; x < width; x += tileSize) g.fillRect(x, wallBandHeight, 1, height - wallBandHeight);
      for (let y = wallBandHeight + tileSize - 1; y < height; y += tileSize) g.fillRect(0, y, width, 1);

      // Wall band with its vertical gradient and pipe run.
      for (let y = 0; y < wallBandHeight; y += 1) {
        g.fillStyle(this.mixColor(env.wallTop, env.wallBottom, y / wallBandHeight), 1);
        g.fillRect(0, y, width, 1);
      }
      g.fillStyle(env.pipeFill, 1);
      g.fillRect(0, 6, width, 10);
      g.fillStyle(env.wallTrim, 1);
      g.fillRect(0, wallBandHeight - 3, width, 3);

      // Shadow the wall casts onto the floor.
      for (let y = 0; y < 14; y += 1) {
        g.fillStyle(P.void, 0.55 * (1 - y / 14));
        g.fillRect(0, wallBandHeight + y, width, 1);
      }

      env.floorMarkings.forEach((mark) => {
        g.fillStyle(mark.color, mark.alpha);
        g.fillRect(mark.x, mark.y, mark.w, mark.h);
      });
    }

    // Recessed conduit channels (dark inlays, no glow — the glow is L5). These map
    // to env_conduit_channels.png, a separate later pass, so they stay whitebox
    // either way: the floor art paints no conduits for them to duplicate.
    const channels = this.add.graphics().setDepth(DEPTH.env + 1);
    COMMAND_CENTER_CONDUITS.forEach((conduit) => {
      if (conduit.beam) return;
      const rect = this.conduitRect(conduit);
      channels.fillStyle(P.bg0, 1);
      channels.fillRect(rect.x, rect.y, rect.w, rect.h);
      channels.fillStyle(P.cyan, 0.14);
      if (conduit.axis === 'h') channels.fillRect(rect.x, rect.y, rect.w, 1);
      else channels.fillRect(rect.x, rect.y, 1, rect.h);
    });

    // Stencils are painted onto the wall band, so they belong to the shell the
    // art replaces. Edge labels are scene-edge signage and always stay.
    if (!this.envArtLoaded) {
      env.stencils.forEach((stencil) => {
        this.add.text(stencil.x, stencil.y, stencil.text, {
          fontFamily: MONO, fontSize: '8px', color: hexColor(P.warn)
        }).setAlpha(0.4).setDepth(DEPTH.env + 2);
      });
    }

    env.edgeLabels.forEach((label) => {
      this.add.text(label.x, label.y, label.text, {
        fontFamily: MONO, fontSize: '8px', color: hexColor(label.color)
      }).setAlpha(label.alpha).setDepth(DEPTH.fore + 1);
    });
  }

  /**
   * Section 08 `fx_local_glow`: one 128x128 additive radial, tinted and scaled per
   * zone. Generated here until the PNG exists — a flat ellipse blows out to a solid
   * blob, which is the one thing the design's soft core must never look like.
   */
  ensureGlowTexture() {
    const key = 'fx_local_glow';
    if (this.textures.exists(key)) return key;
    const size = 128;
    const canvas = this.textures.createCanvas(key, size, size);
    const ctx = canvas.getContext();
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.10)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
    return key;
  }

  addGlow(x, y, width, height, color, alpha, additive = true) {
    return this.add
      .image(x, y, this.ensureGlowTexture())
      .setDisplaySize(width, height)
      .setTint(color)
      .setAlpha(alpha)
      .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
  }

  mixColor(from, to, t) {
    const a = Phaser.Display.Color.IntegerToColor(from);
    const b = Phaser.Display.Color.IntegerToColor(to);
    return Phaser.Display.Color.GetColor(
      Math.round(a.red + (b.red - a.red) * t),
      Math.round(a.green + (b.green - a.green) * t),
      Math.round(a.blue + (b.blue - a.blue) * t)
    );
  }

  conduitRect(conduit) {
    if (conduit.axis === 'h') {
      return { x: conduit.x, y: conduit.y, w: conduit.length, h: conduit.thickness };
    }
    return { x: conduit.x, y: conduit.y, w: conduit.thickness, h: conduit.length };
  }

  // -------------------------------------------------------------------------
  // L2 · static prop bodies
  // -------------------------------------------------------------------------

  /**
   * Registers one looping animation per loaded full-object sheet, and pins every
   * loaded prop texture to NEAREST. Runs once, from buildProps.
   */
  ensurePropAnimations() {
    PROP_SHEETS.forEach((entry) => {
      if (!this.textures.exists(entry.textureKey)) return;

      const texture = this.textures.get(entry.textureKey);
      const nearest = Phaser.Textures?.FilterMode?.NEAREST;
      if (texture && typeof texture.setFilter === 'function' && nearest !== undefined) {
        texture.setFilter(nearest);
      }

      // No-op for static props, and guarded against re-creation for animated
      // ones: the loop is registered once and never restarted afterwards.
      ensurePropAnimation(entry, this.anims);
    });
  }

  /**
   * Paints one registered asset. A static PNG and a full animated sheet take the
   * same code path at the same depth — animating is not a reason to invent a
   * layer. The anchor is derived from the machine's whitebox box in
   * sceneConfig.mjs, so art larger than the whitebox grows upward and outward
   * from the same floor contact point instead of sliding off its station.
   */
  addPropArt(entry) {
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === entry.covers[0]);
    const at = propAnchorFor(entry, box);
    if (!at) return;

    const object = isAnimatedProp(entry)
      ? this.add.sprite(at.x, at.y, entry.textureKey)
      : this.add.image(at.x, at.y, entry.textureKey);
    object.setOrigin(at.originX, at.originY).setScale(at.scale).setDepth(DEPTH.props);

    // Turning a machine around is a registry edit, not an art edit: the sheet on
    // disk stays exactly what Sprite Fusion exported. Safe about a centred
    // origin, so the floor contact point is unmoved.
    if (entry.flipX) object.setFlipX(true);

    // Every machine builds still, holding the first frame of its own sheet. The
    // loop is not an ambient default: it is granted by `setCamperStation` when
    // SpawnCamper arrives to work here, and taken back when he leaves. Reduced
    // motion holds the same frame permanently rather than needing a second PNG.
    const playback = propPlaybackFor(entry, { reducedMotion: this.reducedMotion, active: false });
    if (playback?.kind === 'frame') object.setFrame(playback.frame);
    else if (playback?.kind === 'play' && this.anims.exists(playback.key)) object.play(playback.key, true);

    this.propObjects.set(entry.id, object);

    // Indexed by the whitebox box's own zone — the registry carries no zone of
    // its own, and does not need to: `covers[0]` already names the body, and the
    // body already knows where it stands.
    if (isAnimatedProp(entry) && box?.zone) {
      const list = this.propArtByZone.get(box.zone) || [];
      list.push({ entry, object });
      this.propArtByZone.set(box.zone, list);
    }
  }

  /**
   * Play or freeze every animated machine standing in one zone. The only place
   * machine playback is touched after build time, and the only reason a sheet
   * ever runs: an unattended machine holds `propStaticFrameFor` — the first
   * frame of the sheet it was exported from.
   */
  setZonePropArtActive(zoneId, active) {
    (this.propArtByZone.get(zoneId) || []).forEach(({ entry, object }) => {
      const playback = propPlaybackFor(entry, { reducedMotion: this.reducedMotion, active });
      if (playback?.kind === 'frame') {
        object.anims?.stop();
        object.setFrame(playback.frame);
      } else if (playback?.kind === 'play' && this.anims.exists(playback.key)) {
        object.play(playback.key, true);
      }
    });
  }

  /**
   * The station seam. One zone at a time holds SpawnCamper's attention, and only
   * that zone's machine runs — its sheet loop and, for a machine still on the
   * whitebox fallback, its operational components. Everything else in the room
   * stays frozen no matter how many workflows are live, which is the whole point:
   * motion means he is standing there, not that telemetry is busy.
   *
   * Re-running `applyAreaGroups` re-evaluates the zone being left and the zone
   * being entered off the last telemetry; it is cheap because `applyZoneState`
   * already skips components whose mode did not change.
   */
  setCamperStation(zoneId) {
    const next = zoneId || '';
    if (next === this.camperStationZoneId) return;

    if (this.camperStationZoneId) this.setZonePropArtActive(this.camperStationZoneId, false);
    this.camperStationZoneId = next;
    if (next) this.setZonePropArtActive(next, true);

    if (this.latestState) this.applyAreaGroups(this.latestState.areaGroups || []);
  }

  /**
   * The contact shadow under one piece of art. Machine sheets bake no shadow —
   * they cannot, since the same object is reused wherever the registry anchors
   * it — so the floor pool is generated here from the existing radial texture,
   * tinted void and squashed flat. `DEPTH.props - 1` keeps it under every prop
   * without inventing a layer the DEPTH map would have to name.
   */
  addPropShadow(entry) {
    const box = COMMAND_CENTER_PROPS.find((prop) => prop.key === entry.covers[0]);
    const at = propShadowFor(entry, box);
    if (!at) return;

    this.addGlow(at.x, at.y, at.width, at.height, P.void, at.alpha, false)
      .setDepth(DEPTH.props - 1);
  }

  buildProps() {
    const g = this.add.graphics().setDepth(DEPTH.props);
    this.ensurePropAnimations();

    // A real asset is the complete machine, so it owns both its whitebox body
    // and every whitebox component that machine used to need. Anything without
    // art keeps its whitebox: that is the whole development fallback.
    const live = PROP_SHEETS.filter((entry) => this.textures.exists(entry.textureKey));
    const replacedProps = replacedWhiteboxKeys(live);
    this.replacedComponents = replacedComponentKeys(live);

    COMMAND_CENTER_PROPS.forEach((prop) => {
      if (replacedProps.has(prop.key)) return;
      prop.parts.forEach((part) => this.drawWhiteboxPart(g, prop, part));
      const glyphPart = prop.parts.find((part) => part.glyph);
      if (glyphPart) {
        this.add.text(prop.x + prop.w / 2, prop.y + prop.h / 2, glyphPart.glyph, {
          fontFamily: 'Russo One, sans-serif', fontSize: '20px', color: hexColor(P.gold)
        }).setOrigin(0.5).setDepth(DEPTH.props + 1);
      }
    });

    // Shadows first, as one pass: every pool has to end up under every machine,
    // not just under its own, and art is drawn in registry order at one flat
    // depth.
    live.forEach((entry) => this.addPropShadow(entry));
    live.forEach((entry) => this.addPropArt(entry));

    // Zone number stencils, as in the design's whitebox.
    COMMAND_CENTER_AREAS.forEach((area) => {
      const label = this.zoneNumberAnchor(area);
      this.add.text(label.x, label.y, area.zoneNumber, {
        fontFamily: MONO, fontSize: '9px', color: hexColor(P.gold)
      }).setDepth(DEPTH.props + 2).setAlpha(0.85);
    });
  }

  zoneNumberAnchor(area) {
    const first = area.hitRects[0];
    return { x: first.x + 6, y: first.y - 16 };
  }

  drawWhiteboxPart(g, prop, part) {
    const x = prop.x + part.x;
    const y = prop.y + part.y;
    const radius = part.radius;

    if (part.shadow) {
      g.fillStyle(0x120319, 1);
      this.fillMaybeRounded(g, x, y + part.shadow, part.w, part.h, radius);
    }

    g.fillStyle(part.fill, 1);
    if (part.taper) {
      // Angled wall vent: narrower at the top, matching the design's clip-path.
      const inset = part.w * part.taper;
      g.fillPoints([
        { x: x + inset, y },
        { x: x + part.w - inset, y },
        { x: x + part.w, y: y + part.h },
        { x, y: y + part.h }
      ], true);
    } else {
      this.fillMaybeRounded(g, x, y, part.w, part.h, radius);
    }

    if (part.stroke !== undefined) {
      g.lineStyle(part.strokeWidth || 1, part.stroke, part.strokeAlpha === undefined ? 1 : part.strokeAlpha);
      if (radius) g.strokeRoundedRect(x, y, part.w, part.h, this.radiusObject(radius));
      else g.strokeRect(x, y, part.w, part.h);
    }
    if (part.inset) {
      g.lineStyle(1, P.line, part.inset);
      g.strokeRect(x + 2, y + 2, part.w - 4, part.h - 4);
    }
  }

  fillMaybeRounded(g, x, y, w, h, radius) {
    if (radius) g.fillRoundedRect(x, y, w, h, this.radiusObject(radius));
    else g.fillRect(x, y, w, h);
  }

  radiusObject(radius) {
    if (typeof radius === 'number') return radius;
    return { tl: radius[0], tr: radius[1], br: radius[2], bl: radius[3] };
  }

  // -------------------------------------------------------------------------
  // L3 · whitebox machine components (development fallback)
  // -------------------------------------------------------------------------

  buildComponents() {
    COMMAND_CENTER_COMPONENTS.forEach((spec) => {
      // Subsumed by a real machine asset (buildProps runs first). No whitebox
      // screen, LED, sweep or coil is ever drawn over finished art.
      if (this.replacedComponents.has(spec.key)) return;
      const container = this.add.container(spec.x, spec.y).setDepth(DEPTH.anim);
      const object = {
        spec,
        container,
        parts: {},
        ambientTweens: [],
        operationalTweens: [],
        operational: false
      };
      this.buildComponentParts(object);
      this.componentObjects.set(spec.key, object);
    });
  }

  screenBase(object, colorOverride) {
    const { spec } = object;
    const screen = this.add
      .rectangle(0, 0, spec.w, spec.h, spec.screen === undefined ? P.bg0 : spec.screen, 1)
      .setOrigin(0, 0);
    screen.setStrokeStyle(1, colorOverride === undefined ? (spec.bezel || spec.color) : colorOverride, 0.55);
    object.container.add(screen);
    object.parts.screen = screen;
    return screen;
  }

  addScanline(object, height, color, alpha = 0.16) {
    const { spec } = object;
    const bar = this.add
      .rectangle(0, 0, spec.w, height, color === undefined ? spec.color : color, alpha)
      .setOrigin(0, 0);
    object.container.add(bar);
    object.parts.scanline = bar;
    return bar;
  }

  addMonoText(object, x, y, text, color, alpha = 1, size = '8px') {
    const node = this.add.text(x, y, text, {
      fontFamily: MONO, fontSize: size, color: hexColor(color), lineSpacing: 2
    }).setAlpha(alpha);
    object.container.add(node);
    return node;
  }

  buildComponentParts(object) {
    const { spec } = object;

    // Whitebox only. The superseded path here rendered a per-component `anim_*`
    // overlay PNG, which left `parts` half-populated and crashed the operational
    // tweens; real art now arrives as one complete machine via propSheets.mjs.
    switch (spec.kind) {
      case 'ops-crt': {
        this.screenBase(object);
        object.parts.lines = this.addMonoText(object, 6, 5, '', spec.color, 1, '9px');
        this.addScanline(object, 12, spec.color, 0.16);
        break;
      }
      case 'crt-row': {
        object.parts.cells = [];
        for (let i = 0; i < spec.cells; i += 1) {
          const cell = this.add
            .rectangle(i * (spec.cellWidth + spec.cellGap), 0, spec.cellWidth, spec.h, i === 2 ? 0x1c0d24 : spec.screen, 1)
            .setOrigin(0, 0);
          cell.setStrokeStyle(1, i === 2 ? P.bg4 : spec.bezel, 0.8);
          object.container.add(cell);
          object.parts.cells.push(cell);
        }
        break;
      }
      case 'keyboard': {
        const keys = this.add.graphics();
        for (let x = 0; x < spec.w; x += 8) {
          keys.fillStyle(P.bg4, 1);
          keys.fillRect(x, 0, 6, spec.h);
        }
        object.container.add(keys);
        const ripple = this.add.rectangle(0, 0, 10, spec.h, spec.color, 0.55).setOrigin(0, 0).setVisible(false);
        object.container.add(ripple);
        object.parts.ripple = ripple;
        break;
      }
      case 'caret': {
        const caret = this.add.rectangle(0, 0, spec.w, spec.h, spec.color, 0.5).setOrigin(0, 0);
        object.container.add(caret);
        object.parts.caret = caret;
        break;
      }
      case 'feed-bank': {
        object.parts.cells = [];
        object.parts.bars = [];
        for (let i = 0; i < spec.cells; i += 1) {
          const x = i * (spec.cellWidth + spec.cellGap);
          const cell = this.add.rectangle(x, 0, spec.cellWidth, spec.h, spec.screen, 1).setOrigin(0, 0);
          cell.setStrokeStyle(1, spec.bezel, 1);
          const bar = this.add.rectangle(x, 0, spec.cellWidth, 8, spec.color, 0.2).setOrigin(0, 0);
          object.container.add(cell);
          object.container.add(bar);
          object.parts.cells.push(cell);
          object.parts.bars.push(bar);
        }
        break;
      }
      case 'radar': {
        const dish = this.add.ellipse(spec.w / 2, spec.h / 2, spec.w, spec.h, 0x02181d, 1);
        dish.setStrokeStyle(1, spec.color, 0.3);
        object.container.add(dish);
        const sweep = this.add.graphics();
        sweep.fillStyle(spec.color, 0.4);
        sweep.slice(0, 0, spec.w / 2, Phaser.Math.DegToRad(-14), Phaser.Math.DegToRad(14), false);
        sweep.fillPath();
        sweep.setPosition(spec.w / 2, spec.h / 2).setVisible(false);
        object.container.add(sweep);
        object.parts.sweep = sweep;
        const centre = this.add.rectangle(spec.w / 2 - 2, spec.h / 2 - 2, 4, 4, spec.color, 1).setOrigin(0, 0);
        const blip = this.add.rectangle(20, 48, 3, 3, spec.accent, 1).setOrigin(0, 0);
        object.container.add(centre);
        object.container.add(blip);
        object.parts.blip = blip;
        break;
      }
      case 'scan-bar': {
        this.screenBase(object, spec.bezel);
        const bar = this.add.rectangle(0, 0, 16, spec.h, spec.color, 0.75).setOrigin(0, 0).setVisible(false);
        object.container.add(bar);
        object.parts.bar = bar;
        break;
      }
      case 'lamp': {
        const lamp = this.add.rectangle(0, 0, spec.w, spec.h, spec.color, 1).setOrigin(0, 0);
        object.container.add(lamp);
        object.parts.lamp = lamp;
        break;
      }
      case 'code-crt': {
        this.screenBase(object, spec.bezel);
        object.parts.lines = this.addMonoText(object, 5, 3, '', spec.color, 0.35);
        break;
      }
      case 'led-stack': {
        object.parts.leds = [];
        for (let i = 0; i < spec.cells; i += 1) {
          const led = this.add
            .rectangle(3, 3 + i * 8, 12, 4, i === 2 ? spec.accent : spec.color, i === 0 ? 1 : 0.45)
            .setOrigin(0, 0);
          object.container.add(led);
          object.parts.leds.push(led);
        }
        break;
      }
      case 'reel':
      case 'coil': {
        const ring = this.add.ellipse(spec.w / 2, spec.h / 2, spec.w, spec.h, 0x000000, 0);
        ring.setStrokeStyle(2, spec.kind === 'reel' ? P.bg4 : spec.color, spec.kind === 'reel' ? 1 : 0.6);
        const spoke = this.add.rectangle(spec.w / 2, spec.h / 2, 2, spec.h - 4, P.line, 0.55);
        const group = this.add.container(0, 0, [ring, spoke]);
        object.container.add(group);
        object.parts.spinner = group;
        if (spec.kind === 'coil') group.setVisible(false);
        break;
      }
      case 'chamber': {
        const glass = this.add.rectangle(0, 0, spec.w, spec.h, spec.screen, 1).setOrigin(0, 0);
        glass.setStrokeStyle(1, P.cyan, 0.22);
        object.container.add(glass);
        const fill = this.add.rectangle(0, spec.h, spec.w, spec.h, spec.color, 0.7).setOrigin(0, 1);
        fill.setScale(1, 0.08).setVisible(false);
        object.container.add(fill);
        object.parts.fill = fill;
        const ridges = this.add.graphics();
        for (let y = 0; y < spec.h; y += 4) {
          ridges.fillStyle(0xffffff, 0.05);
          ridges.fillRect(0, y, spec.w, 1);
        }
        object.container.add(ridges);
        break;
      }
      case 'tray': {
        this.screenBase(object, spec.bezel);
        const print = this.add.graphics();
        for (let x = 0; x < 40; x += 6) {
          print.fillStyle(spec.color, 0.5);
          print.fillRect(4 + x, 4, 3, 12);
        }
        print.setVisible(false);
        object.container.add(print);
        object.parts.print = print;
        const sheet = this.add.rectangle(12, -18, 24, 16, P.ink, 0.8).setOrigin(0, 0).setVisible(false);
        object.container.add(sheet);
        object.parts.sheet = sheet;
        break;
      }
      case 'x-crt':
      case 'tx-crt': {
        this.screenBase(object, spec.bezel);
        object.parts.lines = this.addMonoText(object, 5, 4, '', spec.color, 0.4);
        this.addScanline(object, spec.kind === 'x-crt' ? 10 : 12, spec.color, 0.16);
        break;
      }
      case 'lamp-grid': {
        object.parts.leds = [];
        const colors = [P.magenta, P.cyan, P.gold, P.phosphor];
        for (let i = 0; i < spec.cells; i += 1) {
          const led = this.add
            .rectangle(6 + (i % 2) * 11, 6 + Math.floor(i / 2) * 11, 6, 6, colors[i], i === 2 ? 0.5 : 1)
            .setOrigin(0, 0);
          object.container.add(led);
          object.parts.leds.push(led);
        }
        break;
      }
      case 'dish': {
        const orb = this.add.ellipse(4, 4, spec.w, spec.h, spec.color, 1).setVisible(false);
        object.container.add(orb);
        object.parts.orb = orb;
        break;
      }
      case 'charge-orb': {
        const ring = this.add.ellipse(spec.w / 2, spec.h / 2, spec.w, spec.h, 0x000000, 0);
        ring.setStrokeStyle(2, spec.color, 0.4);
        object.container.add(ring);
        const orb = this.add.ellipse(spec.w / 2, spec.h / 2, 16, 16, spec.color, 1).setVisible(false);
        object.container.add(orb);
        object.parts.orb = orb;
        break;
      }
      case 'led-bank': {
        object.parts.leds = [];
        const colors = [spec.color, spec.color, spec.accent, P.gold];
        for (let i = 0; i < spec.cells; i += 1) {
          const bar = this.add.graphics();
          for (let x = 0; x < spec.w - 8; x += 9) {
            bar.fillStyle(colors[i], 1);
            bar.fillRect(x, 0, 4, 8);
          }
          bar.setPosition(4, 4 + i * 14).setAlpha(i === 3 ? 0.4 : 0.8 - i * 0.1);
          object.container.add(bar);
          object.parts.leds.push(bar);
        }
        break;
      }
      case 'fan-stack': {
        object.parts.fans = [];
        for (let i = 0; i < spec.cells; i += 1) {
          const ring = this.add.ellipse(0, 0, 34, 34, 0x000000, 0);
          ring.setStrokeStyle(2, P.bg4, 1);
          const blade = this.add.rectangle(0, 0, 2, 30, spec.color, 0.55);
          const fan = this.add.container(spec.w / 2, 21 + i * 42, [ring, blade]);
          object.container.add(fan);
          object.parts.fans.push(fan);
        }
        break;
      }
      case 'furnace': {
        this.screenBase(object, spec.bezel);
        const heat = this.add.rectangle(0, spec.h, spec.w, 24, spec.color, 0.55).setOrigin(0, 1).setAlpha(0.22);
        object.container.add(heat);
        object.parts.heat = heat;
        object.parts.lines = this.addMonoText(object, 6, 5, 'FURNACE ⌁ IDLE', spec.color, 0.75);
        break;
      }
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Ambient loops. Section 11: run always, seeded with random phase offsets, and
  // they never consult telemetry.
  // -------------------------------------------------------------------------

  startAmbient() {
    if (this.reducedMotion) return;

    this.componentObjects.forEach((object) => {
      const { spec, parts } = object;
      const delay = Phaser.Math.Between(0, 1800);
      const add = (config) => {
        const tween = this.tweens.add({ ...config, delay });
        object.ambientTweens.push(tween);
        return tween;
      };

      if (parts.scanline) {
        add({
          targets: parts.scanline,
          y: spec.h,
          duration: 3200 + Phaser.Math.Between(0, 1200),
          repeat: -1,
          ease: 'Linear',
          onRepeat: () => parts.scanline.setY(-parts.scanline.height)
        });
      }
      if (parts.bars) {
        parts.bars.forEach((bar, index) => {
          add({
            targets: bar,
            y: spec.h,
            duration: 2900 + index * 400,
            repeat: -1,
            ease: 'Linear',
            onRepeat: () => bar.setY(-bar.height)
          });
        });
      }
      if (spec.ambient === 'blink' && parts.lamp) {
        add({ targets: parts.lamp, alpha: 0.14, duration: 1400, yoyo: true, repeat: -1, ease: 'Stepped' });
      }
      if (parts.leds) {
        parts.leds.forEach((led, index) => {
          add({
            targets: led,
            alpha: 0.18,
            duration: 1100 + index * 400,
            yoyo: true,
            repeat: -1,
            ease: 'Stepped'
          });
        });
      }
      if (spec.ambient === 'blink' && parts.caret) {
        add({ targets: parts.caret, alpha: 0.1, duration: 800, yoyo: true, repeat: -1, ease: 'Stepped' });
      }
      if (spec.kind === 'reel' && parts.spinner) {
        add({ targets: parts.spinner, angle: 360, duration: 4000, repeat: -1, ease: 'Linear' });
      }
      if (parts.fans) {
        parts.fans.forEach((fan, index) => {
          add({ targets: fan, angle: 360, duration: 1100 + index * 500, repeat: -1, ease: 'Linear' });
        });
      }
      if (parts.blip) {
        add({ targets: parts.blip, alpha: 0.1, duration: 2200, yoyo: true, repeat: -1, ease: 'Stepped' });
      }
      if (spec.kind === 'ops-crt' || spec.kind === 'crt-row') {
        const targets = parts.cells || [parts.screen];
        targets.filter(Boolean).forEach((cell, index) => {
          add({ targets: cell, alpha: 0.72, duration: 5000 + index * 900, yoyo: true, repeat: -1, ease: 'Stepped' });
        });
      }
      if (parts.heat) {
        add({ targets: parts.heat, alpha: 0.5, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });

    // Idle spine traffic: one slow cyan packet every ~9s. Reads as "powered", not "busy".
    this.time.addEvent({
      delay: COMMAND_CENTER_BUDGET.idleSpineIntervalMs,
      loop: true,
      callback: () => {
        if (this.hasOperationalTraffic) return;
        this.emitPacket(COMMAND_CENTER_CONDUITS[0], { slow: true });
      }
    });
  }

  // -------------------------------------------------------------------------
  // L4 · SpawnCamper9000 (section 03)
  // -------------------------------------------------------------------------

  /**
   * Registers one looping Phaser animation per loaded sheet. Without this the
   * sprite branch renders a frozen frame 0 — `playCamperAnimation` only ever
   * looks animations up, it never creates them.
   */
  ensureCamperAnimations() {
    CAMPER_SHEETS.forEach((sheet) => {
      if (!this.textures.exists(sheet.key)) return;

      // Belt and braces on top of the game config's `pixelArt: true`: hard pixel
      // edges, no smoothing, and therefore no interpolation across the sheet's
      // fully-transparent pixels.
      const texture = this.textures.get(sheet.key);
      const nearest = Phaser.Textures?.FilterMode?.NEAREST;
      if (texture && typeof texture.setFilter === 'function' && nearest !== undefined) {
        texture.setFilter(nearest);
      }

      const key = `camper_${sheet.anim}`;
      if (this.anims.exists(key)) return;
      // Playback order is registry data: a sheet exported back-to-front (the
      // mirrored walk_right strip) declares its own order rather than being
      // re-exported or flipped at runtime.
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet.key, { frames: camperFrameOrderFor(sheet) }),
        frameRate: sheet.fps,
        repeat: sheet.repeat
      });
    });
  }

  buildCamper() {
    const home = COMMAND_CENTER_CANVAS.homePoint;
    this.ensureCamperAnimations();

    const idleSheet = camperSheetFor('idle');
    if (idleSheet && this.textures.exists(idleSheet.key)) {
      // Origin sits on the character's ground contact, so the walk graph and the
      // station anchors keep addressing the same point they always did.
      const sprite = this.add
        .sprite(0, 0, idleSheet.key)
        .setOrigin(idleSheet.originX, idleSheet.originY)
        .setScale(idleSheet.scale);

      // This export bakes no contact shadow (the 48x64 contract did), so the
      // whitebox rig's ellipse stays, resized to the measured foot span. Drop
      // this once a sheet ships with its own shadow.
      const shadow = idleSheet.bakedShadow
        ? null
        : this.add.ellipse(0, -2, 72, 8, P.void, 0.6);

      this.camperSheet = idleSheet;
      this.camperSprite = sprite;
      this.camperBody = sprite;
      this.camperShadow = shadow;
      this.camperRig = this.add
        .container(home.x, home.y, shadow ? [shadow, sprite] : [sprite])
        .setDepth(DEPTH.camper);
      this.camperIsSprite = true;
    } else {
      // The design's 48x64 whitebox rig, drawn relative to a bottom-centre origin
      // at (24, 60). Replaced wholesale by row-based sprite frames when the sheet lands.
      const px = (x) => x - 24;
      const py = (y) => y - 60;
      const shadow = this.add.ellipse(px(24), py(60), 32, 8, P.void, 0.6);
      const dome = this.add.rectangle(px(24), py(9), 20, 18, 0x7ffcf9, 0.85).setStrokeStyle(2, P.bg2);
      const brain = this.add.ellipse(px(24), py(10), 10, 10, 0xff8ad6, 1);
      const collar = this.add.rectangle(px(24), py(19), 24, 6, P.brand, 1);
      const torso = this.add.rectangle(px(24), py(34), 32, 24, P.gold, 1).setStrokeStyle(2, P.bg2);
      const core = this.add.ellipse(px(24), py(34), 8, 8, P.warm, 1);
      const tentacleL = this.add.rectangle(px(5), py(29), 10, 6, 0x301046, 1);
      const tentacleR = this.add.rectangle(px(43), py(29), 10, 6, 0x301046, 1);
      const skirt = this.add.rectangle(px(24), py(51), 24, 10, P.brand, 1);

      const body = this.add.container(0, 0, [dome, brain, collar, torso, core, tentacleL, tentacleR, skirt]);
      this.camperSprite = body;
      this.camperBody = body;
      this.camperShadow = shadow;
      this.camperCore = core;
      this.camperTentacles = [tentacleL, tentacleR];
      this.camperRig = this.add.container(home.x, home.y, [shadow, body]).setDepth(DEPTH.camper);
      this.camperSheet = null;
      this.camperIsSprite = false;
    }

    this.camperBadge = this.add
      .text(home.x - 50, home.y + 6, 'IDLE · OPS', {
        fontFamily: MONO,
        fontSize: '8px',
        color: hexColor(P.gold),
        backgroundColor: 'rgba(13,2,20,0.8)',
        padding: { x: 5, y: 3 }
      })
      .setDepth(DEPTH.camper + 1);

    this.camperAnim = '';
    this.camperRigAnim = '';
    // Which animation should be showing is decided in camperSheets.mjs; this
    // scene only paints what it is handed.
    this.camperVisuals = createCamperVisuals();
    this.playCamperAnimation('idle');
  }

  /**
   * The logical telemetry mode. This is what `inspectCamper` reports, so it stays
   * OPERATE / INSPECT / REACT / HOVER_TRAVEL_* — an animation name never
   * replaces it. Choosing what is on screen is `applyCamperVisual`'s job.
   *
   * While a route is in flight the visual belongs to the segment being walked,
   * so the mode is recorded but not painted; `moveCamperTo` applies the
   * stationary visual on arrival.
   */
  playCamperAnimation(name) {
    this.camperAnim = name;
    // The primitive rig has per-mode tweens (inspect tilts, react jitters) with
    // no sheet equivalent, so it stays keyed to the logical mode.
    if (!this.camperIsSprite) this.applyWhiteboxRig(name);
    this.applyCamperVisual(this.camperVisuals.setMode(name));
  }

  /** The visual animation for the segment currently being traversed. */
  setCamperTravelDirection(dx, dy) {
    const visual = this.camperVisuals.travel(dx, dy);
    if (!this.camperIsSprite && visual) {
      // The rig has one travel pose, not four.
      this.applyWhiteboxRig(visual === 'walk_back' ? 'hover_travel_back' : 'hover_travel_front');
    }
    this.applyCamperVisual(visual);
  }

  /**
   * The only place that touches the sprite, and it paints exactly what
   * `camperVisuals` hands it. A null means the request resolved to the animation
   * already playing, so a walk cycle keeps looping across several same-direction
   * legs instead of restarting at frame 0; a genuine change (walk_right ->
   * walk_back at a turn, walk_back -> operate_back on arrival) arrives as a real
   * value and switches immediately.
   */
  applyCamperVisual(visual) {
    if (!visual) return;

    if (this.camperIsSprite) {
      // Visuals without their own sheet yet fall back to the idle art rather
      // than reverting to the primitive rig.
      const sheet = camperSheetFor(visual);
      if (!sheet) return;
      this.camperSheet = sheet;
      if (this.camperBody.texture?.key !== sheet.key) {
        // Origin is per sheet, but every sheet measures out at (0.5, 1): ground
        // contact is the bottom edge in every frame, so his feet stay on the
        // anchor across the 108/110/113 frame heights with no vertical hop.
        this.camperBody
          .setTexture(sheet.key)
          .setOrigin(sheet.originX, sheet.originY)
          .setScale(sheet.scale);
      }
      const key = `camper_${sheet.anim}`;
      if (this.reducedMotion) {
        // Movement and state keep working; only the loop stops, held on this
        // sheet's own static frame.
        this.camperBody.anims?.stop();
        this.camperBody.setFrame(camperStaticFrameFor(sheet));
        return;
      }
      if (this.anims.exists(key)) this.camperBody.play(key, true);
    }
  }

  /**
   * The pre-art fallback rig, kept only for a build with no character sheets at
   * all. It never runs once the manifest lists the sheets.
   */
  applyWhiteboxRig(name) {
    if (this.camperRigAnim === name) return;
    this.camperRigAnim = name;
    this.tweens.killTweensOf([this.camperBody, this.camperCore, ...this.camperTentacles]);
    this.camperBody.setPosition(0, 0);
    this.camperBody.setAngle(0);
    this.camperTentacles.forEach((tentacle, index) => tentacle.setX(index === 0 ? -19 : 19));
    if (this.reducedMotion) return;

    // He never walks. The torso holds a fixed vertical bob; the tentacles trail
    // behind the direction of travel.
    const bob = (amplitude, duration) => this.tweens.add({
      targets: this.camperBody, y: -amplitude, duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    switch (name) {
      case 'hover_travel_front':
      case 'hover_travel_back':
        bob(4, 480);
        break;
      case 'operate':
        bob(2, 340);
        this.tweens.add({
          targets: this.camperTentacles, y: 3, duration: 190, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
        break;
      case 'inspect':
        bob(2, 900);
        this.tweens.add({ targets: this.camperBody, angle: -4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        break;
      case 'react':
        this.tweens.add({
          targets: this.camperBody, x: COMMAND_CENTER_TIMINGS.glitchJitterPx,
          duration: 70, yoyo: true, repeat: 5, ease: 'Stepped'
        });
        bob(5, 220);
        break;
      default:
        bob(3, 1200);
        break;
    }

    if (this.camperCore) {
      this.tweens.add({
        targets: this.camperCore, alpha: 0.55, duration: name === 'operate' ? 320 : 1400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }

  moveCamperTo(point, { immediate = false, label = '' } = {}) {
    const target = { x: clamp(point.x, 24, COMMAND_CENTER_CANVAS.width - 24), y: clamp(point.y, 132, COMMAND_CENTER_CANVAS.height - 24) };
    this.tweens.killTweensOf(this.camperRig);
    this.tweens.killTweensOf(this.camperBadge);
    if (label) this.camperBadge.setText(label);

    const place = (x, y) => {
      this.camperRig.setPosition(x, y);
      this.camperBadge.setPosition(x - 50, y + 6);
    };

    if (immediate || this.reducedMotion) {
      // Section 11 restoration: on refresh the camper snaps to the newest live
      // workflow's anchor with no travel animation. Reduced motion lands here
      // too: he still relocates and the state still updates, he just does not
      // walk there.
      place(target.x, target.y);
      this.applyCamperVisual(this.camperVisuals.endRoute());
      this.setCamperStation(this.pendingCamperZoneId);
      this.focusCamera(target, true);
      return;
    }

    // Already standing there. Ending the route matters when a new destination
    // lands mid-walk: the old step chain died with its tween, so without this he
    // would hold the last walk frame forever instead of settling.
    if (Math.abs(this.camperRig.x - target.x) < 2 && Math.abs(this.camperRig.y - target.y) < 2) {
      this.applyCamperVisual(this.camperVisuals.endRoute(this.pendingCamperAnim || this.camperAnim));
      this.setCamperStation(this.pendingCamperZoneId);
      return;
    }

    const waypoints = routeThroughWalkGraph({ x: this.camperRig.x, y: this.camperRig.y }, target);
    const timeline = [];
    let cursor = { x: this.camperRig.x, y: this.camperRig.y };
    waypoints.forEach((waypoint) => {
      const distance = Math.abs(waypoint.x - cursor.x) + Math.abs(waypoint.y - cursor.y);
      if (distance < 1) return;
      timeline.push({ ...waypoint, duration: clamp(distance * 3.4, 160, 1400) });
      cursor = waypoint;
    });
    if (!timeline.length) {
      place(target.x, target.y);
      this.applyCamperVisual(this.camperVisuals.endRoute(this.pendingCamperAnim || this.camperAnim));
      this.setCamperStation(this.pendingCamperZoneId);
      return;
    }

    // A walk is actually happening, so he stops working: the machine he was at
    // goes still for the whole flight, and nothing he passes on the way wakes up.
    // Released here rather than at the top of the function on purpose — the
    // early returns above are the cases where he does not move, and releasing
    // before them would restart his machine on every telemetry tick.
    this.setCamperStation('');

    // For the whole flight the visual belongs to the segment being walked, not
    // to the telemetry mode. `playCamperAnimation` keeps recording the logical
    // mode meanwhile; it just does not paint until the route ends.
    this.camperVisuals.beginRoute();

    const step = (index) => {
      if (index >= timeline.length) {
        // Arrival: the pending mode is the state he came here to work in, so a
        // workstation job resolves to operate_back and home resolves to idle.
        this.camperVisuals.endRoute();
        this.playCamperAnimation(this.pendingCamperAnim || 'idle');
        // And the machine he walked over to starts running, on this frame and
        // not before. Walking home stations nowhere, so the room goes still.
        this.setCamperStation(this.pendingCamperZoneId);
        return;
      }
      const leg = timeline[index];
      // Direction comes from the leg actually being traversed, recomputed as
      // each leg starts, so a route that goes right then up switches
      // walk_right -> walk_back at the turn rather than on arrival.
      this.setCamperTravelDirection(leg.x - this.camperRig.x, leg.y - this.camperRig.y);
      this.tweens.add({
        targets: this.camperRig,
        x: leg.x,
        y: leg.y,
        duration: leg.duration,
        ease: 'Sine.easeInOut',
        onUpdate: () => this.camperBadge.setPosition(this.camperRig.x - 50, this.camperRig.y + 6),
        onComplete: () => step(index + 1)
      });
    };
    step(0);
    this.focusCamera(target);
  }

  // -------------------------------------------------------------------------
  // L5 · conduits, packets and effects (section 05)
  // -------------------------------------------------------------------------

  buildConduits() {
    COMMAND_CENTER_CONDUITS.forEach((conduit) => {
      const rect = this.conduitRect(conduit);
      const object = { conduit, rect, active: false, beam: null, timer: null };
      if (conduit.beam) {
        const beam = this.add
          .rectangle(rect.x, rect.y, rect.w, rect.h, conduit.color, 0.5)
          .setOrigin(0, 0)
          .setDepth(DEPTH.fx)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false);
        object.beam = beam;
      }
      this.conduitObjects.set(conduit.id, object);
    });
  }

  acquirePacket() {
    const reusable = this.packetPool.find((packet) => !packet.active);
    if (reusable) return reusable;
    if (this.packetPool.length >= COMMAND_CENTER_BUDGET.maxPackets) return null;
    const sprite = this.add.rectangle(0, 0, 8, 8, P.cyan, 1).setDepth(DEPTH.fx).setVisible(false);
    sprite.setBlendMode(Phaser.BlendModes.ADD);
    const packet = { sprite, active: false };
    this.packetPool.push(packet);
    return packet;
  }

  emitPacket(conduit, { slow = false, handoff = false } = {}) {
    if (this.reducedMotion) return;
    const packet = this.acquirePacket();
    if (!packet) return; // Density cap: queue beyond 6, never spawn per event.

    const rect = this.conduitRect(conduit);
    const horizontal = conduit.axis === 'h';
    const forward = conduit.direction >= 0;
    const from = horizontal
      ? { x: forward ? rect.x : rect.x + rect.w, y: rect.y + rect.h / 2 }
      : { x: rect.x + rect.w / 2, y: forward ? rect.y : rect.y + rect.h };
    const to = horizontal
      ? { x: forward ? rect.x + rect.w : rect.x, y: from.y }
      : { x: from.x, y: forward ? rect.y + rect.h : rect.y };

    packet.active = true;
    packet.sprite
      .setFillStyle(conduit.color, 1)
      .setPosition(from.x, from.y)
      .setSize(8, 8)
      .setScale(1)
      .setAlpha(0.95)
      .setVisible(true);

    const length = horizontal ? rect.w : rect.h;
    this.tweens.add({
      targets: packet.sprite,
      x: to.x,
      y: to.y,
      duration: slow ? 5200 : clamp(length * 9, 700, 2600),
      ease: 'Linear',
      onComplete: () => {
        packet.active = false;
        packet.sprite.setVisible(false);
      }
    });

    if (handoff) {
      // Section 05: the only time flow is loud.
      this.tweens.add({
        targets: packet.sprite,
        scaleX: 1.5, scaleY: 1.5,
        duration: COMMAND_CENTER_BUDGET.handoffEmphasisMs / 2,
        yoyo: true,
        ease: 'Sine.easeOut'
      });
    }
  }

  setConduitActive(conduitId, active, handoff = false) {
    const object = this.conduitObjects.get(conduitId);
    if (!object || object.active === active) return;
    object.active = active;

    if (object.timer) {
      object.timer.remove();
      object.timer = null;
    }

    if (object.beam) {
      // D5: the mast beam exits the top edge of the room.
      object.beam.setVisible(active && !this.reducedMotion);
      this.tweens.killTweensOf(object.beam);
      if (active && !this.reducedMotion) {
        object.beam.setAlpha(0);
        this.tweens.add({
          targets: object.beam, alpha: 0.55, duration: 2200, repeat: -1, ease: 'Sine.easeOut'
        });
      }
      return;
    }

    if (!active || this.reducedMotion) return;
    object.timer = this.time.addEvent({
      delay: object.conduit.id === 'SP' ? 1500 : 1200,
      loop: true,
      startAt: Phaser.Math.Between(0, 900),
      callback: () => this.emitPacket(object.conduit, { handoff })
    });
  }

  // -------------------------------------------------------------------------
  // L6 · foreground / occlusion
  // -------------------------------------------------------------------------

  buildForeground() {
    const g = this.add.graphics().setDepth(DEPTH.fore);
    const { width, height, floorTop } = COMMAND_CENTER_CANVAS;

    COMMAND_CENTER_FOREGROUND.forEach((piece) => {
      if (this.textures.exists(piece.key)) {
        this.add.image(piece.x, piece.y, piece.key).setOrigin(0, 0).setDepth(DEPTH.fore);
        return;
      }
      if (piece.kind === 'pilaster-left' || piece.kind === 'pilaster-right') {
        for (let x = 0; x < piece.w; x += 1) {
          const t = piece.kind === 'pilaster-left' ? 1 - x / piece.w : x / piece.w;
          g.fillStyle(P.bg0, t);
          g.fillRect(piece.x + x, piece.y, 1, piece.h);
        }
        return;
      }
      if (piece.kind === 'wall-port') {
        g.fillStyle(0x1c0627, 1);
        g.fillRect(piece.x, piece.y, piece.w, piece.h);
        g.lineStyle(1, P.line, 0.2);
        g.lineBetween(piece.x, piece.y, piece.x, piece.y + piece.h);
        return;
      }
      g.fillStyle(0x20092c, 1);
      g.fillRect(piece.x, piece.y, piece.w, piece.h);
      g.lineStyle(1, P.line, 0.3);
      g.lineBetween(piece.x, piece.y, piece.x + piece.w, piece.y);
    });

    // Floor vignette and scanline overlay are baked here, never as full-screen fx.
    const overlay = this.add.graphics().setDepth(DEPTH.fore + 2);
    for (let y = 0; y < 24; y += 1) {
      overlay.fillStyle(P.void, 0.75 * (y / 24));
      overlay.fillRect(0, height - 24 + y, width, 1);
    }
    for (let y = floorTop; y < height; y += 3) {
      overlay.fillStyle(P.void, 0.08);
      overlay.fillRect(0, y, width, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Read-only inspection (section 06). Hit areas are the L2 body rects.
  // -------------------------------------------------------------------------

  buildInteraction() {
    COMMAND_CENTER_AREAS.forEach((area) => {
      const outline = this.add.graphics().setDepth(DEPTH.fx + 1).setVisible(false);
      outline.lineStyle(1, area.color, 0.9);
      area.hitRects.forEach((rect) => outline.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1));

      const nameTag = this.add
        .text(area.bounds.x, area.bounds.y - 12, area.label.toUpperCase(), {
          fontFamily: MONO, fontSize: '8px', color: hexColor(area.color)
        })
        .setDepth(DEPTH.fx + 2)
        .setVisible(false);

      const object = {
        area,
        outline,
        nameTag,
        workflows: [],
        displayState: 'idle',
        displayWorkflow: null,
        operationalKeys: new Set(),
        warningLamp: null,
        glitchBand: null
      };

      area.hitRects.forEach((rect) => {
        // 24px minimum hit area, crosshair cursor.
        const width = Math.max(rect.width, 24);
        const height = Math.max(rect.height, 24);
        const zone = this.add
          .zone(rect.x + rect.width / 2, rect.y + rect.height / 2, width, height)
          .setInteractive({ useHandCursor: false });
        zone.input.cursor = 'crosshair';
        zone.on('pointerover', () => {
          outline.setVisible(true);
          nameTag.setVisible(true);
        });
        zone.on('pointerout', () => {
          if (this.selectedZoneId === area.id) return;
          outline.setVisible(false);
          nameTag.setVisible(false);
        });
        zone.on('pointerdown', () => this.inspectArea(area.id));
      });

      this.zoneObjects.set(area.id, object);
    });

    // Sized from the largest registered sheet rather than whichever one happens
    // to be playing, so the box still covers him after a texture swap between
    // animations with different frame sizes. The whitebox rig keeps the design's
    // original 48x64 box.
    const sheetExtent = (dimension) => CAMPER_SHEETS.reduce(
      (largest, sheet) => Math.max(largest, sheet[dimension] * sheet.scale),
      0
    );
    const hitWidth = this.camperSheet ? sheetExtent('frameWidth') : 48;
    const hitHeight = this.camperSheet ? sheetExtent('frameHeight') : 64;
    const camperZone = this.add.zone(0, 0, hitWidth, hitHeight).setInteractive({ useHandCursor: false });
    camperZone.input.cursor = 'crosshair';
    camperZone.on('pointerdown', () => this.inspectCamper());
    this.camperZone = camperZone;
    this.events.on('update', () => {
      // The origin is on his feet, so the box hangs one half-height above the anchor.
      camperZone.setPosition(this.camperRig.x, this.camperRig.y - hitHeight / 2);
    });
  }

  inspectArea(areaId) {
    this.selectedZoneId = areaId;
    this.zoneObjects.forEach((object, id) => {
      const selected = id === areaId;
      object.outline.setVisible(selected);
      object.nameTag.setVisible(selected);
    });
    const object = this.zoneObjects.get(areaId);
    if (!object) return;
    this.options.onZoneInspect?.({
      area: object.area,
      workflows: object.workflows,
      displayState: object.displayState
    });
  }

  inspectStation(stationId) {
    this.inspectArea(stationId);
  }

  inspectCamper() {
    this.selectedZoneId = '';
    this.zoneObjects.forEach((object) => {
      object.outline.setVisible(false);
      object.nameTag.setVisible(false);
    });
    this.options.onCamperInspect?.({
      position: { x: Math.round(this.camperRig.x), y: Math.round(this.camperRig.y) },
      anim: this.camperAnim,
      workflow: this.latestState?.primaryWorkflow || null,
      activeCount: this.latestState?.activeWorkflows?.length || 0
    });
  }

  clearInspection() {
    this.selectedZoneId = '';
    this.zoneObjects.forEach((object) => {
      object.outline.setVisible(false);
      object.nameTag.setVisible(false);
    });
  }

  // -------------------------------------------------------------------------
  // Telemetry → visual. Section 11: one function, zone-scoped. Nothing else in
  // the scene reads telemetry. Machine motion is gated on `camperStationZoneId`
  // rather than on state: telemetry decides where he goes, standing there is what
  // starts the machine.
  // -------------------------------------------------------------------------

  updatePublicState(state) {
    const firstPaint = !this.latestState;
    this.latestState = state;
    const areaGroups = state.areaGroups || [];

    this.applyAreaGroups(areaGroups);
    this.setOpsReadout({
      status: state.overallStatus,
      active: state.activeWorkflows.length,
      stale: state.staleCount
    });
    this.setTerminalReadout(state);

    const primary = state.primaryWorkflow;
    if (primary) {
      const area = areaById(primary.areaId);
      const visual = visualForState(primary.displayState);
      const machineLabel = primary.machineName || area.shortLabel;
      this.pendingCamperAnim = visual.camperAnim;
      // Standing somewhere idle is not working there: a machine wakes only for a
      // pose he actually operates it in.
      this.pendingCamperZoneId = visual.camperAnim === 'idle' ? '' : primary.areaId;
      this.moveCamperTo(area.destination, {
        immediate: firstPaint,
        label: `${visual.label.toUpperCase()} · ${machineLabel.toUpperCase()}`
      });
      if (firstPaint || this.reducedMotion) this.playCamperAnimation(visual.camperAnim);
      this.focusZone(primary.areaId);
    } else {
      this.pendingCamperAnim = 'idle';
      this.pendingCamperZoneId = '';
      const offline = state.overallStatus === 'offline';
      this.moveCamperTo(COMMAND_CENTER_CANVAS.homePoint, {
        immediate: firstPaint,
        label: offline ? 'UPLINK · OFFLINE' : 'IDLE · OPS'
      });
      this.playCamperAnimation('idle');
    }
  }

  applyAreaGroups(areaGroups) {
    const groupById = new Map(areaGroups.map((group) => [group.id, group]));
    this.hasOperationalTraffic = areaGroups.some((group) => group.displayState !== 'idle');

    this.zoneObjects.forEach((object, zoneId) => {
      this.applyZoneState(zoneId, groupById.get(zoneId) || {
        workflows: [], visibleWorkflows: [], activeWorkflows: [], staleWorkflows: [],
        displayState: 'idle', displayWorkflow: null
      });
    });
  }

  /**
   * The single telemetry seam. Sets this zone's L3 animation keys, its fx emitter
   * rate and its local glow. n live workflows = n independent machine loops.
   */
  applyZoneState(zoneId, group) {
    const object = this.zoneObjects.get(zoneId);
    if (!object) return;

    const previousState = object.displayState;
    const visual = visualForState(group.displayState);
    const stale = Boolean(group.staleWorkflows?.length) && group.displayState === 'idle';

    object.workflows = group.workflows || [];
    object.displayWorkflow = group.displayWorkflow || null;
    object.displayState = group.displayState;
    object.nameTag.setText((group.displayMachine?.name || object.displayWorkflow?.machineName || object.area.label).toUpperCase());

    // A whitebox machine follows the same rule its finished-art siblings do: it
    // runs while SpawnCamper is working at it and holds still otherwise, however
    // busy telemetry says this zone is. The status readouts below — glow, warning
    // lamp, glitch, conduits, the complete flash — are deliberately NOT gated:
    // those report state, and freezing them would read as offline rather than calm.
    const attended = this.camperStationZoneId === zoneId;
    const nextKeys = attended ? new Set(visual.components) : new Set();
    // Only touch components that actually changed mode.
    this.componentsForArea(zoneId).forEach((component) => {
      const shouldRun = nextKeys.has(component.spec.key);
      if (shouldRun === component.operational) {
        if (shouldRun) this.setComponentRate(component, visual.rate);
        return;
      }
      component.operational = shouldRun;
      if (shouldRun) this.startOperational(component, visual);
      else this.stopOperational(component);
    });

    // Conduits belonging to this zone follow its state.
    const activeConduits = new Set(visual.conduits);
    this.conduitObjects.forEach((conduitObject, conduitId) => {
      if (conduitId === 'SP') return; // The spine follows the room, not one zone.
      if (conduitObject.conduit.zone !== zoneId) return;
      this.setConduitActive(conduitId, activeConduits.has(conduitId), Boolean(conduitObject.conduit.handoff));
    });
    if (zoneId === 'central-operations') {
      this.setConduitActive('SP', this.hasOperationalTraffic);
    }

    this.setLocalGlow(object, visual, group.displayState !== 'idle');
    this.setWarningLamp(object, visual.severity === 'warning' || stale, stale);
    this.setGlitch(object, visual.severity === 'error');

    if (group.displayState === 'complete' && previousState !== 'complete') {
      this.emitCompleteFlash(object);
    }
  }

  componentsForArea(zoneId) {
    if (!this.componentsByZone) {
      this.componentsByZone = new Map();
      this.componentObjects.forEach((object) => {
        const list = this.componentsByZone.get(object.spec.zone) || [];
        list.push(object);
        this.componentsByZone.set(object.spec.zone, list);
      });
    }
    return this.componentsByZone.get(zoneId) || [];
  }

  setComponentRate(component, rate) {
    // Section 04: warning and stale run the same loops at 60% rate.
    const scale = rate || 1;
    component.operationalTweens.forEach((tween) => {
      if (tween && tween.isPlaying?.()) tween.setTimeScale?.(scale);
    });
  }

  startOperational(component, visual) {
    if (this.reducedMotion) return;
    const { spec, parts } = component;
    const add = (config) => {
      const tween = this.tweens.add(config);
      component.operationalTweens.push(tween);
      return tween;
    };

    switch (spec.kind) {
      case 'radar':
        parts.sweep.setVisible(true).setAngle(0);
        add({ targets: parts.sweep, angle: 360, duration: 2600, repeat: -1, ease: 'Linear' });
        break;
      case 'scan-bar':
        parts.bar.setVisible(true).setX(0);
        add({ targets: parts.bar, x: spec.w - 16, duration: 1900, repeat: -1, ease: 'Linear' });
        break;
      case 'lamp':
        this.tweens.killTweensOf(parts.lamp);
        parts.lamp.setAlpha(1); // Ready lamp goes solid.
        break;
      case 'chamber':
        parts.fill.setVisible(true).setScale(1, 0.08);
        add({ targets: parts.fill, scaleY: 0.96, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        break;
      case 'coil':
        parts.spinner.setVisible(true);
        add({ targets: parts.spinner, angle: 360, duration: 3200, repeat: -1, ease: 'Linear' });
        break;
      case 'tray':
        parts.print.setVisible(true);
        add({ targets: parts.print, alpha: 0.2, duration: 700, yoyo: true, repeat: -1, ease: 'Stepped' });
        add({
          targets: parts.sheet, y: -34, alpha: 0, duration: 2600, repeat: -1, ease: 'Sine.easeOut',
          onRepeat: () => parts.sheet.setVisible(true).setY(-18).setAlpha(0.8)
        });
        parts.sheet.setVisible(true);
        break;
      case 'dish':
      case 'charge-orb':
        parts.orb.setVisible(true);
        add({
          targets: parts.orb, scaleX: 1.16, scaleY: 1.16, alpha: 0.5,
          duration: spec.kind === 'dish' ? 1200 : 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
        break;
      case 'fan-stack':
        component.ambientTweens.forEach((tween) => tween.setTimeScale?.(2.2));
        break;
      case 'furnace':
        add({ targets: parts.heat, alpha: 0.85, scaleY: 1.3, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        parts.lines?.setText('FURNACE ⌁ ACTIVE').setAlpha(1);
        break;
      case 'keyboard':
        parts.ripple.setVisible(true).setX(0);
        add({ targets: parts.ripple, x: spec.w - 10, duration: 900, repeat: -1, ease: 'Linear' });
        break;
      case 'feed-bank':
        component.ambientTweens.forEach((tween) => tween.setTimeScale?.(1.8));
        parts.cells.forEach((cell) => cell.setStrokeStyle(1, spec.color, 1));
        break;
      case 'led-bank':
      case 'led-stack':
      case 'lamp-grid':
        component.ambientTweens.forEach((tween) => tween.setTimeScale?.(2));
        break;
      case 'crt-row':
      case 'ops-crt':
        component.ambientTweens.forEach((tween) => tween.setTimeScale?.(1.6));
        break;
      case 'code-crt':
      case 'x-crt':
      case 'tx-crt':
        parts.lines?.setAlpha(1);
        break;
      default:
        break;
    }

    this.setComponentRate(component, visual.rate);
  }

  stopOperational(component) {
    const { spec, parts } = component;
    component.operationalTweens.forEach((tween) => tween?.remove?.());
    component.operationalTweens = [];
    component.ambientTweens.forEach((tween) => tween.setTimeScale?.(1));

    if (parts.sweep) parts.sweep.setVisible(false);
    if (parts.bar) parts.bar.setVisible(false);
    if (parts.fill) parts.fill.setVisible(false).setScale(1, 0.08);
    if (parts.ripple) parts.ripple.setVisible(false);
    if (parts.print) parts.print.setVisible(false);
    if (parts.sheet) parts.sheet.setVisible(false);
    if (parts.orb) parts.orb.setVisible(false);
    if (parts.heat) parts.heat.setAlpha(0.22).setScale(1, 1);
    if (spec.kind === 'furnace') parts.lines?.setText('FURNACE ⌁ IDLE').setAlpha(0.75);
    if (spec.kind === 'coil' && parts.spinner) parts.spinner.setVisible(false);
    if (spec.kind === 'lamp' && parts.lamp && spec.ambient === 'blink' && !this.reducedMotion) {
      this.tweens.add({ targets: parts.lamp, alpha: 0.14, duration: 1400, yoyo: true, repeat: -1, ease: 'Stepped' });
    }
    if (parts.lines && (spec.kind === 'code-crt' || spec.kind === 'x-crt' || spec.kind === 'tx-crt')) {
      parts.lines.setAlpha(0.4);
    }
    if (spec.kind === 'feed-bank' && parts.cells) {
      parts.cells.forEach((cell) => cell.setStrokeStyle(1, spec.bezel, 1));
    }
  }

  setLocalGlow(object, visual, active) {
    // Section 02 rule 3: state lighting is an additive L5 overlay, never a repaint.
    if (!object.glow) {
      const bounds = object.area.bounds;
      object.glow = this
        .addGlow(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.8, bounds.width * 1.5, bounds.height * 1.2, object.area.color, 0.3)
        .setDepth(DEPTH.fx - 1)
        .setVisible(false);
    }
    object.glow.setTint(visual.areaTint);
    object.glow.setAlpha(visual.severity === 'error' ? 0.4 : 0.3);
    object.glow.setVisible(active);
    this.tweens.killTweensOf(object.glow);
    if (!active || this.reducedMotion || !visual.pulse) return;
    this.tweens.add({
      targets: object.glow,
      alpha: visual.severity === 'error' ? 0.6 : 0.48,
      scaleX: 1.06,
      scaleY: 1.1,
      duration: (visual.severity === 'error' ? 300 : 900) / (visual.rate || 1),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  setWarningLamp(object, active, dim) {
    if (!object.warningLamp) {
      const rect = object.area.hitRects[0];
      object.warningLamp = this.add
        .rectangle(rect.x + rect.width - 10, rect.y - 12, 10, 10, P.warn, 1)
        .setDepth(DEPTH.fx + 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
    }
    this.tweens.killTweensOf(object.warningLamp);
    object.warningLamp.setVisible(active).setAlpha(dim ? 0.45 : 1);
    if (!active || this.reducedMotion) return;
    this.tweens.add({
      targets: object.warningLamp,
      alpha: dim ? 0.12 : 0.25,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped'
    });
  }

  setGlitch(object, active) {
    if (!object.glitchBand) {
      const rect = object.area.hitRects[0];
      const band = this.add.graphics().setDepth(DEPTH.fx + 1).setVisible(false);
      for (let y = 0; y < rect.height; y += 5) {
        band.fillStyle(P.warn, 0.2);
        band.fillRect(rect.x, rect.y + y, rect.width, 2);
      }
      object.glitchBand = band;
    }
    this.tweens.killTweensOf(object.glitchBand);
    object.glitchBand.setVisible(active).setX(0);
    if (!active || this.reducedMotion) return;
    // Local malfunction only: static band + 3px jitter + one spark. No overlay.
    this.tweens.add({
      targets: object.glitchBand,
      x: COMMAND_CENTER_TIMINGS.glitchJitterPx,
      alpha: 0.55,
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped'
    });
    this.emitSpark(object.area);
  }

  emitSpark(area) {
    if (this.reducedMotion) return;
    const rect = area.hitRects[0];
    const spark = this.add
      .rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, 6, 6, P.warn, 1)
      .setDepth(DEPTH.fx + 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: spark,
      y: rect.y - 10,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => spark.destroy()
    });
  }

  emitCompleteFlash(object) {
    const key = latestWorkflowKey(object.displayWorkflow);
    if (!key || this.completeKeys.has(key)) return;
    this.completeKeys.add(key);
    if (this.reducedMotion) return;

    // Section 04: 2-frame phosphor flash + lamp, 600ms, then ease back over 1.2s.
    const rect = object.area.hitRects[0];
    const flash = this.add
      .rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height, P.phosphor, 0.5)
      .setDepth(DEPTH.fx + 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      alpha: 0.16,
      duration: COMMAND_CENTER_TIMINGS.completeFlashMs / 2,
      yoyo: true,
      repeat: 1,
      ease: 'Stepped',
      onComplete: () => {
        this.tweens.add({
          targets: flash,
          alpha: 0,
          duration: COMMAND_CENTER_TIMINGS.completeSettleMs,
          ease: 'Sine.easeOut',
          onComplete: () => flash.destroy()
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // In-world readouts (section 07). These replace the old DOM dashboard cards.
  // Only real, already-sanitized strings ever reach a screen.
  // -------------------------------------------------------------------------

  setOpsReadout({ status, active, stale }) {
    const component = this.componentObjects.get('anim_ops_screens');
    if (!component?.parts?.lines) return;

    const online = status !== 'offline';
    const health = status === 'error' ? 'FAULT' : status === 'warning' ? 'DEGRADED' : online ? 'NOMINAL' : 'NO LINK';
    const filled = online ? clamp(2 + active, 0, 8) : 0;
    const meter = `${'▮'.repeat(filled)}${'▯'.repeat(8 - filled)}`;

    component.parts.lines.setText([
      `GA//OPS ▓▒░ ${health}`,
      `SPWNCMP9000 > ${online ? 'ONLINE' : 'OFFLINE'}`,
      `ACTIVE ${String(active).padStart(2, '0')}   STALE ${String(stale).padStart(2, '0')}`,
      `UPLINK ${meter}`
    ].join('\n'));
    component.parts.lines.setColor(hexColor(status === 'error' ? P.warn : P.phosphor));
  }

  setTerminalReadout(state) {
    const code = this.componentObjects.get('anim_code_scroll');
    const codeGroup = state.areaGroups?.find((group) => group.id === 'github-code');
    if (code?.parts?.lines) {
      const workflow = codeGroup?.displayWorkflow;
      code.parts.lines.setText(workflow
        ? [`$ ${workflow.workflow} ──┐`, `  ${codeGroup.displayState} ▓▓▒`, '  ▊'].join('\n')
        : ['$ idle ─ awaiting', '  branch: main', '  ▊'].join('\n'));
    }

    const x = this.componentObjects.get('anim_x_crt');
    const xGroup = state.areaGroups?.find((group) => group.id === 'x-communications');
    if (x?.parts?.lines) {
      // Never the post body — only the transport state.
      const posting = xGroup?.displayState === 'posting_to_x';
      const writing = xGroup?.displayState === 'writing';
      x.parts.lines.setText(posting
        ? ['TX ▓▓▓▓▓', 'UPLINKING', '→ X UPLINK'].join('\n')
        : writing
          ? ['TX ▓▓▓▒░', 'FORMATTING', '→ X UPLINK'].join('\n')
          : ['TX ░░░░░', 'STANDBY'].join('\n'));
    }

    const tx = this.componentObjects.get('anim_tx_crt');
    const txGroup = state.areaGroups?.find((group) => group.id === 'terminal-transmitter');
    if (tx?.parts?.lines) {
      const publishing = txGroup?.displayState === 'terminal_publish' || txGroup?.displayState === 'publishing';
      const lastEvent = state.recentHistory?.find((event) => event.areaId === 'terminal-transmitter');
      tx.parts.lines.setText(publishing
        ? ['GA TERMINAL LINK', 'PACKET ▓▓▓▓░', 'TRANSMUTE → SIGNAL', 'CHARGE ▮▮▮▮▮▯'].join('\n')
        : ['GA TERMINAL LINK', 'IDLE ░░░░░', `LAST TX ${this.relativeAge(lastEvent?.timestamp)}`].join('\n'));
    }
  }

  relativeAge(timestamp) {
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) return '—';
    const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
    if (minutes < 60) return `${String(minutes).padStart(2, '0')}M AGO`;
    return `${Math.floor(minutes / 60)}H AGO`;
  }
}
