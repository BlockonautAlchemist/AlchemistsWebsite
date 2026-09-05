import { routeThroughWalkGraph } from './walkGraph.mjs';
import { footPositionClear } from './stationGeometry.mjs';
import { camperStationaryVisualFor, camperWalkVisualFor } from './camperSheets.mjs';

/** Clock-driven movement: no tween callbacks can outlive a destination. */
export function createLocomotion({ position, speed = 180, route = routeThroughWalkGraph, isClear = footPositionClear } = {}) {
  let foot = { ...position }, destination = null, legs = [], mode = 'idle', station = '', generation = 0;
  let visual = 'idle', attendance = '', arrived = 0, failed = false;
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const settle = () => { legs = []; foot = { ...destination }; visual = camperStationaryVisualFor(mode); attendance = station; arrived++; };
  const snapshot = () => ({ position: { ...foot }, destination, moving: legs.length > 0, mode, visual,
    attendance, generation, arrived, failed });
  return {
    get state() { return snapshot(); },
    command({ destination: target, mode: nextMode = 'idle', station: nextStation = '', immediate = false }) {
      mode = nextMode; station = nextStation;
      if (same(destination, target) && !failed && (!immediate || !legs.length)) {
        if (!legs.length) { visual = camperStationaryVisualFor(mode); attendance = station; }
        return snapshot();
      }
      generation++; attendance = ''; failed = false;
      destination = { ...target };
      const next = route(foot, target);
      if (!isClear(target) || next === null) {
        legs = []; failed = true; visual = 'idle'; return snapshot();
      }
      legs = next.filter((p, i) => !same(p, i ? next[i-1] : foot));
      if (immediate || !legs.length) settle();
      else visual = camperWalkVisualFor(legs[0].x - foot.x, legs[0].y - foot.y);
      return snapshot();
    },
    update(deltaMs) {
      let remaining = Math.max(0, deltaMs) * speed / 1000;
      while (legs.length && remaining > 0) {
        const next = legs[0], dx = next.x - foot.x, dy = next.y - foot.y;
        const distance = Math.abs(dx) + Math.abs(dy);
        visual = camperWalkVisualFor(dx, dy);
        if (remaining >= distance) { foot = { ...next }; remaining -= distance; legs.shift(); }
        else { foot = { x: foot.x + dx / distance * remaining, y: foot.y + dy / distance * remaining }; remaining = 0; }
        if (!legs.length) settle();
        else visual = camperWalkVisualFor(legs[0].x - foot.x, legs[0].y - foot.y);
      }
      return snapshot();
    },
    cancel() { generation++; legs = []; destination = null; attendance = ''; visual = 'idle'; }
  };
}
