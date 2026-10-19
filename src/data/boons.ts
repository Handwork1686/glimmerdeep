import type { Stats } from '../core/stats';

export type Rarity = 'common' | 'rare' | 'mythic';

export interface BoonDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  rarity: Rarity;
  max: number;
  apply: (s: Stats, stacks: number) => void;
  /** one-shot effect when picked (e.g. refill light) */
  onPick?: 'refill';
}

const b = (o: BoonDef) => o;

export const BOONS: BoonDef[] = [
  // common
  b({ id: 'overcharge', name: 'Overcharge', desc: '+20% drill power.', icon: 'drill', rarity: 'common', max: 3, apply: (s, k) => { s.drillPower *= 1 + 0.2 * k; } }),
  b({ id: 'quickhands', name: 'Quick Hands', desc: '+15% drill speed.', icon: 'speed', rarity: 'common', max: 5, apply: (s, k) => { s.drillRate *= 1 + 0.15 * k; } }),
  b({ id: 'glasslens', name: 'Glass Lens', desc: '+15% light radius.', icon: 'radius', rarity: 'common', max: 3, apply: (s, k) => { s.lightRadius += 0.15 * k; } }),
  b({ id: 'oilflask', name: 'Oil Flask', desc: '+15 max fuel and refill 15.', icon: 'lantern', rarity: 'common', max: 3, onPick: 'refill', apply: (s, k) => { s.maxLight += 15 * k; } }),
  b({ id: 'lightfeet', name: 'Light Feet', desc: '+12% move speed and thrust.', icon: 'thrust', rarity: 'common', max: 3, apply: (s, k) => { s.moveSpeed *= 1 + 0.12 * k; s.thrust *= 1 + 0.08 * k; } }),
  b({ id: 'piercing', name: 'Piercing Glass', desc: 'Every shard breaks through +1 more tile.', icon: 'shard', rarity: 'common', max: 2, apply: (s, k) => { s.shardPierce += k; } }),
  b({ id: 'keenshards', name: 'Keen Shards', desc: '+30% shard damage.', icon: 'shard', rarity: 'common', max: 3, apply: (s, k) => { s.shardDamage *= 1 + 0.3 * k; } }),
  b({ id: 'splinters', name: 'Splinters', desc: 'Every shard burst throws +1 shard.', icon: 'shard', rarity: 'common', max: 3, apply: (s, k) => { s.shardBonus += k; } }),
  b({ id: 'faultline', name: 'Hairline Cracks', desc: '+5% chance plain rock cracks into fault shards.', icon: 'chain', rarity: 'common', max: 4, apply: (s, k) => { s.faultChance += 0.05 * k; } }),
  b({ id: 'gilded', name: 'Gilded', desc: '+15% gold this run.', icon: 'coin', rarity: 'common', max: 5, apply: (s, k) => { s.goldMul += 0.15 * k; } }),
  b({ id: 'steady', name: 'Steady Wick', desc: 'Fuel drains 10% slower.', icon: 'drain', rarity: 'common', max: 3, apply: (s, k) => { s.lightDrain *= Math.pow(0.9, k); } }),
  b({ id: 'shrapnel', name: 'Shrapnel', desc: 'Shard bursts throw 20% more shards.', icon: 'bomb', rarity: 'common', max: 3, apply: (s, k) => { s.burstBonus += 0.2 * k; } }),
  b({ id: 'dowsing', name: 'Dowsing Rod', desc: 'This dig, newly explored ground holds +40% shard sources and +30% geodes.', icon: 'radius', rarity: 'common', max: 2, apply: (s, k) => { s.prospect.shards += 0.4 * k; s.prospect.geodes += 0.3 * k; } }),
  b({ id: 'longfuse', name: 'Long Fuse', desc: 'Chains last 0.25 s longer.', icon: 'clock', rarity: 'common', max: 3, apply: (s, k) => { s.chainTime += 0.25 * k; } }),
  b({ id: 'kindling', name: 'Kindling', desc: 'Chain links refuel 25% more.', icon: 'chain', rarity: 'common', max: 3, apply: (s, k) => { s.chainFuel *= 1 + 0.25 * k; } }),
  // rare
  b({ id: 'widebit', name: 'Wide Bit', desc: 'Drilling also hits side tiles for 50%.', icon: 'drill', rarity: 'rare', max: 2, apply: (s, k) => { s.wideBit += 0.5 * k; } }),
  b({ id: 'echo', name: 'Echo Drill', desc: 'Every 4th hit strikes three times.', icon: 'speed', rarity: 'rare', max: 1, apply: (s) => { s.echoEvery = s.echoEvery ? Math.min(s.echoEvery, 3) : 4; } }),
  b({ id: 'rupture', name: 'Vein Rupture', desc: '+30% chance breaking ore ruptures its whole vein into vein shards.', icon: 'chain', rarity: 'rare', max: 2, apply: (s, k) => { s.veinRupture += 0.3 * k; } }),
  b({ id: 'volatile', name: 'Volatile', desc: 'Ember shards blow apart into +2 sparks.', icon: 'bomb', rarity: 'rare', max: 2, apply: (s, k) => { s.emberSplit += 2 * k; } }),
  b({ id: 'ricochet', name: 'Ricochet', desc: 'Shards bounce off what they cannot break.', icon: 'shard', rarity: 'rare', max: 1, apply: (s) => { s.ricochet += 1; } }),
  b({ id: 'luckystrike', name: 'Lucky Strike', desc: '+10% chance ore drops double.', icon: 'star', rarity: 'rare', max: 3, apply: (s, k) => { s.doubleOre += 0.1 * k; } }),
  b({ id: 'potluck', name: 'Pot Luck', desc: 'Chain pots grow 25% faster.', icon: 'chain', rarity: 'rare', max: 3, apply: (s, k) => { s.chainPot *= 1 + 0.25 * k; } }),
  b({ id: 'redhot', name: 'Red Hot', desc: 'Drill heat gives +20% more speed.', icon: 'speed', rarity: 'rare', max: 2, apply: (s, k) => { s.heatMax += 0.2 * k; } }),
  b({ id: 'seismic', name: 'Seismic Landing', desc: 'Hard landings crack the rock below.', icon: 'bomb', rarity: 'rare', max: 1, apply: (s) => { s.seismic += 1; } }),
  b({ id: 'deeppockets', name: 'Deep Pockets', desc: '+6% gold per 100 m of depth.', icon: 'coin', rarity: 'rare', max: 2, apply: (s, k) => { s.deepPockets += 0.06 * k; } }),
  // mythic
  b({ id: 'secondwind', name: 'Second Wind', desc: 'Relight once when your fuel runs out (25 fuel).', icon: 'heart', rarity: 'mythic', max: 1, apply: (s) => { s.secondWind += 1; } }),
  b({ id: 'supernova', name: 'Supernova', desc: 'Big shard bursts (6+) shatter every crystal within 2 tiles.', icon: 'shard', rarity: 'mythic', max: 1, apply: (s) => { s.supernova = true; } }),
  b({ id: 'midastouch', name: 'Midas Touch', desc: 'Plain rock sometimes holds a gold nugget.', icon: 'coin', rarity: 'mythic', max: 1, apply: (s) => { s.midasTouch += 0.06; } }),
  b({ id: 'prismheart', name: 'Prism Heart', desc: 'Every shard splits in two when it breaks something.', icon: 'gem', rarity: 'mythic', max: 1, apply: (s) => { s.prismHeart = true; } }),
  b({ id: 'eternal', name: 'Eternal Flame', desc: 'Fuel drains 40% slower, but max fuel -20%.', icon: 'lantern', rarity: 'mythic', max: 1, apply: (s) => { s.lightDrain *= 0.6; s.maxLight *= 0.8; } }),
];

export const BOON_BY_ID: Record<string, BoonDef> = Object.fromEntries(BOONS.map((x) => [x.id, x]));

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 100, rare: 26, mythic: 5 };
export const RARITY_COLOR: Record<Rarity, number> = { common: 0xb2a9c8, rare: 0x72aef2, mythic: 0xf7b740 };
