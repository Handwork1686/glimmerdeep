/**
 * The deterministic game simulation. No Phaser, no DOM: the Run scene renders
 * it, bots and tests drive it headless.
 */
import { SKY_ROWS, STEP, TILE } from '../config';
import { biomeAt, SEAL_ROWS, SEALS } from '../data/biomes';
import { BOON_BY_ID, BoonDef, BOONS } from '../data/boons';
import { BASE_SHARD_DAMAGE, MAX_ACTIVE_SHARDS, MAX_PER_BURST, SHARD_BY_ID, ShardId, shardDepthScale } from '../data/shards';
import { ItemKind, T, TILES } from '../data/tiles';
import { computeStats, GloomMods, gloomMods, rollBoons, xpForLevel } from './progression';
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
  | { t: 'shard'; x: number; y: number; type: ShardId; n: number }
  | { t: 'dynamite'; x: number; y: number }
  | { t: 'shardBomb'; x: number; y: number }
  | { t: 'cataclysm'; x: number; y: number }
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
  seals: number;
  /** depths of the seals broken this dig (they stay broken) */
  sealsBroken: number[];
  geodes: number;
  reachedHeart: boolean;
  reason: EndReason;
}

export interface SimConfig {
  seed: number;
  upgrades: Record<string, number>;
  /** relics found on earlier digs (their perks apply, and they are not buried again) */
  relics?: string[];
  /** seals broken on earlier digs: they generate open */
  sealsBroken?: number[];
  /** QA only (dev builds, soak tests): start this many metres down instead of at the surface */
  debugDepth?: number;
  gloom: number;
  /** demo: the first Strata Seal never breaks */
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
const AUTO_HOME = 2.5;
/** void shards turn at most this fast (rad/s): a curve, not an aimbot */
const STEER_RATE = 5;
const CRYSTAL_SHARDS = new Set<ShardId>(['glass', 'crystal', 'void', 'prism']);
const CORNER_ASSIST = [-1, -2, -3, -4, 1, 2, 3, 4];
const CORNER_ASSIST_AIR = [-1, -2, -3, -4, -5, -6, 1, 2, 3, 4, 5, 6];
/** chain pot multiplier for a chain of n links: grows with the square root, then (past 1500 links) only slowly */
export const POT_SOFTCAP = 1500;
export function potMultiplier(n: number, growth: number): number {
  const k = n <= POT_SOFTCAP ? Math.sqrt(n) : Math.sqrt(POT_SOFTCAP) + 4 * Math.log(n / POT_SOFTCAP);
  return 1 + growth * k;
}

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
  /**
   * Drill power that counts against a Strata Seal: the drill you built (Workshop
   * and relics). This dig's boons speed you up, but seals answer only to the bit.
   */
  sealPower = 0;
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
  drones: Drone[] = [];
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
  sealsBroken = 0;
  /** seal depths broken on this dig */
  sealsBrokenNow: number[] = [];
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
  private breakQueue: { x: number; y: number; delay: number }[] = [];
  private sealDenyT = 0;
  private sealsShattered = new Set<number>();
  secondWindsUsed = 0;
  /** when the last tile broke (for the stall drain) */
  lastBreakT = 0;
  /** current stall drain multiplier (1 = not stalled) */
  stallMul = 1;
  private currentBiome = '';

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.gloom = gloomMods(cfg.gloom);
    this.baseUpgrades = cfg.upgrades;
    this.relicsKnown = [...(cfg.relics ?? [])];
    this.stats = computeStats(cfg.upgrades, this.boons, this.relicsKnown);
    this.sealPower = computeStats(cfg.upgrades, {}, this.relicsKnown).drillPower;
    this.heart = { ...HEART_POS };
    const sites = relicSites(cfg.seed, this.relicsKnown, this.prospect().relicSense);
    for (const r of sites) this.relicAt.set(tileKey(r.x, r.y), r.id);
    this.world = new World(
      { seed: cfg.seed, sealsBroken: new Set(cfg.sealsBroken ?? []), demo: cfg.demo, relics: sites, doneLayers: finishedLayers(this.relicsKnown) },
      () => this.prospect(),
      (row) => this.hpScale(row),
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
    for (let i = 0; i < this.stats.drones; i++) this.addDrone();
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
    let drain = Math.max(DRAIN_FLOOR, this.stats.lightDrain) * this.gloom.drainMul * drainCurve(this.depth()) * this.stallMul;
    if (this.stats.lastLight && this.lightFrac() < 0.25) drain *= 0.5;
    return drain;
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
    if (y < 0) return;
    this.world.set(x, y, tile);
    this.emit({ t: 'tile', x, y });
  }

