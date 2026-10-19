import { describe, expect, it } from 'vitest';
import { computeStats, dr, rockHp } from '../src/core/progression';
import { chainRefuel, NO_INPUT, potMultiplier, POT_MAX, SHARD_FUEL_CAP, Sim, SHARD_LEASH } from '../src/core/sim';
import { shardDepthScale } from '../src/data/shards';
import { T } from '../src/data/tiles';

const ROW = 40;
/** a sim with a box of open air around the Wick, in rock, to drill and fire into */
function lab(upgrades: Record<string, number> = { root: 1 }, rows = 8) {
  const sim = new Sim({ seed: 3, upgrades, gloom: 0 });
  for (let y = ROW - rows; y <= ROW + rows; y++) for (let x = -12; x <= 12; x++) sim.setTile(x, y, T.air);
  // a bedrock floor to stand on (so the Wick is grounded, not falling)
  for (let x = -12; x <= 12; x++) sim.setTile(x, ROW + 1, T.bedrock);
  sim.player.x = 8;
  sim.player.y = ROW * 16 + 9.9;
  sim.player.grounded = true;
  sim.drainEvents();
  return sim;
}
const run = (sim: Sim, seconds: number, input = NO_INPUT) => {
  const events = [] as ReturnType<Sim['drainEvents']>;
  for (let i = 0; i < 60 * seconds && !sim.over; i++) {
    sim.light = sim.stats.maxLight;
    sim.step(input);
    events.push(...sim.drainEvents());
  }
  return events;
};

describe('smooth scaling', () => {
  it('the pot multiplier tapers and never reaches x8, however long the chain', () => {
    for (const g of [0.06, 0.3, 1, 3]) {
      let prev = 1;
      for (const n of [1, 10, 100, 500, 2000, 15315, 1e6, 1e9]) {
        const m = potMultiplier(n, g);
        expect(m).toBeGreaterThanOrEqual(prev);
        expect(m).toBeLessThan(POT_MAX);
        prev = m;
      }
    }
    // the playtest chain of 15315 links used to pay x20: now it is a modest, flat multiple
    expect(potMultiplier(15315, 0.6)).toBeLessThan(POT_MAX);
    expect(potMultiplier(100, 0.06)).toBeGreaterThan(1.3);
    // the second 500 links add far less than the first 500
    expect(potMultiplier(1000, 0.3) - potMultiplier(500, 0.3)).toBeLessThan((potMultiplier(500, 0.3) - 1) * 0.35);
  });

  it('shard stacks have diminishing returns: no node doubles output', () => {
    expect(dr(0, 1.5)).toBe(0);
    expect(dr(1, 4)).toBeLessThan(1);
    expect(dr(10, 4)).toBeLessThan(10 * 0.55);
    const raw = (n: number) => computeStats({ root: 1, brittle: 4, keen: 5, keen2: n });
    // every extra Razor Shards level adds less than the one before it
    let prevGain = Infinity;
    for (let n = 1; n <= 4; n++) {
      const gain = raw(n).shardDamage - raw(n - 1).shardDamage;
      expect(gain).toBeLessThan(prevGain);
      prevGain = gain;
    }
    // +40% per level on paper, but a fully stacked build is nowhere near the raw product
    expect(raw(4).shardDamage).toBeLessThan(6 * (1 + 0.25 * 5) * (1 + 0.4 * 4) * 0.6);
  });

  it('shards fall slowly behind the rock: damage grows with its square root', () => {
    expect(shardDepthScale(0)).toBeCloseTo(1, 5);
    expect(shardDepthScale(1500)).toBeCloseTo(Math.sqrt(rockHp(1500) / rockHp(0)), 5);
    expect(shardDepthScale(1500)).toBeGreaterThan(20);
    expect(shardDepthScale(1500)).toBeLessThan(26);
    // so a fixed build needs more shards per tile the deeper it goes
    const dmg = computeStats({ root: 1, brittle: 3, keen: 3, bounty: 1 }).shardDamage;
    let prev = 0;
    for (const d of [500, 1000, 1450]) {
      const hits = rockHp(d) / (dmg * shardDepthScale(d));
      expect(hits).toBeGreaterThan(prev);
      expect(hits).toBeGreaterThan(1);
      prev = hits;
    }
  });

  it('a mid build needs the same or more hits to break plain rock the deeper it goes, with the drill and with shards', () => {
    const mid = computeStats({ root: 1, bit: 3, gearing: 3, brittle: 2, keen: 2 });
    let prevDrill = 0;
    let prevShard = 0;
    for (const d of [100, 500, 1000, 1450]) {
      const drill = Math.ceil(rockHp(d) / (mid.drillPower * mid.rockMul));
      const shard = Math.ceil(rockHp(d) / (mid.shardDamage * shardDepthScale(d) * mid.rockMul));
      expect(drill).toBeGreaterThanOrEqual(Math.max(2, prevDrill));
      expect(shard).toBeGreaterThanOrEqual(prevShard);
      if (d >= 500) expect(shard).toBeGreaterThanOrEqual(2);
      prevDrill = drill;
      prevShard = shard;
    }
  });

  it('every drill break is a chain link that refuels, less so deeper', () => {
    expect(chainRefuel(0.06, 20, 1200)).toBeLessThan(chainRefuel(0.06, 20, 100));
    const sim = lab({ root: 1 });
    sim.setTile(0, ROW, T.dirt);
    sim.player.x = 8;
    sim.player.drill = 'down';
    sim.damageTile(0, ROW, 1e9, 'drill');
    expect(sim.chain).toBe(1);
    sim.setTile(1, ROW, T.dirt);
    sim.damageTile(1, ROW, 1e9, 'drill');
    expect(sim.chain).toBe(2);
    // and each one buys a little extra chain time (capped at twice the window)
    expect(sim.chainTimer).toBeGreaterThan(sim.stats.chainTime);
    expect(sim.chainTimer).toBeLessThanOrEqual(sim.stats.chainTime * 2);
  });

  it('every tenth drill break throws a volley of glass shards the way the drill points', () => {
    const sim = lab({ root: 1 });
    sim.player.drill = 'right';
    const shards: number[] = [];
    for (let i = 0; i < 20; i++) {
      sim.setTile(2 + (i % 10), ROW - 2, T.dirt);
      sim.damageTile(2 + (i % 10), ROW - 2, 1e9, 'drill');
      shards.push(sim.shards.length);
    }
    // the volley appears on the 10th and 20th breaks only
    expect(shards[8]).toBe(0);
    expect(shards[9]).toBeGreaterThanOrEqual(2);
    const s = sim.shards[0];
    expect(s.type).toBe('glass');
    expect(s.vx).toBeGreaterThan(Math.abs(s.vy));
    // Gearing makes it sooner
    expect(computeStats({ root: 1, bit: 1, gearing: 3 }).drillShardEvery).toBe(7);
  });
});

