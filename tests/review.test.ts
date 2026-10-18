import { describe, expect, it } from 'vitest';
import { Sim, NO_INPUT } from '../src/core/sim';
import { parseSave } from '../src/systems/save';

describe('review fixes', () => {
  it('two second winds (node + boon) give two revives', () => {
    const sim = new Sim({ seed: 2, upgrades: { root: 1, secondwind: 1 }, gloom: 0 });
    sim.boons.secondwind = 1;
    sim.stats.secondWind = 2;
    let revives = 0;
    for (let i = 0; i < 60 * 400 && !sim.over; i++) {
      sim.step(NO_INPUT);
      for (const e of sim.drainEvents()) if (e.t === 'secondWind') revives++;
    }
    expect(revives).toBe(2);
  });
  it('head start always grants a boon', () => {
    for (let seed = 1; seed < 40; seed++) {
      const sim = new Sim({ seed, upgrades: { root: 1, headstart: 1 }, gloom: 0 });
      expect(Object.values(sim.boons).reduce((a, b) => a + b, 0)).toBe(1);
    }
  });
  it('a corrupt save is flagged as recovered', () => {
    expect(parseSave('{broken').recovered).toBe(true);
    expect(parseSave(null).recovered).toBe(false);
  });
});
