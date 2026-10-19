import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { NO_INPUT, Sim } from '../src/core/sim';
import { BASE_SHARD_DAMAGE, MAX_ACTIVE_SHARDS, MAX_PER_BURST, SHARD_TYPES } from '../src/data/shards';
import { T, TILES } from '../src/data/tiles';
import { BOONS } from '../src/data/boons';
import { UPGRADES } from '../src/data/upgrades';
import { RELICS } from '../src/data/relics';

const ROW = 40;
/** a sim with a sealed box of open air to fire shards into */
function lab(upgrades: Record<string, number> = { root: 1 }, boons: Record<string, number> = {}) {
  const sim = new Sim({ seed: 3, upgrades, gloom: 0 });
  for (const [id, k] of Object.entries(boons)) for (let i = 0; i < k; i++) {
    sim.choices = [];
    sim.choose(id);
  }
  sim.choices = null;
  for (let y = ROW - 8; y <= ROW + 8; y++) for (let x = -8; x <= 8; x++) sim.setTile(x, y, T.air);
  sim.player.x = 8;
  sim.player.y = ROW * 16 + 8;
  sim.drainEvents();
  return sim;
}
/** shards thrown when a tile breaks */
function burstOf(sim: Sim, tile: number) {
  sim.setTile(0, ROW, tile);
  const before = sim.shards.length;
  sim.damageTile(0, ROW, 1e9, 'drill');
  return sim.shards.length - before;
}
function steps(sim: Sim, n: number) {
  for (let i = 0; i < n; i++) {
    sim.light = sim.stats.maxLight;
    sim.step(NO_INPUT);
  }
}

