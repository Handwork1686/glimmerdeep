/**
 * Versioned save data with forward migrations. Storage goes through a small
 * backend so the Electron build can write files (Steam Cloud) while the web
 * build uses localStorage.
 */
import { DEMO } from '../config';
import { SEAL_ROWS, SEALS } from '../data/biomes';

export const SAVE_VERSION = 5;
const KEY = DEMO ? 'glimmerdeep.demo.save' : 'glimmerdeep.save';

export type Action = 'left' | 'right' | 'up' | 'down' | 'shardbomb' | 'bomb' | 'pause' | 'confirm' | 'back';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  shake: number;
  flash: boolean; // reduce flashes
  darkAssist: boolean;
  speed: number; // 1, 0.85, 0.7
  pixelPerfect: boolean;
  fullscreen: boolean;
  crt: boolean;
  showFps: boolean;
  holdThrust: boolean; // reserved
  bindings: Record<Action, string[]>;
}

export interface SaveData {
  version: number;
  gold: number;
  gems: number;
  cores: number;
  upgrades: Record<string, number>;
  maxDepth: number;
  /** depths of the Strata Seals broken so far: they stay broken on every dig */
  sealsBroken: number[];
  gloom: number;
  maxGloom: number;
  seedCounter: number;
  stats: {
    runs: number;
    totalGold: number;
    totalGems: number;
    /** Shard Bombs thrown */
    bombs: number;
    bestChain: number;
    playTime: number;
    nodesBought: number;
    longestRun: number;
    mythics: number;
    maxBoons: number;
    endless: number;
    bestPot: number;
    seals: number;
    geodes: number;
    hearts: number;
  };
  /** ore pieces ever mined, by kind (the Codex) */
  codex: Record<string, number>;
  /** relics found, in order */
  relics: string[];
  achievements: Record<string, number>;
  tips: Record<string, boolean>;
  /** upgrade nodes the player has looked at (drives the NEW pips) */
  seenNodes: Record<string, boolean>;
  credits: boolean; // has seen the ending
  settings: Settings;
}

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  up: ['W', 'UP', 'SPACE'],
  down: ['S', 'DOWN'],
  shardbomb: ['E', 'SHIFT'],
  bomb: ['Q', 'X'],
  pause: ['ESC', 'P'],
  confirm: ['ENTER', 'SPACE', 'Z'],
  back: ['ESC', 'BACKSPACE'],
};

export function defaultSettings(): Settings {
  return {
    master: 0.8, music: 0.7, sfx: 0.8, shake: 1, flash: false, darkAssist: false, speed: 1, pixelPerfect: true,
    fullscreen: false, crt: false, showFps: false, holdThrust: true, bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  };
}

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION, gold: 0, gems: 0, cores: 0, upgrades: { root: 1 }, maxDepth: 0, sealsBroken: [],
    gloom: 0, maxGloom: 0, seedCounter: 1,
    stats: {
      runs: 0, totalGold: 0, totalGems: 0, bombs: 0, bestChain: 0, playTime: 0, nodesBought: 0, longestRun: 0, mythics: 0, maxBoons: 0,
      endless: 0, bestPot: 0, seals: 0, geodes: 0, hearts: 0,
    },
    codex: {}, relics: [], achievements: {}, tips: {}, seenNodes: { root: true }, credits: false, settings: defaultSettings(),
  };
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: settings gained crt/showFps; stats gained endless
  1: (d) => {
    const s = (d.settings ?? {}) as Record<string, unknown>;
    s.crt = s.crt ?? false;
    s.showFps = s.showFps ?? false;
    d.settings = s;
    const st = (d.stats ?? {}) as Record<string, unknown>;
    st.endless = st.endless ?? 0;
    d.stats = st;
    d.version = 2;
    return d;
  },
  // v2 -> v3: the guardians and creatures are gone. Refund every upgrade that
  // only made sense in a fight, drop combat stats, and let the new ending play.
  2: (d) => {
    const ups = (d.upgrades ?? {}) as Record<string, number>;
    const refund = { gold: 0, gems: 0, cores: 0 };
    for (const [id, o] of Object.entries(REMOVED_V3)) {
      const lvl = Math.min(ups[id] ?? 0, 9);
      for (let l = 0; l < lvl; l++) {
        refund.gold += Math.round(o.gold * Math.pow(1.85, l) * o.tier);
        refund.gems += o.gems ? Math.ceil(o.gems * Math.pow(1.5, l)) : 0;
        refund.cores += o.cores ?? 0;
      }
      delete ups[id];
    }
    d.upgrades = ups;
    d.gold = ((d.gold as number) ?? 0) + refund.gold;
    d.gems = ((d.gems as number) ?? 0) + refund.gems;
    d.cores = ((d.cores as number) ?? 0) + refund.cores;
    delete d.defeated;
    const st = (d.stats ?? {}) as Record<string, unknown>;
    delete st.kills;
    d.stats = st;
    d.credits = false;
    const ach = (d.achievements ?? {}) as Record<string, number>;
    for (const id of ['coil_breaker', 'heartbreaker', 'lightbringer', 'pacifist', 'moth_bane', 'close_call', 'gloom5', 'gloom10']) delete ach[id];
    d.achievements = ach;
    d.version = 3;
    return d;
  },
  // v3 -> v4: the lifts are gone (every dig starts at the surface) and broken
  // seals stay broken. Having been below a seal's band proves it was broken.
  3: (d) => {
    delete d.stop;
    const max = isNum(d.maxDepth) ? d.maxDepth : 0;
    d.sealsBroken = sealsBelow(max);
    d.version = 4;
    return d;
  },
  // v4 -> v5: the Flare became the Shard Bomb (same keys, no upgrades of its
  // own) and pickups always auto-collect. Refund the flare and magnet nodes in
  // full, keep the player's own keys for the bomb, carry the throw count over.
  4: (d) => {
    const ups = isMap(d.upgrades) ? (d.upgrades as Record<string, unknown>) : {};
    const refund = refundNodes(ups, REMOVED_V5);
    d.upgrades = ups;
    d.gold = (isNum(d.gold) ? d.gold : 0) + refund.gold;
    d.gems = (isNum(d.gems) ? d.gems : 0) + refund.gems;
    d.cores = (isNum(d.cores) ? d.cores : 0) + refund.cores;
    const st = isMap(d.stats) ? d.stats : {};
    if (isNum(st.flares)) st.bombs = st.flares;
    delete st.flares;
    d.stats = st;
    const set = isMap(d.settings) ? d.settings : null;
    if (set && isMap(set.bindings)) {
      const b = set.bindings as Record<string, unknown>;
      if (b.flare !== undefined) b.shardbomb = b.flare;
      delete b.flare;
    }
    const tips = isMap(d.tips) ? d.tips : null;
    if (tips) {
      delete tips.flare;
      delete tips.lift;
    }
    d.version = 5;
    return d;
  },
};

