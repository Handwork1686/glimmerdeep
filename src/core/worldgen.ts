import { SKY_ROWS } from '../config';
import { BIOMES, BiomeDef, biomeAt, blendAt, HEART_CHAMBER, HEART_DEPTH, SEAL_ROWS, SEALS } from '../data/biomes';
import { RELICS } from '../data/relics';
import { T, TILES } from '../data/tiles';
import { fbm, hash2, Rng, valueNoise } from './rng';

/**
 * Open-world generation. The world is unbounded sideways and downward, and is
 * generated one CHUNK x CHUNK block at a time, on demand.
 *
 * Determinism: a chunk depends only on (seed, chunk coords, prospect, ctx), never
 * on which chunks were generated before it. Stateless per-cell layers (rock,
 * caves, scatter) are pure functions of position. Features that cross chunk
 * borders (ore veins, geode vaults) belong to an *origin chunk* whose hash seeds
 * them; a chunk replays the features of itself and its 8 neighbours and keeps
 * only the cells that land inside it, so a vein drawn half by each of two chunks
 * is seamless. Relics are sited by hash at dig start (see `relicSites`).
 */
export const CHUNK = 32;

export const rowOfDepth = (depth: number) => SKY_ROWS + Math.floor(depth);
export const depthOfRow = (row: number) => row - SKY_ROWS;

/** World-shaping (prospecting) stats, read when a chunk is generated. All 0 by default. */
export interface Prospect {
  /** more shard sources (crystal and explosive veins, embers) */
  shards: number;
  /** more geode vaults */
  geodes: number;
  /** relics sited nearer the shaft; more caches in finished layers */
  relicSense: number;
  /** larger, more frequent caves */
  caves: number;
  /** more and richer ore veins, a little more gem ore */
  ores: number;
  /** more lamp moss and amber */
  flora: number;
  /** chance a chunk is rich ground (x2 sources); capped */
  rich: number;
}

export const NO_PROSPECT: Prospect = { shards: 0, geodes: 0, relicSense: 0, caves: 0, ores: 0, flora: 0, rich: 0 };

export interface RelicSpot {
  id: string;
  x: number;
  y: number;
}

/** Per-dig context: everything generation needs besides the seed and the chunk. */
export interface GenContext {
  seed: number;
  /** this dig's relic sites (one per unfound relic) */
  relics: readonly RelicSpot[];
  /** biome ids whose four relics are all found: relic rolls there become caches */
  doneLayers: ReadonlySet<string>;
}

export interface Chunk {
  tiles: Uint8Array;
  /** 1 where the cell was open cave at generation (decor grows only there) */
  natural: Uint8Array;
  rich: boolean;
}

/** the World's Heart: a 2x2 crystal at the spawn column */
export const HEART_POS = { x: -1, y: rowOfDepth(HEART_DEPTH) + HEART_CHAMBER / 2 - 1 };

const SHARD_SOURCES = new Set<number>([T.quartz, T.glimmer, T.opal, T.voidglass, T.aether, T.moonstone, T.heartstone, T.ember, T.cinnabar]);
const GEM_ORES = new Set<number>([T.fossil, T.sapphire, T.ruby, T.emerald, T.prism]);
const MAX_P = 0.9;
const clampP = (p: number) => Math.max(0, Math.min(MAX_P, p));
const chunkHash = (cx: number, cy: number, salt: number) => Math.floor(hash2(cx, cy, salt) * 4294967296);

function biomeT(biome: BiomeDef, depth: number): number {
  const span = Math.min(biome.to, biome.from + 600) - biome.from;
  return Math.min(1, Math.max(0, (depth - biome.from) / Math.max(1, span)));
}

/** the biome a cell belongs to: layers blend into each other over a band around each boundary */
function cellBiome(seed: number, x: number, y: number): BiomeDef {
  const { a, b, p } = blendAt(depthOfRow(y));
  return b && hash2(x, y, seed + 5) < p ? b : a;
}

