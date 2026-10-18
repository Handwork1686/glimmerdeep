/**
 * Shards: everything you hit underground that boosts you. Crystals, embers,
 * cinnabar, geodes, ruptured veins, fault lines, the Cataclysm and the Shard
 * Bomb all resolve the same way: they throw shards, and the shards do the work
 * (break tiles, link chains, fill the pot, refuel the lantern).
 *
 * Every type reads the same global shard stats (count, damage, speed, pierce,
 * split, burst size); the numbers here only give each type its own flavour.
 */
export type ShardId = 'glass' | 'crystal' | 'ember' | 'cinnabar' | 'geode' | 'vein' | 'fault' | 'cataclysm' | 'void' | 'prism' | 'rune';

export interface ShardType {
  id: ShardId;
  name: string;
  /** tint for the sprite and its sparks (palette colour) */
  color: number;
  /** multiplies the shard's damage */
  dmgMul: number;
  /** multiplies launch speed */
  speedMul: number;
  /** seconds of flight */
  life: number;
  /** tiles it can break and keep flying through */
  pierce: number;
  /** children thrown when it first hits something (they fly on as glass) */
  burst: number;
  /** splits in two on its first impact */
  split: boolean;
  /** curves gently toward ore and crystal */
  seek: boolean;
  /** a burst source: Shrapnel-style bonuses add to its count */
  burstSource: boolean;
  /** where it comes from (Codex) */
  source: string;
  /** what it does (Codex) */
  desc: string;
}

const t = (o: ShardType) => o;

export const SHARD_TYPES: ShardType[] = [
  t({ id: 'glass', name: 'Glass Shard', color: 0xc8ecff, dmgMul: 1, speedMul: 1.15, life: 0.75, pierce: 0, burst: 0, split: false, seek: false, burstSource: false,
    source: 'Quartz, the Shard Bomb, ember sparks', desc: 'Fast and light, it flies far and breaks the first thing it meets.' }),
  t({ id: 'crystal', name: 'Crystal Shard', color: 0x5fe0c4, dmgMul: 1, speedMul: 1, life: 0.65, pierce: 1, burst: 0, split: false, seek: false, burstSource: false,
    source: 'Glimmer, opal, moonstone', desc: 'Breaks a tile and keeps going through to the next one.' }),
  t({ id: 'ember', name: 'Ember Shard', color: 0xff9a73, dmgMul: 1, speedMul: 0.95, life: 0.5, pierce: 0, burst: 2, split: false, seek: false, burstSource: true,
    source: 'Embers, fire opal', desc: 'Blows apart on impact into a spray of glass. Embers are the ones to blow up.' }),
  t({ id: 'cinnabar', name: 'Cinnabar Shard', color: 0xf0564a, dmgMul: 1.6, speedMul: 0.7, life: 0.85, pierce: 0, burst: 0, split: false, seek: false, burstSource: true,
    source: 'Cinnabar, dynamite', desc: 'Slow and heavy. A battering ram for hard rock.' }),
  t({ id: 'geode', name: 'Geode Shard', color: 0xb862de, dmgMul: 1.2, speedMul: 1, life: 0.6, pierce: 0, burst: 0, split: false, seek: false, burstSource: true,
    source: 'Geode vaults', desc: 'A cracked vault throws a volley of mixed shards before its loot.' }),
  t({ id: 'vein', name: 'Vein Shard', color: 0xf7b740, dmgMul: 1, speedMul: 0.8, life: 0.35, pierce: 1, burst: 0, split: false, seek: false, burstSource: false,
    source: 'Vein Rupture', desc: 'A ruptured vein lights up and tears itself apart from the inside.' }),
  t({ id: 'fault', name: 'Fault Shard', color: 0xa3673f, dmgMul: 0.9, speedMul: 1, life: 0.45, pierce: 0, burst: 0, split: false, seek: false, burstSource: false,
    source: 'Fault Lines (plain rock)', desc: 'Even barren rock can crack open into shards.' }),
  t({ id: 'cataclysm', name: 'Cataclysm Shard', color: 0xffd877, dmgMul: 1.4, speedMul: 1.2, life: 0.8, pierce: 1, burst: 0, split: false, seek: false, burstSource: true,
    source: 'Long chains (Cataclysm)', desc: 'The chain itself erupts into a storm of shards.' }),
  t({ id: 'void', name: 'Void Shard', color: 0x8034a6, dmgMul: 1.1, speedMul: 0.9, life: 0.95, pierce: 0, burst: 0, split: false, seek: true, burstSource: false,
    source: 'Voidglass, aether', desc: 'Curves gently toward the nearest ore or crystal.' }),
  t({ id: 'prism', name: 'Prism Shard', color: 0xfff0b5, dmgMul: 1, speedMul: 1, life: 0.6, pierce: 0, burst: 0, split: true, seek: false, burstSource: false,
    source: 'Prism, heartstone, the Heart', desc: 'Splits in two the first time it hits something.' }),
  t({ id: 'rune', name: 'Rune Shard', color: 0x72aef2, dmgMul: 1, speedMul: 1.1, life: 0.6, pierce: 0, burst: 0, split: false, seek: false, burstSource: false,
    source: 'Strata Seal waves', desc: 'A breaking seal throws its runes into the rock around it.' }),
];

export const SHARD_BY_ID = Object.fromEntries(SHARD_TYPES.map((s) => [s.id, s])) as Record<ShardId, ShardType>;

/** base shard damage before upgrades (stats.shardDamage starts here) */
export const BASE_SHARD_DAMAGE = 6;
/** at most this many shards from one burst; extra count turns into damage */
export const MAX_PER_BURST = 28;
/** at most this many shards in flight; extra count turns into damage */
export const MAX_ACTIVE_SHARDS = 300;
/** shards keep pace with harder rock the deeper they fly */
export const shardDepthScale = (depth: number) => 1 + Math.max(0, depth) / 250;
/** Codex key for a shard type */
export const shardCodexKey = (id: ShardId) => `shard_${id}`;