interface Snapshot {
  gold: number;
  gems?: number;
  cores?: number;
  growth: number;
  /** ring tier multiplier at the time */
  tier: number;
  /** the price scale at the time */
  econ: number;
}

/** refund every level of the removed nodes at the list price the player paid, and drop them */
function refundNodes(ups: Record<string, unknown>, removed: Record<string, Snapshot>) {
  const refund = { gold: 0, gems: 0, cores: 0 };
  for (const [id, o] of Object.entries(removed)) {
    const raw = ups[id];
    const lvl = isNum(raw) ? Math.max(0, Math.min(Math.floor(raw), 9)) : 0;
    for (let l = 0; l < lvl; l++) {
      refund.gold += Math.round(o.gold * Math.pow(o.growth, l) * o.tier * o.econ);
      refund.gems += o.gems ? Math.ceil(o.gems * Math.pow(1.5, l)) : 0;
      refund.cores += o.cores ?? 0;
    }
    delete ups[id];
  }
  return refund;
}

/** v4 flare and magnet nodes, frozen as they were priced when removed */
const REMOVED_V5: Record<string, Snapshot> = {
  flarecd: { gold: 20, growth: 1.85, tier: 1, econ: 3.5 },
  flarer: { gold: 60, growth: 1.85, tier: 1, econ: 3.5 },
  flarep: { gold: 70, growth: 1.85, tier: 1, econ: 3.5 },
  magnet: { gold: 35, growth: 1.85, tier: 1, econ: 3.5 },
  magnet2: { gold: 4000, gems: 5, growth: 1.85, tier: 7, econ: 3.5 },
};

/** seals a save that has reached `maxDepth` must have broken (never the demo's Amber Seal) */
export function sealsBelow(maxDepth: number): number[] {
  return SEALS.filter((s, i) => maxDepth >= s.depth + SEAL_ROWS && !(DEMO && i === 0)).map((s) => s.depth);
}

/** a clean list of broken seal depths: known seals only, each once, in order */
export function cleanSeals(stored: unknown): number[] {
  if (!Array.isArray(stored)) return [];
  const known = SEALS.filter((_, i) => !(DEMO && i === 0)).map((s) => s.depth);
  return known.filter((dep) => stored.includes(dep));
}

/** v2 combat nodes and their old costs (base gold, gems, cores, tier multiplier) */
const REMOVED_V3: Record<string, { gold: number; gems?: number; cores?: number; tier: number }> = {
  brighthull: { gold: 120, tier: 1.35 },
  plating: { gold: 180, gems: 1, tier: 1.35 },
  shocks: { gold: 220, tier: 1.35 },
  reflex: { gold: 260, tier: 1.35 },
  spikes: { gold: 1100, gems: 3, tier: 3 },
  juggernaut: { gold: 8000, cores: 1, tier: 7 },
  coredrill: { gold: 6000, cores: 1, tier: 7 },
};

const isMap = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && isFinite(x);

/** Copy each default key, keeping the stored value only when it has the same type. */
function shaped<T extends object>(defaults: T, stored: unknown): T {
  const out = { ...defaults } as Record<string, unknown>;
  if (!isMap(stored)) return out as T;
  for (const [k, def] of Object.entries(defaults)) {
    const v = stored[k];
    if (typeof def === 'number' ? isNum(v) : typeof v === typeof def && !Array.isArray(v) && v !== null) out[k] = v;
  }
  return out as T;
}

