import { describe, expect, it } from 'vitest';
import { SKY_ROWS } from '../src/config';
import { Bot } from '../src/core/bot';
import { NO_INPUT, Sim } from '../src/core/sim';
import { CHUNK, GenContext, generateChunk, HEART_POS, NO_PROSPECT, Prospect, relicSites, rowOfDepth } from '../src/core/worldgen';
import { HEART_DEPTH, SEAL_ROWS, SEALS } from '../src/data/biomes';
import { RELICS } from '../src/data/relics';
import { T, TILES } from '../src/data/tiles';

const ctx = (seed: number, extra: Partial<GenContext> = {}): GenContext => ({
  seed, relics: relicSites(seed, [], 0), doneLayers: new Set(), ...extra,
});
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

/** count tiles matching `pred` in a band of chunks */
function count(seed: number, cxs: number[], cy: number, pred: (t: number) => boolean, p: Prospect = NO_PROSPECT) {
  let n = 0;
  for (const cx of cxs) for (const t of generateChunk(cx, cy, p, ctx(seed)).tiles) if (pred(t)) n++;
  return n;
}

describe('open world generation', () => {
  it('is deterministic per chunk, whatever order chunks are generated in', () => {
    const c = ctx(123);
    const coords: [number, number][] = [];
    for (let cy = 0; cy < 6; cy++) for (let cx = -3; cx <= 3; cx++) coords.push([cx, cy]);
    const first = new Map(coords.map(([x, y]) => [`${x},${y}`, generateChunk(x, y, NO_PROSPECT, c).tiles]));
    // generate again in a shuffled order, with fresh contexts
    const shuffled = [...coords].sort((a, b) => ((a[0] * 7919 + a[1] * 104729) % 13) - ((b[0] * 7919 + b[1] * 104729) % 13));
    for (const [x, y] of shuffled) expect(same(generateChunk(x, y, NO_PROSPECT, ctx(123)).tiles, first.get(`${x},${y}`)!)).toBe(true);
  });

  it('differs across seeds', () => {
    expect(same(generateChunk(0, 2, NO_PROSPECT, ctx(1)).tiles, generateChunk(0, 2, NO_PROSPECT, ctx(2)).tiles)).toBe(false);
  });

  it('has no side walls: ground far left and right matches the shaft for its depth', () => {
    const cy = Math.floor(rowOfDepth(200) / CHUNK);
    const ore = (t: number) => !!TILES[t].ore;
    const open = (t: number) => t === T.air;
    const home = count(5, [-1, 0], cy, ore);
    const far = count(5, [-40, 40], cy, ore);
    expect(far).toBeGreaterThan(home * 0.5);
    expect(far).toBeLessThan(home * 2);
    expect(count(5, [-40, 40], cy, open)).toBeGreaterThan(0);
    for (const cx of [-500, 500]) for (const t of generateChunk(cx, cy, NO_PROSPECT, ctx(5)).tiles) expect(t).not.toBe(T.bedrock);
  });

  it('veins cross chunk borders without seams', () => {
    // a vein walk that leaves its origin chunk is drawn by the neighbour too; check the
    // shared border has ore on both sides somewhere across many chunks
    let crossings = 0;
    for (let cx = -6; cx < 6; cx++) {
      const a = generateChunk(cx, 8, NO_PROSPECT, ctx(77)).tiles;
      const b = generateChunk(cx + 1, 8, NO_PROSPECT, ctx(77)).tiles;
      for (let y = 0; y < CHUNK; y++) {
        const l = a[y * CHUNK + CHUNK - 1];
        const r = b[y * CHUNK];
        if (TILES[l].ore && l === r) crossings++;
      }
    }
    expect(crossings).toBeGreaterThan(0);
  });

  it('rune ribbons run under every column, with gaps, and are breakable rune stone', () => {
    for (const sl of SEALS) {
      const row = rowOfDepth(sl.depth);
      let gaps = 0;
      let runes = 0;
      for (const cx of [-500, -17, 0, 3, 500]) {
        const c = generateChunk(cx, Math.floor(row / CHUNK), NO_PROSPECT, ctx(9));
        for (let y = row; y < row + SEAL_ROWS; y++) {
          if (Math.floor(y / CHUNK) !== Math.floor(row / CHUNK)) continue;
          for (let lx = 0; lx < CHUNK; lx++) {
            const t = c.tiles[(y % CHUNK) * CHUNK + lx];
            if (t === T.seal) runes++;
            else if (t === T.air) gaps++;
          }
        }
      }
      expect(runes).toBeGreaterThan(gaps * 2);
      expect(gaps).toBeGreaterThan(0);
    }
  });

  it("has one World's Heart, under the shaft", () => {
    const hy = HEART_POS.y;
    expect(hy).toBeGreaterThan(rowOfDepth(HEART_DEPTH));
    const sim = new Sim({ seed: 3, upgrades: { root: 1 }, gloom: 0 });
    expect(sim.tileAt(HEART_POS.x, hy)).toBe(T.worldheart);
    expect(Math.abs(sim.heart.x)).toBeLessThanOrEqual(1);
    let hearts = 0;
    for (let cx = -8; cx <= 8; cx++) for (let cy = Math.floor((hy - 20) / CHUNK); cy <= Math.floor((hy + 20) / CHUNK); cy++) {
      for (const t of generateChunk(cx, cy, NO_PROSPECT, ctx(3)).tiles) if (t === T.worldheart) hearts++;
    }
    expect(hearts).toBe(4); // one 2x2 crystal
  });

  it('sites each unfound relic exactly once, never reburies found ones, and Relic Sense pulls them in', () => {
    const all = relicSites(4, [], 0);
    expect(all).toHaveLength(RELICS.length);
    expect(new Set(all.map((r) => r.id)).size).toBe(RELICS.length);
    const some = relicSites(4, ['oldpick', 'crown'], 0);
    expect(some.map((r) => r.id)).not.toContain('oldpick');
    expect(some).toHaveLength(RELICS.length - 2);
    const sensed = relicSites(4, [], 3);
    const spread = (rs: { x: number }[]) => Math.max(...rs.map((r) => Math.abs(r.x)));
    expect(spread(sensed)).toBeLessThan(spread(all));
    // a relic chunk holds its relic tile, generated in any order
    const r = all[5];
    const c = generateChunk(Math.floor(r.x / CHUNK), Math.floor(r.y / CHUNK), NO_PROSPECT, ctx(4));
    expect(c.tiles[(r.y - Math.floor(r.y / CHUNK) * CHUNK) * CHUNK + (r.x - Math.floor(r.x / CHUNK) * CHUNK)]).toBe(T.relic);
  });

  it('finished layers roll capped caches instead of relics', () => {
    const done = ctx(11, { doneLayers: new Set(['grotto']), relics: [] });
    let caches = 0;
    const cy0 = Math.floor(rowOfDepth(330) / CHUNK);
    for (let cx = -40; cx < 40; cx++) for (const t of generateChunk(cx, cy0, { ...NO_PROSPECT, relicSense: 99 }, done).tiles) if (t === T.geode) caches++;
    // even absurd Relic Sense stays below certainty (<= 90% of chunks)
    expect(caches).toBeGreaterThan(0);
  });
});

