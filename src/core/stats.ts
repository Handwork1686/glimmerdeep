import { NO_PROSPECT, Prospect } from './worldgen';

/** Derived player stats: base values modified by Workshop upgrades, relics and run boons. */
export interface Stats {
  maxLight: number; // lantern fuel
  lightDrain: number; // per second
  lightRadius: number; // multiplier
  lastLight: boolean; // halve drain below 25%
  mossMul: number;
  amberMul: number;
  kindling: number; // fuel per ore tile mined
  secondWind: number; // relights available
  astral: number; // fuel restored on level-up

  drillPower: number;
  drillRate: number; // hits per second
  wideBit: number; // fraction of damage to the side tiles
  echoEvery: number; // 0 = off
  rockMul: number;
  oreMul: number;
  seismic: number; // damage on hard landing
  heatMax: number; // extra drill speed at full heat
  auger: number; // fraction of damage to the tile behind the target
  excavator: boolean; // the bit chews a full 3x3
  plow: number; // tiles with HP <= plow x power break on contact

  moveSpeed: number;
  thrust: number;

  // ---- shards: one global path; every shard type reads these
  shardBonus: number; // +shards on every burst, from every source
  shardDamage: number; // base damage (BASE_SHARD_DAMAGE at start)
  shardSpeed: number; // speed and range multiplier
  shardPierce: number; // extra tiles every shard breaks through
  shardSplit: number; // chance a shard splits in two on impact
  burstBonus: number; // burst sources (embers, cinnabar, geodes, bombs...) throw this fraction more
  faultChance: number; // chance plain rock cracks into fault shards
  veinRupture: number; // chance breaking ore ruptures its whole vein into vein shards
  emberSplit: number; // extra sparks per ember shard impact
  cinnabarMul: number; // cinnabar shard damage multiplier
  ricochet: number; // bounces off tiles a shard fails to break
  chainPot: number; // chain pot multiplier growth
  chainTime: number; // seconds a chain stays alive
  chainFuel: number; // fuel per chain link
  resonance: number; // fuel per 10 links
  cataclysm: boolean;
  cataclysmEvery: number; // links per Cataclysm volley
  prismHeart: boolean;
  supernova: boolean;

  goldMul: number;
  doubleOre: number;
  gemChance: number;
  deepPockets: number; // gold % per 100 m
  costMul: number;
  fossilBonus: number;
  xpMul: number;
  survey: number;
  /** extra rows the relic pointer reaches */
  surveyRange: number;
  midas: boolean;
  midasTouch: number; // chance rock drops a gold nugget

  bombCooldown: number; // Shard Bomb recharge (s)
  dynamite: number; // cinnabar charges per run
  boonEcho: number; // chance a picked boon is taken twice
  drones: number;
  boonChoices: number;
  rerolls: number;
  banishes: number;
  headStart: number;
  luck: number;
  /** world-shaping stats: what newly generated ground contains */
  prospect: Prospect;
}

export function baseStats(): Stats {
  return {
    maxLight: 60, lightDrain: 1, lightRadius: 1, lastLight: false, mossMul: 1, amberMul: 1, kindling: 0, secondWind: 0, astral: 0,
    drillPower: 2, drillRate: 4, wideBit: 0, echoEvery: 0, rockMul: 1, oreMul: 1, seismic: 0, heatMax: 0.4, auger: 0, excavator: false, plow: 1,
    moveSpeed: 74, thrust: 1350,
    shardBonus: 0, shardDamage: 6, shardSpeed: 1, shardPierce: 0, shardSplit: 0, burstBonus: 0, faultChance: 0, veinRupture: 0,
    emberSplit: 0, cinnabarMul: 1, ricochet: 0,
    chainPot: 0.06, chainTime: 1.2, chainFuel: 0.06, resonance: 0, cataclysm: false, cataclysmEvery: 25, prismHeart: false, supernova: false,
    goldMul: 1, doubleOre: 0, gemChance: 0, deepPockets: 0, costMul: 1, fossilBonus: 0, xpMul: 1, survey: 0, surveyRange: 0, midas: false, midasTouch: 0,
    bombCooldown: 10, dynamite: 0, boonEcho: 0, drones: 0, boonChoices: 3, rerolls: 0, banishes: 0, headStart: 0,
    luck: 0, prospect: { ...NO_PROSPECT },
  };
}
