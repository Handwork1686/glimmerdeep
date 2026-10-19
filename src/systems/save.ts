/**
 * Versioned save data. A save from an older version is discarded for a fresh
 * one (settings are kept); there are no migrations. Storage goes through a small
 * backend so the Electron build can write files (Steam Cloud) while the web
 * build uses localStorage.
 */
import { DEMO } from '../config';

export const SAVE_VERSION = 6;
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
  /** layers whose depth milestone has been claimed (biome ids) */
  milestones: string[];
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
    version: SAVE_VERSION, gold: 0, gems: 0, cores: 0, upgrades: { root: 1 }, maxDepth: 0, milestones: [],
    gloom: 0, maxGloom: 0, seedCounter: 1,
    stats: {
      runs: 0, totalGold: 0, totalGems: 0, bombs: 0, bestChain: 0, playTime: 0, nodesBought: 0, longestRun: 0, mythics: 0, maxBoons: 0,
      endless: 0, bestPot: 0, seals: 0, geodes: 0, hearts: 0,
    },
    codex: {}, relics: [], achievements: {}, tips: {}, seenNodes: { root: true }, credits: false, settings: defaultSettings(),
  };
}

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
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (typeof d !== 'object' || d === null) throw new Error('bad');
    // an older save is not carried over: start fresh, keep only the settings
    if (!isNum(d.version) || d.version < SAVE_VERSION) {
      const fresh = newSave();
      fresh.settings = shaped(fresh.settings, d.settings);
      fresh.settings.bindings = bindings(isMap(d.settings) ? d.settings.bindings : undefined);
      return { data: fresh, recovered: false };
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
      milestones: Array.isArray(d.milestones) ? (d.milestones as unknown[]).filter((x): x is string => typeof x === 'string') : [],
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
