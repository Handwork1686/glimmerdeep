import type { Stats } from '../core/stats';

export type Branch = 'core' | 'light' | 'drill' | 'hull' | 'shatter' | 'fortune' | 'arcana';

export interface Cost {
  gold: number;
  gems?: number;
  cores?: number;
}

export interface UpgradeNode {
  id: string;
  branch: Branch;
  name: string;
  desc: string; // use {v} for the per-level value
  icon: string;
  max: number;
  /** distance along branch, lateral offset */
  pos: [number, number];
  requires: string[];
  base: Cost;
  growth: number;
  apply: (s: Stats, lvl: number) => void;
  capstone?: boolean;
  /** explicit placement (angle in degrees, distance) for nodes outside a branch line */
  at?: [number, number];
  /** repeatable without limit */
  infinite?: boolean;
}

const n = (o: Omit<UpgradeNode, 'growth'> & { growth?: number }): UpgradeNode => ({ growth: 1.85, ...o });

export const BRANCH_ANGLE: Record<Branch, number> = {
  core: 0,
  light: -90,
  drill: -30,
  hull: 30,
  shatter: 90,
  fortune: 150,
  arcana: 210,
};

export const BRANCH_COLOR: Record<Branch, number> = {
  core: 0xffd877,
  light: 0xffd877,
  drill: 0xd3dde8,
  hull: 0xec9446,
  shatter: 0x5fe0c4,
  fortune: 0xf7b740,
  arcana: 0xb862de,
};

export const BRANCH_NAME: Record<Branch, string> = {
  core: 'Lantern',
  light: 'Lantern',
  drill: 'Drill',
  hull: 'Rig',
  shatter: 'Shatter',
  fortune: 'Fortune',
  arcana: 'Arcana',
};

