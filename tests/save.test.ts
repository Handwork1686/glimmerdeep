import { describe, expect, it } from 'vitest';
import { newSave, parseSave, Save, SAVE_VERSION } from '../src/systems/save';
import { bankRun, availableStops } from '../src/systems/bank';
import type { RunSummary } from '../src/core/sim';

const run = (o: Partial<RunSummary> = {}): RunSummary => ({
  gold: 100, gems: 2, cores: 0, depth: 40, maxDepth: 60, startDepth: 0, time: 80, bestChain: 12, bestPot: 40, level: 4,
  boons: { overcharge: 1 }, flares: 3, lightPickups: 2, ores: { copper: 9 }, relics: [], seals: 0, geodes: 0, reachedHeart: false,
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
    const r = parseSave('{"version":3,"tips":null,"achievements":"x","seenNodes":[],"stats":null,"codex":7}');
    expect(r.data.tips).toEqual({});
    expect(r.data.tips.move).toBeUndefined();
    expect(r.data.achievements).toEqual({});
    expect(Array.isArray(r.data.seenNodes)).toBe(false);
    expect(r.data.stats.runs).toBe(0);
    expect(r.data.codex).toEqual({});
  });
  it('checks every field against the shape of a fresh save', () => {
    const r = parseSave(JSON.stringify({
      version: 3, gold: 'lots', maxGloom: -2, stop: 5, credits: 'yes',
      stats: { runs: 'x', bestChain: 40, totalGold: null },
      settings: { master: 'loud', music: 0.3, flash: 1, bindings: { left: 'A', right: [], up: ['W', 3], down: ['S'] } },
      codex: { copper: 'many', tin: 4 }, achievements: { first_light: null, amber_age: 5 },
    }));
    const base = newSave();
    expect(r.data.gold).toBe(0);
    expect(r.data.maxGloom).toBe(0);
    expect(r.data.stop).toBe(base.stop);
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
    const r = parseSave('{"version":3,"upgrades":{"bit":"x","oil":2.7,"lens":-1,"gearing":null,"diamond":3}}');
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
  it('migrates v2 saves: combat upgrades are refunded in full', () => {
    const v2 = {
      version: 2, gold: 10, gems: 0, cores: 0, upgrades: { root: 1, plating: 2, juggernaut: 1, bit: 3 }, defeated: { coil: true },
      stats: { runs: 9, kills: { moth: 40 } }, credits: true, achievements: { coil_breaker: 1, first_light: 1 },
    };
    const d = parseSave(JSON.stringify(v2)).data;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.upgrades.plating).toBeUndefined();
    expect(d.upgrades.juggernaut).toBeUndefined();
    expect(d.upgrades.bit).toBe(3);
    // plating: 180*1.35 + 180*1.85*1.35 ; juggernaut: 8000*7
    expect(d.gold).toBe(10 + Math.round(180 * 1.35) + Math.round(180 * 1.85 * 1.35) + 8000 * 7);
    expect(d.gems).toBe(1 + 2);
    expect(d.cores).toBe(1);
    expect((d as unknown as Record<string, unknown>).defeated).toBeUndefined();
    expect(d.credits).toBe(false);
    expect(d.achievements.coil_breaker).toBeUndefined();
    expect(d.achievements.first_light).toBe(1);
    expect(d.codex).toEqual({});
    expect(d.relics).toEqual([]);
  });
  it('migrates v1 saves', () => {
    const v1 = { version: 1, gold: 50, upgrades: { root: 1, oil: 2 }, settings: { master: 0.5 }, stats: { runs: 3 } };
    const d = parseSave(JSON.stringify(v1)).data;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.settings.crt).toBe(false);
    expect(d.settings.master).toBe(0.5);
    expect(d.stats.runs).toBe(3);
    expect(d.stats.endless).toBe(0);
    expect(d.settings.bindings.left.length).toBeGreaterThan(0);
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
    expect(availableStops(s).map((x) => x.id)).toContain('amber');
    expect(s.relics).toEqual(['oldpick']);
  });
  it('lift stops open by depth; the deepest only after the Heart', () => {
    const s = newSave();
    bankRun(s, run({ maxDepth: 330 }));
    expect(availableStops(s).map((x) => x.id)).toContain('grotto');
    bankRun(s, run({ maxDepth: 1600 }));
    expect(availableStops(s).map((x) => x.id)).not.toContain('deep');
    bankRun(s, run({ maxDepth: 1600, reachedHeart: true }));
    expect(availableStops(s).map((x) => x.id)).toContain('deep');
  });
  it("reaching the Heart plays the finale once and opens Deep Pressure", () => {
    const s = newSave();
    const r = bankRun(s, run({ reachedHeart: true, maxDepth: 1510 }));
    expect(r.finale).toBe(true);
    expect(r.newPressure).toBe(1);
    expect(s.maxGloom).toBe(1);
    s.credits = true;
    s.gloom = 1;
    // from the deepest stop it does not count
    expect(bankRun(s, run({ reachedHeart: true, startDepth: 1540 })).newPressure).toBe(0);
    const r2 = bankRun(s, run({ reachedHeart: true, startDepth: 1056 }));
    expect(r2.finale).toBe(false);
    expect(s.maxGloom).toBe(2);
  });
});