/** Upgrade levels: whole numbers above 0, capped; the root node is always owned. */
function levels(stored: unknown): Record<string, number> {
  const out: Record<string, number> = { root: 1 };
  if (isMap(stored)) for (const [id, l] of Object.entries(stored)) if (isNum(l) && l > 0) out[id] = Math.min(9999, Math.floor(l));
  return out;
}

function numberMap(stored: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isMap(stored)) for (const [k, v] of Object.entries(stored)) if (isNum(v) && v >= 0) out[k] = v;
  return out;
}

function flagMap(stored: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (isMap(stored)) for (const [k, v] of Object.entries(stored)) if (v) out[k] = true;
  return out;
}

/** Each action keeps its stored keys only if they are a non-empty list of strings. */
function bindings(stored: unknown): Record<Action, string[]> {
  const out = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) as Record<Action, string[]>;
  if (!isMap(stored)) return out;
  for (const a of Object.keys(out) as Action[]) {
    const v = stored[a];
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string')) out[a] = [...v];
  }
  return out;
}

/** Parse + migrate + fill defaults. Never throws; corrupt input yields a fresh save. */
export function parseSave(raw: string | null): { data: SaveData; recovered: boolean } {
  if (!raw) return { data: newSave(), recovered: false };
  try {
    let d = JSON.parse(raw) as Record<string, unknown>;
    if (typeof d !== 'object' || d === null) throw new Error('bad');
    let v = typeof d.version === 'number' ? d.version : 1;
    while (v < SAVE_VERSION && MIGRATIONS[v]) {
      d = MIGRATIONS[v](d);
      v = d.version as number;
    }
    // Every field is checked against the shape of a fresh save, so a damaged
    // file (null, a string or an array where something else belongs, NaN...)
    // falls back to defaults field by field instead of crashing the game.
    const base = newSave();
    const merged: SaveData = {
      ...shaped(base, d),
      stats: shaped(base.stats, d.stats),
      settings: shaped(base.settings, d.settings),
      upgrades: levels(d.upgrades),
      codex: numberMap(d.codex),
      achievements: numberMap(d.achievements),
      tips: flagMap(d.tips),
      seenNodes: { ...base.seenNodes, ...flagMap(d.seenNodes) },
      relics: Array.isArray(d.relics) ? (d.relics as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      sealsBroken: cleanSeals(d.sealsBroken),
      version: SAVE_VERSION,
    };
    merged.settings.bindings = bindings(isMap(d.settings) ? d.settings.bindings : undefined);
    for (const k of ['gold', 'gems', 'cores', 'maxDepth', 'gloom', 'maxGloom'] as const) merged[k] = Math.max(0, merged[k]);
    return { data: merged, recovered: false };
  } catch {
    return { data: newSave(), recovered: true };
  }
}

export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

const memory: Record<string, string> = {};
export const localBackend: StorageBackend = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory[key] ?? null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory[key] = value;
    }
  },
};

declare global {
  interface Window {
    glimmer?: {
      /** slot 'bak' reads the backup copy the desktop shell keeps beside save.json */
      readSave?: (slot?: 'main' | 'bak') => string | null;
      writeSave?: (s: string) => void;
      achievement?: (id: string) => void;
      quit?: () => void;
      setFullscreen?: (on: boolean) => void;
      richPresence?: (s: string) => void;
      platform?: string;
    };
  }
}

function backend(): StorageBackend {
  const g = typeof window !== 'undefined' ? window.glimmer : undefined;
  if (g?.readSave && g.writeSave) {
    // the desktop shell keeps its own .bak beside save.json on every write, so only the main slot is written here
    return {
      read: (k) => g.readSave!(k.endsWith('.bak') ? 'bak' : 'main'),
      write: (k, v) => {
        if (!k.endsWith('.bak')) g.writeSave!(v);
      },
    };
  }
  return localBackend;
}

class SaveManager {
  data: SaveData = newSave();
  /** the main save was unreadable */
  recovered = false;
  /** ...and the backup was used instead */
  restoredFromBackup = false;

  load() {
    const b = backend();
    const raw = b.read(KEY);
    const res = parseSave(raw);
    this.data = res.data;
    this.recovered = res.recovered;
    if (res.recovered) {
      // the main slot is damaged: fall back to the backup if it is intact
      const bakRaw = b.read(KEY + '.bak');
      const bak = parseSave(bakRaw);
      if (bakRaw && !bak.recovered) {
        this.data = bak.data;
        this.restoredFromBackup = true;
      }
    }
  }

  save() {
    const b = backend();
    const s = JSON.stringify(this.data);
    const prev = b.read(KEY);
    if (prev) b.write(KEY + '.bak', prev);
    b.write(KEY, s);
  }

  reset() {
    const settings = this.data.settings;
    this.data = newSave();
    this.data.settings = settings;
    this.save();
  }
}

export const Save = new SaveManager();
