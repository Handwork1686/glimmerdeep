import { describe, expect, it } from 'vitest';
import { NO_INPUT, NOVA_CHAIN, NOVA_RADIUS, Sim, SURGE_LENGTH, SURGE_LINKS } from '../src/core/sim';
import { computeStats } from '../src/core/progression';
import { CHUNK, generateChunk, NO_PROSPECT, PLAIN_ROCK, rowOfDepth, shardFloor } from '../src/core/worldgen';
import { BIOMES, HEART_CHAMBER, HEART_DEPTH, SEALS } from '../src/data/biomes';
import { SHARD_TYPES } from '../src/data/shards';
import { T, TILES } from '../src/data/tiles';

const ctx = (seed: number, floor = true) => ({ seed, relics: [], doneLayers: new Set<string>(), floor });
const hasSource = (t: number) => !!TILES[t].shards;

/** chunk rows that sit inside a layer (clear of its boundary blends), at most `max` of them */
function layerRows(b: (typeof BIOMES)[number], max = 5) {
  const lo = rowOfDepth(Math.max(b.from + 30, 8));
  const hi = rowOfDepth(Math.min(b.to - 30, b.from + 700));
  const rows: number[] = [];
  for (let cy = Math.ceil(lo / CHUNK); (cy + 1) * CHUNK <= hi && rows.length < max; cy++) rows.push(cy);
  return rows;
}

describe('shards in every layer', () => {
  it('every layer keeps a shard source in every 32 x 8 block, with no World nodes bought', { timeout: 120000 }, () => {
    const hTop = rowOfDepth(HEART_DEPTH);
    for (const b of BIOMES) {
      let blocks = 0;
      for (const cy of layerRows(b)) {
        for (let cx = -20; cx < 20; cx++) {
          const c = generateChunk(cx, cy, NO_PROSPECT, ctx(31));
          for (let g = 0; g < CHUNK / 8; g++) {
            const gy = cy * CHUNK + g * 8;
            if (gy + 8 > hTop - 2 && gy < hTop + HEART_CHAMBER + 2 && Math.abs(cx * CHUNK + 16) < 32) continue;
            let n = 0;
            for (let i = g * 8 * CHUNK; i < (g + 1) * 8 * CHUNK; i++) if (hasSource(c.tiles[i])) n++;
            expect(n, `${b.id} chunk ${cx},${cy} group ${g}`).toBeGreaterThan(0);
            blocks++;
          }
        }
      }
      expect(blocks).toBeGreaterThan(100);
    }
  });

  it('the floor only ever replaces plain rock: never ore, relics, rune ribbons, geodes or air', () => {
    // a starved chunk: stone with a few things the floor must leave alone
    for (const b of BIOMES) {
      const cy = layerRows(b, 1)[0];
      const rock = b.base[0][0];
      const tiles = new Uint8Array(CHUNK * CHUNK).fill(rock);
      const keep = new Map<number, number>();
      for (let i = 0; i < tiles.length; i += 5) {
        const t = [T.copper, T.air, T.seal, T.relic, T.gold, T.lampmoss][(i / 5) % 6];
        tiles[i] = t;
        keep.set(i, t);
      }
      const before = tiles.slice();
      shardFloor(77, 3, cy, tiles, 3 * CHUNK, cy * CHUNK);
      let placed = 0;
      const perGroup = [0, 0, 0, 0];
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === before[i]) continue;
        placed++;
        expect(PLAIN_ROCK.has(before[i]), `${b.id} replaced a ${TILES[before[i]].name}`).toBe(true);
        expect(hasSource(tiles[i])).toBe(true);
        perGroup[Math.floor(i / CHUNK / 8)]++;
      }
      for (const [i, t] of keep) expect(tiles[i]).toBe(t);
      expect(placed, b.id).toBe(4);
      for (const n of perGroup) expect(n).toBe(1);
      // and a block that already has a source is left alone
      const rich = before.slice();
      rich[100] = T.quartz;
      const kept = rich.slice();
      shardFloor(77, 3, cy, rich, 3 * CHUNK, cy * CHUNK);
      expect(Array.from(rich.slice(0, 8 * CHUNK))).toEqual(Array.from(kept.slice(0, 8 * CHUNK)));
    }
  });

  it('glass is in every layer and faultstone in every layer from Amberstone down', { timeout: 120000 }, () => {
    for (const b of BIOMES) {
      let glass = 0;
      let fault = 0;
      for (const cy of layerRows(b, 3)) for (let cx = -6; cx < 6; cx++) {
        for (const t of generateChunk(cx, cy, NO_PROSPECT, ctx(5)).tiles) {
          if (t === T.quartz) glass++;
          if (t === T.faultstone) fault++;
        }
      }
      expect(glass, `${b.id} quartz`).toBeGreaterThan(0);
      if (b.id !== 'rootsoil') expect(fault, `${b.id} faultstone`).toBeGreaterThan(0);
    }
  });

  it('each layer has at least 3 kinds of shard source', { timeout: 120000 }, () => {
    for (const b of BIOMES) {
      const kinds = new Set<number>();
      for (const cy of layerRows(b, 4)) for (let cx = -10; cx < 10; cx++) {
        for (const t of generateChunk(cx, cy, NO_PROSPECT, ctx(13)).tiles) if (hasSource(t)) kinds.add(t);
      }
      expect(kinds.size, b.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every shard type can be thrown in regular play: tiles, vaults, ribbons, base Vein Rupture and Cataclysm', () => {
    const fromTiles = new Set(TILES.filter((t) => t.shards).map((t) => t.shardType ?? 'glass'));
    const base = computeStats({ root: 1 });
    const have = new Set<string>([...fromTiles, 'geode']);
    if (SEALS.length) have.add('rune');
    if (base.veinRupture > 0) have.add('vein');
    if (base.cataclysm) have.add('cataclysm');
    expect(base.veinRupture).toBe(0.05);
    expect(base.cataclysmEvery).toBe(100);
    expect(computeStats({ root: 1, cataclysm: 1 }).cataclysmEvery).toBe(30);
    for (const s of SHARD_TYPES) expect(have.has(s.id), s.id).toBe(true);
  });
});

