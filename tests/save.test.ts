import { describe, expect, it } from 'vitest';
import { newSave, parseSave, Save, SAVE_VERSION } from '../src/systems/save';
import { bankRun } from '../src/systems/bank';
import { checkAll, codexPct } from '../src/systems/achievements';
import type { RunSummary } from '../src/core/sim';

const run = (o: Partial<RunSummary> = {}): RunSummary => ({
  gold: 100, gems: 2, cores: 0, depth: 40, maxDepth: 60, time: 80, bestChain: 12, bestPot: 40, level: 4,
  boons: { overcharge: 1 }, bombs: 3, shardTypes: { glass: 12, ember: 4 }, lightPickups: 2, ores: { copper: 9 }, relics: [], seals: 0, milestones: [], geodes: 0, reachedHeart: false,
  reason: 'dark', ...o,
});

describe('save', () => {
  it('round-trips', () => {
    const s = newSave();
    s.gold = 1234;
    s.upgrades.bit = 3;
    const back = parseSave(JSON.stringify(s)).data;
    expect(back.gold).toBe(1234);
    expect(back.upgrades.bit).toBe(3);
  });
  it('recovers from garbage without throwing', () => {
    for (const raw of ['{', 'null', '"x"', '[]', '{"gold":"lots"}']) {
      const r = parseSave(raw);
      expect(r.data.version).toBe(SAVE_VERSION);
      expect(Number.isFinite(r.data.gold)).toBe(true);
    }
  });
  it('repairs damaged maps instead of crashing on them', () => {
    const r = parseSave('{"version":6,"tips":null,"achievements":"x","seenNodes":[],"stats":null,"codex":7}');
    expect(r.data.tips).toEqual({});
    expect(r.data.tips.move).toBeUndefined();
    expect(r.data.achievements).toEqual({});
    expect(Array.isArray(r.data.seenNodes)).toBe(false);
    expect(r.data.stats.runs).toBe(0);
    expect(r.data.codex).toEqual({});
  });
  it('checks every field against the shape of a fresh save', () => {
    const r = parseSave(JSON.stringify({
      version: SAVE_VERSION, gold: 'lots', maxGloom: -2, milestones: ['grotto', 7, 'hollow'], credits: 'yes',
      stats: { runs: 'x', bestChain: 40, totalGold: null },
      settings: { master: 'loud', music: 0.3, flash: 1, bindings: { left: 'A', right: [], up: ['W', 3], down: ['S'] } },
      codex: { copper: 'many', tin: 4 }, achievements: { first_light: null, amber_age: 5 },
    }));
    const base = newSave();
    expect(r.data.gold).toBe(0);
    expect(r.data.maxGloom).toBe(0);
    expect(r.data.milestones).toEqual(['grotto', 'hollow']);
    expect(r.data.credits).toBe(false);
    expect(r.data.stats.runs).toBe(0);
    expect(r.data.stats.bestChain).toBe(40);
    expect(r.data.settings.master).toBe(base.settings.master);
    expect(r.data.settings.music).toBe(0.3);
    expect(r.data.settings.flash).toBe(base.settings.flash);
    expect(r.data.settings.bindings.left).toEqual(base.settings.bindings.left);
    expect(r.data.settings.bindings.right).toEqual(base.settings.bindings.right);
    expect(r.data.settings.bindings.up).toEqual(base.settings.bindings.up);
    expect(r.data.settings.bindings.down).toEqual(['S']);
    expect(r.data.codex).toEqual({ tin: 4 });
    expect(r.data.achievements).toEqual({ amber_age: 5 });
  });
  it('drops upgrade levels that are not whole non-negative numbers', () => {
    const r = parseSave('{"version":6,"upgrades":{"bit":"x","oil":2.7,"lens":-1,"gearing":null,"diamond":3}}');
    expect(r.data.upgrades).toEqual({ root: 1, oil: 2, diamond: 3 });
  });
  it('restores the desktop backup slot when the main save is corrupt', () => {
    const good = JSON.stringify({ ...newSave(), gold: 777 });
    const w = globalThis as unknown as { window?: unknown };
    const prev = w.window;
    w.window = { glimmer: { readSave: (slot?: string) => (slot === 'bak' ? good : '{broken'), writeSave: () => {} } };
    try {
      Save.load();
      expect(Save.restoredFromBackup).toBe(true);
      expect(Save.data.gold).toBe(777);
    } finally {
      w.window = prev;
    }
  });
  it('discards an older save for a fresh one, keeping only the settings', () => {
    const old = {
      version: 5, gold: 777, gems: 4, cores: 1, upgrades: { root: 1, bit: 4, oldnode: 2 }, maxDepth: 790, milestones: ['amberstone'],
      relics: ['acorn'], codex: { copper: 50 }, achievements: { first_light: 1 }, stats: { runs: 30 },
      settings: { master: 0.3, bindings: { left: ['J'] } },
    };
    const d = parseSave(JSON.stringify(old)).data;
    const fresh = newSave();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.gold).toBe(0);
    expect(d.upgrades).toEqual({ root: 1 });
    expect(d.maxDepth).toBe(0);
    expect(d.relics).toEqual([]);
    expect(d.codex).toEqual({});
    expect(d.achievements).toEqual({});
    expect(d.stats.runs).toBe(0);
    expect(d.milestones).toEqual([]);
    expect(d.settings.master).toBe(0.3);
    expect(d.settings.bindings.left).toEqual(['J']);
    expect(d.settings.bindings.right).toEqual(fresh.settings.bindings.right);
    // a save with no version at all is just as stale
    expect(parseSave('{"gold":50,"upgrades":{"root":1,"bit":2}}').data.gold).toBe(0);
  });
  it('the Codex counts ores, shard types and relics (57 in all), and never takes an achievement back', () => {
    const s = newSave();
    expect(codexPct(s)).toBe(0);
    s.codex.shard_glass = 4;
    expect(codexPct(s)).toBeCloseTo(1 / 57);
    s.codex.copper = 3;
    s.relics = ['acorn'];
    expect(codexPct(s)).toBeCloseTo(3 / 57);
    // an old save that had earned Field Notes keeps it, even though the Codex grew
    s.achievements.codex50 = 1;
    const was = Save.data;
    Save.data = s;
    checkAll();
    Save.data = was;
    expect(s.achievements.codex50).toBe(1);
  });
});