export const UPGRADES: UpgradeNode[] = [
  n({ id: 'root', branch: 'core', name: 'The Wick', desc: 'Your lantern-pod. Every path starts here.', icon: 'lantern', max: 1, pos: [0, 0], requires: [], base: { gold: 0 }, apply: () => {} }),
  // repeatable late-game refinements (gold sinks)
  n({ id: 'refine_bit', branch: 'core', name: 'Refine the Bit', desc: '+4% drill power. Repeatable.', icon: 'drill', max: 999, infinite: true, pos: [1, 0], at: [-60, 1.45], requires: ['root'], base: { gold: 25000 }, growth: 1.22, apply: (s, l) => { s.drillPower *= 1 + 0.04 * l; } }),
  n({ id: 'refine_wick', branch: 'core', name: 'Refine the Wick', desc: '+3% lantern fuel. Repeatable.', icon: 'lantern', max: 999, infinite: true, pos: [1, 0], at: [60, 1.45], requires: ['root'], base: { gold: 25000 }, growth: 1.22, apply: (s, l) => { s.maxLight *= 1 + 0.03 * l; } }),
  n({ id: 'refine_purse', branch: 'core', name: 'Refine the Purse', desc: '+4% gold. Repeatable.', icon: 'coin', max: 999, infinite: true, pos: [1, 0], at: [180, 1.45], requires: ['root'], base: { gold: 25000 }, growth: 1.22, apply: (s, l) => { s.goldMul *= 1 + 0.04 * l; } }),
  n({ id: 'refine_chain', branch: 'core', name: 'Refine the Pot', desc: 'Chain pots grow 4% faster. Repeatable.', icon: 'chain', max: 999, infinite: true, pos: [1, 0], at: [120, 1.45], requires: ['root'], base: { gold: 30000 }, growth: 1.22, apply: (s, l) => { s.chainPot *= 1 + 0.04 * l; } }),
  n({ id: 'refine_luck', branch: 'core', name: 'Refine the Eye', desc: '+1% chance ore drops double. Repeatable.', icon: 'star', max: 999, infinite: true, pos: [1, 0], at: [240, 1.45], requires: ['root'], base: { gold: 30000 }, growth: 1.22, apply: (s, l) => { s.doubleOre += 0.01 * l; } }),

  // ---------------------------------------------------------------- LIGHT
  n({ id: 'oil', branch: 'light', name: 'Wick Oil', desc: '+10 lantern fuel.', icon: 'lantern', max: 5, pos: [1, 0], requires: ['root'], base: { gold: 12 }, growth: 1.8, apply: (s, l) => { s.maxLight += 10 * l; } }),
  n({ id: 'steady', branch: 'light', name: 'Steady Flame', desc: 'Fuel drains 5% slower.', icon: 'drain', max: 5, pos: [2, -1], requires: ['oil'], base: { gold: 30 }, growth: 1.9, apply: (s, l) => { s.lightDrain *= Math.pow(0.95, l); } }),
  n({ id: 'lens', branch: 'light', name: 'Wide Glass', desc: '+12% light radius.', icon: 'radius', max: 3, pos: [2, 1], requires: ['oil'], base: { gold: 40 }, apply: (s, l) => { s.lightRadius += 0.12 * l; } }),
  n({ id: 'mosslore', branch: 'light', name: 'Moss Lore', desc: 'Lamp moss restores 50% more fuel.', icon: 'plus', max: 3, pos: [3, -2], requires: ['steady'], base: { gold: 70 }, apply: (s, l) => { s.mossMul += 0.5 * l; } }),
  n({ id: 'reserve', branch: 'light', name: 'Reserve Tank', desc: '+15 lantern fuel.', icon: 'lantern', max: 3, pos: [3, 0], requires: ['steady', 'lens'], base: { gold: 260, gems: 2 }, apply: (s, l) => { s.maxLight += 15 * l; } }),
  n({ id: 'recycler', branch: 'light', name: 'Fuel Recycler', desc: 'Chain links refuel 50% more.', icon: 'chain', max: 3, pos: [3, 2], requires: ['lens'], base: { gold: 120 }, apply: (s, l) => { s.chainFuel *= 1 + 0.5 * l; } }),
  n({ id: 'amberinf', branch: 'light', name: 'Amber Infusion', desc: 'Amber restores 50% more fuel.', icon: 'plus', max: 2, pos: [4, -2], requires: ['mosslore'], base: { gold: 600 }, apply: (s, l) => { s.amberMul += 0.5 * l; } }),
  n({ id: 'kindling', branch: 'light', name: 'Kindling', desc: 'Each ore pickup restores 0.03 fuel.', icon: 'plus', max: 3, pos: [4, 0], requires: ['reserve'], base: { gold: 900, gems: 4 }, apply: (s, l) => { s.kindling += 0.03 * l; } }),
  n({ id: 'secondwind', branch: 'light', name: 'Second Wind', desc: 'Once per dig, relight with 25 fuel when it runs out.', icon: 'heart', max: 1, pos: [4, 2], requires: ['recycler'], base: { gold: 1500, gems: 6 }, apply: (s, l) => { s.secondWind += l; } }),
  n({ id: 'steady2', branch: 'light', name: 'Patient Flame', desc: 'Fuel drains 4% slower.', icon: 'drain', max: 3, pos: [5, -1], requires: ['amberinf', 'kindling'], base: { gold: 4000, gems: 6 }, apply: (s, l) => { s.lightDrain *= Math.pow(0.96, l); } }),
  n({ id: 'lastlight', branch: 'light', name: 'Last Light', desc: 'Below 25% fuel, drain is halved.', icon: 'lantern', max: 1, pos: [5, 1], requires: ['kindling', 'secondwind'], base: { gold: 9000, cores: 1 }, capstone: true, apply: (s, l) => { if (l) s.lastLight = true; } }),

  // ---------------------------------------------------------------- DRILL
  n({ id: 'bit', branch: 'drill', name: 'Tempered Bit', desc: '+1 drill power.', icon: 'drill', max: 5, pos: [1, 0], requires: ['root'], base: { gold: 10 }, growth: 1.65, apply: (s, l) => { s.drillPower += l; } }),
  n({ id: 'gearing', branch: 'drill', name: 'Gearing', desc: '+12% drill speed.', icon: 'speed', max: 5, pos: [2, -1], requires: ['bit'], base: { gold: 25 }, apply: (s, l) => { s.drillRate *= 1 + 0.12 * l; } }),
  n({ id: 'pulverize', branch: 'drill', name: 'Pulverizer', desc: 'Plain rock takes 20% more damage.', icon: 'drill', max: 3, pos: [2, 1], requires: ['bit'], base: { gold: 60 }, apply: (s, l) => { s.rockMul += 0.2 * l; } }),
  n({ id: 'diamond', branch: 'drill', name: 'Diamond Edge', desc: '+3 drill power.', icon: 'drill', max: 5, pos: [3, 0], requires: ['gearing', 'pulverize'], base: { gold: 300, gems: 1 }, growth: 1.85, apply: (s, l) => { s.drillPower += 3 * l; } }),
  n({ id: 'prospect', branch: 'drill', name: "Prospector's Eye", desc: 'Ore takes 25% more damage.', icon: 'eye', max: 3, pos: [3, -2], requires: ['gearing'], base: { gold: 140 }, apply: (s, l) => { s.oreMul += 0.25 * l; } }),
  n({ id: 'widebit', branch: 'drill', name: 'Wide Bit', desc: 'Drilling also hits the tiles beside your target (25%).', icon: 'drill', max: 3, pos: [3, 2], requires: ['pulverize'], base: { gold: 400, gems: 3 }, apply: (s, l) => { s.wideBit += 0.25 * l; } }),
  n({ id: 'echo', branch: 'drill', name: 'Echo Drill', desc: 'Every 5th hit strikes three times. Each level hits one sooner.', icon: 'speed', max: 2, pos: [4, -1], requires: ['diamond', 'prospect'], base: { gold: 1400, gems: 5 }, apply: (s, l) => { if (l) s.echoEvery = 6 - l; } }),
  n({ id: 'overclock', branch: 'drill', name: 'Overclock', desc: '+20% drill speed.', icon: 'speed', max: 3, pos: [4, 1], requires: ['diamond', 'widebit'], base: { gold: 2200, gems: 4 }, apply: (s, l) => { s.drillRate *= 1 + 0.2 * l; } }),
  n({ id: 'seismic', branch: 'drill', name: 'Seismic Landing', desc: 'Falling 4+ tiles cracks the rock below.', icon: 'bomb', max: 2, pos: [5, -2], requires: ['echo'], base: { gold: 3000 }, apply: (s, l) => { s.seismic += l; } }),
  n({ id: 'starbit', branch: 'drill', name: 'Starmetal Bit', desc: '+8 drill power.', icon: 'drill', max: 5, pos: [5, 0], requires: ['echo', 'overclock'], base: { gold: 9000, gems: 8 }, growth: 1.9, apply: (s, l) => { s.drillPower += 8 * l; } }),
  n({ id: 'excavator', branch: 'drill', name: 'Excavator', desc: 'Your bit chews a full 3x3 block.', icon: 'drill', max: 1, pos: [5, 2], requires: ['overclock'], base: { gold: 6000, cores: 1 }, capstone: true, apply: (s, l) => { if (l) { s.excavator = true; s.wideBit = Math.max(s.wideBit, 1); } } }),

  // ---------------------------------------------------------------- HULL
  n({ id: 'treads', branch: 'hull', name: 'Treads', desc: '+10% move speed.', icon: 'hull', max: 4, pos: [1, 0], requires: ['root'], base: { gold: 18 }, apply: (s, l) => { s.moveSpeed *= 1 + 0.1 * l; } }),
  n({ id: 'gyro', branch: 'hull', name: 'Gyro Shards', desc: 'All shards fly 12% faster and farther.', icon: 'thrust', max: 4, pos: [2, -1], requires: ['treads'], base: { gold: 35 }, apply: (s, l) => { s.shardSpeed *= 1 + 0.12 * l; } }),
  n({ id: 'thrusters', branch: 'hull', name: 'Thrusters', desc: '+12% thrust.', icon: 'thrust', max: 4, pos: [2, 1], requires: ['treads'], base: { gold: 45 }, apply: (s, l) => { s.thrust *= 1 + 0.12 * l; } }),
  n({ id: 'heatsink', branch: 'hull', name: 'Heat Sink', desc: 'Drill heat gives +10% more speed.', icon: 'speed', max: 5, pos: [3, 0], requires: ['gyro', 'thrusters'], base: { gold: 180, gems: 1 }, apply: (s, l) => { s.heatMax += 0.1 * l; } }),
  n({ id: 'auger', branch: 'hull', name: 'Auger', desc: 'The drill also bores the tile behind its target (40%).', icon: 'drill', max: 3, pos: [3, 2], requires: ['thrusters'], base: { gold: 220 }, apply: (s, l) => { s.auger += 0.4 * l; } }),
  n({ id: 'longfuse', branch: 'hull', name: 'Long Fuse', desc: 'Chains stay alive 0.2 s longer.', icon: 'clock', max: 4, pos: [3, -2], requires: ['gyro'], base: { gold: 260 }, apply: (s, l) => { s.chainTime += 0.2 * l; } }),
  n({ id: 'potplus', branch: 'hull', name: 'Deeper Pot', desc: 'Chain pots grow 20% faster.', icon: 'chain', max: 5, pos: [4, -1], requires: ['heatsink', 'longfuse'], base: { gold: 1100, gems: 3 }, apply: (s, l) => { s.chainPot *= 1 + 0.2 * l; } }),
  n({ id: 'treads2', branch: 'hull', name: 'Racing Treads', desc: '+8% move speed and thrust.', icon: 'thrust', max: 3, pos: [4, 1], requires: ['heatsink', 'auger'], base: { gold: 1600, gems: 3 }, apply: (s, l) => { s.moveSpeed *= 1 + 0.08 * l; s.thrust *= 1 + 0.08 * l; } }),
  n({ id: 'splitter', branch: 'hull', name: 'Splitter', desc: 'Every shard has a 15% chance to split in two when it hits.', icon: 'shard', max: 3, pos: [5, -2], requires: ['potplus'], base: { gold: 4000, gems: 5 }, apply: (s, l) => { s.shardSplit += 0.15 * l; } }),
  n({ id: 'plow', branch: 'hull', name: 'Juggernaut Plow', desc: 'Tiles with up to 3x your drill power in toughness break on contact.', icon: 'hull', max: 1, pos: [5, 0], requires: ['potplus', 'treads2'], base: { gold: 8000, cores: 1 }, capstone: true, apply: (s, l) => { if (l) s.plow = 3; } }),

  // ---------------------------------------------------------------- SHATTER
  n({ id: 'brittle', branch: 'shatter', name: 'Brittle Crystal', desc: 'Every shard burst throws +1 shard: crystals, embers, geodes, veins, the Shard Bomb.', icon: 'shard', max: 4, pos: [1, 0], requires: ['root'], base: { gold: 20 }, apply: (s, l) => { s.shardBonus += l; } }),
  n({ id: 'keen', branch: 'shatter', name: 'Keen Shards', desc: 'All shards deal 25% more damage.', icon: 'shard', max: 5, pos: [2, -1], requires: ['brittle'], base: { gold: 40 }, apply: (s, l) => { s.shardDamage *= 1 + 0.25 * l; } }),
  n({ id: 'bounty', branch: 'shatter', name: 'Chain Bounty', desc: 'Chain pots grow 15% faster.', icon: 'chain', max: 3, pos: [2, 1], requires: ['brittle'], base: { gold: 80 }, apply: (s, l) => { s.chainPot *= 1 + 0.15 * l; } }),
  n({ id: 'fault', branch: 'shatter', name: 'Fault Shards', desc: 'Plain rock has a 3% chance to crack into fault shards.', icon: 'shard', max: 5, pos: [3, 0], requires: ['keen', 'bounty'], base: { gold: 350, gems: 2 }, apply: (s, l) => { s.faultChance += 0.03 * l; } }),
  n({ id: 'volatile', branch: 'shatter', name: 'Ember Shards', desc: 'Ember shards blow apart into +1 spark.', icon: 'bomb', max: 3, pos: [3, -2], requires: ['keen'], base: { gold: 500 }, apply: (s, l) => { s.emberSplit += l; } }),
  n({ id: 'rupture', branch: 'shatter', name: 'Vein Shards', desc: '20% chance breaking ore ruptures its whole vein: every ore in it bursts into a vein shard.', icon: 'chain', max: 3, pos: [3, 2], requires: ['bounty'], base: { gold: 600, gems: 3 }, apply: (s, l) => { s.veinRupture += 0.2 * l; } }),
  n({ id: 'blastcore', branch: 'shatter', name: 'Cinnabar Shards', desc: 'Cinnabar shards (cinnabar, dynamite) deal 40% more damage.', icon: 'bomb', max: 3, pos: [4, -2], requires: ['volatile'], base: { gold: 1800 }, apply: (s, l) => { s.cinnabarMul += 0.4 * l; } }),
  n({ id: 'ricochet', branch: 'shatter', name: 'Ricochet', desc: 'Shards that fail to break a tile bounce off it.', icon: 'shard', max: 2, pos: [4, 0], requires: ['fault'], base: { gold: 2000, gems: 4 }, apply: (s, l) => { s.ricochet += l; } }),
  n({ id: 'resonance', branch: 'shatter', name: 'Resonance', desc: 'Every 10 chain links restore 1 extra fuel.', icon: 'chain', max: 3, pos: [4, 2], requires: ['rupture'], base: { gold: 2500, gems: 4 }, apply: (s, l) => { s.resonance += l; } }),
  n({ id: 'keen2', branch: 'shatter', name: 'Razor Shards', desc: 'Shards deal 40% more damage.', icon: 'shard', max: 4, pos: [5, -1], requires: ['blastcore', 'ricochet'], base: { gold: 7000, gems: 6 }, apply: (s, l) => { s.shardDamage *= 1 + 0.4 * l; } }),
  n({ id: 'cataclysm', branch: 'shatter', name: 'Cataclysm', desc: 'Every 20 chain links the chain erupts in a storm of Cataclysm shards. The Shard Bomb recharges 3 s faster.', icon: 'shard', max: 1, pos: [5, 1], requires: ['ricochet', 'resonance'], base: { gold: 9000, cores: 1 }, capstone: true, apply: (s, l) => { if (l) { s.cataclysm = true; s.cataclysmEvery = 20; s.bombCooldown -= 3; } } }),

  // --------------------------------------------------------------- FORTUNE
  n({ id: 'appraise', branch: 'fortune', name: 'Appraisal', desc: '+10% gold.', icon: 'coin', max: 5, pos: [1, 0], requires: ['root'], base: { gold: 15 }, apply: (s, l) => { s.goldMul += 0.1 * l; } }),
  n({ id: 'lucky', branch: 'fortune', name: 'Lucky Strike', desc: '4% chance ore drops double.', icon: 'star', max: 5, pos: [2, -1], requires: ['appraise'], base: { gold: 50 }, apply: (s, l) => { s.doubleOre += 0.04 * l; } }),
  n({ id: 'assay', branch: 'fortune', name: 'Assay', desc: '+15% experience.', icon: 'eye', max: 4, pos: [2, 1], requires: ['appraise'], base: { gold: 45 }, apply: (s, l) => { s.xpMul += 0.15 * l; } }),
  n({ id: 'gemsense', branch: 'fortune', name: 'Gem Sense', desc: 'Ore has a 2% chance to drop a gem.', icon: 'gem', max: 4, pos: [3, 0], requires: ['lucky', 'assay'], base: { gold: 400 }, apply: (s, l) => { s.gemChance += 0.02 * l; } }),
  n({ id: 'deeppockets', branch: 'fortune', name: 'Deep Pockets', desc: '+3% gold for every 100 m of depth.', icon: 'coin', max: 3, pos: [3, -2], requires: ['lucky'], base: { gold: 300 }, apply: (s, l) => { s.deepPockets += 0.03 * l; } }),
  n({ id: 'survey', branch: 'fortune', name: 'Survey Lamp', desc: 'Ore, geodes and relics glow brighter. Level 2 points to the nearest relic.', icon: 'radius', max: 2, pos: [3, 2], requires: ['assay'], base: { gold: 240 }, apply: (s, l) => { s.survey += l; } }),
  n({ id: 'haggle', branch: 'fortune', name: 'Haggler', desc: 'Workshop prices drop 4%.', icon: 'coin', max: 3, pos: [4, -1], requires: ['gemsense', 'deeppockets'], base: { gold: 1500, gems: 3 }, apply: (s, l) => { s.costMul *= Math.pow(0.96, l); } }),
  n({ id: 'fossil', branch: 'fortune', name: 'Fossil Hunter', desc: 'Gem sources yield +1 gem.', icon: 'gem', max: 2, pos: [4, 1], requires: ['gemsense', 'survey'], base: { gold: 1800, gems: 5 }, apply: (s, l) => { s.fossilBonus += l; } }),
  n({ id: 'appraise2', branch: 'fortune', name: 'Master Appraiser', desc: '+15% gold.', icon: 'coin', max: 5, pos: [5, -1], requires: ['haggle'], base: { gold: 6000, gems: 4 }, apply: (s, l) => { s.goldMul += 0.15 * l; } }),
  n({ id: 'midas', branch: 'fortune', name: 'Midas Lamp', desc: 'Copper and silver are worth triple.', icon: 'coin', max: 1, pos: [5, 1], requires: ['haggle', 'fossil'], base: { gold: 7000, cores: 1 }, capstone: true, apply: (s, l) => { if (l) s.midas = true; } }),

  // ---------------------------------------------------------------- ARCANA
  n({ id: 'draw', branch: 'arcana', name: "Fortune's Draw", desc: '+1 free boon reroll every dig.', icon: 'dice', max: 2, pos: [1, 0], requires: ['root'], base: { gold: 20 }, apply: (s, l) => { s.rerolls += l; } }),
  n({ id: 'echoes', branch: 'arcana', name: 'Boon Echo', desc: 'A picked boon has a 12% chance to be taken twice.', icon: 'star', max: 3, pos: [2, -1], requires: ['draw'], base: { gold: 60 }, apply: (s, l) => { s.boonEcho += 0.12 * l; } }),
  n({ id: 'shrapnel', branch: 'arcana', name: 'Shrapnel', desc: 'Shard bursts (embers, cinnabar, geodes, bombs, Cataclysm) throw 15% more shards.', icon: 'bomb', max: 3, pos: [2, 1], requires: ['draw'], base: { gold: 70 }, apply: (s, l) => { s.burstBonus += 0.15 * l; } }),
  n({ id: 'reroll', branch: 'arcana', name: 'Second Thoughts', desc: '+1 boon reroll each run.', icon: 'dice', max: 3, pos: [3, 0], requires: ['echoes', 'shrapnel'], base: { gold: 250, gems: 1 }, apply: (s, l) => { s.rerolls += l; } }),
  n({ id: 'dynamite', branch: 'arcana', name: 'Cinnabar Charges', desc: 'Carry 2 sticks of dynamite (Q) that burst into cinnabar shards. +1 per extra level.', icon: 'bomb', max: 4, pos: [3, -2], requires: ['echoes'], base: { gold: 300, gems: 2 }, apply: (s, l) => { if (l) s.dynamite += 1 + l; } }),
  n({ id: 'headstart', branch: 'arcana', name: 'Head Start', desc: 'Begin each run with a random boon.', icon: 'star', max: 2, pos: [3, 2], requires: ['shrapnel'], base: { gold: 700, gems: 3 }, apply: (s, l) => { s.headStart += l; } }),
  n({ id: 'drone', branch: 'arcana', name: 'Scout Drone', desc: 'A drone orbits you and mines nearby rock.', icon: 'drone', max: 2, pos: [4, -1], requires: ['dynamite', 'reroll'], base: { gold: 2000, gems: 5 }, apply: (s, l) => { s.drones += l; } }),
  n({ id: 'luck', branch: 'arcana', name: 'Lucky Stars', desc: 'Rare and mythic boons appear more often.', icon: 'star', max: 3, pos: [4, 1], requires: ['reroll', 'headstart'], base: { gold: 1600, gems: 3 }, apply: (s, l) => { s.luck += l; } }),
  n({ id: 'banish', branch: 'arcana', name: 'Banish', desc: '+1 banish each run: remove a boon from the pool.', icon: 'skull', max: 2, pos: [5, -2], requires: ['drone'], base: { gold: 5000, gems: 4 }, apply: (s, l) => { s.banishes += l; } }),
  n({ id: 'insight', branch: 'arcana', name: 'Insight', desc: 'Choose from 4 boons instead of 3.', icon: 'eye', max: 1, pos: [5, 0], requires: ['drone', 'luck'], base: { gold: 8000, cores: 1 }, apply: (s, l) => { s.boonChoices += l; } }),
  n({ id: 'astral', branch: 'arcana', name: 'Astral Lantern', desc: 'Levelling up restores 10 fuel.', icon: 'lantern', max: 1, pos: [5, 2], requires: ['luck'], base: { gold: 7000, cores: 1 }, capstone: true, apply: (s, l) => { s.astral += 10 * l; } }),
];

export const UPGRADE_BY_ID: Record<string, UpgradeNode> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

const TIER_MUL = [1, 1, 1, 1.35, 3, 7];
/** global price scale: peaceful digs last longer and mine more than the old fights allowed */
export const ECON = 3.5;

export function costOf(node: UpgradeNode, level: number, costMul = 1): Cost {
  const f = Math.pow(node.growth, level) * (node.infinite ? 1 : TIER_MUL[Math.min(5, node.pos[0])]);
  return {
    gold: Math.round(node.base.gold * f * costMul * ECON),
    gems: node.base.gems ? Math.ceil(node.base.gems * Math.pow(1.5, level)) : 0,
    cores: node.base.cores ?? 0,
  };
}

export function isAvailable(node: UpgradeNode, owned: Record<string, number>): boolean {
  if (node.id === 'root') return true;
  return node.requires.some((r) => (owned[r] ?? 0) > 0 || r === 'root');
}
