/**
 * The deterministic game simulation. No Phaser, no DOM: the Run scene renders
 * it, bots and tests drive it headless.
 */
import { SKY_ROWS, STEP, TILE } from '../config';
import { biomeAt, SEAL_ROWS, SEALS } from '../data/biomes';
import { BOON_BY_ID, BoonDef, BOONS } from '../data/boons';
import { BASE_SHARD_DAMAGE, MAX_ACTIVE_SHARDS, MAX_PER_BURST, SHARD_BY_ID, ShardId, shardDepthScale } from '../data/shards';
import { ItemKind, T, TILES } from '../data/tiles';
import { computeStats, GloomMods, gloomMods, rockHp, hpCurve, rollBoons, xpForLevel } from './progression';
import { MILESTONE_FUEL } from './constants';
import { Rng } from './rng';
import { Stats } from './stats';
import { keyX, keyY, tileKey, World } from './world';
import { depthOfRow, finishedLayers, HEART_POS, NO_PROSPECT, Prospect, relicSites, rowOfDepth } from './worldgen';

export interface SimInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  shardBomb: boolean; // edge-triggered by the caller
  bomb: boolean; // dynamite; edge-triggered by the caller
}

export const NO_INPUT: SimInput = { left: false, right: false, up: false, down: false, shardBomb: false, bomb: false };

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
  /** Shard Bomb recharge left (s) */
  bombCd: number;
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
  type: ShardId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  color: number;
  bounces: number;
  /** tiles it can still break through */
  pierce: number;
  /** sparks thrown on first impact (ember) */
  burst: number;
  /** splits in two on first impact (prism) */
  split: boolean;
  /** thrown by an Echo Chain volley: it can never set off another echo */
  echo?: boolean;
  /** a prism shard that may still shatter the ore around its first impact (children cannot) */
  nova: boolean;
  /** curves toward ore and crystal (void) */
  seek: boolean;
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


export type SimEvent =
  | { t: 'tile'; x: number; y: number }
  | { t: 'hit'; x: number; y: number; tile: number; src: string }
  | { t: 'break'; x: number; y: number; tile: number; src: string; chain: number }
  | { t: 'pickup'; kind: ItemKind; gold: number; gems: number; cores: number; light: number; x: number; y: number }
  | { t: 'shard'; x: number; y: number; type: ShardId; n: number }
  | { t: 'dynamite'; x: number; y: number }
  | { t: 'shardBomb'; x: number; y: number }
  | { t: 'cataclysm'; x: number; y: number }
  | { t: 'cataclysmWarn'; x: number; y: number }
  | { t: 'lanternNova'; x: number; y: number }
  | { t: 'echo'; x: number; y: number }
  | { t: 'surgeArm' }
  | { t: 'surgeFire'; x: number; y: number; dir: string; n: number }
  | { t: 'nova'; x: number; y: number; n: number; tile: number }
  | { t: 'bombThrow' }
  | { t: 'levelup'; level: number }
  | { t: 'chainLink'; count: number }
  | { t: 'chainEnd'; count: number; pot: number; mult: number; bonus: number }
  | { t: 'land'; speed: number }
  | { t: 'quake'; x: number; y: number }
  | { t: 'rockShatter'; x: number; y: number }
  | { t: 'clank'; x: number; y: number }
  | { t: 'milestone'; id: string; name: string; x: number; y: number }
  | { t: 'geode'; x: number; y: number }
  | { t: 'relic'; id: string; x: number; y: number }
  | { t: 'heart'; x: number; y: number }
  | { t: 'secondWind' }
  | { t: 'boonEcho'; id: string }
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
  time: number;
  bestChain: number;
  bestPot: number;
  level: number;
  boons: Record<string, number>;
  /** Shard Bombs thrown */
  bombs: number;
  /** shards thrown this dig, by type (the Codex) */
  shardTypes: Partial<Record<ShardId, number>>;
  lightPickups: number;
  /** ore pieces mined this run, by kind */
  ores: Partial<Record<ItemKind, number>>;
  relics: string[];
  /** rune ribbons broken into this dig */
  seals: number;
  /** layers reached for the first time ever this dig */
  milestones: string[];
  geodes: number;
  reachedHeart: boolean;
  reason: EndReason;
}

export interface SimConfig {
  seed: number;
  upgrades: Record<string, number>;
  /** relics found on earlier digs (their perks apply, and they are not buried again) */
  relics?: string[];
  /** layers whose milestone (+max fuel) was claimed on earlier digs */
  milestones?: string[];
  /** QA only (dev builds, soak tests): start this many metres down instead of at the surface */
  debugDepth?: number;
  gloom: number;
  /** demo: the dig ends at the first rune ribbon depth */
  demo?: boolean;
}

const G = 900;
const MAX_FALL = 330;
const COYOTE = 0.09;
/** shards thrown by tiles that shards broke thin out as a chain grows past a few hundred links */
export const cascadeDamp = (chain: number) => 1 / (1 + Math.max(0, chain - 300) / 600);
/** tiles broken this many generations into a cascade throw no more shards */
const CASCADE_MAX_GEN = 8;
/** pickups this close home in at once; everything homes after AUTO_HOME seconds */
const AUTO_PULL = 30;
/** at most this many pickups fly at once; more are banked on the spot */
const MAX_PICKUPS = 180;
const AUTO_HOME = 2.5;
/** void shards turn at most this fast (rad/s): a curve, not an aimbot */
const STEER_RATE = 5;
const CRYSTAL_SHARDS = new Set<ShardId>(['glass', 'crystal', 'void', 'prism']);
const CORNER_ASSIST = [-1, -2, -3, -4, 1, 2, 3, 4];
const CORNER_ASSIST_AIR = [-1, -2, -3, -4, -5, -6, 1, 2, 3, 4, 5, 6];
/**
 * Chain pot multiplier for a chain of n links. It grows with the square root up
 * to 500 links, then only logarithmically, and a soft cap keeps it under x8 no
 * matter how long the chain or how many pot nodes you own.
 */
