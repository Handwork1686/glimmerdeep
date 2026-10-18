/**
 * The deterministic game simulation. No Phaser, no DOM: the Run scene renders
 * it, bots and tests drive it headless.
 */
import { COLS, SKY_ROWS, STEP, TILE, WORLD_ROWS } from '../config';
import { biomeAt, SEAL_ROWS, SEALS } from '../data/biomes';
import { BOON_BY_ID, BoonDef, BOONS } from '../data/boons';
import { ItemKind, T, TILES } from '../data/tiles';
import { computeStats, GloomMods, gloomMods, rollBoons, xpForLevel } from './progression';
import { Rng } from './rng';
import { Stats } from './stats';
import { depthOfRow, generateWorld, rowOfDepth } from './worldgen';

export interface SimInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  flare: boolean; // edge-triggered by the caller
  bomb: boolean; // edge-triggered by the caller
}

export const NO_INPUT: SimInput = { left: false, right: false, up: false, down: false, flare: false, bomb: false };

export type DrillDir = 'left' | 'right' | 'up' | 'down' | null;

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: 1 | -1;
  grounded: boolean;
  blockL: boolean;
  blockR: boolean;
  blockU: boolean;
  drill: DrillDir;
  drillTimer: number;
  drillTarget: { x: number; y: number } | null;
  hitCount: number;
  flareCd: number;
  fallFrom: number;
  thrusting: boolean;
  dynamite: number;
  /** 0..1 thrust ease-in */
  thrustT: number;
  /** seconds since last grounded (coyote time) */
  groundT: number;
  /** 0..1 drill heat: continuous drilling spins the bit faster */
  heat: number;
  plowCd: number;
}

export interface Shard {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  color: number;
  bounces: number;
  gen: number;
}

export interface Pickup {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gold: number;
  gems: number;
  cores: number;
  light: number;
  age: number;
  done: boolean;
}

export interface Bomb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
}

export interface FallingRock {
  id: number;
  x: number;
  y: number;
  vy: number;
}

export interface Drone {
  angle: number;
  cd: number;
  x: number;
  y: number;
}

export type SimEvent =
  | { t: 'tile'; x: number; y: number }
  | { t: 'hit'; x: number; y: number; tile: number; src: string }
  | { t: 'break'; x: number; y: number; tile: number; src: string; chain: number }
  | { t: 'pickup'; kind: ItemKind; gold: number; gems: number; cores: number; light: number; x: number; y: number }
  | { t: 'shard'; x: number; y: number }
  | { t: 'explode'; x: number; y: number; r: number }
  | { t: 'flare'; x: number; y: number; r: number }
  | { t: 'bombThrow' }
  | { t: 'levelup'; level: number }
  | { t: 'chainLink'; count: number }
  | { t: 'chainEnd'; count: number; pot: number; mult: number; bonus: number }
  | { t: 'land'; speed: number }
  | { t: 'quake'; x: number; y: number }
  | { t: 'rockShatter'; x: number; y: number }
  | { t: 'clank'; x: number; y: number }
  | { t: 'sealDeny'; x: number; y: number; need: number; name: string }
  | { t: 'sealBreak'; x: number; y: number; name: string }
  | { t: 'geode'; x: number; y: number }
  | { t: 'relic'; id: string; x: number; y: number }
  | { t: 'heart'; x: number; y: number }
  | { t: 'secondWind' }
  | { t: 'biome'; id: string; name: string }
  | { t: 'end'; reason: EndReason };

/** how a dig ended: the lantern ran dry, the player went up, or the World's Heart broke */
export type EndReason = 'dark' | 'quit' | 'heart';

export interface RunSummary {
  gold: number;
  gems: number;
  cores: number;
  depth: number;
  maxDepth: number;
  startDepth: number;
  time: number;
  bestChain: number;
  bestPot: number;
  level: number;
  boons: Record<string, number>;
  flares: number;
  lightPickups: number;
  /** ore pieces mined this run, by kind */
  ores: Partial<Record<ItemKind, number>>;
  relics: string[];
  seals: number;
  geodes: number;
  reachedHeart: boolean;
  reason: EndReason;
}

export interface SimConfig {
  seed: number;
  upgrades: Record<string, number>;
  /** relics found on earlier digs (their perks apply, and they are not buried again) */
  relics?: string[];
  startDepth: number;
  gloom: number;
  /** demo: the first Strata Seal never breaks */
  demo?: boolean;
}

const G = 900;
const MAX_FALL = 330;
const COYOTE = 0.09;
const CORNER_ASSIST = [-1, -2, -3, -4, 1, 2, 3, 4];
const CORNER_ASSIST_AIR = [-1, -2, -3, -4, -5, -6, 1, 2, 3, 4, 5, 6];
/** chain pot multiplier for a chain of n links */
export function potMultiplier(n: number, growth: number): number {
  return 1 + growth * Math.sqrt(n);
}

export class Sim {
  readonly W = COLS;
  readonly H = WORLD_ROWS;
  tiles: Uint8Array;
  /** cells that were open cave at generation (decor grows only there) */
  naturalAir: Uint8Array;
  hp: Float32Array;
  rng: Rng;
  cfg: SimConfig;
  gloom: GloomMods;
  baseUpgrades: Record<string, number>;
  stats: Stats;
  boons: Record<string, number> = {};
  banished = new Set<string>();
  rerolls = 0;
  banishes = 0;

  player: Player;
  light: number;
  shards: Shard[] = [];
  pickups: Pickup[] = [];
  bombs: Bomb[] = [];
  rocks: FallingRock[] = [];
  drones: Drone[] = [];
  events: SimEvent[] = [];
  /** tile index -> relic id buried there */
  relicAt = new Map<number, string>();
  relicsKnown: string[];
  heart: { x: number; y: number };

