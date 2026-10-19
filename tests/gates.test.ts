import { describe, expect, it } from 'vitest';
import { Bot } from '../src/core/bot';
import { rockHp } from '../src/core/progression';
import { Sim } from '../src/core/sim';
import { CHUNK, generateChunk, NO_PROSPECT, relicSites, rowOfDepth } from '../src/core/worldgen';
import { BIOMES, BLEND_M, blendAt, HEART_DEPTH, SEALS } from '../src/data/biomes';
import { costOf, UPGRADE_BY_ID } from '../src/data/upgrades';
import { T, TILES } from '../src/data/tiles';

const ctx = (seed: number) => ({ seed, relics: relicSites(seed, [], 0), doneLayers: new Set<string>() });

describe('no hard gates', () => {
  it('no tile from the surface to the Heart is unbreakable (bedrock and brick never generate)', { timeout: 60000 }, () => {
    const cols = [-40, -12, 0, 7, 40, 211, -333];
    for (const seed of [3]) {
      for (const x of cols.slice(0, 4)) {
        const cx = Math.floor(x / CHUNK);
        for (let cy = 0; cy <= Math.floor((rowOfDepth(HEART_DEPTH) + 24) / CHUNK); cy++) {
          const c = generateChunk(cx, cy, NO_PROSPECT, ctx(seed));
          for (const t of c.tiles) expect(TILES[t].unbreakable ?? false).toBe(false);
        }
      }
    }
  });

  it('every solid tile has finite hit points a starter drill can wear down', () => {
    const sim = new Sim({ seed: 5, upgrades: { root: 1 }, gloom: 0 });
    for (const d of [0, 100, 299, 300, 301, 520, 760, 1050, 1494, 1500, 2400]) {
      for (let t = 0; t < TILES.length; t++) {
        if (!TILES[t].solid || TILES[t].unbreakable) continue;
        const hp = sim.tileHp(t, rowOfDepth(d));
        expect(hp).toBeGreaterThan(0);
        expect(hp).toBeLessThan(1e7);
      }
    }
  });

  it('rock hardness is one smooth rising curve: no step at a layer boundary', () => {
    let prev = rockHp(0);
    for (let d = 1; d <= 3000; d++) {
      const hp = rockHp(d);
      expect(hp).toBeGreaterThanOrEqual(prev - 1e-9);
      // no cliff: no metre costs more than 4% (or 3 HP) extra
      expect(hp - prev).toBeLessThan(Math.max(3, prev * 0.04));
      prev = hp;
    }
    expect(rockHp(2500)).toBeGreaterThan(rockHp(1500) + 1000);
    const sim = new Sim({ seed: 1, upgrades: { root: 1 }, gloom: 0 });
    for (const b of BIOMES.slice(0, -1)) {
      const before = sim.tileHp(T.stone, rowOfDepth(b.to - 1));
      const after = sim.tileHp(T.stone, rowOfDepth(b.to + 1));
      expect(Math.abs(after - before) / before).toBeLessThan(0.1);
    }
  });

  it('layers blend over a 50 m band instead of cutting at a line', () => {
    const seed = 21;
    for (const b of BIOMES.slice(0, -1)) {
      const next = BIOMES[BIOMES.indexOf(b) + 1];
      const share: number[] = [];
      for (let band = 0; band < 10; band++) {
        // rows of this 5 m slice across the band; count cells that are the next layer's base rock
        let n = 0;
        let tot = 0;
        const d0 = b.to - BLEND_M / 2 + band * 5;
        for (let d = d0; d < d0 + 5; d++) {
          const cy = Math.floor(rowOfDepth(d) / CHUNK);
          for (let cx = -3; cx <= 3; cx++) {
            const c = generateChunk(cx, cy, NO_PROSPECT, ctx(seed));
            for (let lx = 0; lx < CHUNK; lx++) {
              const t = c.tiles[(rowOfDepth(d) % CHUNK) * CHUNK + lx];
              if (t === next.base[0][0]) n++;
              if (t === next.base[0][0] || t === b.base[0][0]) tot++;
            }
          }
        }
        share.push(tot ? n / tot : 0);
      }
      // starts mostly the old layer, ends mostly the new one, never jumps by more than ~40% in one 5 m slice
      expect(share[0]).toBeLessThan(0.4);
      expect(share[9]).toBeGreaterThan(0.6);
      for (let i = 1; i < share.length; i++) expect(share[i] - share[i - 1]).toBeLessThan(0.45);
    }
    expect(blendAt(0).b).toBeNull();
    expect(blendAt(300).p).toBeCloseTo(0.5, 2);
  });

  it('a weak build ends its dig by lantern-out, not by a wall, and shards alone take it deeper', () => {
    const dig = (upgrades: Record<string, number>) => {
      let deepest = 0;
      let dark = 0;
      for (const seed of [11, 12, 13]) {
        const sim = new Sim({ seed, upgrades, gloom: 0 });
        const bot = new Bot();
        for (let i = 0; i < 60 * 600 && !sim.over; i++) {
          sim.step(bot.think(sim));
          sim.drainEvents();
        }
        expect(sim.over).toBe(true);
        if (sim.endReason === 'dark') dark++;
        deepest += sim.maxDepth;
      }
      return { deepest: deepest / 3, dark };
    };
    const starter = dig({ root: 1 });
    expect(starter.dark).toBe(3);
    expect(starter.deepest).toBeGreaterThan(40);
    const shards = dig({ root: 1, brittle: 3, keen: 3, bounty: 1 });
    expect(shards.deepest).toBeGreaterThan(starter.deepest);
  });

  it('ribbons sit at the old seal depths; drill nodes are cheaper and flatter than before', () => {
    expect(SEALS.map((s) => s.depth)).toEqual([300, 520, 760, 1050, 1494]);
    const bit = UPGRADE_BY_ID.bit;
    const costs = [0, 1, 2, 3, 4].map((l) => costOf(bit, l).gold);
    // first five Tempered Bit levels at the old 1.8 growth cost 60, 108, 194, 350, 630
    expect(costs[4]).toBeLessThan(630);
    expect(costs[4] / costs[0]).toBeLessThan(Math.pow(1.3, 4));
    for (const id of ['diamond', 'starbit']) expect(UPGRADE_BY_ID[id].growth).toBeLessThan(1.4);
    expect(UPGRADE_BY_ID.refine_bit.growth).toBeLessThan(1.28);
  });
});
