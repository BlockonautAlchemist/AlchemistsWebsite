import { COMMAND_CENTER_WALK_GRAPH } from './sceneConfig.mjs';

// Rectilinear corridors: nodes are segment endpoints, crossings and the actual
// current foot position. The character uses four directional walking sheets.

function nodeKey(point) {
  return `${point.x},${point.y}`;
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

/** Insert the actual foot positions into their segments before pathfinding. */
export function routeThroughWalkGraph(from, to, segments = COMMAND_CENTER_WALK_GRAPH.segments) {
  if (![from, to].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && segments.some((segment) => pointOnSegment(p, segment)))) return null;
  const augmented = [...segments, { from, to: from }, { from: to, to }];
  const nodes = buildWalkGraph(augmented);
  const start = nodes.get(nodeKey(from)), goal = nodes.get(nodeKey(to));
  if (!start || !goal) return null;
  const previous = new Map([[start.key, null]]), cost = new Map([[start.key, 0]]);
  const queue = [start.key];
  while (queue.length) {
    queue.sort((a, b) => cost.get(a) - cost.get(b));
    const key = queue.shift();
    if (key === goal.key) break;
    const node = nodes.get(key);
    for (const edgeKey of node.edges) {
      const edge = nodes.get(edgeKey);
      const next = cost.get(key) + Math.abs(edge.x - node.x) + Math.abs(edge.y - node.y);
      if (cost.has(edgeKey) && cost.get(edgeKey) <= next) continue;
      cost.set(edgeKey, next); previous.set(edgeKey, key); queue.push(edgeKey);
    }
  }
  if (!previous.has(goal.key)) return null;
  const path = [];
  for (let cursor = goal.key; cursor; cursor = previous.get(cursor)) {
    const node = nodes.get(cursor); path.unshift({ x: node.x, y: node.y });
  }
  const merged = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = merged.at(-2), b = merged.at(-1), c = path[i];
    if (a && ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) merged.pop();
    merged.push(c);
  }
  return merged.length === 1 ? [{ ...to }] : merged.slice(1);
}
