import { NO_PROSPECT, Prospect } from './worldgen';

/** Derived player stats: base values modified by Workshop upgrades, relics and run boons. */
export interface Stats {
  maxLight: number; // lantern fuel
  lightDrain: number; // per second
  lightRadius: number; // multiplier
  lastLight: boolean; // halve drain below 25%
  mossMul: number;
  amberMul: number;
  kindling: number; // fuel per ore pickup
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
  magnet: number; // px

  shardBonus: number;
  shardDamage: number;
  shatter: number; // chance any rock emits shards
  veinRupture: number; // fraction of connected same-ore damage
  blastRadius: number; // added tiles
  blastMul: number;
  ricochet: number;
  chainPot: number; // chain pot multiplier growth
  chainTime: number; // seconds a chain stays alive
  chainFuel: number; // fuel per chain link
  resonance: number; // fuel per 10 links
  cataclysm: boolean;
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
  midas: boolean;
  midasTouch: number; // chance rock drops a gold nugget

  flareCooldown: number;
  flareRadius: number; // px
  flareDamage: number;
  dynamite: number; // count per run
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
    moveSpeed: 74, thrust: 1350, magnet: 26,
    shardBonus: 0, shardDamage: 6, shatter: 0, veinRupture: 0, blastRadius: 0, blastMul: 1, ricochet: 0,
    chainPot: 0.06, chainTime: 1.2, chainFuel: 0.06, resonance: 0, cataclysm: false, prismHeart: false, supernova: false,
    goldMul: 1, doubleOre: 0, gemChance: 0, deepPockets: 0, costMul: 1, fossilBonus: 0, xpMul: 1, survey: 0, midas: false, midasTouch: 0,
    flareCooldown: 10, flareRadius: 40, flareDamage: 8, dynamite: 0, drones: 0, boonChoices: 3, rerolls: 0, banishes: 0, headStart: 0,
    luck: 0, prospect: { ...NO_PROSPECT },
  };
}