describe('banking', () => {
  it('adds loot, records and the codex', () => {
    const s = newSave();
    const r = bankRun(s, run());
    expect(s.gold).toBe(100);
    expect(s.gems).toBe(2);
    expect(s.maxDepth).toBe(60);
    expect(s.stats.runs).toBe(1);
    expect(s.codex.copper).toBe(9);
    expect(r.newDepthRecord).toBe(false);
    bankRun(s, run({ maxDepth: 130, relics: ['oldpick'] }));
    expect(s.relics).toEqual(['oldpick']);
  });
  it('layer milestones are banked once each and stay claimed', () => {
    const s = newSave();
    bankRun(s, run({ maxDepth: 330, milestones: ['amberstone'] }));
    expect(s.milestones).toEqual(['amberstone']);
    bankRun(s, run({ maxDepth: 540, milestones: ['grotto', 'amberstone'] }));
    expect(s.milestones).toEqual(['amberstone', 'grotto']);
    // even a dig that ends in the dark keeps what it reached
    bankRun(s, run({ maxDepth: 770, milestones: ['emberdeep'], reason: 'dark' }));
    expect(s.milestones).toEqual(['amberstone', 'grotto', 'emberdeep']);
  });
  it("reaching the Heart plays the finale once and opens Deep Pressure", () => {
    const s = newSave();
    const r = bankRun(s, run({ reachedHeart: true, maxDepth: 1510 }));
    expect(r.finale).toBe(true);
    expect(r.newPressure).toBe(1);
    expect(s.maxGloom).toBe(1);
    s.credits = true;
    s.gloom = 1;
    // below your highest tier it does not count
    s.gloom = 0;
    expect(bankRun(s, run({ reachedHeart: true })).newPressure).toBe(0);
    s.gloom = 1;
    const r2 = bankRun(s, run({ reachedHeart: true }));
    expect(r2.finale).toBe(false);
    expect(s.maxGloom).toBe(2);
  });
});