/** the stateless rock + cave layer: a pure function of position */
export function baseTile(seed: number, x: number, y: number, caves = 0): number {
  if (y < SKY_ROWS) return T.air;
  if (y === SKY_ROWS) return T.turf;
  const depth = depthOfRow(y);
  const b = cellBiome(seed, x, y);
  const t = biomeT(b, depth);
  let total = 0;
  for (const [, w0, w1] of b.base) total += w0 + (w1 - w0) * t;
  let n = fbm(x * 1.0, y * 1.25, seed + 11) * 1.25 - 0.12;
  n = Math.min(0.999, Math.max(0, n)) * total;
  let tile = b.base[0][0];
  for (const [tl, w0, w1] of b.base) {
    n -= w0 + (w1 - w0) * t;
    if (n <= 0) {
      tile = tl;
      break;
    }
  }
  if (depth > 4) {
    const cn = valueNoise(x, y * 1.4, 7, seed + 21) * 0.65 + valueNoise(x, y, 3, seed + 22) * 0.35;
    // a slow sideways wobble: some regions are cave-riddled, others solid
    const wobble = (valueNoise(x, y, 48, seed + 31) - 0.5) * 0.12;
    const open = Math.min(0.75, b.cave * (1 + caves));
    if (cn > 1 - open * 0.52 - wobble) return T.air;
  }
  return tile;
}

function isRich(seed: number, cx: number, cy: number, p: Prospect): boolean {
  if (cy * CHUNK < SKY_ROWS + 24) return false;
  return hash2(cx, cy, seed + 991) < Math.min(0.15, Math.max(0, p.rich));
}

/** Generate one chunk. Pure: same arguments => same chunk. */
export function generateChunk(cx: number, cy: number, p: Prospect, ctx: GenContext): Chunk {
  const { seed } = ctx;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const tiles = new Uint8Array(CHUNK * CHUNK);
  const inside = (x: number, y: number) => x >= x0 && x < x0 + CHUNK && y >= y0 && y < y0 + CHUNK;
  const idx = (x: number, y: number) => (y - y0) * CHUNK + (x - x0);
  const get = (x: number, y: number) => tiles[idx(x, y)];
  const set = (x: number, y: number, t: number) => {
    if (inside(x, y)) tiles[idx(x, y)] = t;
  };

  // ---- 1. rock + caves (stateless)
  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) tiles[idx(x, y)] = baseTile(seed, x, y, p.caves);

  // ---- 2. features of this chunk and its neighbours (veins, geodes), in a fixed order
  for (let oy = cy - 1; oy <= cy + 1; oy++) {
    for (let ox = cx - 1; ox <= cx + 1; ox++) {
      if ((oy + 1) * CHUNK <= SKY_ROWS) continue;
      const rich = isRich(seed, ox, oy, p);
      drawVeins(seed, ox, oy, p, rich, (x, y, ore) => {
        if (!inside(x, y) || y <= SKY_ROWS + 1) return;
        const base = baseTile(seed, x, y, p.caves);
        if (base !== T.air && !TILES[base].ore) set(x, y, ore);
      });
      drawGeode(seed, ox, oy, p, rich, set);
    }
  }

  // ---- 3. scatter specials & boulders above cave ceilings (stateless per cell)
  for (let y = Math.max(y0, SKY_ROWS + 3); y < y0 + CHUNK; y++) {
    for (let x = x0; x < x0 + CHUNK; x++) {
      const biome = cellBiome(seed, x, y);
      const cur = get(x, y);
      if (cur === T.air || TILES[cur].ore || cur === T.geode || TILES[cur].shards) continue;
      const belowAir = baseTile(seed, x, y + 1, p.caves) === T.air;
      for (const [tile, chance] of biome.scatter) {
        let q = chance;
        if (tile === T.boulder) q = belowAir ? chance * 14 : 0;
        if (tile === T.lampmoss && belowAir) q *= 2;
        if (tile === T.lampmoss || tile === T.amber) q *= 1 + p.flora;
        if (tile === T.ember) q *= 1 + p.shards;
        if (hash2(x, y, seed + tile * 7) < clampP(q)) {
          tiles[idx(x, y)] = tile;
          break;
        }
      }
    }
  }

  // ---- 4. relics (sited at dig start) and caches in finished layers
  for (const r of ctx.relics) if (inside(r.x, r.y)) set(r.x, r.y, T.relic);
  if (y0 + CHUNK > SKY_ROWS + 20) {
    const cy0 = y0 + 8 + Math.floor(hash2(cx, cy, seed + 515) * (CHUNK - 16));
    const biome = biomeAt(depthOfRow(cy0));
    if (ctx.doneLayers.has(biome.id) && hash2(cx, cy, seed + 514) < clampP(0.12 + 0.08 * p.relicSense)) {
      const ccx = x0 + 8 + Math.floor(hash2(cx, cy, seed + 516) * (CHUNK - 16));
      // a tiny gem geode: a crust around a gem heart
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(ccx + dx, cy0 + dy, T.geode);
      set(ccx, cy0, GEM_FOR[biome.id] ?? T.sapphire);
    }
  }

  // ---- 5. rune ribbons at the old seal depths: breakable, with gaps, never a wall
  for (const sl of SEALS) {
    const r0 = rowOfDepth(sl.depth);
    if (r0 + SEAL_ROWS <= y0 || r0 >= y0 + CHUNK) continue;
    for (let y = r0; y < r0 + SEAL_ROWS; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        if (ribbonGap(seed, sl.depth, x)) {
          set(x, y, T.air);
        } else {
          const cur = get(x, y);
          if (cur !== T.relic) set(x, y, T.seal);
        }
      }
    }
  }

  // ---- 6. fixed stamps at the spawn column: the World's Heart chamber and the starter vein
  stampHeart(seed, x0, y0, set, get, inside);
  if (inside(0, SKY_ROWS + 2) || inside(0, SKY_ROWS + 5)) {
    for (let x = -3; x <= 2; x++) if (inside(x, SKY_ROWS + 2) && get(x, SKY_ROWS + 2) !== T.air) set(x, SKY_ROWS + 2, x % 2 ? T.copper : T.dirt);
    set(0, SKY_ROWS + 4, T.quartz);
    set(1, SKY_ROWS + 4, T.quartz);
    set(-1, SKY_ROWS + 5, T.quartz);
  }

  const natural = new Uint8Array(CHUNK * CHUNK);
  for (let i = 0; i < tiles.length; i++) natural[i] = tiles[i] === T.air ? 1 : 0;
  return { tiles, natural, rich: isRich(seed, cx, cy, p) };
}

