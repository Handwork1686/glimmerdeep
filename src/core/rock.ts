import { blendAt, type BiomeDef } from '../data/biomes';
import { TILES } from '../data/tiles';

/**
 * How hard plain rock is at a depth: one smooth, monotone curve (a Fritsch-Carlson
 * cubic through these anchors) instead of a step at every layer boundary.
 * Past the Heart it keeps climbing at the same slope, so the endless depths never
 * go soft.
 */
const ANCHORS: [number, number][] = [[0, 2.2], [50, 4.9], [100, 9], [150, 18], [400, 55], [640, 110], [900, 450], [1270, 800], [1500, 1100]];
const END_SLOPE = 1.5;

const slopes = (() => {
  const n = ANCHORS.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ANCHORS[i + 1][1] - ANCHORS[i][1]) / (ANCHORS[i + 1][0] - ANCHORS[i][0]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  m.push(d[n - 2]);
  return m;
})();

export function rockHp(depth: number): number {
  if (depth <= 0) return ANCHORS[0][1];
  const last = ANCHORS[ANCHORS.length - 1];
  if (depth >= last[0]) return last[1] + END_SLOPE * (depth - last[0]);
  let i = 0;
  while (ANCHORS[i + 1][0] < depth) i++;
  const [x0, y0] = ANCHORS[i];
  const [x1, y1] = ANCHORS[i + 1];
  const h = x1 - x0;
  const t = (depth - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slopes[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slopes[i + 1];
}

/** the average toughness of the base rock a biome generates at a depth */
function biomeMean(b: BiomeDef, depth: number): number {
  const span = Math.min(b.to, b.from + 600) - b.from;
  const t = Math.min(1, Math.max(0, (depth - b.from) / Math.max(1, span)));
  let total = 0;
  let sum = 0;
  for (const [tile, w0, w1] of b.base) {
    const w = w0 + (w1 - w0) * t;
    total += w;
    sum += w * TILES[tile].hp;
  }
  return sum / total;
}

/** the average def-HP of base rock at a depth, blended across layer boundaries like the rock itself */
const MEAN_CACHE: number[] = [];
export function baseHpMean(depth: number): number {
  const d = Math.max(0, Math.min(1700, Math.round(depth)));
  let v = MEAN_CACHE[d];
  if (v === undefined) {
    const { a, b, p } = blendAt(d);
    v = b ? biomeMean(a, d) * (1 - p) + biomeMean(b, d) * p : biomeMean(a, d);
    MEAN_CACHE[d] = v;
  }
  return v;
}

/**
 * Multiplier turning a tile's list HP into its real HP at a depth, so the average
 * base rock there is exactly rockHp(depth) and ores keep their toughness relative
 * to the rock around them.
 */
export function hpCurve(depth: number): number {
  return rockHp(depth) / baseHpMean(depth);
}