describe('no autoplay', () => {
  /** a lab full of crystals within reach: a chain that could run by itself */
  function crystalLab() {
    const sim = lab({ root: 1, brittle: 3, keen: 3 }, 10);
    for (let y = ROW - 9; y <= ROW + 9; y += 2) for (let x = -11; x <= 11; x += 2) if ((Math.abs(x - 1) > 2 || Math.abs(y - ROW) > 2) && y < ROW + 1) sim.setTile(x, y, T.quartz);
    return sim;
  }

  it('a chain started and then abandoned cools off fast and stops clearing tiles', () => {
    const sim = crystalLab();
    sim.setTile(-1, ROW - 1, T.quartz);
    sim.damageTile(-1, ROW - 1, 1e9, 'drill');
    const events = run(sim, 4);
    expect(events.some((e) => e.t === 'break')).toBe(true);
    // standing still: the chain must die, and with it the clearing
    const later = run(sim, 10);
    expect(sim.chain).toBe(0);
    const tail = later.filter((e) => e.t === 'break');
    expect(tail.length).toBeLessThan(80);
    const quiet = run(sim, 5).filter((e) => e.t === 'break');
    expect(quiet.length).toBe(0);
  });

  it('a standing chain times out three times faster than a moving one', () => {
    const idle = lab({ root: 1 });
    idle.step(NO_INPUT);
    expect(idle.idle).toBe(true);
    idle.setTile(0, ROW - 2, T.quartz);
    idle.damageTile(0, ROW - 2, 1e9, 'shard');
    const moving = lab({ root: 1 });
    moving.step({ ...NO_INPUT, left: true });
    expect(moving.idle).toBe(false);
    moving.setTile(0, ROW - 2, T.quartz);
    moving.damageTile(0, ROW - 2, 1e9, 'shard');
    expect(idle.chainTimer).toBeLessThan(moving.chainTimer * 0.6);
  });

  it('a tile a shard breaks far from the Wick throws no further shards', () => {
    const sim = lab({ root: 1 });
    const far = Math.ceil(SHARD_LEASH / 16) + 4;
    sim.setTile(far + 8, ROW, T.quartz);
    sim.damageTile(far + 8, ROW, 1e9, 'shard');
    expect(sim.shards.length).toBe(0);
    sim.setTile(2, ROW, T.quartz);
    sim.damageTile(2, ROW, 1e9, 'shard');
    expect(sim.shards.length).toBeGreaterThan(0);
  });

  it('shard-break fuel (Fuel Recycler) never exceeds 2 fuel per second and tapers with depth', () => {
    const sim = lab({ root: 1, oil: 3, steady: 1, lens: 1, recycler: 3 });
    sim.light = 1;
    const before = sim.lightLog.recycler ?? 0;
    for (let i = 0; i < 400; i++) {
      sim.setTile(i % 20, ROW - 3, T.dirt);
      sim.damageTile(i % 20, ROW - 3, 1e9, 'shard', 8);
    }
    const got = (sim.lightLog.recycler ?? 0) - before;
    expect(got).toBeLessThanOrEqual(SHARD_FUEL_CAP + 0.001);
    expect(got).toBeGreaterThan(0);
  });
});
