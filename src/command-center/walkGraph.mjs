import { COMMAND_CENTER_WALK_GRAPH } from './sceneConfig.mjs';

// Section 01 walk graph: 4 lanes + 6 spurs, every segment axis-aligned. Nodes are
// segment endpoints plus every lane crossing, so a route can turn at an
// intersection but never travels diagonally — the hover rig has no diagonal cel.

function nodeKey(point) {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

export function isHorizontal(segment) {
  return segment.from.y === segment.to.y;
}

export function pointOnSegment(point, segment) {
  if (isHorizontal(segment)) {
    if (point.y !== segment.from.y) return false;
    return point.x >= Math.min(segment.from.x, segment.to.x) && point.x <= Math.max(segment.from.x, segment.to.x);
  }
  if (point.x !== segment.from.x) return false;
  return point.y >= Math.min(segment.from.y, segment.to.y) && point.y <= Math.max(segment.from.y, segment.to.y);
}

export function buildWalkGraph(segments = COMMAND_CENTER_WALK_GRAPH.segments) {
  const candidates = [];
  segments.forEach((segment) => candidates.push(segment.from, segment.to));

  segments.forEach((a) => {
    segments.forEach((b) => {
      if (a === b) return;
      if (isHorizontal(a) === isHorizontal(b)) return;
      const h = isHorizontal(a) ? a : b;
      const v = isHorizontal(a) ? b : a;
      const crossing = { x: v.from.x, y: h.from.y };
      if (pointOnSegment(crossing, h) && pointOnSegment(crossing, v)) candidates.push(crossing);
    });
  });

  const nodes = new Map();
  candidates.forEach((point) => {
    const key = nodeKey(point);
    if (!nodes.has(key)) nodes.set(key, { x: point.x, y: point.y, key, edges: [] });
  });

  segments.forEach((segment) => {
    const horizontal = isHorizontal(segment);
    const onSegment = [...nodes.values()].filter((node) => pointOnSegment(node, segment));
    onSegment.sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    for (let i = 0; i < onSegment.length - 1; i += 1) {
      const from = onSegment[i];
      const to = onSegment[i + 1];
      if (!from.edges.includes(to.key)) from.edges.push(to.key);
      if (!to.edges.includes(from.key)) to.edges.push(from.key);
    }
  });

  return nodes;
}

const WALK_NODES = buildWalkGraph();

export function walkNodes() {
  return WALK_NODES;
}

function nearestNode(point) {
  let best = null;
  let bestDistance = Infinity;
  WALK_NODES.forEach((node) => {
    const distance = Math.abs(node.x - point.x) + Math.abs(node.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  });
  return best;
}

/** Axis-aligned waypoint list from `from` to `to`, routed along lanes only. */
export function routeThroughWalkGraph(from, to) {
  const start = nearestNode(from);
  const goal = nearestNode(to);
  if (!start || !goal) return [to];

  // Dijkstra on Manhattan distance: hop count alone would happily pick a
  // physically longer lane just because it has fewer intersections.
  const previous = new Map([[start.key, null]]);
  const cost = new Map([[start.key, 0]]);
  const queue = [start.key];
  while (queue.length) {
    queue.sort((a, b) => cost.get(a) - cost.get(b));
    const key = queue.shift();
    if (key === goal.key) break;
    const node = WALK_NODES.get(key);
    node.edges.forEach((edgeKey) => {
      const edge = WALK_NODES.get(edgeKey);
      const next = cost.get(key) + Math.abs(edge.x - node.x) + Math.abs(edge.y - node.y);
      if (cost.has(edgeKey) && cost.get(edgeKey) <= next) return;
      cost.set(edgeKey, next);
      previous.set(edgeKey, key);
      queue.push(edgeKey);
    });
  }

  if (!previous.has(goal.key)) return [to];

  const path = [];
  let cursor = goal.key;
  while (cursor) {
    const node = WALK_NODES.get(cursor);
    path.unshift({ x: node.x, y: node.y });
    cursor = previous.get(cursor);
  }

  // Reaching the anchor itself may need one final axis-aligned step.
  const last = path[path.length - 1];
  if (last.x !== to.x || last.y !== to.y) {
    if (last.x !== to.x && last.y !== to.y) path.push({ x: to.x, y: last.y });
    path.push({ x: to.x, y: to.y });
  }
  return path;
}