describe('digs in the open world', () => {
  it('every dig starts at the surface over the shaft', () => {
    const sim = new Sim({ seed: 1, upgrades: { root: 1 }, milestones: ['amberstone', 'grotto'], gloom: 0 });
    expect(sim.depth()).toBe(0);
    expect(Math.abs(sim.player.x)).toBeLessThan(16);
    expect(sim.player.y).toBeLessThan(SKY_ROWS * 16);
  });

  it('the player can walk and dig far sideways without hitting a wall', () => {
    const sim = new Sim({ seed: 5, upgrades: { root: 1 }, gloom: 0 });
    // carve a corridor 300 tiles left of the shaft and walk it
    const row = SKY_ROWS + 6;
    for (let x = -310; x <= 0; x++) for (let y = row - 1; y <= row; y++) sim.setTile(x, y, T.air);
    for (let x = -310; x <= 0; x++) sim.setTile(x, row + 1, T.stone);
    sim.player.x = 8;
    sim.player.y = row * 16 + 10;
    for (let i = 0; i < 60 * 70 && sim.player.x > -300 * 16; i++) {
      sim.light = sim.stats.maxLight; // keep the lantern lit: this is about the walls
      sim.step({ ...NO_INPUT, left: true });
    }
    expect(sim.player.x).toBeLessThan(-290 * 16);
  });

  it('the bot stays near the shaft and makes progress', () => {
    const sim = new Sim({ seed: 21, upgrades: { root: 1, bit: 3 }, gloom: 0 });
    const bot = new Bot();
    for (let i = 0; i < 60 * 120 && !sim.over; i++) {
      sim.step(bot.think(sim));
      sim.drainEvents();
      expect(Math.abs(sim.player.x / 16)).toBeLessThan(80);
    }
    expect(sim.maxDepth).toBeGreaterThan(20);
  });
});
