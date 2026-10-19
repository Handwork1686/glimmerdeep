import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { Rng } from '../src/core/rng';
import { rowOfDepth } from '../src/core/worldgen';
import { keyX, keyY } from '../src/core/world';
import { Sim, NO_INPUT, potMultiplier } from '../src/core/sim';
import { Bot } from '../src/core/bot';
import { computeStats, rollBoons, xpForLevel } from '../src/core/progression';
import { TILE_NAMES, T, TILES } from '../src/data/tiles';
import { SEALS } from '../src/data/biomes';
import { UPGRADES, costOf, isAvailable, UPGRADE_BY_ID } from '../src/data/upgrades';
import { BOONS } from '../src/data/boons';

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
    const sim = new Sim({ seed: 1, upgrades: {}, gloom: 0 });
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
      const sim = new Sim({ seed, upgrades: { root: 1, bit: 2 }, gloom: 0 });
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
    const sim = new Sim({ seed: 77, upgrades: { root: 1, bit: 3, gearing: 2 }, gloom: 0 });
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
  it('a rune ribbon breaks with the starter drill: it throws rune shards and gold, never blocks', () => {
    const sim = new Sim({ seed: 4, upgrades: { root: 1 }, gloom: 0 });
    const row = rowOfDepth(SEALS[0].depth);
    let x = 0;
    while (sim.tileAt(x, row) !== T.seal) x++;
    expect(sim.stats.drillPower).toBeLessThanOrEqual(2);
    expect(sim.damageTile(x, row, 1e9, 'drill')).toBe(true);
    expect(sim.tileAt(x, row)).toBe(T.air);
    expect(sim.summary().seals).toBe(1);
    // shards break it too
    let y = 0;
    while (sim.tileAt(y + 3, row) !== T.seal) y++;
    expect(sim.damageTile(y + 3, row, 1e9, 'shard')).toBe(true);
  });
  it('a chain pays its pot out multiplied when it ends', () => {
    const sim = new Sim({ seed: 8, upgrades: { root: 1 }, gloom: 0 });
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
    const sim = new Sim({ seed: 6, upgrades: { root: 1 }, gloom: 0 });
    const [k, id] = [...sim.relicAt.entries()].find(([, r]) => r === 'oldpick')!;
    const power = sim.stats.drillPower;
    expect(sim.tileAt(keyX(k), keyY(k))).toBe(T.relic);
    sim.damageTile(keyX(k), keyY(k), 1e9, 'drill');
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
