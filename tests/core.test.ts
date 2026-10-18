import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { Rng } from '../src/core/rng';
import { generateWorld, rowOfDepth } from '../src/core/worldgen';
import { Sim, NO_INPUT, potMultiplier } from '../src/core/sim';
import { Bot } from '../src/core/bot';
import { computeStats, rollBoons, xpForLevel } from '../src/core/progression';
import { TILE_NAMES, T, TILES } from '../src/data/tiles';
import { HEART_DEPTH, LIFT_STOPS, SEAL_ROWS, SEALS } from '../src/data/biomes';
import { RELICS } from '../src/data/relics';
import { UPGRADES, costOf, isAvailable, UPGRADE_BY_ID } from '../src/data/upgrades';
import { BOONS } from '../src/data/boons';
import { COLS, WORLD_ROWS } from '../src/config';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe('tiles', () => {
  it('match the art pipeline tileset order', () => {
    const meta = JSON.parse(fs.readFileSync('public/assets/tiles.json', 'utf8'));
    expect(meta.names).toEqual([...TILE_NAMES]);
  });
  it('have sane definitions', () => {
    for (const t of TILES) {
      expect(t.hp).toBeGreaterThanOrEqual(0);
      if (t.drop) expect(t.drop.gold).toBeGreaterThan(0);
    }
  });
});

describe('worldgen', () => {
  it('is deterministic', () => {
    const a = generateWorld({ seed: 123 });
    const b = generateWorld({ seed: 123 });
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(true);
  });
  it('differs across seeds', () => {
    const a = generateWorld({ seed: 1 });
    const b = generateWorld({ seed: 2 });
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(false);
  });
  it('has bedrock walls and full-width strata seals at every boundary', () => {
    const w = generateWorld({ seed: 9 });
    for (let y = 20; y < WORLD_ROWS; y += 37) {
      expect(w.tiles[y * COLS]).toBe(T.bedrock);
      expect(w.tiles[y * COLS + COLS - 1]).toBe(T.bedrock);
    }
    for (const sl of SEALS) {
      for (let y = rowOfDepth(sl.depth); y < rowOfDepth(sl.depth) + SEAL_ROWS; y++) {
        for (let x = 1; x < COLS - 1; x++) expect(w.tiles[y * COLS + x]).toBe(T.seal);
      }
    }
  });
  it('gives every lift stop a breakable way down', () => {
    const w = generateWorld({ seed: 5 });
    for (const s of LIFT_STOPS) {
      if (s.depth === 0) continue;
      const y = rowOfDepth(s.depth);
      expect(w.tiles[y * COLS + 15]).toBe(T.air);
      const plug = w.tiles[(y + 1) * COLS + 15];
      expect(TILES[plug].unbreakable ?? false).toBe(false);
    }
  });
  it("puts the World's Heart in its chamber, and buries every relic not yet found", () => {
    const w = generateWorld({ seed: 3 });
    expect(w.tiles[w.heart.y * COLS + w.heart.x]).toBe(T.worldheart);
    expect(w.heart.y).toBeGreaterThan(rowOfDepth(HEART_DEPTH));
    expect(w.relics).toHaveLength(RELICS.length);
    for (const r of w.relics) expect(w.tiles[r.y * COLS + r.x]).toBe(T.relic);
    const w2 = generateWorld({ seed: 3, foundRelics: ['oldpick', 'crown'] });
    expect(w2.relics.map((r) => r.id)).not.toContain('oldpick');
    expect(w2.relics).toHaveLength(RELICS.length - 2);
  });
  it('fills geode vaults with crystal around a core', () => {
    let vaults = 0;
    for (const seed of [1, 2, 3]) vaults += generateWorld({ seed }).geodes;
    expect(vaults).toBeGreaterThan(10);
  });
});

describe('progression', () => {
  it('base stats are positive', () => {
    const s = computeStats({});
    expect(s.maxLight).toBeGreaterThan(0);
    expect(s.drillPower).toBeGreaterThan(0);
  });
  it('upgrades only ever help the main stats', () => {
    const base = computeStats({});
    const maxed = computeStats(Object.fromEntries(UPGRADES.map((u) => [u.id, u.infinite ? 5 : u.max])));
    expect(maxed.drillPower).toBeGreaterThan(base.drillPower);
    expect(maxed.maxLight).toBeGreaterThan(base.maxLight);
    expect(maxed.lightDrain).toBeLessThan(base.lightDrain);
  });
  it('costs grow with level and every requirement exists', () => {
    for (const u of UPGRADES) {
      if (u.max > 1) expect(costOf(u, 1).gold).toBeGreaterThanOrEqual(costOf(u, 0).gold);
      for (const r of u.requires) expect(UPGRADE_BY_ID[r]).toBeDefined();
    }
  });
  it('every node is reachable from the root', () => {
    const owned: Record<string, number> = { root: 1 };
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of UPGRADES) if (!owned[u.id] && isAvailable(u, owned)) {
        owned[u.id] = 1;
        changed = true;
      }
    }
    for (const u of UPGRADES) expect(owned[u.id], u.id).toBe(1);
  });
  it('boon hands are distinct and respect caps', () => {
    const r = new Rng(3);
    for (let i = 0; i < 50; i++) {
      const hand = rollBoons(r, 3, {}, new Set(), 0);
      expect(new Set(hand.map((b) => b.id)).size).toBe(hand.length);
    }
    const full = Object.fromEntries(BOONS.map((b) => [b.id, b.max]));
    expect(rollBoons(r, 3, full, new Set(), 0)).toHaveLength(0);
  });
  it('xp curve increases', () => {
    for (let l = 1; l < 40; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l) - 1);
  });
});