export const POT_KNEE = 500;
export const POT_MAX = 8;
export function potMultiplier(n: number, growth: number): number {
  const raw = 1 + growth * Math.sqrt(Math.min(n, POT_KNEE)) + growth * 4 * Math.log(Math.max(1, n / POT_KNEE));
  return 1 + (POT_MAX - 1) * (1 - Math.exp(-(raw - 1) / (POT_MAX - 1)));
}
/** a fast chain of drill breaks costs a little more fuel */
export const THROUGHPUT_WINDOW = 3;
export const THROUGHPUT_PER_BREAK = 0.015;
export const THROUGHPUT_MAX = 1.4;
/** chains cool off this much faster when the Wick stands still */
export const IDLE_CHAIN_DECAY = 3;
/** a tile a shard breaks this far from the Wick throws no further shards */
export const SHARD_LEASH = 12 * TILE;
/** links that arm a Surge, and the tiles it clears */
export const SURGE_LINKS = 75;
export const SURGE_LENGTH = 20;
/** a Prism Nova needs a chain this long, and reaches this far (tiles) */
export const NOVA_CHAIN = 50;
export const NOVA_RADIUS = 5;
/** the Cataclysm ring shows this long before the volley */
export const CATACLYSM_WARN = 0.5;
/** the most fuel shard breaks (Fuel Recycler, Shardlight) restore per second */
export const SHARD_FUEL_CAP = 2;
/** Overburn: this long, at twice the burn and twice the shard damage */
export const OVERBURN_SECONDS = 30;
/** Echo Chain: a chain this long echoes, a second later, and never within this many seconds of another echo */
export const ECHO_CHAIN = 20;
export const ECHO_DELAY = 1;
export const ECHO_COOLDOWN = 2;

/**
 * The lantern burns faster the deeper you are: about as forgiving as ever in the
 * Rootsoil, thirsty in the Grotto, ravenous at the Heart and below.
 */
export const DRAIN_K = 520;
export const DRAIN_P = 1.35;
export function drainCurve(depth: number): number {
  return 1 + Math.pow(Math.max(0, depth) / DRAIN_K, DRAIN_P);
}
/** fuel you earn by mining is worth less the deeper you are, so the deep stays a threat */
export const deepTaper = (depth: number) => 1 / (1 + Math.max(0, depth) / 700);
/** chain links refuel less the deeper you are and the longer the chain, so chains never make fuel endless */
export function chainRefuel(chainFuel: number, chain: number, depth: number): number {
  return ((chainFuel * 60) / (60 + chain)) * deepTaper(depth);
}
/** drilling with nothing breaking for this long, the lantern stops waiting */
export const STALL_GRACE = 2.5;
/** the most all drain reductions together can do */
export const DRAIN_FLOOR = 0.4;
export const STALL_MAX = 1.5;