describe('board clears', () => {
  const ROW = 60;
  /** a long corridor to drill along, floor below, rock to clear above and ahead */
  function lab(upgrades: Record<string, number> = { root: 1 }) {
    const sim = new Sim({ seed: 9, upgrades, gloom: 0 });
    for (let y = ROW - 6; y <= ROW + 6; y++) for (let x = -10; x <= 60; x++) sim.setTile(x, y, y > ROW ? T.stone : T.air);
    for (let x = -10; x <= 60; x++) sim.setTile(x, ROW + 1, T.bedrock);
    sim.player.x = 8;
    sim.player.y = ROW * 16 + 9.9;
    sim.player.grounded = true;
    sim.drainEvents();
    return sim;
  }
  const link = (sim: Sim, n: number) => {
    for (let i = 0; i < n; i++) {
      sim.setTile(2, ROW - 3, T.dirt);
      sim.damageTile(2, ROW - 3, 1e9, 'shard');
    }
  };

  it('75 fresh links arm exactly one Surge, and more links do not stack a second', () => {
    const sim = lab();
    expect(SURGE_LINKS).toBe(75);
    link(sim, SURGE_LINKS - 1);
    expect(sim.surgeArmed).toBe(false);
    link(sim, 1);
    expect(sim.surgeArmed).toBe(true);
    const armed = sim.drainEvents().filter((e) => e.t === 'surgeArm');
    expect(armed.length).toBe(1);
    link(sim, 300);
    expect(sim.drainEvents().filter((e) => e.t === 'surgeArm').length).toBe(0);
    expect(sim.surgeLinks).toBe(0);
  });

  it('an armed Surge survives its chain ending and fires on the next drill break along the drill', () => {
    const sim = lab();
    link(sim, SURGE_LINKS);
    expect(sim.surgeArmed).toBe(true);
    // let the chain die
    for (let i = 0; i < 60 * 8; i++) {
      sim.light = sim.stats.maxLight;
      sim.step(NO_INPUT);
    }
    expect(sim.chain).toBe(0);
    expect(sim.surgeArmed).toBe(true);
    // a drill break to the right clears a line of rock to the right
    for (let x = 3; x <= 3 + SURGE_LENGTH + 2; x++) sim.setTile(x, ROW, T.stone);
    sim.player.drill = 'right';
    sim.drainEvents();
    sim.damageTile(2, ROW, 1e9, 'drill');
    expect(sim.surgeArmed).toBe(true); // that break was armed-then, the next one fires
    sim.setTile(2, ROW, T.stone);
    sim.damageTile(2, ROW, 1e9, 'drill');
    expect(sim.surgeArmed).toBe(false);
    for (let i = 0; i < 90; i++) sim.step(NO_INPUT);
    const cleared = [];
    for (let x = 3; x <= 3 + SURGE_LENGTH; x++) if (sim.tileAt(x, ROW) === T.air) cleared.push(x);
    expect(cleared.length).toBe(SURGE_LENGTH);
    expect(sim.tileAt(3 + SURGE_LENGTH + 1, ROW)).toBe(T.stone);
    // the rows above and below are untouched
    expect(sim.tileAt(10, ROW + 2)).toBe(T.stone);
  });

  it('tiles a clear breaks pay out and link the chain, but throw no shards and never re-arm a Surge', () => {
    const sim = lab();
    link(sim, SURGE_LINKS);
    sim.player.drill = 'right';
    for (let x = 3; x <= 3 + SURGE_LENGTH; x++) sim.setTile(x, ROW, T.quartz);
    sim.setTile(2, ROW, T.stone);
    sim.damageTile(2, ROW, 1e9, 'drill');
    sim.setTile(2, ROW, T.stone);
    sim.damageTile(2, ROW, 1e9, 'drill');
    const shardsBefore = sim.shards.length;
    const chainBefore = sim.chain;
    sim.shards.length = 0;
    for (let i = 0; i < 120; i++) sim.step(NO_INPUT);
    expect(sim.breaksBy.clear).toBe(SURGE_LENGTH);
    expect(sim.bestChain).toBeGreaterThan(chainBefore);
    expect(sim.surgeArmed).toBe(false);
    expect(sim.surgeLinks).toBeLessThan(SURGE_LINKS);
    expect(sim.shardSpawned.glass ?? 0).toBeLessThanOrEqual(shardsBefore + 4);
  });

  it('a Prism Nova shatters the most common ore around a prism shard, and only ore', () => {
    expect(NOVA_CHAIN).toBe(50);
    const sim = lab({ root: 1 });
    // a patch: gold x 6, copper x 2, plain stone and a relic around
    const golds = [[20, ROW - 2], [21, ROW - 2], [22, ROW - 2], [20, ROW - 3], [21, ROW - 3], [22, ROW - 3]];
    for (const [x, y] of golds) sim.setTile(x, y, T.gold);
    sim.setTile(23, ROW - 2, T.copper);
    sim.setTile(19, ROW - 3, T.copper);
    sim.setTile(21, ROW - 4, T.stone);
    sim.setTile(22, ROW - 4, T.relic);
    sim.setTile(20, ROW - 4, T.seal);
    // a chain of 50
    sim.chain = NOVA_CHAIN;
    sim.chainTimer = 5;
    sim.shards.push({
      id: 999, type: 'prism', x: 21 * 16 - 4, y: (ROW - 2) * 16 + 8, vx: 200, vy: 0, life: 1, dmg: 1, color: 0xffffff, bounces: 0, pierce: 0, burst: 0,
      split: false, nova: true, seek: false, gen: 0,
    });
    sim.drainEvents();
    for (let i = 0; i < 60; i++) {
      sim.light = sim.stats.maxLight;
      sim.step(NO_INPUT);
    }
    for (const [x, y] of golds) expect(sim.tileAt(x, y), `gold ${x},${y}`).toBe(T.air);
    // the other ore, plain rock, the relic and the ribbon are not touched
    expect(sim.tileAt(23, ROW - 2)).toBe(T.copper);
    expect(sim.tileAt(19, ROW - 3)).toBe(T.copper);
    expect(sim.tileAt(21, ROW - 4)).toBe(T.stone);
    expect(sim.tileAt(22, ROW - 4)).toBe(T.relic);
    expect(sim.tileAt(20, ROW - 4)).toBe(T.seal);
    expect(sim.novasFired).toBe(1);
    expect(NOVA_RADIUS).toBe(5);
  });

  it('a Prism shard below a chain of 50 does nothing special', () => {
    const sim = lab({ root: 1 });
    for (let x = 20; x <= 22; x++) sim.setTile(x, ROW - 2, T.gold);
    sim.chain = 10;
    sim.chainTimer = 5;
    sim.shards.push({
      id: 998, type: 'prism', x: 21 * 16 - 4, y: (ROW - 2) * 16 + 8, vx: 200, vy: 0, life: 1, dmg: 1, color: 0xffffff, bounces: 0, pierce: 0, burst: 0,
      split: false, nova: true, seek: false, gen: 0,
    });
    for (let i = 0; i < 30; i++) {
      sim.light = sim.stats.maxLight;
      sim.step(NO_INPUT);
    }
    expect(sim.novasFired).toBe(0);
  });

  it('the Cataclysm warns with a ring before it erupts', () => {
    const sim = lab({ root: 1 });
    sim.drainEvents();
    link(sim, 100);
    const warn = sim.drainEvents().filter((e) => e.t === 'cataclysmWarn');
    expect(warn.length).toBe(1);
    expect(sim.shardSpawned.cataclysm ?? 0).toBe(0);
    for (let i = 0; i < 40; i++) sim.step(NO_INPUT);
    expect(sim.shardSpawned.cataclysm ?? 0).toBeGreaterThan(0);
  });
});