describe('simulation', () => {
  it('light drains and the run ends in darkness when idle', () => {
    const sim = new Sim({ seed: 1, upgrades: {}, startDepth: 0, gloom: 0 });
    let steps = 0;
    while (!sim.over && steps < 60 * 200) {
      sim.step(NO_INPUT);
      steps++;
    }
    expect(sim.over).toBe(true);
    expect(sim.endReason).toBe('dark');
    expect(sim.time).toBeGreaterThan(50);
  });
  it('a bot run produces sane, finite results', () => {
    for (const seed of [11, 12, 13]) {
      const sim = new Sim({ seed, upgrades: { root: 1, bit: 2 }, startDepth: 0, gloom: 0 });
      const bot = new Bot();
      let steps = 0;
      while (!sim.over && steps < 60 * 400) {
        if (sim.pendingLevels > 0) {
          const h = sim.openChoice();
          if (h?.length) sim.choose(h[0].id);
        }
        sim.step(bot.think(sim));
        sim.drainEvents();
        steps++;
        expect(Number.isFinite(sim.player.x) && Number.isFinite(sim.player.y)).toBe(true);
      }
      const s = sim.summary();
      expect(s.gold).toBeGreaterThan(0);
      expect(s.maxDepth).toBeGreaterThan(5);
      expect(Number.isFinite(s.gold)).toBe(true);
    }
  });
  it('the player never ends up inside solid rock', () => {
    const sim = new Sim({ seed: 77, upgrades: { root: 1, bit: 3, gearing: 2 }, startDepth: 0, gloom: 0 });
    const bot = new Bot();
    for (let i = 0; i < 60 * 60 && !sim.over; i++) {
      if (sim.pendingLevels > 0) {
        const h = sim.openChoice();
        if (h?.length) sim.choose(h[0].id);
      }
      sim.step(bot.think(sim));
      sim.drainEvents();
      const p = sim.player;
      expect(sim.solidPx(p.x, p.y)).toBe(false);
    }
  });
  it('a seal only yields to a drill with enough power, then shatters across', () => {
    const weak = new Sim({ seed: 4, upgrades: { root: 1 }, startDepth: 0, gloom: 0 });
    const row = rowOfDepth(SEALS[0].depth);
    expect(weak.damageTile(15, row, 1e9, 'drill')).toBe(false);
    expect(weak.damageTile(15, row, 1e9, 'blast')).toBe(false);
    expect(weak.drainEvents().some((e) => e.t === 'sealDeny')).toBe(true);
    const strong = new Sim({ seed: 4, upgrades: { root: 1, bit: 5, diamond: 2 }, startDepth: 0, gloom: 0 });
    expect(strong.stats.drillPower).toBeGreaterThanOrEqual(SEALS[0].power);
    expect(strong.damageTile(15, row, 1e9, 'drill')).toBe(true);
    for (let i = 0; i < 120; i++) strong.step(NO_INPUT);
    for (let x = 1; x < COLS - 1; x++) expect(strong.tileAt(x, row)).toBe(T.air);
    expect(strong.summary().seals).toBe(1);
  });
  it('a chain pays its pot out multiplied when it ends', () => {
    const sim = new Sim({ seed: 8, upgrades: { root: 1 }, startDepth: 0, gloom: 0 });
    const y = 30;
    for (let x = 3; x < 13; x++) sim.setTile(x, y, T.gold);
    for (let x = 3; x < 13; x++) sim.damageTile(x, y, 1e9, 'shard');
    expect(sim.chain).toBe(10);
    const pot = sim.potGold;
    expect(pot).toBeGreaterThan(0);
    const before = sim.gold;
    let end: { bonus: number; mult: number } | null = null;
    for (let i = 0; i < 200 && !end; i++) {
      sim.step(NO_INPUT);
      for (const e of sim.drainEvents()) if (e.t === 'chainEnd') end = e;
    }
    expect(end).not.toBeNull();
    expect(end!.mult).toBeCloseTo(potMultiplier(10, sim.stats.chainPot));
    expect(sim.gold - before).toBeGreaterThanOrEqual(end!.bonus - 1e-6);
  });
  it("finding a relic applies its perk at once, and breaking the Heart reaches the end", () => {
    const sim = new Sim({ seed: 6, upgrades: { root: 1 }, startDepth: 0, gloom: 0 });
    const [i, id] = [...sim.relicAt.entries()].find(([, r]) => r === 'oldpick')!;
    const power = sim.stats.drillPower;
    sim.damageTile(i % COLS, Math.floor(i / COLS), 1e9, 'drill');
    expect(sim.stats.drillPower).toBe(power + 1);
    expect(sim.summary().relics).toEqual([id]);
    sim.damageTile(sim.heart.x, sim.heart.y, 1e9, 'drill');
    expect(sim.summary().reachedHeart).toBe(true);
    // the Heart tile's own XP must not leave a level-up hand waiting
    expect(sim.pendingLevels).toBe(0);
    // the Heart's light ends the dig a few seconds later, even with a level-up hand left open
    sim.pendingLevels = 3;
    sim.openChoice();
    expect(sim.choices).not.toBeNull();
    for (let i = 0; i < 60 * 5 && !sim.over; i++) sim.step(NO_INPUT);
    expect(sim.over).toBe(true);
    expect(sim.endReason).toBe('heart');
    expect(sim.choices).toBeNull();
  });
});