/** gaps of one or two tiles every 4-7 tiles along a ribbon */
export function ribbonGap(seed: number, depth: number, x: number): boolean {
  const k = Math.floor(x / 6);
  const off = Math.floor(hash2(k, depth, seed + 88) * 6);
  const len = hash2(k, depth, seed + 89) < 0.5 ? 1 : 2;
  const r = x - k * 6 - off;
  return r >= 0 && r < len;
}

const GEM_FOR: Record<string, number> = {
  rootsoil: T.fossil, amberstone: T.fossil, grotto: T.sapphire, emberdeep: T.ruby, hollow: T.prism, mantle: T.emerald, heart: T.prism,
};

/** ore veins seeded by origin chunk (ox, oy): random walks of at most 12 steps */
function drawVeins(seed: number, ox: number, oy: number, p_: Prospect, rich: boolean, plot: (x: number, y: number, ore: number) => void) {
  const rng = new Rng(chunkHash(ox, oy, seed ^ 0x51ed));
  // a per-chunk lean: veins in some regions run more sideways, in others more down
  const lean = rng.range(-0.15, 0.15);
  // density was tuned per 10-row x 28-column band (280 cells); a group here is 8 x 32 (256)
  const AREA = (8 * CHUNK) / 280;
  for (let g = 0; g < CHUNK / 8; g++) {
    const gy = oy * CHUNK + g * 8;
    const depth = depthOfRow(gy + 4);
    if (depth < 0) continue;
    const { a, b, p } = blendAt(depth);
    const cands: [BiomeDef, number][] = b ? [[a, 1 - p], [b, p]] : [[a, 1]];
    for (const [biome, share] of cands) {
      if (share <= 0.001) continue;
      const t = biomeT(biome, depth);
      for (const ore of biome.ores) {
        if (ore.minT !== undefined && t < ore.minT) continue;
        let per = ore.perBand * AREA * (1 + p_.ores * (GEM_ORES.has(ore.tile) ? 1.5 : 1));
        if (SHARD_SOURCES.has(ore.tile)) per *= 1 + p_.shards;
        if (rich) per *= 2;
        // early game: generous copper near the surface
        if (depth < 20 && ore.tile === T.copper) per += 2 * AREA;
        per *= share;
        let count = Math.floor(per);
        if (rng.chance(per - count)) count++;
        for (let k = 0; k < count; k++) {
          let x = ox * CHUNK + rng.int(0, CHUNK - 1);
          let y = gy + rng.int(0, 7);
          const len = Math.min(12, rng.int(ore.len[0], ore.len[1]) + (p_.ores > 0 && rng.chance(Math.min(1, p_.ores)) ? 1 : 0));
          for (let s = 0; s < len; s++) {
            plot(x, y, ore.tile);
            const r = rng.next();
            if (r < 0.25 + lean) x++;
            else if (r < 0.5) x--;
            else if (r < 0.75) y++;
            else y += rng.chance(0.5) ? 1 : -1;
          }
        }
      }
    }
  }
}