  /**
   * Damage a tile. Everything that breaks rock is the drill, a shard, a drone or
   * a seismic landing: there is no other damage path.
   */
  damageTile(x: number, y: number, dmg: number, src: 'drill' | 'shard' | 'drone' | 'seismic', gen = 0, by?: ShardId): boolean {
    const tile = this.tileAt(x, y);
    const def = TILES[tile];
    if (tile === T.air || def.unbreakable) return false;
    if (tile === T.seal) {
      // seals only yield to a strong enough drill
      const need = this.sealNeed(y);
      if (src !== 'drill' && src !== 'seismic') return false;
      if (this.sealPower < need) {
        if (this.sealDenyT <= 0) {
          this.sealDenyT = 0.6;
          this.emit({ t: 'sealDeny', x: x * TILE + 8, y: y * TILE + 8, need, name: this.sealAt(y)?.name ?? '' });
        }
        return false;
      }
    }
    const mult = def.ore ? this.stats.oreMul : this.stats.rockMul;
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
    // every cascade break is a link; so is every ore, crystal or gem you drill
    const cascade = src === 'shard' || src === 'wave';
    const valuable = this.isValuable(tile) || tile === T.seal || tile === T.geode;
    const linked = cascade || valuable;
    if (linked) this.link();
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
    if (tile === T.seal) this.shatterSeal(x, y);
    if (tile === T.worldheart) this.breakHeart(cx, cy);
    // shard sources: everything resolves through spawnShards
    if (tile === T.geode) this.geodeVolley(cx, cy, depth, gen);
    else if (def.shards) this.spawnShards(cx, cy, def.shardType ?? 'glass', def.shards, { power: def.shardPower, gen });
    else if (tile === T.seal && src === 'wave' && this.rng.chance(0.34)) this.spawnShards(cx, cy, 'rune', 1, { exact: true, gen });
    // fault shards never crack more fault lines: plain rock would cascade forever
    else if (!def.ore && !def.light && tile !== T.seal && by !== 'fault' && gen <= 1 && this.stats.faultChance > 0 && this.rng.chance(Math.min(0.3, this.stats.faultChance))) {
      this.spawnShards(cx, cy, 'fault', 2, { gen });
    }
    if (def.ore && by !== 'vein' && this.stats.veinRupture > 0 && this.rng.chance(Math.min(0.9, this.stats.veinRupture))) this.rupture(x, y, tile);
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
        this.cataclysmVolley();
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
      this.emit({ t: 'chainEnd', count: this.chain, pot: this.potGold, mult, bonus });
    }
    this.chain = 0;
    this.chainTimer = 0;
    this.potGold = 0;
  }

  private findRelic(k: number, cx: number, cy: number) {
    const id = this.relicAt.get(k);
    if (!id) return;
    this.relicAt.delete(k);
    this.relicsFound.push(id);
    this.relicsKnown.push(id);
    this.stats = computeStats(this.baseUpgrades, this.boons, this.relicsKnown);
    this.sealPower = computeStats(this.baseUpgrades, {}, this.relicsKnown).drillPower;
    this.light = Math.min(this.light, this.stats.maxLight);
    this.emit({ t: 'relic', id, x: cx, y: cy });
  }

  /** breaking one seal tile sends a shattering wave through the whole band */
  private shatterSeal(x: number, y: number) {
    const seal = this.sealAt(y);
    if (!seal) return;
    const y0 = rowOfDepth(seal.depth);
    // only the first break sends a wave (the band is endless sideways; tiles
    // the wave itself breaks must not start new waves of their own)
    if (this.sealsShattered.has(seal.depth)) return;
    this.sealsShattered.add(seal.depth);
    this.sealsBroken++;
    this.sealsBrokenNow.push(seal.depth);
    this.emit({ t: 'sealBreak', x: x * TILE + 8, y: y * TILE + 8, name: seal.name });
    // the wave runs out across the band as far as the eye can see
    for (let yy = y0; yy < y0 + SEAL_ROWS; yy++) {
      for (let xx = x - 26; xx <= x + 26; xx++) {
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
    const power = TILES[tile].hp * this.hpScale(y) * 1.05;
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
    const full = (o.spread ?? Math.PI * 2) >= Math.PI * 2 - 1e-6;
    const a0 = o.angle ?? this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = full ? a0 + (k / n) * Math.PI * 2 + this.rng.range(-0.2, 0.2) : a0 + ((n > 1 ? k / (n - 1) : 0.5) - 0.5) * o.spread! + this.rng.range(-0.1, 0.1);
      const sp = this.rng.range(150, 210) * type.speedMul * s.shardSpeed;
      this.shards.push({
        id: this.id(), type: id, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: type.life, dmg, color: type.color,
        bounces: s.ricochet, pierce: type.pierce + s.shardPierce, burst: type.burst ? type.burst + s.emberSplit : 0, split: type.split,
        seek: type.seek, gen: o.gen ?? 0,
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
    // drilling and breaking nothing (no chain alive either): the lantern won't wait
    const stalled = p.drill !== null && this.chain === 0 && this.time - this.lastBreakT > STALL_GRACE;
    const target = stalled ? Math.min(STALL_MAX, 1 + (this.time - this.lastBreakT - STALL_GRACE) * (STALL_MAX - 1)) : 1;
    this.stallMul += (target - this.stallMul) * Math.min(1, dt * 6);
    this.light -= this.drainRate() * dt;
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
        if (TILES[this.tileAt(b.x, b.y)].solid) this.breakTile(b.x, b.y, 'wave', 0);
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
      time: this.time, bestChain: this.bestChain, bestPot: Math.round(this.bestPot), level: this.level, boons,
      bombs: this.bombsUsed, shardTypes: { ...this.shardSpawned }, lightPickups: this.lightPickups, ores: { ...this.ores }, relics: [...this.relicsFound],
      seals: this.sealsBroken, sealsBroken: [...this.sealsBrokenNow], geodes: this.geodesCracked, reachedHeart: this.reachedHeart, reason: this.endReason,
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
      const sealLocked = def.name === 'seal' && this.sealPower < this.sealNeed(ty);
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
        const left = this.world.hp(tx, ty);
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
      burst: 0, split: false, seek: false, pierce: this.stats.shardPierce, gen: s.gen + 1,
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