describe('the shard family', () => {
  it('has 10+ distinct types, each with a sprite and a Codex entry', () => {
    expect(SHARD_TYPES.length).toBeGreaterThanOrEqual(10);
    const atlas = JSON.parse(fs.readFileSync('public/assets/atlas.json', 'utf8'));
    const frames = new Set(Object.keys(atlas.frames ?? {}).concat((atlas.textures?.[0]?.frames ?? []).map((f: { filename: string }) => f.filename)));
    for (const t of SHARD_TYPES) {
      expect(frames.has(`shard_${t.id}`), t.id).toBe(true);
      expect(t.desc.length).toBeGreaterThan(10);
      expect(t.source.length).toBeGreaterThan(3);
    }
    // behaviours are not just recolours
    const sig = new Set(SHARD_TYPES.map((t) => [t.dmgMul, t.speedMul, t.life, t.pierce, t.burst, t.split, t.seek].join()));
    expect(sig.size).toBeGreaterThanOrEqual(8);
  });

  it('every type has its own colour, a one-line hint and its own voice', () => {
    const colors = new Set(SHARD_TYPES.map((t) => t.color));
    expect(colors.size).toBe(SHARD_TYPES.length);
    const manifest = JSON.parse(fs.readFileSync('public/assets/audio/manifest.json', 'utf8'));
    const hints = new Set<string>();
    for (const t of SHARD_TYPES) {
      expect(t.hint.length, t.id).toBeGreaterThan(15);
      hints.add(t.hint);
      expect(manifest.sfx[`shard_${t.id}`], `sfx shard_${t.id}`).toBeGreaterThan(0);
      expect(fs.existsSync(`public/assets/audio/sfx/shard_${t.id}_0.ogg`)).toBe(true);
    }
    expect(hints.size).toBe(SHARD_TYPES.length);
    // the crystal and rune tints are the two palette colours the brief swapped
    expect(SHARD_TYPES.find((t) => t.id === 'crystal')!.color).toBe(0x72aef2);
    expect(SHARD_TYPES.find((t) => t.id === 'rune')!.color).toBe(0x5fe0c4);
  });

  it('embers and cinnabar are shard sources now, not explosions', () => {
    expect(TILES[T.ember].shards).toBeGreaterThan(0);
    expect(TILES[T.cinnabar].shardType).toBe('cinnabar');
    for (const t of TILES) expect((t as unknown as Record<string, unknown>).explode).toBeUndefined();
  });

  it('one +shard upgrade raises the output of every source', () => {
    const plain = lab();
    const built = lab({ root: 1, brittle: 2 });
    for (const tile of [T.quartz, T.glimmer, T.ember, T.geode, T.voidglass]) {
      expect(burstOf(built, tile), TILES[tile].name).toBeGreaterThan(burstOf(plain, tile));
    }
    // fault shards from plain rock too
    const f0 = lab({ root: 1, fault: 5 });
    const f1 = lab({ root: 1, fault: 5, brittle: 2 });
    let a = 0;
    let b = 0;
    for (let i = 0; i < 60; i++) {
      a += burstOf(f0, T.stone);
      b += burstOf(f1, T.stone);
    }
    expect(b).toBeGreaterThan(a);
  });

  it('a shard-built Shard Bomb is a different beast from a bare one', () => {
    const bare = lab();
    bare.step({ ...NO_INPUT, shardBomb: true });
    const built = lab({ root: 1, brittle: 4, keen: 5, shrapnel: 3 });
    built.step({ ...NO_INPUT, shardBomb: true });
    expect(bare.summary().bombs).toBe(1);
    expect(built.shards.length).toBeGreaterThan(bare.shards.length * 1.5);
    expect(built.shards[0].dmg).toBeGreaterThan(bare.shards[0].dmg * 1.7);
    // and it recharges before it can go again
    const n = built.shards.length;
    built.step({ ...NO_INPUT, shardBomb: true });
    expect(built.summary().bombs).toBe(1);
    expect(built.shards.length).toBeLessThanOrEqual(n);
    // the bomb breaks rock it is fired into
    const rocky = lab({ root: 1, brittle: 4, keen: 5 });
    for (let y = ROW - 3; y <= ROW + 3; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) + Math.abs(y - ROW) >= 2) rocky.setTile(x, y, T.dirt);
    rocky.drainEvents();
    rocky.step({ ...NO_INPUT, shardBomb: true });
    let broke = 0;
    for (let i = 0; i < 40; i++) {
      rocky.step(NO_INPUT);
      broke += rocky.drainEvents().filter((e) => e.t === 'break').length;
    }
    expect(broke).toBeGreaterThan(4);
  });

  it('nothing deals damage except the drill, shards and landings', () => {
    const sim = lab({ root: 1, rupture: 3, fault: 5, cataclysm: 1, dynamite: 2 });
    const srcs = new Set<string>();
    const orig = sim.damageTile.bind(sim);
    sim.damageTile = (x, y, d, src, gen, by) => {
      srcs.add(src);
      return orig(x, y, d, src, gen, by);
    };
    for (let x = -6; x <= 6; x++) sim.setTile(x, ROW + 2, T.copper);
    sim.setTile(2, ROW, T.ember);
    sim.setTile(-2, ROW, T.cinnabar);
    sim.damageTile(2, ROW, 1e9, 'drill');
    sim.damageTile(-2, ROW, 1e9, 'drill');
    sim.damageTile(0, ROW + 2, 1e9, 'drill');
    sim.step({ ...NO_INPUT, bomb: true, shardBomb: true });
    steps(sim, 150);
    for (const s of srcs) expect(['drill', 'shard', 'seismic']).toContain(s);
  });

  it('vein rupture tears the vein apart with vein shards', () => {
    const sim = lab({ root: 1, rupture: 3 });
    // 60% a try: break veins until one ruptures
    for (let k = 0; k < 8 && !sim.summary().shardTypes.vein; k++) {
      for (let x = -6; x <= 6; x++) sim.setTile(x, ROW + 2, T.silver);
      sim.damageTile(0, ROW + 2, 1e9, 'drill');
    }
    expect(sim.summary().shardTypes.vein).toBeGreaterThanOrEqual(10);
    steps(sim, 60);
    let left = 0;
    for (let x = -6; x <= 6; x++) if (sim.tileAt(x, ROW + 2) === T.silver) left++;
    expect(left).toBeLessThan(7);
  });

  it('crystal shards pierce, prisms split, embers spray sparks, void shards curve (gently)', () => {
    // crystal: breaks through a wall of dirt
    const c = lab();
    for (let x = 1; x <= 4; x++) c.setTile(x, ROW, T.dirt);
    c.spawnShards(8, ROW * 16 + 8, 'crystal', 1, { exact: true, angle: 0, spread: 0 });
    steps(c, 30);
    expect(c.tileAt(1, ROW)).toBe(T.air);
    expect(c.tileAt(2, ROW)).toBe(T.air);
    // prism: one shard becomes three
    const p = lab();
    p.setTile(3, ROW, T.stone);
    p.spawnShards(8, ROW * 16 + 8, 'prism', 1, { exact: true, angle: 0, spread: 0 });
    let maxPrism = 0;
    for (let i = 0; i < 20; i++) {
      p.step(NO_INPUT);
      maxPrism = Math.max(maxPrism, p.shards.filter((s) => s.type === 'prism').length);
    }
    expect(maxPrism).toBeGreaterThanOrEqual(2);
    // ember: blows apart into glass sparks
    const e = lab();
    e.setTile(3, ROW, T.obsidian);
    e.spawnShards(8, ROW * 16 + 8, 'ember', 1, { exact: true, angle: 0, spread: 0 });
    let sparks = 0;
    for (let i = 0; i < 20; i++) {
      e.step(NO_INPUT);
      sparks = Math.max(sparks, e.shards.filter((s) => s.type === 'glass').length);
    }
    expect(sparks).toBeGreaterThanOrEqual(2);
    // void: bends toward ore off to the side, but never snaps onto it
    const v = lab();
    v.setTile(3, ROW - 2, T.gold);
    v.spawnShards(8, ROW * 16 + 8, 'void', 1, { exact: true, angle: 0, spread: 0 });
    const s = v.shards[0];
    let maxTurn = 0;
    let prev = Math.atan2(s.vy, s.vx);
    for (let i = 0; i < 10 && s.life > 0; i++) {
      v.step(NO_INPUT);
      const a = Math.atan2(s.vy, s.vx);
      maxTurn = Math.max(maxTurn, Math.abs(a - prev));
      prev = a;
    }
    expect(prev).toBeLessThan(0); // turned upward, toward the gold
    expect(maxTurn).toBeLessThanOrEqual(5 / 60 + 1e-6);
  });

  it('caps shards per burst and in flight, folding the extra into damage', () => {
    const sim = lab({ root: 1, brittle: 4 });
    const n = sim.spawnShards(8, ROW * 16 + 8, 'glass', 100, { exact: true });
    expect(n).toBe(MAX_PER_BURST);
    expect(sim.shards[0].dmg).toBeGreaterThan(BASE_SHARD_DAMAGE * 3);
    for (let i = 0; i < 40; i++) sim.spawnShards(8, ROW * 16 + 8, 'glass', 30, { exact: true });
    expect(sim.shards.length).toBeLessThanOrEqual(MAX_ACTIVE_SHARDS);
  });

  it('pickups bank on their own: there is no magnet any more', () => {
    for (const u of UPGRADES) expect(u.id).not.toMatch(/magnet|flare/);
    for (const b of BOONS) expect(b.id).not.toMatch(/lodestone|battery/);
    expect(RELICS.find((r) => r.id === 'miniature')!.perk).not.toMatch(/pickup/i);
    const sim = lab();
    sim.spawnPickup('gold', sim.player.x + 120, sim.player.y, { gold: 5 });
    steps(sim, 60 * 4);
    expect(sim.pickups.length).toBe(0);
    expect(sim.gold).toBeGreaterThanOrEqual(5);
  });

  it('the Codex learns every shard type thrown in a dig', () => {
    const sim = lab();
    burstOf(sim, T.quartz);
    burstOf(sim, T.ember);
    const types = sim.summary().shardTypes;
    expect(types.glass).toBeGreaterThan(0);
    expect(types.ember).toBeGreaterThan(0);
  });
});
