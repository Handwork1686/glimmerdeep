import { describe, expect, it } from 'vitest';
import { chainRefuel, deepTaper, drainCurve, NO_INPUT, Sim, STALL_GRACE } from '../src/core/sim';
import { rowOfDepth } from '../src/core/worldgen';
import { SEALS } from '../src/data/biomes';
import { T } from '../src/data/tiles';

describe('the lantern', () => {
  it('burns faster the deeper you are, gently at first', () => {
    expect(drainCurve(0)).toBe(1);
    expect(drainCurve(60)).toBeLessThan(1.06);
    expect(drainCurve(120)).toBeLessThan(1.2);
    let prev = 0;
    for (let d = 0; d <= 4000; d += 50) {
      expect(drainCurve(d)).toBeGreaterThan(prev);
      prev = drainCurve(d);
    }
    expect(drainCurve(520)).toBeGreaterThan(1.8);
    expect(drainCurve(1500)).toBeGreaterThan(4);
  });

  it('chain links, Kindling and lamp light refuel less in the deep', () => {
    expect(chainRefuel(0.06, 10, 1200)).toBeLessThan(chainRefuel(0.06, 10, 100));
    expect(chainRefuel(0.06, 1000, 100)).toBeLessThan(chainRefuel(0.06, 10, 100));
    expect(deepTaper(0)).toBe(1);
    expect(deepTaper(1400)).toBeLessThan(0.4);
  });

  it("won't wait while you drill and break nothing", () => {
    // drill into a seal with a weak bit: nothing breaks, and after a grace period the drain climbs
    const sim = new Sim({ seed: 2, upgrades: { root: 1 }, gloom: 0 });
    const row = rowOfDepth(SEALS[0].depth);
    for (let y = row - 3; y < row; y++) for (let x = -1; x <= 0; x++) sim.setTile(x, y, T.air);
    sim.player.x = 0;
    sim.player.y = (row - 1) * 16 + 10;
    sim.lastBreakT = 0;
    const base = drainCurve(SEALS[0].depth - 1);
    const rates: number[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      sim.light = sim.stats.maxLight;
      sim.step({ ...NO_INPUT, down: true });
      rates.push(sim.drainRate());
    }
    expect(sim.player.drill).toBe('down');
    // inside the grace period it is just the depth drain
    expect(rates[Math.floor(60 * (STALL_GRACE - 0.5))]).toBeCloseTo(base, 1);
    // well past it, half again
    expect(rates[rates.length - 1]).toBeGreaterThan(base * 1.4);
    // and it eases off as soon as you break something
    sim.setTile(0, row - 2, T.air);
    sim.setTile(1, row - 1, T.dirt);
    for (let i = 0; i < 60; i++) sim.step({ ...NO_INPUT, right: true });
    expect(sim.stallMul).toBeLessThan(1.2);
  });

  it('a first dig, just holding down, still reaches past 100 m', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Sim({ seed, upgrades: { root: 1 }, gloom: 0 });
      for (let i = 0; i < 60 * 300 && !sim.over; i++) {
        if (sim.pendingLevels > 0) {
          const h = sim.openChoice();
          if (h?.length) sim.choose(h[0].id);
        }
        const p = sim.player;
        sim.step({ ...NO_INPUT, down: true, right: p.drill === null && p.vy === 0 && i % 120 < 30 });
        sim.drainEvents();
      }
      expect(sim.maxDepth).toBeGreaterThanOrEqual(100);
    }
  });
});
