import { COLS, SKY_ROWS, WORLD_ROWS } from '../config';
import { BIOMES, biomeAt, HEART_CHAMBER, HEART_DEPTH, LIFT_STOPS, SEAL_ROWS, SEALS } from '../data/biomes';
import { RELICS } from '../data/relics';
import { T, TILES } from '../data/tiles';
import { fbm, hash2, Rng, valueNoise } from './rng';

export interface RelicSpot {
  id: string;
  x: number;
  y: number;
}

export interface GenResult {
  tiles: Uint8Array;
  relics: RelicSpot[];
  /** centre of the World's Heart crystal (tile coords) */
  heart: { x: number; y: number };
  geodes: number;
}

export interface GenOptions {
  seed: number;
  /** relics already found are not buried again */
  foundRelics?: string[];
}

export const rowOfDepth = (depth: number) => SKY_ROWS + Math.floor(depth);
export const depthOfRow = (row: number) => row - SKY_ROWS;

/**
 * Pure, deterministic world generation. Same seed + options => same world.
 */
export function generateWorld(opts: GenOptions): GenResult {
  const { seed } = opts;
  const W = COLS;
  const H = WORLD_ROWS;
  const tiles = new Uint8Array(W * H);
  const idx = (x: number, y: number) => y * W + x;

  // ---- 1. base materials + caves
  for (let y = SKY_ROWS; y < H; y++) {
    const depth = depthOfRow(y);
    const biome = biomeAt(depth);
    const span = Math.min(biome.to, biome.from + 600) - biome.from;
    const t = Math.min(1, (depth - biome.from) / Math.max(1, span));
    // blend into next biome near the boundary
    const next = BIOMES[BIOMES.indexOf(biome) + 1];
    for (let x = 1; x < W - 1; x++) {
      let b = biome;
      if (next && biome.to - depth < 6 && hash2(x, y, seed + 5) < (6 - (biome.to - depth)) / 9) b = next;
      const weights = b.base.map(([tile, w0, w1]) => [tile, w0 + (w1 - w0) * t] as const);
      let total = 0;
      for (const [, w] of weights) total += w;
      // spatially coherent selection
      let n = fbm(x * 1.0, y * 1.25, seed + 11) * 1.25 - 0.12;
      n = Math.min(0.999, Math.max(0, n)) * total;
      let tile = weights[0][0];
      for (const [tl, w] of weights) {
        n -= w;
        if (n <= 0) {
          tile = tl;
          break;
        }
      }
      tiles[idx(x, y)] = tile;
      // caves (never in the first 4 rows, keep edges thicker)
      if (depth > 4) {
        const cn = valueNoise(x, y * 1.4, 7, seed + 21) * 0.65 + valueNoise(x, y, 3, seed + 22) * 0.35;
        const edge = x <= 1 || x >= W - 2 ? 0.08 : 0;
        if (cn > 1 - b.cave * 0.52 + edge) tiles[idx(x, y)] = T.air;
      }
    }
    tiles[idx(0, y)] = T.bedrock;
    tiles[idx(W - 1, y)] = T.bedrock;
  }
  // turf row
  for (let x = 1; x < W - 1; x++) tiles[idx(x, SKY_ROWS)] = T.turf;
  for (let y = 0; y < SKY_ROWS; y++) {
    tiles[idx(0, y)] = T.air;
    tiles[idx(W - 1, y)] = T.air;
  }

  // ---- 2. ore veins (random walks per 10-row band)
  const rng = new Rng(seed ^ 0x51ed);
  for (let band = 0; band * 10 < H - SKY_ROWS; band++) {
    const bandTop = SKY_ROWS + band * 10;
    const depth = band * 10;
    const biome = biomeAt(depth + 5);
    const t = (depth - biome.from) / Math.max(1, Math.min(biome.to, biome.from + 600) - biome.from);
    for (const ore of biome.ores) {
      if (ore.minT !== undefined && t < ore.minT) continue;
      let count = Math.floor(ore.perBand);
      if (rng.chance(ore.perBand - count)) count++;
      // early game: guarantee generous copper near the surface
      if (depth < 20 && ore.tile === T.copper) count += 2;
      for (let k = 0; k < count; k++) {
        let x = rng.int(2, W - 3);
        let y = bandTop + rng.int(0, 9);
        const len = rng.int(ore.len[0], ore.len[1]);
        for (let s = 0; s < len; s++) {
          if (y > SKY_ROWS + 1 && y < H && x > 0 && x < W - 1) {
            const cur = tiles[idx(x, y)];
            if (cur !== T.air && cur !== T.bedrock && !TILES[cur].ore) tiles[idx(x, y)] = ore.tile;
          }
          const dir = rng.int(0, 3);
          if (dir === 0) x++;
          else if (dir === 1) x--;
          else if (dir === 2) y++;
          else y += rng.chance(0.5) ? 1 : -1;
          x = Math.max(1, Math.min(W - 2, x));
        }
      }
    }
  }

  // ---- 3. scatter specials & boulders above cave ceilings
  for (let y = SKY_ROWS + 3; y < H - 1; y++) {
    const biome = biomeAt(depthOfRow(y));
    for (let x = 1; x < W - 1; x++) {
      const cur = tiles[idx(x, y)];
      if (cur === T.air || TILES[cur].ore || cur === T.bedrock) continue;
      const below = tiles[idx(x, y + 1)];
      for (const [tile, chance] of biome.scatter) {
        let p = chance;
        if (tile === T.boulder) p = below === T.air ? chance * 14 : 0;
        if (tile === T.lampmoss && below === T.air) p *= 2;
        if (hash2(x, y, seed + tile * 7) < p) {
          tiles[idx(x, y)] = tile;
          break;
        }
      }
    }
  }

  // ---- 4. geode vaults: hollow crystal pockets, a jackpot chain with a core at the centre
  const grng = new Rng(seed ^ 0x6e0d);
  let geodes = 0;
  for (let top = SKY_ROWS + 40; top < H - 20; top += 55) {
    if (!grng.chance(0.42)) continue;
    const cy = top + grng.int(0, 40);
    const depth = depthOfRow(cy);
    const biome = biomeAt(depth);
    const rx = grng.int(3, 5) + 0.5;
    const ry = grng.int(2, 3) + 0.5;
    const cx = grng.int(3 + Math.ceil(rx), W - 4 - Math.ceil(rx));
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 1 || x > W - 2 || y < SKY_ROWS + 5 || y >= H) continue;
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d > 1.05) continue;
        tiles[idx(x, y)] = d > 0.7 ? T.geode : biome.geodeFill;
      }
    }
    tiles[idx(cx, cy)] = T.heartstone;
    geodes++;
  }

  // ---- 5. relics: each biome keeps its four, until they are found
  const found = new Set(opts.foundRelics ?? []);
  const relics: RelicSpot[] = [];
  const rrng = new Rng(seed ^ 0x2e11c);
  for (const relic of RELICS) {
    if (found.has(relic.id)) continue;
    const biome = BIOMES.find((b) => b.id === relic.biome)!;
    const y = rowOfDepth(rrng.int(biome.from + 12, Math.min(biome.to, 1500) - 12));
    const x = rrng.int(2, W - 3);
    tiles[idx(x, y)] = T.relic;
    relics.push({ id: relic.id, x, y });
  }

  // ---- 6. strata seals: full-width glowing bands at the biome boundaries
  for (const seal of SEALS) {
    const y0 = rowOfDepth(seal.depth);
    for (let y = y0; y < y0 + SEAL_ROWS; y++) for (let x = 1; x < W - 1; x++) tiles[idx(x, y)] = T.seal;
    // relics never hide inside a seal
    for (let i = relics.length - 1; i >= 0; i--) if (relics[i].y >= y0 - 1 && relics[i].y <= y0 + SEAL_ROWS) relics.splice(i, 1);
  }

  // ---- 7. the World's Heart: a great cavern with the heart crystal at its centre
  const hTop = rowOfDepth(HEART_DEPTH);
  const hcx = W / 2;
  const hcy = hTop + HEART_CHAMBER / 2;
  for (let y = hTop; y < hTop + HEART_CHAMBER; y++) {
    for (let x = 1; x < W - 1; x++) {
      const d = Math.hypot((x + 0.5 - hcx) / 13, (y + 0.5 - hcy) / (HEART_CHAMBER / 2));
      if (d < 0.86) tiles[idx(x, y)] = T.air;
      else if (d < 1.0) tiles[idx(x, y)] = hash2(x, y, seed + 77) < 0.35 ? T.heartstone : T.heartrock;
    }
  }
  // crystal pillars and the heart itself
  const heart = { x: Math.floor(hcx) - 1, y: Math.floor(hcy) - 1 };
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[idx(heart.x + dx, heart.y + dy)] = T.worldheart;
  for (let y = heart.y + 2; y < hTop + HEART_CHAMBER; y++) for (let dx = 0; dx < 2; dx++) if (tiles[idx(heart.x + dx, y)] === T.air) tiles[idx(heart.x + dx, y)] = T.heartrock;
  for (const px of [5, 9, W - 10, W - 6]) {
    const ph = 3 + (px % 3);
    for (let k = 0; k < ph; k++) tiles[idx(px, hTop + HEART_CHAMBER - 3 - k)] = T.heartstone;
  }

  // ---- 8. lift landings: small pockets
  for (const stop of LIFT_STOPS) {
    if (stop.depth === 0) continue;
    const y0 = rowOfDepth(stop.depth);
    for (let y = y0 - 2; y <= y0; y++) for (let x = 13; x <= 16; x++) tiles[idx(x, y)] = T.air;
    for (let x = 12; x <= 17; x++) tiles[idx(x, y0 + 1)] = T.brick;
    for (let x = 13; x <= 16; x++) tiles[idx(x, y0 + 1)] = T.stone; // diggable plug
  }

  // ---- 9. a guaranteed starter vein just below the turf
  for (let x = 12; x <= 17; x++) {
    if (tiles[idx(x, SKY_ROWS + 2)] !== T.air) tiles[idx(x, SKY_ROWS + 2)] = x % 2 ? T.copper : T.dirt;
  }
  tiles[idx(15, SKY_ROWS + 4)] = T.quartz;
  tiles[idx(16, SKY_ROWS + 4)] = T.quartz;
  tiles[idx(14, SKY_ROWS + 5)] = T.quartz;

  return { tiles, relics, heart, geodes };
}