  time = 0;
  level = 1;
  xp = 0;
  gold = 0;
  gems = 0;
  cores = 0;
  maxDepth = 0;
  chain = 0;
  chainTimer = 0;
  bestChain = 0;
  chainLinksForResonance = 0;
  chainLinksForCataclysm = 0;
  /** gold mined during the current chain: paid out x multiplier when it ends */
  potGold = 0;
  bestPot = 0;
  flares = 0;
  lightPickups = 0;
  ores: Partial<Record<ItemKind, number>> = {};
  relicsFound: string[] = [];
  sealsBroken = 0;
  geodesCracked = 0;
  reachedHeart = false;
  choices: BoonDef[] | null = null;
  pendingLevels = 0;
  over = false;
  endReason: EndReason = 'dark';
  /** seconds until the dig ends after the Heart breaks */
  private heartEndT = -1;
  private nextId = 1;
  private blastQueue: { x: number; y: number; r: number; dmg: number; delay: number }[] = [];
  /** tiles that shatter on a timer (seal waves, the heart) */
  private breakQueue: { x: number; y: number; delay: number }[] = [];
  private sealDenyT = 0;
  private sealsShattered = new Set<number>();
  secondWindsUsed = 0;
  private currentBiome = '';
  private lowLightWarned = false;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.gloom = gloomMods(cfg.gloom);
    this.baseUpgrades = cfg.upgrades;
    this.relicsKnown = [...(cfg.relics ?? [])];
    const gen = generateWorld({ seed: cfg.seed, foundRelics: this.relicsKnown });
    this.tiles = gen.tiles;
    this.heart = gen.heart;
    for (const r of gen.relics) if (this.tiles[r.y * COLS + r.x] === T.relic) this.relicAt.set(r.y * COLS + r.x, r.id);
    this.naturalAir = new Uint8Array(this.tiles.length);
    for (let i = 0; i < this.tiles.length; i++) this.naturalAir[i] = this.tiles[i] === T.air ? 1 : 0;
    this.hp = new Float32Array(this.tiles.length);
    for (let y = 0; y < this.H; y++) {
      const scale = this.hpScale(y);
      for (let x = 0; x < this.W; x++) {
        const i = y * this.W + x;
        this.hp[i] = TILES[this.tiles[i]].hp * scale;
      }
    }
    this.stats = computeStats(cfg.upgrades, this.boons, this.relicsKnown);
    this.rerolls = this.stats.rerolls;
    this.banishes = this.stats.banishes;
    const startRow = cfg.startDepth > 0 ? rowOfDepth(cfg.startDepth) : SKY_ROWS - 1;
    this.player = {
      x: 15 * TILE, y: startRow * TILE + TILE - 6, vx: 0, vy: 0, w: 12, h: 12, facing: 1, grounded: false,
      blockL: false, blockR: false, blockU: false, drill: null, drillTimer: 0, drillTarget: null, hitCount: 0,
      flareCd: 0, fallFrom: 0, thrusting: false, dynamite: this.stats.dynamite, thrustT: 0, groundT: 0, heat: 0, plowCd: 0,
    };
    this.player.fallFrom = this.player.y;
    this.light = this.stats.maxLight;
    for (let i = 0; i < this.stats.drones; i++) this.addDrone();
    for (let i = 0; i < this.stats.headStart; i++) {
      const commons = BOONS.filter((b) => b.rarity === 'common' && (this.boons[b.id] ?? 0) < b.max);
      if (commons.length) this.applyBoon(this.rng.pick(commons), true);
    }
  }

  // ---------------------------------------------------------------- helpers
  hpScale(row: number): number {
    const depth = depthOfRow(row);
    let s = this.gloom.rockMul;
    if (depth > 1500) s *= 1 + (depth - 1500) / 300;
    return s;
  }

  /** below the Heart, ore keeps getting richer the deeper it lies */
  valueScale(depth: number): number {
    return 1 + Math.max(0, depth - 1500) / 300;
  }

  /** drill power a seal row needs, or 0 if the row is not a seal */
  sealNeed(row: number): number {
    const depth = depthOfRow(row);
    for (let i = 0; i < SEALS.length; i++) {
      const sl = SEALS[i];
      if (depth >= sl.depth && depth < sl.depth + SEAL_ROWS) return this.cfg.demo && i === 0 ? Infinity : sl.power;
    }
    return 0;
  }

  sealAt(row: number) {
    const depth = depthOfRow(row);
    return SEALS.find((sl) => depth >= sl.depth && depth < sl.depth + SEAL_ROWS) ?? null;
  }

  /** nearest unfound relic within reach (for the Survey Lamp's pointer) */
  nearestRelic(maxRows = 80): { x: number; y: number; dist: number } | null {
    const px = this.player.x / TILE;
    const py = this.player.y / TILE;
    let best: { x: number; y: number; dist: number } | null = null;
    for (const [i] of this.relicAt) {
      const x = i % this.W;
      const y = Math.floor(i / this.W);
      if (Math.abs(y - py) > maxRows || this.tiles[i] !== T.relic) continue;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (!best || d < best.dist) best = { x: x * TILE + 8, y: y * TILE + 8, dist: d };
    }
    return best;
  }

  depth(): number {
    return Math.max(0, Math.floor(this.player.y / TILE) - SKY_ROWS);
  }

  tileAt(x: number, y: number): number {
    if (x < 0 || x >= this.W) return T.bedrock;
    if (y < 0) return T.air;
    if (y >= this.H) return T.bedrock;
    return this.tiles[y * this.W + x];
  }

  solidAt(x: number, y: number): boolean {
    return TILES[this.tileAt(x, y)].solid;
  }

  solidPx(px: number, py: number): boolean {
    return this.solidAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  lightFrac(): number {
    return Math.max(0, Math.min(1, this.light / this.stats.maxLight));
  }

  /** light radius in px */
  lightRadius(): number {
    return (2.3 + 4.7 * Math.sqrt(this.lightFrac())) * this.stats.lightRadius * TILE;
  }

  private id(): number {
    return this.nextId++;
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private addDrone() {
    this.drones.push({ angle: this.rng.range(0, Math.PI * 2), cd: this.rng.range(0, 0.5), x: this.player.x, y: this.player.y });
  }

  // ------------------------------------------------------------- tile damage
  setTile(x: number, y: number, tile: number) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return;
    const i = y * this.W + x;
    this.tiles[i] = tile;
    this.hp[i] = TILES[tile].hp * this.hpScale(y);
    this.emit({ t: 'tile', x, y });
  }

  damageTile(x: number, y: number, dmg: number, src: 'drill' | 'shard' | 'blast' | 'flare' | 'drone' | 'rupture' | 'seismic', gen = 0): boolean {
    const tile = this.tileAt(x, y);
    const def = TILES[tile];
    if (tile === T.air || def.unbreakable) return false;
    const i = y * this.W + x;
    if (tile === T.seal) {
      // seals only yield to a strong enough drill
      const need = this.sealNeed(y);
      if (src !== 'drill' && src !== 'seismic') return false;
      if (this.stats.drillPower < need) {
        if (this.sealDenyT <= 0) {
          this.sealDenyT = 0.6;
          this.emit({ t: 'sealDeny', x: x * TILE + 8, y: y * TILE + 8, need, name: this.sealAt(y)?.name ?? '' });
        }
        return false;
      }
    }
    const mult = def.ore ? this.stats.oreMul : this.stats.rockMul;
    this.hp[i] -= dmg * mult;
    if (this.hp[i] <= 0) {
      this.breakTile(x, y, src, gen);
      return true;
    }
    this.emit({ t: 'hit', x, y, tile, src });
    return false;
  }

  private breakTile(x: number, y: number, src: string, gen: number) {
    const tile = this.tileAt(x, y);
    const def = TILES[tile];
    const i = y * this.W + x;
    this.tiles[i] = T.air;
    this.hp[i] = 0;
    // every cascade break is a link; so is every ore, crystal or gem you drill
    const cascade = src === 'shard' || src === 'blast' || src === 'rupture' || src === 'flare';
    const valuable = this.isValuable(tile) || tile === T.seal || tile === T.geode;
    const linked = cascade || valuable;
    if (linked) this.link();
    this.emit({ t: 'tile', x, y });
    this.emit({ t: 'break', x, y, tile, src, chain: linked ? this.chain : 0 });
    this.gainXp(def.xp);
    const cx = x * TILE + 8;
    const cy = y * TILE + 8;
    const depth = depthOfRow(y);
    // drops
    if (def.drop) {
      let count = def.drop.count;
      if (this.rng.chance(this.stats.doubleOre)) count *= 2;
      let per = def.drop.gold;
      // a geode's heart above the Mantle is a core, not a fortune
      if (tile === T.heartstone && depth < 1050) {
        per = 2 + depth * 0.03;
        count = 1;
      }
      if (this.stats.midas && (def.drop.kind === 'copper' || def.drop.kind === 'silver' || def.drop.kind === 'tin')) per *= 3;
      const goldMul = this.stats.goldMul * this.valueScale(depth) * (1 + this.stats.deepPockets * depth / 100) * this.gloom.goldMul;
      for (let k = 0; k < count; k++) this.spawnPickup(def.drop.kind, cx, cy, { gold: per * goldMul });
      if (this.chain > 0) this.potGold += per * goldMul * count;
      this.ores[def.drop.kind] = (this.ores[def.drop.kind] ?? 0) + count;
      if (this.stats.gemChance > 0 && this.rng.chance(this.stats.gemChance)) this.spawnPickup('sapphire', cx, cy, { gems: 1 });
    }
    if (def.gems) {
      const g = def.gems + this.stats.fossilBonus;
      this.spawnPickup(def.drop?.kind ?? 'sapphire', cx, cy, { gems: g });
    }
    if (def.cores) this.spawnPickup('core', cx, cy, { cores: def.cores });
    if (def.light) {
      const mul = tile === T.lampmoss ? this.stats.mossMul : this.stats.amberMul;
      this.spawnPickup('orb', cx, cy, { light: def.light * mul });
    }
    if (!def.ore && !def.light && this.stats.midasTouch > 0 && this.rng.chance(this.stats.midasTouch)) {
      const g = (3 + depth * 0.25) * this.stats.goldMul;
      this.spawnPickup('gold', cx, cy, { gold: g });
      if (this.chain > 0) this.potGold += g;
    }
    // specials
    if (tile === T.relic) this.findRelic(i, cx, cy);
    if (tile === T.geode) {
      this.geodesCracked++;
      this.emit({ t: 'geode', x: cx, y: cy });
    }
    if (tile === T.seal) this.shatterSeal(x, y);
    if (tile === T.worldheart) this.breakHeart(cx, cy);
    // chain effects
    let shardCount = def.shards ? def.shards + this.stats.shardBonus : 0;
    if (!shardCount && !def.ore && this.stats.shatter > 0 && src !== 'flare' && this.rng.chance(Math.min(0.3, this.stats.shatter))) shardCount = 2;
    if (shardCount > 0) this.burstShards(cx, cy, shardCount, def.tint, gen);
    if (def.explode) {
      this.blastQueue.push({ x: cx, y: cy, r: def.explode.radius + this.stats.blastRadius, dmg: def.explode.damage * this.stats.blastMul * (1 + depth / 600), delay: 0.09 });
    }
    if (def.ore && this.stats.veinRupture > 0 && src !== 'rupture') this.rupture(x, y, tile);
    // something above may fall
    this.checkFall(x, y - 1);
  }

  isValuable(tile: number): boolean {
    const d = TILES[tile];
    return !!(d.ore || d.shards || d.gems || tile === T.relic || tile === T.worldheart);
  }

  private link() {
    this.chain++;
    this.chainTimer = this.stats.chainTime;
    this.bestChain = Math.max(this.bestChain, this.chain);
    // long chains refuel a little less per link, so a dig still ends
    this.addLight((this.stats.chainFuel * 60) / (60 + this.chain), 'chain');
    this.emit({ t: 'chainLink', count: this.chain });
    if (this.stats.resonance > 0) {
      this.chainLinksForResonance++;
      if (this.chainLinksForResonance >= 10) {
        this.chainLinksForResonance = 0;
        this.addLight(this.stats.resonance, 'resonance');
      }
    }
    if (this.stats.cataclysm) {
      this.chainLinksForCataclysm++;
      if (this.chainLinksForCataclysm >= 25) {
        this.chainLinksForCataclysm = 0;
        this.doFlare(true);
      }
    }
  }

  /** pay out the chain pot: every coin mined during the chain, times the chain multiplier */
  private cashOut() {
    if (this.chain >= 3) {
      const mult = potMultiplier(this.chain, this.stats.chainPot);
      const bonus = this.potGold * (mult - 1);
      this.gold += bonus;
      this.bestPot = Math.max(this.bestPot, this.potGold + bonus);
      this.emit({ t: 'chainEnd', count: this.chain, pot: this.potGold, mult, bonus });
    }
    this.chain = 0;
    this.chainTimer = 0;
    this.potGold = 0;
  }

  private findRelic(i: number, cx: number, cy: number) {
    const id = this.relicAt.get(i);
    if (!id) return;
    this.relicAt.delete(i);
    this.relicsFound.push(id);
    this.relicsKnown.push(id);
    this.stats = computeStats(this.baseUpgrades, this.boons, this.relicsKnown);
    this.light = Math.min(this.light, this.stats.maxLight);
    this.emit({ t: 'relic', id, x: cx, y: cy });
  }

  /** breaking one seal tile sends a shattering wave through the whole band */
  private shatterSeal(x: number, y: number) {
    const seal = this.sealAt(y);
    if (!seal) return;
    const y0 = rowOfDepth(seal.depth);
    if (!this.sealsShattered.has(seal.depth)) {
      this.sealsShattered.add(seal.depth);
      this.sealsBroken++;
      this.emit({ t: 'sealBreak', x: x * TILE + 8, y: y * TILE + 8, name: seal.name });
    }
    for (let yy = y0; yy < y0 + SEAL_ROWS; yy++) {
      for (let xx = 1; xx < this.W - 1; xx++) {
        if (this.tileAt(xx, yy) !== T.seal || this.breakQueue.some((b) => b.x === xx && b.y === yy)) continue;
        this.breakQueue.push({ x: xx, y: yy, delay: 0.03 + Math.hypot(xx - x, (yy - y) * 2) * 0.022 });
      }
    }
  }

  private breakHeart(cx: number, cy: number) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const hx = this.heart.x + dx;
      const hy = this.heart.y + dy;
      if (this.tileAt(hx, hy) === T.worldheart && !this.breakQueue.some((b) => b.x === hx && b.y === hy)) this.breakQueue.push({ x: hx, y: hy, delay: 0.15 });
    }
    if (this.reachedHeart) return;
    this.reachedHeart = true;
    // the Heart's light carries the Wick home: the dig ends a few seconds later,
    // and no level-up hand (not even one this very tile's XP queued) gets in the way
    this.heartEndT = 4;
    this.pendingLevels = 0;
    this.choices = null;
    this.emit({ t: 'heart', x: cx, y: cy });
    this.addLight(this.stats.maxLight, 'heart');
    for (let k = 0; k < 3; k++) this.spawnPickup('core', cx, cy, { cores: 1 });
    const g = 400 * this.stats.goldMul * this.valueScale(1500);
    for (let k = 0; k < 24; k++) this.spawnPickup('heartstone', cx, cy, { gold: g / 24 });
    this.burstShards(cx, cy, 24, 0xffd877, 0);
  }

  private rupture(x: number, y: number, tile: number) {
    const seen = new Set<number>();
    const stack = [[x, y]];
    const hits: [number, number][] = [];
    while (stack.length && hits.length < 40) {
      const [cx, cy] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const k = ny * this.W + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.tileAt(nx, ny) === tile) {
          hits.push([nx, ny]);
          stack.push([nx, ny]);
        }
      }
    }
    const dmg = TILES[tile].hp * this.hpScale(y) * this.stats.veinRupture;
    for (const [hx, hy] of hits) this.damageTile(hx, hy, dmg, 'rupture');
  }

  private checkFall(x: number, y: number) {
    if (this.tileAt(x, y) !== T.boulder) return;
    if (this.solidAt(x, y + 1)) return;
    this.tiles[y * this.W + x] = T.air;
    this.emit({ t: 'tile', x, y });
    this.rocks.push({ id: this.id(), x: x * TILE + 8, y: y * TILE + 8, vy: 0 });
  }

  burstShards(cx: number, cy: number, count: number, color: number, gen: number) {
    const base = this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < count; k++) {
      const a = base + (k / count) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
      const sp = this.rng.range(150, 210);
      this.shards.push({
        id: this.id(), x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color,
        dmg: this.stats.shardDamage * (1 + depthOfRow(Math.floor(cy / TILE)) / 250), bounces: this.stats.ricochet, gen,
      });
    }
    this.emit({ t: 'shard', x: cx, y: cy });
  }

  explode(x: number, y: number, r: number, dmg: number) {
    const tr = Math.ceil(r);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    this.emit({ t: 'explode', x, y, r });
    for (let dy = -tr; dy <= tr; dy++) {
      for (let dx = -tr; dx <= tr; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        this.damageTile(tx + dx, ty + dy, dmg * (1 - d / (r + 1) * 0.5), 'blast');
      }
    }
  }

  // ----------------------------------------------------------------- pickups
  spawnPickup(kind: ItemKind, x: number, y: number, v: { gold?: number; gems?: number; cores?: number; light?: number }) {
    const a = this.rng.range(-Math.PI * 0.85, -Math.PI * 0.15);
    const sp = this.rng.range(50, 110);
    this.pickups.push({
      id: this.id(), kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      gold: v.gold ?? 0, gems: v.gems ?? 0, cores: v.cores ?? 0, light: v.light ?? 0, age: 0, done: false,
    });
  }

  private collect(pk: Pickup) {
    pk.done = true;
    this.gold += pk.gold;
    this.gems += pk.gems;
    this.cores += pk.cores;
    if (pk.light) {
      this.addLight(pk.light, 'orb');
      this.lightPickups++;
    }
    if (pk.gold > 0 && this.stats.kindling > 0) this.addLight(this.stats.kindling, 'kindling');
    this.emit({ t: 'pickup', kind: pk.kind, gold: pk.gold, gems: pk.gems, cores: pk.cores, light: pk.light, x: pk.x, y: pk.y });
  }

  /** light gained per source (balance telemetry) */
  lightLog: Record<string, number> = {};

  addLight(v: number, src = 'other') {
    this.lightLog[src] = (this.lightLog[src] ?? 0) + Math.max(0, Math.min(v, this.stats.maxLight - this.light));
    this.light = Math.min(this.stats.maxLight, this.light + v);
    if (this.light > this.stats.maxLight * 0.3) this.lowLightWarned = false;
  }

  gainXp(v: number) {
    this.xp += v * this.stats.xpMul;
    let need = xpForLevel(this.level);
    while (this.xp >= need) {
      this.xp -= need;
      this.level++;
      // once the Heart breaks the dig is about to end: no more boon hands
      if (!this.reachedHeart) this.pendingLevels++;
      this.emit({ t: 'levelup', level: this.level });
      need = xpForLevel(this.level);
      if (this.stats.astral) this.addLight(this.stats.astral, 'astral');
    }
  }

  // ------------------------------------------------------------------- boons
  /** Called by the UI when it is ready to show the next level-up hand. */
  openChoice(): BoonDef[] | null {
    if (this.choices || this.pendingLevels <= 0) return this.choices;
    const n = Math.max(2, this.stats.boonChoices + this.gloom.boonChoiceDelta);
    this.choices = rollBoons(this.rng, n, this.boons, this.banished, this.stats.luck);
    if (this.choices.length === 0) {
      this.pendingLevels = 0;
      this.choices = null;
      this.addLight(10);
    }
    return this.choices;
  }

  choose(id: string) {
    const def = BOON_BY_ID[id];
    if (!def || !this.choices) return;
    this.applyBoon(def, false);
    this.choices = null;
    this.pendingLevels--;
  }

  reroll(): boolean {
    if (!this.choices || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = null;
    this.openChoice();
    return true;
  }

  banish(id: string): boolean {
    if (!this.choices || this.banishes <= 0) return false;
    this.banishes--;
    this.banished.add(id);
    this.choices = null;
    this.openChoice();
    return true;
  }

  skipChoice() {
    this.choices = null;
    this.pendingLevels--;
    this.addLight(8, 'skip');
  }

  private applyBoon(def: BoonDef, silent: boolean) {
    this.boons[def.id] = (this.boons[def.id] ?? 0) + 1;
    const prevMax = this.stats.maxLight;
    const prevDrones = this.stats.drones;
    this.stats = computeStats(this.baseUpgrades, this.boons, this.relicsKnown);
    if (def.onPick === 'refill') this.addLight(15, 'boon');
    void prevMax;
    this.light = Math.min(this.light, this.stats.maxLight);
    for (let i = prevDrones; i < this.stats.drones; i++) this.addDrone();
    void silent;
  }

  get paused(): boolean {
    return this.choices !== null;
  }

  // -------------------------------------------------------------------- step
  step(input: SimInput, dt = STEP) {
    if (this.over) return;
    // the Heart's countdown runs even while a level-up hand is open
    if (this.heartEndT > 0) {
      this.heartEndT -= dt;
      if (this.heartEndT <= 0) {
        this.endRun('heart');
        return;
      }
    }
    if (this.choices) return; // waiting for a boon pick
    this.time += dt;
    const p = this.player;
    this.stepPlayer(input, dt);

    // light drain
    let drain = this.stats.lightDrain * this.gloom.drainMul * biomeAt(this.depth()).drain;
    if (this.stats.lastLight && this.lightFrac() < 0.25) drain *= 0.5;
    this.light -= drain * dt;
    if (!this.lowLightWarned && this.lightFrac() < 0.2) {
      this.lowLightWarned = true;
    }
    if (this.light <= 0) {
      if (this.stats.secondWind - this.secondWindsUsed > 0) {
        this.secondWindsUsed++;
        this.light = 25;
        this.emit({ t: 'secondWind' });
      } else {
        this.light = 0;
        this.endRun('dark');
        return;
      }
    }

    // depth & biome
    const d = this.depth();
    if (d > this.maxDepth) this.maxDepth = d;
    const biome = biomeAt(d);
    if (biome.id !== this.currentBiome && p.y > SKY_ROWS * TILE) {
      if (this.currentBiome !== '') this.emit({ t: 'biome', id: biome.id, name: biome.name });
      this.currentBiome = biome.id;
    }

    // chain timer
    // the chain holds while the drill is chewing something valuable
    const chewing = p.drillTarget && this.isValuable(this.tileAt(p.drillTarget.x, p.drillTarget.y));
    if (this.chainTimer > 0) {
      if (!chewing) this.chainTimer -= dt;
      if (this.chainTimer <= 0) this.cashOut();
    }
    if (this.sealDenyT > 0) this.sealDenyT -= dt;
    // timed shatters (seal waves, the heart)
    for (let i = this.breakQueue.length - 1; i >= 0; i--) {
      const b = this.breakQueue[i];
      b.delay -= dt;
      if (b.delay <= 0) {
        this.breakQueue.splice(i, 1);
        if (TILES[this.tileAt(b.x, b.y)].solid) this.breakTile(b.x, b.y, 'blast', 0);
      }
    }

    // queued blasts
    for (let i = this.blastQueue.length - 1; i >= 0; i--) {
      const b = this.blastQueue[i];
      b.delay -= dt;
      if (b.delay <= 0) {
        this.blastQueue.splice(i, 1);
        this.explode(b.x, b.y, b.r, b.dmg);
      }
    }

    this.stepShards(dt);
    this.stepPickups(dt);
    this.stepBombs(dt);
    this.stepRocks(dt);
    this.stepDrones(dt);
  }

  endRun(reason: EndReason) {
    if (this.over) return;
    // bank everything that was already knocked loose
    for (const pk of this.pickups) if (!pk.done) this.collect(pk);
    this.cashOut();
    // no level-up hand lingers over the walk to Results
    this.choices = null;
    this.pendingLevels = 0;
    this.over = true;
    this.endReason = reason;
    this.emit({ t: 'end', reason });
  }

  summary(): RunSummary {
    const boons = { ...this.boons };
    return {
      gold: Math.round(this.gold), gems: this.gems, cores: this.cores, depth: this.depth(), maxDepth: this.maxDepth,
      startDepth: this.cfg.startDepth, time: this.time, bestChain: this.bestChain, bestPot: Math.round(this.bestPot), level: this.level, boons,
      flares: this.flares, lightPickups: this.lightPickups, ores: { ...this.ores }, relics: [...this.relicsFound],
      seals: this.sealsBroken, geodes: this.geodesCracked, reachedHeart: this.reachedHeart, reason: this.endReason,
    };
  }

  // ------------------------------------------------------------------ player
  private collideBox(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor((x - w / 2) / TILE);
    const x1 = Math.floor((x + w / 2 - 0.001) / TILE);
    const y0 = Math.floor((y - h / 2) / TILE);
    const y1 = Math.floor((y + h / 2 - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) return true;
    return false;
  }

  private stepPlayer(inp: SimInput, dt: number) {
    const p = this.player;
    const s = this.stats;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) p.facing = dir as 1 | -1;
    const target = dir * s.moveSpeed;
    const accel = p.grounded ? 1100 : 700;
    if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
    else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);

    // gravity & thrust
    p.thrusting = inp.up;
    p.thrustT = p.thrusting ? Math.min(1, p.thrustT + dt * 8) : 0;
    p.vy += G * dt;
    if (p.thrusting) {
      // ease in over ~0.12 s so taps feel controllable
      p.vy -= s.thrust * dt * (0.45 + 0.55 * p.thrustT);
      const maxUp = 105 * (s.thrust / 1350);
      if (p.vy < -maxUp) p.vy = -maxUp;
    }
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;

    // move X
    p.blockL = p.blockR = false;
    const nx = p.x + p.vx * dt;
    if (!this.collideBox(nx, p.y, p.w, p.h)) {
      p.x = nx;
    } else {
      // corner assist: nudge up to 4px vertically into an opening
      let nudged = false;
      const reach = p.grounded ? CORNER_ASSIST : CORNER_ASSIST_AIR;
      for (const off of reach) {
        if (!this.collideBox(nx, p.y + off, p.w, p.h) && !this.collideBox(p.x, p.y + off, p.w, p.h)) {
          p.y += off;
          p.x = nx;
          nudged = true;
          break;
        }
      }
      if (!nudged) {
        if (p.vx > 0) {
          p.x = Math.floor((p.x + p.w / 2) / TILE) * TILE + TILE - p.w / 2 - 0.01;
          if (this.collideBox(p.x, p.y, p.w, p.h)) p.x = nx - p.vx * dt;
          p.blockR = true;
        } else if (p.vx < 0) {
          p.x = Math.floor((p.x - p.w / 2) / TILE) * TILE + p.w / 2 + 0.01;
          if (this.collideBox(p.x, p.y, p.w, p.h)) p.x = nx - p.vx * dt;
          p.blockL = true;
        }
        p.vx = 0;
      }
    }
    // pushing into a wall with zero velocity still counts as blocked
    if (dir > 0 && this.collideBox(p.x + 1, p.y, p.w, p.h)) p.blockR = true;
    if (dir < 0 && this.collideBox(p.x - 1, p.y, p.w, p.h)) p.blockL = true;

    // move Y
    const wasGrounded = p.grounded;
    const prevVy = p.vy;
    p.grounded = false;
    p.blockU = false;
    const ny = p.y + p.vy * dt;
    if (!this.collideBox(p.x, ny, p.w, p.h)) {
      p.y = ny;
    } else {
      if (p.vy > 0) {
        p.y = Math.floor((ny + p.h / 2) / TILE) * TILE - p.h / 2 - 0.01;
        if (this.collideBox(p.x, p.y, p.w, p.h)) p.y = ny - p.vy * dt;
        p.grounded = true;
      } else {
        p.y = Math.floor((ny - p.h / 2) / TILE) * TILE + TILE + p.h / 2 + 0.01;
        if (this.collideBox(p.x, p.y, p.w, p.h)) p.y = ny - p.vy * dt;
        p.blockU = true;
      }
      p.vy = 0;
    }
    if (!p.grounded && this.collideBox(p.x, p.y + 1, p.w, p.h) && p.vy >= 0) p.grounded = true;
    if (inp.up && this.collideBox(p.x, p.y - 1, p.w, p.h)) p.blockU = true;

    // landing
    if (p.grounded && !wasGrounded) {
      const fall = (p.y - p.fallFrom) / TILE;
      this.emit({ t: 'land', speed: prevVy });
      if (s.seismic > 0 && fall >= 4) {
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor((p.y + p.h / 2 + 2) / TILE);
        for (let dx = -1; dx <= 1; dx++) this.damageTile(tx + dx, ty, s.drillPower * 3 * s.seismic + fall * 2, 'seismic');
        this.emit({ t: 'quake', x: p.x, y: p.y + 8 });
      }
    }
    if (p.grounded || p.vy < 0) p.fallFrom = p.y;
    p.groundT = p.grounded ? 0 : p.groundT + dt;

    // ---- drilling
    let want: DrillDir = null;
    if (inp.down && (p.grounded || (p.groundT < COYOTE && p.vy < 120))) want = 'down';
    else if (dir > 0 && p.blockR) want = 'right';
    else if (dir < 0 && p.blockL) want = 'left';
    else if (inp.up && p.blockU) want = 'up';
    let target2: { x: number; y: number } | null = null;
    if (want) {
      const cx = Math.floor(p.x / TILE);
      const cy = Math.floor(p.y / TILE);
      if (want === 'down') target2 = { x: cx, y: Math.floor((p.y + p.h / 2 + 2) / TILE) };
      if (want === 'up') target2 = { x: cx, y: Math.floor((p.y - p.h / 2 - 2) / TILE) };
      if (want === 'right') target2 = { x: Math.floor((p.x + p.w / 2 + 2) / TILE), y: cy };
      if (want === 'left') target2 = { x: Math.floor((p.x - p.w / 2 - 2) / TILE), y: cy };
      // if the row under the player's centre is open but the feet row is blocked, aim at the blocking tile
      if ((want === 'left' || want === 'right') && target2 && !this.solidAt(target2.x, target2.y)) {
        const fy = Math.floor((p.y + p.h / 2 - 1) / TILE);
        const hy = Math.floor((p.y - p.h / 2) / TILE);
        if (this.solidAt(target2.x, fy)) target2.y = fy;
        else if (this.solidAt(target2.x, hy)) target2.y = hy;
      }
      // straddling two columns: drill whichever one is actually holding us up (or down)
      if ((want === 'down' || want === 'up') && target2 && !this.solidAt(target2.x, target2.y)) {
        const x0 = Math.floor((p.x - p.w / 2) / TILE);
        const x1 = Math.floor((p.x + p.w / 2 - 0.001) / TILE);
        for (const tx of [x0, x1]) if (this.solidAt(tx, target2.y)) target2.x = tx;
      }
    }
    // keep chewing the same tile while the direction is held, instead of hopping rows
    if (want && want === p.drill && p.drillTarget && this.solidAt(p.drillTarget.x, p.drillTarget.y)) {
      const lx = p.drillTarget.x * TILE + 8;
      const ly = p.drillTarget.y * TILE + 8;
      if (Math.abs(lx - p.x) <= 20 && Math.abs(ly - p.y) <= 20) target2 = { ...p.drillTarget };
    }
    if (target2 && this.solidAt(target2.x, target2.y)) {
      const def = TILES[this.tileAt(target2.x, target2.y)];
      if (p.drillTarget?.x !== target2.x || p.drillTarget?.y !== target2.y) p.drillTimer = Math.min(p.drillTimer, 0.5 / s.drillRate);
      p.drill = want;
      p.drillTarget = target2;
      const tx = target2.x;
      const ty = target2.y;
      const sealLocked = def.name === 'seal' && s.drillPower < this.sealNeed(ty);
      if (def.unbreakable || sealLocked) {
        p.drillTimer += dt;
        p.heat = Math.max(0, p.heat - dt * 1.2);
        if (p.drillTimer > 0.35) {
          p.drillTimer = 0;
          if (sealLocked) this.damageTile(tx, ty, 0, 'drill');
          else this.emit({ t: 'clank', x: tx * TILE + 8, y: ty * TILE + 8 });
        }
      } else {
        // the bit heats up while it keeps chewing, and spins faster
        p.heat = Math.min(1, p.heat + dt * 0.9);
        const rate = s.drillRate * (1 + p.heat * s.heatMax);
        const mult = def.ore ? s.oreMul : s.rockMul;
        const left = this.hp[ty * this.W + tx];
        if (p.plowCd <= 0 && left <= s.drillPower * s.plow * mult) {
          // overpowered: soft rock gives way on contact
          p.plowCd = 0.035;
          p.hitCount++;
          this.drillStrike(tx, ty, want!, Math.max(s.drillPower, left / mult + 0.01));
          p.drillTimer = 0;
        } else {
          p.drillTimer += dt;
          const interval = 1 / rate;
          while (p.drillTimer >= interval) {
            p.drillTimer -= interval;
            p.hitCount++;
            let dmg = s.drillPower;
            if (s.echoEvery > 0 && p.hitCount % s.echoEvery === 0) dmg *= 3;
            this.drillStrike(tx, ty, want!, dmg);
          }
        }
      }
      // centring assist so vertical shafts stay one tile wide
      if (want === 'down' || want === 'up') {
        const centre = target2.x * TILE + 8;
        const dx = centre - p.x;
        p.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt);
      }
    } else {
      p.drill = null;
      p.drillTarget = null;
      p.drillTimer = Math.max(0, p.drillTimer - dt);
      p.heat = Math.max(0, p.heat - dt * 1.2);
    }
    if (p.plowCd > 0) p.plowCd -= dt;

    if (p.flareCd > 0) p.flareCd -= dt;
    if (inp.flare && p.flareCd <= 0) this.doFlare(false);
    if (inp.bomb && p.dynamite > 0) {
      p.dynamite--;
      this.bombs.push({ id: this.id(), x: p.x, y: p.y - 4, vx: p.facing * 95 + p.vx * 0.5, vy: -150, fuse: 1.25 });
      this.emit({ t: 'bombThrow' });
    }
  }

  /** one bite of the drill: the target, plus the side tiles, the tile behind, or a full 3x3 */
  private drillStrike(tx: number, ty: number, dir: Exclude<DrillDir, null>, dmg: number) {
    const s = this.stats;
    const dx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
    this.damageTile(tx, ty, dmg, 'drill');
    if (s.excavator) {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        this.damageTile(tx + ox, ty + oy, dmg * s.wideBit, 'drill');
      }
    } else if (s.wideBit > 0) {
      if (dy !== 0) {
        this.damageTile(tx - 1, ty, dmg * s.wideBit, 'drill');
        this.damageTile(tx + 1, ty, dmg * s.wideBit, 'drill');
      } else {
        this.damageTile(tx, ty - 1, dmg * s.wideBit, 'drill');
        this.damageTile(tx, ty + 1, dmg * s.wideBit, 'drill');
      }
    }
    if (s.auger > 0) this.damageTile(tx + dx, ty + dy, dmg * s.auger, 'drill');
  }

  doFlare(free: boolean) {
    const p = this.player;
    const s = this.stats;
    if (!free) {
      p.flareCd = s.flareCooldown;
      this.flares++;
    }
    const r = s.flareRadius;
    this.emit({ t: 'flare', x: p.x, y: p.y, r });
    const tr = Math.ceil(r / TILE);
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    const depth = this.depth();
    for (let dy = -tr; dy <= tr; dy++) {
      for (let dx = -tr; dx <= tr; dx++) {
        const d = Math.hypot(dx, dy) * TILE;
        if (d > r) continue;
        const x = tx + dx;
        const y = ty + dy;
        const def = TILES[this.tileAt(x, y)];
        if (s.supernova && def.shards) {
          this.damageTile(x, y, 1e9, 'flare');
        } else {
          this.damageTile(x, y, s.flareDamage * (1 + depth / 150) * (1 - d / r * 0.6), 'flare');
        }
      }
    }
    this.addLight(0.5, 'flare');
  }

  // ---------------------------------------------------------------- shards
  private stepShards(dt: number) {
    for (const s of this.shards) {
      s.life -= dt;
      if (s.life <= 0) continue;
      const steps = 3;
      for (let k = 0; k < steps && s.life > 0; k++) {
        const nx = s.x + (s.vx * dt) / steps;
        const ny = s.y + (s.vy * dt) / steps;
        const tx = Math.floor(nx / TILE);
        const ty = Math.floor(ny / TILE);
        const tile = this.tileAt(tx, ty);
        if (TILES[tile].solid) {
          if (TILES[tile].unbreakable) {
            if (s.bounces > 0) {
              s.bounces--;
              if (Math.floor(s.x / TILE) !== tx) s.vx = -s.vx;
              else s.vy = -s.vy;
              continue;
            }
            s.life = 0;
            break;
          }
          const broke = this.damageTile(tx, ty, s.dmg, 'shard', s.gen + 1);
          if (broke && this.stats.prismHeart && s.gen < 2) {
            const a = Math.atan2(s.vy, s.vx);
            for (const da of [-0.5, 0.5]) {
              this.shards.push({ ...s, id: this.id(), x: tx * TILE + 8, y: ty * TILE + 8, vx: Math.cos(a + da) * 170, vy: Math.sin(a + da) * 170, life: 0.4, gen: s.gen + 1 });
            }
          }
          s.life = 0;
          break;
        }
        s.x = nx;
        s.y = ny;
      }
    }
    this.shards = this.shards.filter((s) => s.life > 0);
  }

  // --------------------------------------------------------------- pickups
  private stepPickups(dt: number) {
    const p = this.player;
    const mag = this.stats.magnet;
    for (const pk of this.pickups) {
      if (pk.done) continue;
      pk.age += dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (pk.age > 0.3 && (d < mag || pk.age > 6)) {
        const pull = 520 + (pk.age > 6 ? 400 : 0);
        pk.vx += (dx / (d + 0.01)) * pull * dt;
        pk.vy += (dy / (d + 0.01)) * pull * dt;
        pk.vx *= 0.9;
        pk.vy *= 0.9;
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
      } else {
        pk.vy += G * 0.7 * dt;
        pk.vx *= 0.98;
        const nx = pk.x + pk.vx * dt;
        const ny = pk.y + pk.vy * dt;
        if (this.solidPx(nx, pk.y)) pk.vx *= -0.4;
        else pk.x = nx;
        if (this.solidPx(pk.x, ny + 3)) {
          pk.vy *= -0.35;
          pk.vx *= 0.8;
        } else pk.y = ny;
      }
      if (d < 9 && pk.age > 0.15) this.collect(pk);
    }
    this.pickups = this.pickups.filter((pk) => !pk.done);
  }

  // ----------------------------------------------------------------- bombs
  private stepBombs(dt: number) {
    for (const b of this.bombs) {
      b.fuse -= dt;
      b.vy += G * dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      if (this.solidPx(nx, b.y)) b.vx *= -0.3;
      else b.x = nx;
      if (this.solidPx(b.x, ny + 3)) {
        b.vy *= -0.3;
        b.vx *= 0.7;
      } else b.y = ny;
      if (b.fuse <= 0) this.explode(b.x, b.y, 2.6 + this.stats.blastRadius, 60 * this.stats.blastMul * (1 + this.depth() / 120));
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);
  }

  // ----------------------------------------------------------------- rocks
  private stepRocks(dt: number) {
    const p = this.player;
    for (const r of this.rocks) {
      r.vy = Math.min(MAX_FALL, r.vy + G * dt);
      const ny = r.y + r.vy * dt;
      if (Math.abs(p.x - r.x) < 13 && Math.abs(p.y - ny) < 13 && r.vy > 60) {
        // the boulder bursts harmlessly on the hull, and there is a little something inside
        this.emit({ t: 'rockShatter', x: r.x, y: r.y });
        this.spawnPickup('gold', r.x, r.y, { gold: (2 + this.depth() * 0.1) * this.stats.goldMul });
        r.vy = -1; // marks destroyed
        continue;
      }
      const tx = Math.floor(r.x / TILE);
      const ty = Math.floor((ny + 8) / TILE);
      if (this.solidAt(tx, ty)) {
        const ry = ty - 1;
        if (!this.solidAt(tx, ry) && !(Math.abs(p.x - r.x) < 14 && Math.abs(p.y - (ry * TILE + 8)) < 14)) {
          this.setTile(tx, ry, T.boulder);
        }
        this.emit({ t: 'land', speed: r.vy * 0.5 });
        r.vy = -1;
        continue;
      }
      r.y = ny;
    }
    this.rocks = this.rocks.filter((r) => r.vy >= 0);
  }

  private stepDrones(dt: number) {
    const p = this.player;
    for (const d of this.drones) {
      d.angle += dt * 2.2;
      d.x = p.x + Math.cos(d.angle) * 22;
      d.y = p.y + Math.sin(d.angle) * 16;
      d.cd -= dt;
      if (d.cd <= 0) {
        d.cd = 0.55;
        // strike the closest solid tile in reach
        const tx = Math.floor(d.x / TILE);
        const ty = Math.floor(d.y / TILE);
        let best: [number, number] | null = null;
        let bd = 1e9;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          const def = TILES[this.tileAt(x, y)];
          if (!def.solid || def.unbreakable) continue;
          const dd = Math.hypot(x * TILE + 8 - d.x, y * TILE + 8 - d.y);
          if (dd < bd) {
            bd = dd;
            best = [x, y];
          }
        }
        if (best) this.damageTile(best[0], best[1], this.stats.drillPower * 0.7, 'drone');
      }
    }
  }
}