/** a geode vault seeded by origin chunk (ox, oy): radius < 6, so it never reaches past a neighbour */
function drawGeode(seed: number, ox: number, oy: number, p: Prospect, rich: boolean, set: (x: number, y: number, t: number) => void) {
  const rng = new Rng(chunkHash(ox, oy, seed ^ 0x6e0d));
  // the old shaft had one vault per ~1540 cells at 42%; a chunk is 1024 cells
  let chance = 0.42 * ((CHUNK * CHUNK) / 1540) * (1 + p.geodes);
  if (rich) chance *= 2;
  if (!rng.chance(clampP(chance))) return;
  const cy = oy * CHUNK + rng.int(4, CHUNK - 5);
  if (cy < SKY_ROWS + 40) return;
  const biome = cellBiome(seed, ox * CHUNK, cy);
  const rx = rng.int(3, 5) + 0.5;
  const ry = rng.int(2, 3) + 0.5;
  const cx = ox * CHUNK + rng.int(4, CHUNK - 5);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d > 1.05) continue;
      set(x, y, d > 0.7 ? T.geode : biome.geodeFill);
    }
  }
  set(cx, cy, T.heartstone);
}

function stampHeart(
  seed: number, x0: number, y0: number,
  set: (x: number, y: number, t: number) => void, get: (x: number, y: number) => number, inside: (x: number, y: number) => boolean,
) {
  const hTop = rowOfDepth(HEART_DEPTH);
  if (hTop + HEART_CHAMBER <= y0 || hTop >= y0 + CHUNK || x0 > 14 || x0 + CHUNK < -14) return;
  const hcx = 0;
  const hcy = hTop + HEART_CHAMBER / 2;
  for (let y = hTop; y < hTop + HEART_CHAMBER; y++) {
    for (let x = -14; x <= 14; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot((x + 0.5 - hcx) / 13, (y + 0.5 - hcy) / (HEART_CHAMBER / 2));
      if (d < 0.86) set(x, y, T.air);
      else if (d < 1.0) set(x, y, hash2(x, y, seed + 77) < 0.35 ? T.heartstone : T.heartrock);
    }
  }
  const h = HEART_POS;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(h.x + dx, h.y + dy, T.worldheart);
  for (let y = h.y + 2; y < hTop + HEART_CHAMBER; y++) for (let dx = 0; dx < 2; dx++) if (inside(h.x + dx, y) && get(h.x + dx, y) === T.air) set(h.x + dx, y, T.heartrock);
  for (const px of [-10, -6, 5, 9]) {
    const ph = 3 + (((px % 3) + 3) % 3);
    for (let k = 0; k < ph; k++) set(px, hTop + HEART_CHAMBER - 3 - k, T.heartstone);
  }
}

/**
 * Relic sites for one dig: exactly one per unfound relic, placed by hash so the
 * site never depends on generation order. Relic Sense pulls them toward the shaft.
 */
export function relicSites(seed: number, found: readonly string[], relicSense: number): RelicSpot[] {
  const have = new Set(found);
  const spread = Math.max(16, Math.round(96 / (1 + Math.max(0, relicSense))));
  const out: RelicSpot[] = [];
  RELICS.forEach((relic, i) => {
    if (have.has(relic.id)) return;
    const biome = BIOMES.find((b) => b.id === relic.biome)!;
    const lo = biome.from + 12;
    const hi = Math.min(biome.to, HEART_DEPTH) - 12;
    let depth = lo + Math.floor(hash2(i, 1, seed + 0x2e11c) * (hi - lo + 1));
    // relics never hide in a seal band
    for (const s of SEALS) if (depth >= s.depth - 2 && depth <= s.depth + SEAL_ROWS + 1) depth = s.depth + SEAL_ROWS + 3;
    const x = Math.round((hash2(i, 2, seed + 0x2e11c) * 2 - 1) * spread);
    out.push({ id: relic.id, x, y: rowOfDepth(depth) });
  });
  return out;
}

/** biomes whose four relics are all found */
export function finishedLayers(found: readonly string[]): Set<string> {
  const have = new Set(found);
  const out = new Set<string>();
  for (const b of BIOMES) {
    const rs = RELICS.filter((r) => r.biome === b.id);
    if (rs.length && rs.every((r) => have.has(r.id))) out.add(b.id);
  }
  return out;
}
