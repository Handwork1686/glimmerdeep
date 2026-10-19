import { describe, expect, it } from 'vitest';
import { rollBoons } from '../src/core/progression';
import { Rng } from '../src/core/rng';
import { ECHO_CHAIN, NO_INPUT, OVERBURN_SECONDS, SHARD_FUEL_CAP, Sim } from '../src/core/sim';
import { BOON_BY_ID, BOONS } from '../src/data/boons';
import { T } from '../src/data/tiles';

const ROW = 40;
function lab(upgrades: Record<string, number> = { root: 1 }, boons: Record<string, number> = {}, rows = 8, debugDepth?: number) {
  const sim = new Sim({ seed: 3, upgrades, gloom: 0, debugDepth });
  const row = debugDepth ? sim.player.y / 16 | 0 : ROW;
  for (const [id, k] of Object.entries(boons)) for (let i = 0; i < k; i++) {
    sim.choices = [];
    sim.choose(id);
  }
  sim.choices = null;
  for (let y = row - rows; y <= row + rows; y++) for (let x = -12; x <= 24; x++) sim.setTile(x, y, T.air);
  for (let x = -12; x <= 24; x++) sim.setTile(x, row + 1, T.bedrock);
  sim.player.x = 8;
  sim.player.y = row * 16 + 9.9;
  sim.player.grounded = true;
  sim.drainEvents();
  return { sim, row };
}
const run = (sim: Sim, seconds: number, keepLit = true) => {
  const ev = [] as ReturnType<Sim['drainEvents']>;
  for (let i = 0; i < 60 * seconds && !sim.over; i++) {
    if (keepLit) sim.light = sim.stats.maxLight;
    sim.step(NO_INPUT);
    ev.push(...sim.drainEvents());
  }
  return ev;
};

