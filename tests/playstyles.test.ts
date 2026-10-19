import { describe, expect, it } from 'vitest';
import { Bot } from '../src/core/bot';
import { computeStats } from '../src/core/progression';
import { Sim } from '../src/core/sim';
import { CHUNK, GenContext, generateChunk, NO_PROSPECT, Prospect, rowOfDepth } from '../src/core/worldgen';
import { T, TILES } from '../src/data/tiles';
import { BRANCH_HINT, UPGRADES } from '../src/data/upgrades';

const ctx = (seed: number): GenContext => ({ seed, relics: [], doneLayers: new Set() });
/** count tiles matching `pred` over many chunks around 250-450 m */
function census(p: Prospect, pred: (t: number) => boolean, seed = 31) {
  let n = 0;
  const cy0 = Math.floor(rowOfDepth(250) / CHUNK);
  for (let cy = cy0; cy < cy0 + 6; cy++) for (let cx = -17; cx < 17; cx++) for (const t of generateChunk(cx, cy, p, ctx(seed)).tiles) if (pred(t)) n++;
  return n;
}
const isShardSource = (t: number) => !!TILES[t].shards && t !== T.geode;

describe('the world can be upgraded', () => {
  it('each worldgen stat measurably raises its feature over 200 chunks', () => {
    const base = NO_PROSPECT;
    expect(census({ ...base, shards: 0.6 }, isShardSource)).toBeGreaterThan(census(base, isShardSource) * 1.2);
    expect(census({ ...base, geodes: 0.8 }, (t) => t === T.geode)).toBeGreaterThan(census(base, (t) => t === T.geode) * 1.15);
    expect(census({ ...base, caves: 0.36 }, (t) => t === T.air)).toBeGreaterThan(census(base, (t) => t === T.air) * 1.1);
    expect(census({ ...base, ores: 0.6 }, (t) => !!TILES[t].ore)).toBeGreaterThan(census(base, (t) => !!TILES[t].ore) * 1.15);
    const flora = (t: number) => t === T.lampmoss || t === T.amber;
    expect(census({ ...base, flora: 0.75 }, flora)).toBeGreaterThan(census(base, flora) * 1.1);
  });

  it('rich ground happens, but stays special (never more than 15% of chunks)', () => {
    let rich = 0;
    let total = 0;
    for (let cy = 4; cy < 14; cy++) for (let cx = -20; cx < 20; cx++) {
      total++;
      if (generateChunk(cx, cy, { ...NO_PROSPECT, rich: 5 }, ctx(9)).rich) rich++;
    }
    expect(rich).toBeGreaterThan(0);
    expect(rich / total).toBeLessThan(0.22);
    expect(generateChunk(3, 8, NO_PROSPECT, ctx(9)).rich).toBe(false);
  });

  it('only newly explored ground changes: ground already generated stays as it was', () => {
    const sim = new Sim({ seed: 12, upgrades: { root: 1 }, gloom: 0 });
    const row = rowOfDepth(300);
    const before: number[] = [];
    for (let x = -30; x < 30; x++) before.push(sim.tileAt(x, row));
    // the dig picks up a world-shaping boon
    sim.stats.prospect.shards += 3;
    sim.stats.prospect.caves += 0.3;
    const after: number[] = [];
    for (let x = -30; x < 30; x++) after.push(sim.tileAt(x, row));
    expect(after).toEqual(before);
    // ...while ground first reached after it is richer than the same ground without it
    const far = rowOfDepth(400);
    const plain = new Sim({ seed: 12, upgrades: { root: 1 }, gloom: 0 });
    let a = 0;
    let b = 0;
    for (let x = 200; x < 520; x++) for (let y = far; y < far + 30; y++) {
      if (isShardSource(sim.tileAt(x, y))) a++;
      if (isShardSource(plain.tileAt(x, y))) b++;
    }
    expect(a).toBeGreaterThan(b);
  });

  it('every World node says it shapes newly explored ground', () => {
    for (const u of UPGRADES.filter((x) => x.branch === 'world' && x.id !== 'surveyor')) expect(u.desc).toMatch(/newly explored ground/);
    for (const b of Object.keys(BRANCH_HINT)) expect(BRANCH_HINT[b as keyof typeof BRANCH_HINT].length).toBeGreaterThan(10);
    expect(UPGRADES.length).toBeGreaterThanOrEqual(78);
  });
});

describe('playstyles', () => {
  /** tiles a bot breaks in 40 s of Emberdeep with a given build */
  function breaks(upgrades: Record<string, number>) {
    let total = 0;
    for (const seed of [41, 42, 43]) {
      const sim = new Sim({ seed, upgrades, gloom: 0, debugDepth: 560 });
      const bot = new Bot();
      for (let i = 0; i < 60 * 40 && !sim.over; i++) {
        sim.light = sim.stats.maxLight;
        if (sim.pendingLevels > 0) sim.pendingLevels = 0;
        sim.step(bot.think(sim));
        total += sim.drainEvents().filter((e) => e.t === 'break').length;
      }
    }
    return total;
  }

  it('a shard build with a modest drill clears rock its drill alone could not', () => {
    const drill = { root: 1, bit: 5, diamond: 5 };
    const shard = { ...drill, brittle: 4, keen: 5, volatile: 3, shrapnel: 3, gyro: 2 };
    expect(computeStats(shard).drillPower).toBe(computeStats(drill).drillPower);
    expect(breaks(shard)).toBeGreaterThan(breaks(drill) * 1.5);
  });

  it('drill power has diminishing returns: each further point costs more', () => {
    const per = (id: string, lvl: number, pts: number) => {
      const u = UPGRADES.find((x) => x.id === id)!;
      const c = Math.round(u.base.gold * Math.pow(u.growth, lvl));
      return c / pts;
    };
    expect(per('diamond', 0, 3)).toBeGreaterThan(per('bit', 0, 1));
    expect(per('starbit', 0, 8)).toBeGreaterThan(per('diamond', 4, 3));
  });
});
