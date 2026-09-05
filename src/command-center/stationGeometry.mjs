import measurements from './assetMeasurements.json' with { type: 'json' };
import { COMMAND_CENTER_AREAS, COMMAND_CENTER_PROPS } from './sceneConfig.mjs';
import { PROP_SHEETS, propAnchorFor } from './propSheets.mjs';

// Independently authored from env_floor_wall.png: back-wall bases reach y166,
// side architecture reaches x58 / x902, and the front curb begins at y504.
export const WALKABLE_FLOOR = Object.freeze({ left: 60, right: 900, top: 170, bottom: 502 });
export const FOOT_ENVELOPE = Object.freeze({ left: -41, right: 41, top: -8, bottom: 0 });
const union = (rects) => {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x,
    height: Math.max(...rects.map(r => r.y + r.height)) - y };
};
// Screen surfaces traced in world coordinates from the shipped first frames.
// They are distinct from the full inspection silhouette and ground footprint.
const SCREEN_SURFACES = {
  'central-operations': { x: 410, y: 171, width: 35, height: 15 },
  'intelligence-research': { x: 92, y: 29, width: 135, height: 27 },
  'scanner-bench': { x: 302, y: 173, width: 28, height: 18 },
  'github-code': { x: 118, y: 344, width: 43, height: 29 },
  newsletter: { x: 301, y: 343, width: 32, height: 56 },
  'x-communications': { x: 465, y: 449, width: 23, height: 20 },
  'terminal-transmitter': { x: 816, y: 404, width: 20, height: 13 },
  'model-infrastructure': { x: 805, y: 252, width: 43, height: 41 },
  'experiment-bench': { x: 472, y: 289, width: 25, height: 24 },
  'creator-console': { x: 83, y: 147, width: 23, height: 23 },
  'profit-analyzer': { x: 633, y: 319, width: 45, height: 25 },
  'agent-lab': { x: 817, y: 96, width: 29, height: 47 },
  'opportunity-radar': { x: 648, y: 206, width: 24, height: 25 }
};
export const STATION_GEOMETRY = new Map(COMMAND_CENTER_AREAS.map(area => {
  const parts = PROP_SHEETS.filter(entry => COMMAND_CENTER_PROPS.find(p => p.key === entry.covers[0])?.zone === area.id)
    .filter(entry => measurements[entry.textureKey]).map(entry => {
      const box = COMMAND_CENTER_PROPS.find(p => p.key === entry.covers[0]);
      const placement = propAnchorFor(entry, box), m = measurements[entry.textureKey];
      const bounds = union(m.frames.map(({ visual: v }) => {
        const left = entry.flipX ? m.width - v.right : v.left;
        return { x: placement.x + (left - m.width * placement.originX) * placement.scale,
          y: placement.y + (v.top - m.height * placement.originY) * placement.scale,
          width: (v.right - v.left) * placement.scale, height: (v.bottom - v.top) * placement.scale };
      }));
      const baseline = bounds.y + bounds.height;
      return { id: entry.id, placement, bounds, baseline, wall: entry.groundShadow === false,
        // The bottom 24px is the ground footprint; higher artwork may occlude
        // the character but is not a floor obstacle (e.g. cabinet overhangs).
        footprint: entry.groundShadow === false ? null : { x: bounds.x, y: baseline - 24, width: bounds.width, height: 24 } };
    });
  const bounds = parts.length ? union(parts.map(p=>p.bounds)) : area.bounds;
  const screen = SCREEN_SURFACES[area.id];
  return [area.id, { id: area.id, parts, bounds, inspection: parts.length ? parts.map(p=>p.bounds) : area.hitRects,
    foot: area.destination, pose: 'operate_back', interaction: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    baseline: Math.max(...parts.filter(p=>!p.wall).map(p=>p.baseline), 0), screen,
    effectOrigin: { x: screen.x + screen.width / 2, y: screen.y + screen.height / 2 } }];
}));
export function stationGeometry(id) { return STATION_GEOMETRY.get(id); }
export function footPositionClear(point) {
  const f = FOOT_ENVELOPE, room = WALKABLE_FLOOR;
  const left = point.x + f.left, right = point.x + f.right, top = point.y + f.top, bottom = point.y + f.bottom;
  if (left < room.left || right > room.right || top < room.top || bottom > room.bottom) return false;
  return [...STATION_GEOMETRY.values()].every(s => s.parts.every(({ footprint: r }) => !r
    || right <= r.x || left >= r.x + r.width || bottom <= r.y || top >= r.y + r.height));
}