describe('lantern boons that are worth a choice', () => {
  it('the passive lantern boons are gone, and so are their ids', () => {
    for (const id of ['glasslens', 'oilflask', 'steady', 'eternal', 'scoutdrone']) expect(BOON_BY_ID[id], id).toBeUndefined();
    // nothing left in the pool is just +vision, -drain or +max fuel
    for (const b of BOONS) expect(b.desc).not.toMatch(/light radius|drains? \d+% slower|max fuel/i);
  });

  it('at least four new boons, two of them lantern-flavoured and active', () => {
    const fresh = ['shardlight', 'overburn', 'lanternnova', 'echochain', 'glassharvest'];
    for (const id of fresh) expect(BOON_BY_ID[id], id).toBeDefined();
    expect(['shardlight', 'overburn', 'lanternnova'].every((id) => BOON_BY_ID[id])).toBe(true);
    expect(BOON_BY_ID.kindling.name).toBe('Kindled Links');
  });

  it('Kindled Links is the only boon that feeds chain-link fuel, and its stacks add (x1.25, x1.5, x1.75)', () => {
    const base = new Sim({ seed: 1, upgrades: { root: 1 }, gloom: 0 }).stats.chainFuel;
    const holders = BOONS.filter((b) => {
      const sim = new Sim({ seed: 1, upgrades: { root: 1 }, gloom: 0 });
      sim.choices = [];
      sim.choose(b.id);
      return sim.stats.chainFuel !== base;
    });
    expect(holders.map((b) => b.id)).toEqual(['kindling']);
    for (const k of [1, 2, 3]) {
      const { sim } = lab({ root: 1 }, { kindling: k });
      expect(sim.stats.chainFuel).toBeCloseTo(base * (1 + 0.25 * k), 6);
    }
    expect(BOON_BY_ID.kindling.max).toBe(3);
  });

  it('a hand can offer the new boons, and none of them is an automatic pick (rarity weights)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const b of rollBoons(new Rng(i), 3, {}, new Set(), 0)) seen.add(b.id);
    for (const id of ['shardlight', 'overburn', 'lanternnova', 'echochain', 'glassharvest', 'kindling']) expect(seen.has(id), id).toBe(true);
  });

  it('Shardlight: every 10 shard breaks give back 1 fuel (tapered), never more than 2 a second', () => {
    const { sim } = lab({ root: 1, oil: 3 }, { shardlight: 1 }, 8);
    sim.light = 10;
    const before = sim.lightLog.shardlight ?? 0;
    for (let i = 0; i < 10; i++) {
      sim.setTile(i, ROW - 3, T.dirt);
      sim.damageTile(i, ROW - 3, 1e9, 'shard');
    }
    expect((sim.lightLog.shardlight ?? 0) - before).toBeCloseTo(1, 1);
    // a hundred breaks in an instant: capped by the 2 fuel/s budget
    sim.light = 1;
    const mark = sim.lightLog.shardlight ?? 0;
    const markR = sim.lightLog.recycler ?? 0;
    for (let i = 0; i < 300; i++) {
      sim.setTile(i % 20, ROW - 3, T.dirt);
      sim.damageTile(i % 20, ROW - 3, 1e9, 'shard');
    }
    const got = (sim.lightLog.shardlight ?? 0) - mark + ((sim.lightLog.recycler ?? 0) - markR);
    expect(got).toBeLessThanOrEqual(SHARD_FUEL_CAP + 0.001);
    expect(SHARD_FUEL_CAP).toBe(2);
    // and it gives less deep down
    const deep = lab({ root: 1, oil: 3 }, { shardlight: 1 }, 8, 1200);
    deep.sim.light = 5;
    const m2 = deep.sim.lightLog.shardlight ?? 0;
    for (let i = 0; i < 10; i++) {
      deep.sim.setTile(i, deep.row - 3, T.dirt);
      deep.sim.damageTile(i, deep.row - 3, 1e9, 'shard');
    }
    const gotDeep = (deep.sim.lightLog.shardlight ?? 0) - m2;
    expect(gotDeep).toBeGreaterThan(0);
    expect(gotDeep).toBeLessThan(0.5);
  });

  it('Overburn: 30 s of twice the burn and twice the shard damage, then it is over', () => {
    const plain = lab({ root: 1 }).sim;
    const burn = lab({ root: 1 }, { overburn: 1 }).sim;
    expect(burn.overburnT).toBe(OVERBURN_SECONDS);
    expect(burn.drainRate()).toBeCloseTo(plain.drainRate() * 2, 5);
    plain.spawnShards(100, 100, 'glass', 1, { exact: true });
    burn.spawnShards(100, 100, 'glass', 1, { exact: true });
    expect(burn.shards[0].dmg).toBeCloseTo(plain.shards[0].dmg * 2, 5);
    run(burn, OVERBURN_SECONDS + 1);
    expect(burn.overburnT).toBe(0);
    expect(burn.drainRate()).toBeCloseTo(plain.drainRate() * burn.stallMul, 1);
    // it cannot be taken twice
    expect(BOON_BY_ID.overburn.max).toBe(1);
  });

  it('Lantern Nova: once, when fuel falls below 25%, a burst of shards and some fuel', () => {
    const { sim } = lab({ root: 1 }, { lanternnova: 1 });
    sim.light = sim.stats.maxLight * 0.5;
    run(sim, 1, false);
    expect(sim.lanternNovaUsed).toBe(false);
    sim.light = sim.stats.maxLight * 0.2;
    sim.drainEvents();
    run(sim, 0.1, false);
    expect(sim.lanternNovaUsed).toBe(true);
    expect(sim.lightLog.lanternnova).toBeGreaterThan(0);
    expect(sim.shardSpawned.glass ?? 0).toBeGreaterThanOrEqual(10);
    // never again this dig
    const n = sim.shardSpawned.glass ?? 0;
    sim.light = sim.stats.maxLight * 0.1;
    run(sim, 1, false);
    expect(sim.shardSpawned.glass ?? 0).toBe(n);
  });

  it('Glass Harvest: drill breaks sometimes throw extra glass shards', () => {
    const { sim } = lab({ root: 1 }, { glassharvest: 3 });
    sim.player.drill = 'right';
    let thrown = 0;
    for (let i = 0; i < 400; i++) {
      sim.setTile(2 + (i % 8), ROW - 2, T.dirt);
      sim.damageTile(2 + (i % 8), ROW - 2, 1e9, 'drill');
      thrown += sim.shards.length;
      sim.shards.length = 0;
    }
    // 24% a break x 2 shards, plus the regular volley every 10th break
    expect(thrown).toBeGreaterThan(100);
  });

  describe('Echo Chain', () => {
    /** a field of crystals to chain through, so the echo has something to break */
    function field() {
      const { sim } = lab({ root: 1, brittle: 3, keen: 3 }, { echochain: 1 }, 10);
      for (let y = ROW - 9; y <= ROW - 2; y += 1) for (let x = -11; x <= 23; x += 2) sim.setTile(x, y, T.quartz);
      return sim;
    }

    it('a chain of 20+ ends and one echo volley follows a second later, from where it ended', () => {
      const sim = field();
      sim.chain = ECHO_CHAIN + 5;
      sim.chainTimer = 0.05;
      const ev = run(sim, 1.5);
      const echoes = ev.filter((e) => e.t === 'echo');
      expect(echoes.length).toBe(1);
      expect(sim.echoesFired).toBe(1);
    });

    it('a short chain does not echo', () => {
      const sim = field();
      sim.chain = ECHO_CHAIN - 1;
      sim.chainTimer = 0.05;
      const ev = run(sim, 4);
      expect(ev.filter((e) => e.t === 'echo').length).toBe(0);
    });

    it('never an echo of an echo: ten seconds after the first echo there is still exactly one', () => {
      const sim = field();
      sim.chain = 60;
      sim.chainTimer = 0.05;
      const ev = run(sim, 10);
      expect(ev.filter((e) => e.t === 'echo').length).toBe(1);
      // the echo shards really did break things, so the guard was tested
      expect(ev.filter((e) => e.t === 'break').length).toBeGreaterThan(5);
      expect(sim.echoesFired).toBe(1);
    });
  });
});