export class Sim {
  /** the open world: generated chunk by chunk as the Wick goes */
  world: World;
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
  events: SimEvent[] = [];
  /** tile key -> relic id buried there */
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
  bombsUsed = 0;
  shardSpawned: Partial<Record<ShardId, number>> = {};
  lightPickups = 0;
  ores: Partial<Record<ItemKind, number>> = {};
  relicsFound: string[] = [];
  /** rune ribbon bands broken into this dig (by depth) */
  private ribbonsHit = new Set<number>();
  /** layers claimed on earlier digs, plus this one */
  milestonesClaimed: Set<string>;
  milestonesNow: string[] = [];
  geodesCracked = 0;
  reachedHeart = false;
  choices: BoonDef[] | null = null;
  pendingLevels = 0;
  over = false;
  endReason: EndReason = 'dark';
  /** seconds until the dig ends after the Heart breaks */
  private heartEndT = -1;
  private nextId = 1;
  /** tiles that shatter on a timer (seal waves, the heart, Supernova) */
  private breakQueue: { x: number; y: number; delay: number; src?: string }[] = [];
  /** links counted toward the next Surge (clears do not count) */
  surgeLinks = 0;
  /** a Surge is armed and fires on the next drill break */
  surgeArmed = false;
  private surgeArmedAt = 0;
  surgesFired = 0;
  novasFired = 0;
  /** seconds of Overburn left (twice the burn, twice the shard damage) */
  overburnT = 0;
  /** Lantern Nova has gone off this dig */
  lanternNovaUsed = false;
  /** seconds until a queued Echo Chain volley fires, and where from */
  private echoT = 0;
  private echoAt = { x: 0, y: 0 };
  /** when an echo shard last broke something (no echo of an echo) */
  private echoLastT = -99;
  /** an echo shard broke something during this chain: the chain cannot echo */
  private echoInChain = false;
  echoesFired = 0;
  /** seconds until a warned Cataclysm volley erupts (0 = none) */
  private cataclysmT = 0;
  secondWindsUsed = 0;
  /** when the last tile broke (for the stall drain) */
  lastBreakT = 0;
  /** is the Wick standing still, not drilling? (chains cool off) */
  idle = false;
  /** recent drill breaks, for the throughput drain */
  private drillBreakTimes: number[] = [];
  private drillBreaks = 0;
  private shardBreaks = 0;
  /** fuel shard breaks may still restore right now (refills at SHARD_FUEL_CAP per second) */
  private shardFuelBudget = SHARD_FUEL_CAP;
  /** tiles broken, by what broke them (balance telemetry) */
  breaksBy: Record<string, number> = {};
  /** seconds and fuel burned inside a chain and outside one (balance telemetry) */
  drainSplit = { chainT: 0, chainFuel: 0, freeT: 0, freeFuel: 0 };
  /** current stall drain multiplier (1 = not stalled) */
  stallMul = 1;
  private currentBiome = '';

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.gloom = gloomMods(cfg.gloom);
    this.baseUpgrades = cfg.upgrades;
    this.relicsKnown = [...(cfg.relics ?? [])];
    this.milestonesClaimed = new Set(cfg.milestones ?? []);
    this.stats = this.recompute();
    this.heart = { ...HEART_POS };
    const sites = relicSites(cfg.seed, this.relicsKnown, this.prospect().relicSense);
    for (const r of sites) this.relicAt.set(tileKey(r.x, r.y), r.id);
    this.world = new World(
      { seed: cfg.seed, relics: sites, doneLayers: finishedLayers(this.relicsKnown) },
      () => this.prospect(),
      (tile, row) => this.tileHp(tile, row),
    );
    this.rerolls = this.stats.rerolls;
    this.banishes = this.stats.banishes;
    // every dig starts at the surface, at the shaft (x = 0)
    this.player = {
      x: 0, y: (SKY_ROWS - 1) * TILE + TILE - 6, vx: 0, vy: 0, w: 12, h: 12, facing: 1, grounded: false,
      blockL: false, blockR: false, blockU: false, drill: null, drillTimer: 0, drillTarget: null, hitCount: 0,
      bombCd: 0, fallFrom: 0, thrusting: false, dynamite: this.stats.dynamite, thrustT: 0, groundT: 0, heat: 0, plowCd: 0,
    };
    if (cfg.debugDepth && cfg.debugDepth > 0) {
      const row = rowOfDepth(cfg.debugDepth);
      for (let y = row - 2; y <= row; y++) for (let x = -2; x <= 1; x++) if (!TILES[this.world.get(x, y)].unbreakable) this.world.set(x, y, T.air);
      this.player.y = row * TILE + TILE - 6;
    }
    this.player.fallFrom = this.player.y;
    this.light = this.stats.maxLight;
    for (let i = 0; i < this.stats.headStart; i++) {
      const commons = BOONS.filter((b) => b.rarity === 'common' && (this.boons[b.id] ?? 0) < b.max);
      if (commons.length) this.applyBoon(this.rng.pick(commons), true);
    }
  }

  // ---------------------------------------------------------------- helpers
  /** world-shaping stats for chunks generated from now on */
  prospect(): Prospect {
    return this.stats?.prospect ?? NO_PROSPECT;
  }

  /** stats from the Workshop, relics, this dig's boons and the layer milestones claimed so far */
  private recompute(): Stats {
    return computeStats(this.baseUpgrades, this.boons, this.relicsKnown, this.milestonesClaimed.size);
  }

  /**
   * Hit points of a tile at a row. Rock gets harder along one smooth curve of
   * depth (no step at a layer boundary); ore keeps its toughness relative to the
   * rock around it; rune ribbons are a little tougher than the rock they sit in.
   */
  tileHp(tile: number, row: number): number {
    const def = TILES[tile];
    if (def.unbreakable || def.hp <= 0) return def.hp;
    const depth = depthOfRow(row);
    if (tile === T.seal) return rockHp(depth) * 1.2 * this.gloom.rockMul;
    return def.hp * hpCurve(depth) * this.gloom.rockMul;
  }

  /** below the Heart, ore keeps getting richer the deeper it lies */
  valueScale(depth: number): number {
    return 1 + Math.max(0, depth - 1500) / 300;
  }

  /** nearest unfound relic within reach (for the Survey Lamp's pointer) */
  nearestRelic(maxRows = 80): { x: number; y: number; dist: number } | null {
    const px = this.player.x / TILE;
    const py = this.player.y / TILE;
    let best: { x: number; y: number; dist: number } | null = null;
    for (const [k] of this.relicAt) {
      const x = keyX(k);
      const y = keyY(k);
      if (Math.abs(y - py) > maxRows) continue;
      if (this.world.has(Math.floor(x / 32), Math.floor(y / 32)) && this.world.get(x, y) !== T.relic) continue;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (!best || d < best.dist) best = { x: x * TILE + 8, y: y * TILE + 8, dist: d };
    }
    return best;
  }

  depth(): number {
    return Math.max(0, Math.floor(this.player.y / TILE) - SKY_ROWS);
  }

  tileAt(x: number, y: number): number {
    return this.world.get(x, y);
  }

  /** remaining hit points of a tile */
  hpAt(x: number, y: number): number {
    return this.world.hp(x, y);
  }

  /** was this cell open cave when it was generated? */
  naturalAirAt(x: number, y: number): boolean {
    return this.world.natural(x, y);
  }

  solidAt(x: number, y: number): boolean {
    return TILES[this.tileAt(x, y)].solid;
  }

  solidPx(px: number, py: number): boolean {
    return this.solidAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** the playstyle gold engines: a big lantern (Lanternkeeper) and a full hand of boons (Trickster) */
  engineGold(): number {
    const held = Object.values(this.boons).reduce((a, b) => a + b, 0);
    return (1 + this.stats.lanternGold * (this.stats.maxLight / 100)) * (1 + this.stats.boonGold * held);
  }

  /** fuel burned per second right now (depth, pressure, stall and Last Light included) */
  drainRate(): number {
    // drain reductions stack, but never below DRAIN_FLOOR: the deep always bites
    let drain = Math.max(DRAIN_FLOOR, this.stats.lightDrain) * this.gloom.drainMul * drainCurve(this.depth()) * this.stallMul * this.throughputMul();
    if (this.stats.lastLight && this.lightFrac() < 0.25) drain *= 0.5;
    if (this.overburnT > 0) drain *= 2;
    return drain;
  }

  /** drill breaks in the last few seconds make the lantern burn a little faster (shard breaks do not count) */
  throughputMul(): number {
    const perSec = this.drillBreakTimes.length / THROUGHPUT_WINDOW;
    return Math.min(THROUGHPUT_MAX, 1 + THROUGHPUT_PER_BREAK * perSec);
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

  // ------------------------------------------------------------- tile damage
  setTile(x: number, y: number, tile: number) {
    if (y < 0) return;
    this.world.set(x, y, tile);
    this.emit({ t: 'tile', x, y });
  }

  /**
   * Damage a tile. Everything that breaks rock is the drill, a shard or a
   * seismic landing: there is no other damage path, and nothing is a wall.
   */
  damageTile(x: number, y: number, dmg: number, src: 'drill' | 'shard' | 'seismic', gen = 0, by?: ShardId): boolean {
    const tile = this.tileAt(x, y);
    const def = TILES[tile];
    if (tile === T.air || def.unbreakable) return false;
    const mult = def.ore ? this.stats.oreMul : this.stats.rockMul;
    if (src === 'shard' && def.ore) dmg *= this.stats.shardOreMul;
    const left = this.world.hp(x, y) - dmg * mult;
    this.world.setHp(x, y, left);
    if (left <= 0) {
      this.breakTile(x, y, src, gen, by);
      return true;
    }
    this.emit({ t: 'hit', x, y, tile, src });
    return false;
  }

  private breakTile(x: number, y: number, src: string, gen: number, by?: ShardId) {
    const tile = this.tileAt(x, y);
    const def = TILES[tile];
    this.world.set(x, y, T.air);
    this.lastBreakT = this.time;
    // every cascade break is a link, and so is every drill break: the drill keeps the chain going
    const cascade = src === 'shard' || src === 'wave';
    const fromDrill = src === 'drill';
    const fromClear = src === 'clear';
    const valuable = this.isValuable(tile) || tile === T.seal || tile === T.geode;
    const linked = cascade || valuable || fromDrill || fromClear;
    this.breaksBy[src] = (this.breaksBy[src] ?? 0) + 1;
    if (linked) this.link(fromDrill, fromClear);
    const p = this.player;
    // a shard that breaks something far from the Wick sets nothing else off: the chain needs you nearby
    // (a board clear is the same: it pays out and links, but it never throws shards of its own)
    const leashed = fromClear || (src === 'shard' && Math.hypot(x * TILE + 8 - p.x, y * TILE + 8 - p.y) > SHARD_LEASH);
    if (fromDrill) {
      this.drillBreak();
      if (this.surgeArmed && this.drillBreaks > this.surgeArmedAt) this.fireSurge(x, y);
    }
    if (src === 'shard') this.shardBreak(depthOfRow(y));
    this.emit({ t: 'tile', x, y });
    this.emit({ t: 'break', x, y, tile, src, chain: linked ? this.chain : 0 });
    // plain rock knocked loose by a cascade teaches you little: XP comes from what you dig and what you find
    this.gainXp(cascade && !valuable ? def.xp * 0.15 : def.xp);
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
      const goldMul = this.stats.goldMul * this.valueScale(depth) * (1 + this.stats.deepPockets * depth / 100) * this.gloom.goldMul * this.engineGold();
      for (let k = 0; k < count; k++) this.spawnPickup(def.drop.kind, cx, cy, { gold: per * goldMul });
      if (this.chain > 0) this.potGold += per * goldMul * count;
      this.ores[def.drop.kind] = (this.ores[def.drop.kind] ?? 0) + count;
      if (this.stats.kindling > 0) this.addLight(this.stats.kindling * deepTaper(depth), 'kindling');
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
    if (tile === T.relic) this.findRelic(tileKey(x, y), cx, cy);
    if (tile === T.geode) {
      this.geodesCracked++;
      this.emit({ t: 'geode', x: cx, y: cy });
    }
    if (tile === T.seal) this.ribbonBreak(x, y, cx, cy, depth, gen);
    if (tile === T.worldheart) this.breakHeart(cx, cy);
    // shard sources: everything resolves through spawnShards
    if (leashed) {
      // too far from the Wick: the tile still pays out, but sets nothing else off
    } else if (tile === T.geode) this.geodeVolley(cx, cy, depth, gen);
    else if (def.shards) this.spawnShards(cx, cy, def.shardType ?? 'glass', def.shards, { power: def.shardPower, gen });
    // fault shards never crack more fault lines: plain rock would cascade forever
    else if (!def.ore && !def.light && tile !== T.seal && by !== 'fault' && gen <= 1 && this.stats.faultChance > 0 && this.rng.chance(Math.min(0.3, this.stats.faultChance))) {
      this.spawnShards(cx, cy, 'fault', 2, { gen });
    }
    if (!leashed && def.ore && by !== 'vein' && this.stats.veinRupture > 0 && this.rng.chance(Math.min(0.9, this.stats.veinRupture))) this.rupture(x, y, tile);
    // something above may fall
    this.checkFall(x, y - 1);
  }

  isValuable(tile: number): boolean {
    const d = TILES[tile];
    return !!(d.ore || d.shards || d.gems || tile === T.relic || tile === T.worldheart);
  }

  /** a drill break: every tenth throws a cone of glass shards the way the drill is pointing */
  private drillBreak() {
    this.drillBreaks++;
    this.drillBreakTimes.push(this.time);
    if (this.drillBreaks % Math.max(3, Math.round(this.stats.drillShardEvery)) === 0) this.drillVolley();
    if (this.stats.glassHarvest > 0 && this.rng.chance(this.stats.glassHarvest)) this.drillVolley(2);
  }

  /** glass shards from the drill: along its direction, or toward a valuable tile just ahead */
  private drillVolley(n?: number) {
    const p = this.player;
    const s = this.stats;
    const dir = p.drill;
    if (!dir) return;
    let a = dir === 'right' ? 0 : dir === 'left' ? Math.PI : dir === 'down' ? Math.PI / 2 : -Math.PI / 2;
    // drilling next to ore nudges the volley toward it
    const px = Math.floor(p.x / TILE);
    const py = Math.floor(p.y / TILE);
    let bd = 1e9;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (!this.isValuable(this.tileAt(px + dx, py + dy))) continue;
      const d = dx * dx + dy * dy;
      if (d > 0 && d < bd) {
        bd = d;
        a = Math.atan2(dy, dx);
      }
    }
    const count = n ?? 2 + Math.round(s.shardBonus / 2) + s.drillShardBonus;
    this.spawnShards(p.x, p.y, 'glass', count, { angle: a, spread: 0.9, exact: true });
  }

  /** a shard break: Fuel Recycler restores a little fuel, inside the shared per-second cap */
  private shardBreak(depth: number) {
    this.shardBreaks++;
    if (this.stats.shardFuel > 0) this.shardFuel(this.stats.shardFuel * deepTaper(depth), 'recycler');
    if (this.stats.shardlight > 0 && this.shardBreaks % 10 === 0) this.shardFuel(this.stats.shardlight * deepTaper(depth), 'shardlight');
  }

  /** every fuel source that comes from shard breaks goes through here: tapered by the caller, capped at SHARD_FUEL_CAP per second */
  shardFuel(amount: number, src: string) {
    const give = Math.min(amount, this.shardFuelBudget);
    if (give <= 0) return;
    this.shardFuelBudget -= give;
    this.addLight(give, src);
  }

  private link(fromDrill = false, clear = false) {
    this.chain++;
    // 75 fresh links arm a Surge (only one charge at a time; board clears never count)
    if (!clear && !this.surgeArmed && ++this.surgeLinks >= SURGE_LINKS) {
      this.surgeLinks = 0;
      this.surgeArmed = true;
      // it fires on the next drill break after this one
      this.surgeArmedAt = this.drillBreaks + (fromDrill ? 1 : 0);
      this.emit({ t: 'surgeArm' });
    }
    // standing still, a chain cools off fast; every drill break buys a little extra time
    const base = this.stats.chainTime * (this.idle ? 1 / IDLE_CHAIN_DECAY : 1);
    this.chainTimer = fromDrill ? Math.min(this.stats.chainTime * 2, base + 0.25 + this.stats.chainKeeper) : base;
    this.bestChain = Math.max(this.bestChain, this.chain);
    // long chains refuel a little less per link, so a dig still ends
    this.addLight(chainRefuel(this.stats.chainFuel, this.chain, this.depth()), 'chain');
    this.emit({ t: 'chainLink', count: this.chain });
    if (this.stats.resonance > 0) {
      this.chainLinksForResonance++;
      if (this.chainLinksForResonance >= 10) {
        this.chainLinksForResonance = 0;
        this.addLight(this.stats.resonance * deepTaper(this.depth()) * (60 / (60 + this.chain)) * 3, 'resonance');
      }
    }
    if (this.stats.cataclysm) {
      this.chainLinksForCataclysm++;
      if (this.chainLinksForCataclysm >= this.stats.cataclysmEvery) {
        this.chainLinksForCataclysm = 0;
        this.warnCataclysm();
      }
    }
  }

  /** pay out the chain pot: every coin mined during the chain, times the chain multiplier */
  private cashOut() {
    if (this.chain >= 3) {
      const mult = potMultiplier(this.chain, this.stats.chainPot);
      const bonus = this.potGold * (mult - 1);
      this.gold += bonus;
      // Midas Lamp: a big pot also pays out in gems
      if (this.stats.midas) this.gems += Math.min(25, Math.floor(bonus / 400));
      this.bestPot = Math.max(this.bestPot, this.potGold + bonus);
      // Midas Lamp: a paid-out pot throws a volley of shards
      if (this.stats.midas && !this.over) this.spawnShards(this.player.x, this.player.y, 'glass', 4, { gen: 1 });
      this.emit({ t: 'chainEnd', count: this.chain, pot: this.potGold, mult, bonus });
    }
    // Echo Chain: a long chain's end is answered by one echo volley, never by an echo of an echo
    if (
      this.stats.echoChain && this.chain >= ECHO_CHAIN && !this.over && this.echoT <= 0 && !this.echoInChain &&
      this.time - this.echoLastT > ECHO_COOLDOWN && !this.shards.some((s) => s.echo)
    ) {
      this.echoT = ECHO_DELAY;
      this.echoAt = { x: this.player.x, y: this.player.y };
    }
    this.chain = 0;
    this.chainTimer = 0;
    this.potGold = 0;
    this.echoInChain = false;
  }

  /** the echo volley: glass shards from where the chain ended, each flagged so they cannot echo again */
  private fireEcho() {
    const { x, y } = this.echoAt;
    this.echoesFired++;
    this.emit({ t: 'echo', x, y });
    const n = this.spawnShards(x, y, 'glass', 12, { exact: true, gen: 1 });
    for (const s of this.shards.slice(this.shards.length - n)) s.echo = true;
  }

  /** Lantern Nova: once a dig, when the fuel is nearly gone, a burst of shards and a little light */
  private lanternNova() {
    this.lanternNovaUsed = true;
    const p = this.player;
    this.emit({ t: 'lanternNova', x: p.x, y: p.y });
    this.spawnShards(p.x, p.y, 'glass', 18, { exact: true, power: BASE_SHARD_DAMAGE * 2.5 });
    this.addLight(15 * deepTaper(this.depth()), 'lanternnova');
  }

  private findRelic(k: number, cx: number, cy: number) {
    const id = this.relicAt.get(k);
    if (!id) return;
    this.relicAt.delete(k);
    this.relicsFound.push(id);
    this.relicsKnown.push(id);
    this.stats = this.recompute();
    this.light = Math.min(this.light, this.stats.maxLight);
    this.emit({ t: 'relic', id, x: cx, y: cy });
  }

  /** a rune ribbon tile gives way: a little gold and a rune shard, never a barrier */
  private ribbonBreak(x: number, y: number, cx: number, cy: number, depth: number, gen: number) {
    const sl = SEALS.find((r) => depth >= r.depth && depth < r.depth + SEAL_ROWS);
    if (sl) this.ribbonsHit.add(sl.depth);
    const g = (6 + depth * 0.06) * this.stats.goldMul * this.gloom.goldMul;
    this.spawnPickup('gold', cx, cy, { gold: g });
    if (this.chain > 0) this.potGold += g;
    if (this.rng.chance(0.6)) this.spawnShards(cx, cy, 'rune', 1, { gen });
    void x;
    void y;
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
    this.spawnShards(cx, cy, 'prism', 24, { power: 40 });
  }

  /** Vein Rupture: the whole connected vein throws vein shards and tears itself apart */
  private rupture(x: number, y: number, tile: number) {
    const seen = new Set<number>();
    const stack = [[x, y]];
    const hits: [number, number][] = [];
    while (stack.length && hits.length < 40) {
      const [cx, cy] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const k = tileKey(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.tileAt(nx, ny) === tile) {
          hits.push([nx, ny]);
          stack.push([nx, ny]);
        }
      }
    }
    // each vein shard bursts out of its own ore (enough to break it), then flies on
    const power = this.tileHp(tile, y) * 1.05;
    const per = 1 + Math.floor(this.stats.shardBonus / 3);
    for (const [hx, hy] of hits) this.spawnShards(hx * TILE + 8, hy * TILE + 8, 'vein', per, { power, exact: true, flat: true });
  }

  private checkFall(x: number, y: number) {
    if (this.tileAt(x, y) !== T.boulder) return;
    if (this.solidAt(x, y + 1)) return;
    this.world.set(x, y, T.air);
    this.emit({ t: 'tile', x, y });
    this.rocks.push({ id: this.id(), x: x * TILE + 8, y: y * TILE + 8, vy: 0 });
  }

  /**
   * The one shard funnel. Every source (crystals, embers, cinnabar, geodes,
   * veins, faults, Cataclysm, the Shard Bomb, dynamite, the Heart) throws its
   * shards through here, so every global shard stat improves every type.
   * Returns how many shards were actually thrown.
   */
  spawnShards(
    cx: number, cy: number, id: ShardId, base: number,
    o: { power?: number; gen?: number; angle?: number; spread?: number; exact?: boolean; burst?: boolean; flat?: boolean } = {},
  ): number {
    const type = SHARD_BY_ID[id];
    const s = this.stats;
    let count = o.exact ? base : base + s.shardBonus;
    if (!o.exact && (o.burst ?? type.burstSource)) count *= 1 + s.burstBonus;
    const gen = o.gen ?? 0;
    if (gen > 0) {
      // a cascade set off by shards: the rock is spent after a while, so it burns out instead of running forever
      if (gen > CASCADE_MAX_GEN) return 0;
      count *= cascadeDamp(this.chain);
    }
    count = Math.round(count);
    if (count <= 0) return 0;
    const n = Math.max(0, Math.min(count, MAX_PER_BURST, MAX_ACTIVE_SHARDS - this.shards.length));
    if (n === 0) return 0;
    // past the caps, the extra shards' damage goes into the ones that fly
    const overflow = count / n;
    const depth = depthOfRow(Math.floor(cy / TILE));
    let dmg = (o.power ?? BASE_SHARD_DAMAGE) * (s.shardDamage / BASE_SHARD_DAMAGE) * type.dmgMul * overflow;
    if (!o.flat) dmg *= shardDepthScale(depth);
    if (id === 'cinnabar') dmg *= s.cinnabarMul;
    if (this.overburnT > 0) dmg *= 2;
    const full = (o.spread ?? Math.PI * 2) >= Math.PI * 2 - 1e-6;
    const a0 = o.angle ?? this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = full ? a0 + (k / n) * Math.PI * 2 + this.rng.range(-0.2, 0.2) : a0 + ((n > 1 ? k / (n - 1) : 0.5) - 0.5) * o.spread! + this.rng.range(-0.1, 0.1);
      const sp = this.rng.range(150, 210) * type.speedMul * s.shardSpeed;
      this.shards.push({
        id: this.id(), type: id, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: type.life, dmg, color: type.color,
        bounces: s.ricochet, pierce: type.pierce + s.shardPierce, burst: type.burst ? type.burst + s.emberSplit : 0, split: type.split,
        seek: type.seek, gen: o.gen ?? 0, nova: id === 'prism',
      });
    }
    this.shardSpawned[id] = (this.shardSpawned[id] ?? 0) + n;
    this.emit({ t: 'shard', x: cx, y: cy, type: id, n });
    if (s.supernova && n >= 6) this.supernova(cx, cy);
    return n;
  }

  /** a cracked geode vault: geode shards and the crystal it was filled with */
  private geodeVolley(cx: number, cy: number, depth: number, gen: number) {
    const fill = TILES[biomeAt(depth).geodeFill];
    this.spawnShards(cx, cy, 'geode', 3, { gen });
    this.spawnShards(cx, cy, fill.shardType ?? 'glass', 3, { gen, power: fill.shardPower, burst: true });
  }

  /** the chain is about to erupt: a ring warns first, the volley follows half a second later */
  private warnCataclysm() {
    if (this.cataclysmT > 0) return;
    this.cataclysmT = CATACLYSM_WARN;
    this.emit({ t: 'cataclysmWarn', x: this.player.x, y: this.player.y });
  }

  /** Surge: the next drill break clears a line of tiles in the direction the drill points */
  private fireSurge(x: number, y: number) {
    const dir = this.player.drill;
    if (!dir) return;
    this.surgeArmed = false;
    this.surgesFired++;
    const dx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
    const dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
    let n = 0;
    for (let k = 1; k <= SURGE_LENGTH; k++) {
      const tx = x + dx * k;
      const ty = y + dy * k;
      const def = TILES[this.tileAt(tx, ty)];
      if (!def.solid || def.unbreakable) continue;
      if (this.tileAt(tx, ty) === T.worldheart) continue;
      this.queueClear(tx, ty, 0.03 + k * 0.025);
      n++;
    }
    this.emit({ t: 'surgeFire', x: x * TILE + 8, y: y * TILE + 8, dir, n });
  }

  private queueClear(x: number, y: number, delay: number) {
    if (this.breakQueue.some((b) => b.x === x && b.y === y)) return;
    this.breakQueue.push({ x, y, delay, src: 'clear' });
  }

  /** Prism Nova: a prism shard's first hit, deep in a chain, shatters the most common ore around it */
  private prismNova(tx: number, ty: number) {
    const counts = new Map<number, number>();
    for (let dy = -NOVA_RADIUS; dy <= NOVA_RADIUS; dy++) for (let dx = -NOVA_RADIUS; dx <= NOVA_RADIUS; dx++) {
      if (dx * dx + dy * dy > NOVA_RADIUS * NOVA_RADIUS) continue;
      const t = this.tileAt(tx + dx, ty + dy);
      if (TILES[t].ore && !TILES[t].unbreakable) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    let best = -1;
    let bn = 0;
    for (const [t, c] of counts) if (c > bn) {
      best = t;
      bn = c;
    }
    if (best < 0) return;
    this.novasFired++;
    for (let dy = -NOVA_RADIUS; dy <= NOVA_RADIUS; dy++) for (let dx = -NOVA_RADIUS; dx <= NOVA_RADIUS; dx++) {
      if (dx * dx + dy * dy > NOVA_RADIUS * NOVA_RADIUS) continue;
      if (this.tileAt(tx + dx, ty + dy) === best) this.queueClear(tx + dx, ty + dy, 0.04 + Math.hypot(dx, dy) * 0.045);
    }
    this.emit({ t: 'nova', x: tx * TILE + 8, y: ty * TILE + 8, n: bn, tile: best });
  }

  /** Cataclysm: the chain itself erupts in a storm of shards around the Wick */
  private cataclysmVolley() {
    const p = this.player;
    this.emit({ t: 'cataclysm', x: p.x, y: p.y });
    // the chain feeds it, so it thins out like any cascade (otherwise it would feed itself forever)
    this.spawnShards(p.x, p.y, 'cataclysm', 10, { power: BASE_SHARD_DAMAGE * 1.4, gen: 1 });
    this.spawnShards(p.x, p.y, 'ember', 4, { power: 20, gen: 1 });
  }

  /** the Shard Bomb: a burst of glass shards that carries every shard upgrade */
  fireShardBomb() {
    const p = this.player;
    const s = this.stats;
    p.bombCd = Math.max(2, s.bombCooldown);
    this.bombsUsed++;
    this.emit({ t: 'shardBomb', x: p.x, y: p.y });
    // the bomb counts every +shard twice: it is the player's own burst
    this.spawnShards(p.x, p.y, 'glass', 8 + s.shardBonus, { power: BASE_SHARD_DAMAGE * 1.6, burst: true });
  }

  /** Supernova: a big burst shatters every crystal around it, in a quick ripple */
  private supernova(cx: number, cy: number) {
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5) continue;
      const def = TILES[this.tileAt(tx + dx, ty + dy)];
      if (!def.shards || !CRYSTAL_SHARDS.has(def.shardType ?? 'glass')) continue;
      if (this.breakQueue.some((b) => b.x === tx + dx && b.y === ty + dy)) continue;
      this.breakQueue.push({ x: tx + dx, y: ty + dy, delay: 0.05 + Math.hypot(dx, dy) * 0.04 });
    }
  }

  // ----------------------------------------------------------------- pickups
  spawnPickup(kind: ItemKind, x: number, y: number, v: { gold?: number; gems?: number; cores?: number; light?: number }) {
    const a = this.rng.range(-Math.PI * 0.85, -Math.PI * 0.15);
    const sp = this.rng.range(50, 110);
    const pk: Pickup = {
      id: this.id(), kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      gold: v.gold ?? 0, gems: v.gems ?? 0, cores: v.cores ?? 0, light: v.light ?? 0, age: 0, done: false,
    };
    // in a huge cascade the air is already full of loot: bank the rest straight away
    if (this.pickups.length >= MAX_PICKUPS) this.collect(pk);
    else this.pickups.push(pk);
  }

  private collect(pk: Pickup) {
    pk.done = true;
    this.gold += pk.gold;
    this.gems += pk.gems;
    this.cores += pk.cores;
    if (pk.light) {
      this.addLight(pk.light * deepTaper(this.depth()), 'orb');
      this.lightPickups++;
    }
    this.emit({ t: 'pickup', kind: pk.kind, gold: pk.gold, gems: pk.gems, cores: pk.cores, light: pk.light, x: pk.x, y: pk.y });
  }

  /** light gained per source (balance telemetry) */
  lightLog: Record<string, number> = {};

  addLight(v: number, src = 'other') {
    this.lightLog[src] = (this.lightLog[src] ?? 0) + Math.max(0, Math.min(v, this.stats.maxLight - this.light));
    this.light = Math.min(this.stats.maxLight, this.light + v);
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

  /** the first time a layer is ever reached: a fanfare, a burst of shards and a little more fuel for good */
  private claimMilestone(id: string, name: string) {
    if (this.milestonesClaimed.has(id)) return;
    this.milestonesClaimed.add(id);
    this.milestonesNow.push(id);
    this.stats = this.recompute();
    const p = this.player;
    this.emit({ t: 'milestone', id, name, x: p.x, y: p.y });
    this.addLight(MILESTONE_FUEL, 'milestone');
    this.spawnShards(p.x, p.y, 'crystal', 10, { power: BASE_SHARD_DAMAGE * 1.5, gen: 1 });
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
    // Boon Echo: sometimes a pick is taken twice
    if (this.stats.boonEcho > 0 && (this.boons[def.id] ?? 0) < def.max && this.rng.chance(this.stats.boonEcho)) {
      this.applyBoon(def, false);
      this.emit({ t: 'boonEcho', id: def.id });
    }
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
    this.stats = this.recompute();
    if (def.onPick === 'overburn') this.overburnT = OVERBURN_SECONDS;
    void prevMax;
    this.light = Math.min(this.light, this.stats.maxLight);
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
    this.idle = p.drill === null && p.grounded && !input.left && !input.right && !input.up && !input.down;
    this.shardFuelBudget = Math.min(SHARD_FUEL_CAP, this.shardFuelBudget + SHARD_FUEL_CAP * dt);
    while (this.drillBreakTimes.length && this.drillBreakTimes[0] < this.time - THROUGHPUT_WINDOW) this.drillBreakTimes.shift();

    // light drain
    // drilling and breaking nothing (no chain alive either): the lantern won't wait
    const stalled = p.drill !== null && this.chain === 0 && this.time - this.lastBreakT > STALL_GRACE;
    const target = stalled ? Math.min(STALL_MAX, 1 + (this.time - this.lastBreakT - STALL_GRACE) * (STALL_MAX - 1)) : 1;
    this.stallMul += (target - this.stallMul) * Math.min(1, dt * 6);
    const burn = this.drainRate() * dt;
    this.light -= burn;
    if (this.chain > 0) {
      this.drainSplit.chainT += dt;
      this.drainSplit.chainFuel += burn;
    } else {
      this.drainSplit.freeT += dt;
      this.drainSplit.freeFuel += burn;
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
      if (this.currentBiome !== '') {
        this.emit({ t: 'biome', id: biome.id, name: biome.name });
        this.claimMilestone(biome.id, biome.name);
      }
      this.currentBiome = biome.id;
    }
    if (this.cfg.demo && d >= SEALS[0].depth && !this.over) this.endRun('quit');

    // chain timer
    // the chain holds while the drill is chewing something valuable
    const chewing = p.drillTarget && this.isValuable(this.tileAt(p.drillTarget.x, p.drillTarget.y));
    if (this.chainTimer > 0) {
      if (!chewing) this.chainTimer -= dt * (this.idle ? IDLE_CHAIN_DECAY : 1);
      if (this.chainTimer <= 0) this.cashOut();
    }
    if (this.echoT > 0) {
      this.echoT -= dt;
      if (this.echoT <= 0) this.fireEcho();
    }
    if (this.overburnT > 0) this.overburnT = Math.max(0, this.overburnT - dt);
    if (this.stats.lanternNova && !this.lanternNovaUsed && this.lightFrac() < 0.25) this.lanternNova();
    if (this.cataclysmT > 0) {
      this.cataclysmT -= dt;
      if (this.cataclysmT <= 0) this.cataclysmVolley();
    }
    // timed shatters (the heart, Supernova, board clears)
    for (let i = this.breakQueue.length - 1; i >= 0; i--) {
      const b = this.breakQueue[i];
      b.delay -= dt;
      if (b.delay <= 0) {
        this.breakQueue.splice(i, 1);
        if (TILES[this.tileAt(b.x, b.y)].solid) this.breakTile(b.x, b.y, b.src ?? 'wave', 0);
      }
    }

    this.stepShards(dt);
    this.stepPickups(dt);
    this.stepBombs(dt);
    this.stepRocks(dt);
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
      time: this.time, bestChain: this.bestChain, bestPot: Math.round(this.bestPot), level: this.level, boons,
      bombs: this.bombsUsed, shardTypes: { ...this.shardSpawned }, lightPickups: this.lightPickups, ores: { ...this.ores }, relics: [...this.relicsFound],
      seals: this.ribbonsHit.size, milestones: [...this.milestonesNow], geodes: this.geodesCracked, reachedHeart: this.reachedHeart, reason: this.endReason,
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
      if (def.unbreakable) {
        p.drillTimer += dt;
        p.heat = Math.max(0, p.heat - dt * 1.2);
        if (p.drillTimer > 0.35) {
          p.drillTimer = 0;
          this.emit({ t: 'clank', x: tx * TILE + 8, y: ty * TILE + 8 });
        }
      } else {
        // the bit heats up while it keeps chewing, and spins faster
        p.heat = Math.min(1, p.heat + dt * 0.9);
        const rate = s.drillRate * (1 + p.heat * s.heatMax);
        const mult = def.ore ? s.oreMul : s.rockMul;
        const left = this.world.hp(tx, ty);
        if (p.plowCd <= 0 && left <= s.drillPower * s.plow * mult * 0.5) {
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
            if (s.echoEvery > 0 && p.hitCount % s.echoEvery === 0) {
              dmg *= 3;
              if (s.echoShard) this.drillVolley(1);
            }
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

    if (p.bombCd > 0) p.bombCd -= dt;
    if (inp.shardBomb && p.bombCd <= 0) this.fireShardBomb();
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

  // ---------------------------------------------------------------- shards
  private stepShards(dt: number) {
    const born: Shard[] = [];
    const child = (s: Shard, type: ShardId, a: number, speed: number, dmg: number, life: number, x: number, y: number): Shard => ({
      ...s, id: this.id(), type, color: SHARD_BY_ID[type].color, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, life,
      burst: 0, split: false, nova: false, seek: false, pierce: this.stats.shardPierce, gen: s.gen + 1,
    });
    for (const s of this.shards) {
      s.life -= dt;
      if (s.life <= 0) continue;
      if (s.seek) this.steer(s, dt);
      const steps = 3;
      for (let k = 0; k < steps && s.life > 0; k++) {
        const nx = s.x + (s.vx * dt) / steps;
        const ny = s.y + (s.vy * dt) / steps;
        const tx = Math.floor(nx / TILE);
        const ty = Math.floor(ny / TILE);
        const def = TILES[this.tileAt(tx, ty)];
        if (!def.solid) {
          s.x = nx;
          s.y = ny;
          continue;
        }
        const broke = !def.unbreakable && this.damageTile(tx, ty, s.dmg, 'shard', s.gen + 1, s.type);
        if (broke && s.echo) {
          this.echoLastT = this.time;
          this.echoInChain = true;
        }
        const a = Math.atan2(s.vy, s.vx);
        const hx = tx * TILE + 8;
        const hy = ty * TILE + 8;
        // first impact: embers blow apart into sparks, prisms (and lucky shards) split
        if (s.burst > 0 && s.gen < 3) {
          for (let j = 0; j < s.burst; j++) {
            const ca = a + Math.PI + this.rng.range(-1.2, 1.2);
            born.push(child(s, 'glass', ca, this.rng.range(140, 200) * this.stats.shardSpeed, s.dmg * 0.5, 0.35, s.x, s.y));
          }
          s.burst = 0;
        }
        if (s.nova) {
          s.nova = false;
          if (this.chain >= NOVA_CHAIN) this.prismNova(tx, ty);
        }
        const lucky = broke && (this.stats.prismHeart || (this.stats.shardSplit > 0 && this.rng.chance(this.stats.shardSplit)));
        if ((s.split || lucky) && s.gen < 2) {
          for (const da of [-0.5, 0.5]) born.push(child(s, s.type, a + da, 170 * this.stats.shardSpeed, s.dmg, 0.4, hx, hy));
          s.split = false;
        }
        if (broke && s.pierce > 0) {
          s.pierce--;
          s.x = nx;
          s.y = ny;
          continue;
        }
        if (!broke && s.bounces > 0) {
          s.bounces--;
          if (Math.floor(s.x / TILE) !== tx) s.vx = -s.vx;
          else s.vy = -s.vy;
          continue;
        }
        s.life = 0;
        break;
      }
    }
    this.shards = this.shards.filter((s) => s.life > 0);
    for (const b of born) if (this.shards.length < MAX_ACTIVE_SHARDS) this.shards.push(b);
  }

  /** a void shard bends toward the nearest ore or crystal within 3 tiles (a gentle, capped turn) */
  private steer(s: Shard, dt: number) {
    const tx = Math.floor(s.x / TILE);
    const ty = Math.floor(s.y / TILE);
    let best: [number, number] | null = null;
    let bd = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const t = this.tileAt(tx + dx, ty + dy);
      if (!this.isValuable(t)) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = [tx + dx, ty + dy];
      }
    }
    if (!best) return;
    const want = Math.atan2(best[1] * TILE + 8 - s.y, best[0] * TILE + 8 - s.x);
    const cur = Math.atan2(s.vy, s.vx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-STEER_RATE * dt, Math.min(STEER_RATE * dt, d));
    const sp = Math.hypot(s.vx, s.vy);
    s.vx = Math.cos(cur + turn) * sp;
    s.vy = Math.sin(cur + turn) * sp;
  }

  // --------------------------------------------------------------- pickups
  private stepPickups(dt: number) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.done) continue;
      pk.age += dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      // auto-collect: close pickups home in at once, everything else after a moment
      if (pk.age > 0.3 && (d < AUTO_PULL || pk.age > AUTO_HOME)) {
        const pull = 520 + (pk.age > AUTO_HOME ? 400 : 0);
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
      if (b.fuse <= 0) {
        // dynamite bursts into heavy cinnabar shards
        this.emit({ t: 'dynamite', x: b.x, y: b.y });
        this.spawnShards(b.x, b.y, 'cinnabar', 10, { power: 45 });
      }
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
}
