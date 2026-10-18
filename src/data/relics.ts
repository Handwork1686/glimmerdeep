import type { Stats } from '../core/stats';
import type { BiomeId } from './biomes';

/**
 * Relics are unique keepsakes buried in the deep. Each one is found once and
 * grants a small permanent perk. Four rest in every biome above the Heart.
 */
export interface RelicDef {
  id: string;
  name: string;
  biome: BiomeId;
  lore: string;
  perk: string;
  apply: (s: Stats) => void;
}

const r = (o: RelicDef) => o;

export const RELICS: RelicDef[] = [
  // Rootsoil
  r({ id: 'oldpick', name: "Grandmother's Pick", biome: 'rootsoil', lore: 'Worn smooth where a hand held it for fifty years.', perk: '+1 drill power', apply: (s) => { s.drillPower += 1; } }),
  r({ id: 'acorn', name: 'Stone Acorn', biome: 'rootsoil', lore: 'Something planted it here before there was a here.', perk: '+5 lantern fuel', apply: (s) => { s.maxLight += 5; } }),
  r({ id: 'brasskey', name: 'Brass Key', biome: 'rootsoil', lore: 'It fits no lock in Hearthmoor.', perk: 'Workshop prices -2%', apply: (s) => { s.costMul *= 0.98; } }),
  r({ id: 'wormcoil', name: 'Glass Worm', biome: 'rootsoil', lore: 'A tiny spiral of fused sand. Warm to the touch.', perk: 'Chains last +0.1 s', apply: (s) => { s.chainTime += 0.1; } }),
  // Amberstone
  r({ id: 'ambereye', name: 'Amber Eye', biome: 'amberstone', lore: 'A beetle, trapped mid-thought, a million years ago.', perk: '+5% gold', apply: (s) => { s.goldMul += 0.05; } }),
  r({ id: 'sundial', name: 'Buried Sundial', biome: 'amberstone', lore: 'It has been noon down here for a very long time.', perk: 'Fuel drains 3% slower', apply: (s) => { s.lightDrain *= 0.97; } }),
  r({ id: 'shellhorn', name: 'Spiral Horn', biome: 'amberstone', lore: 'Blow it and the rock answers.', perk: 'Shard bursts throw +1 shard', apply: (s) => { s.shardBonus += 1; } }),
  r({ id: 'miniature', name: 'Tin Miniature', biome: 'amberstone', lore: 'A little miner, lantern held high.', perk: '+4% gold', apply: (s) => { s.goldMul *= 1.04; } }),
  // Grotto
  r({ id: 'geodeheart', name: 'Singing Geode', biome: 'grotto', lore: 'Hold it to your ear: it hums the Grotto\'s note.', perk: 'Chain pot grows 5% faster', apply: (s) => { s.chainPot *= 1.05; } }),
  r({ id: 'mirror', name: 'Mirror Shard', biome: 'grotto', lore: 'Your reflection in it is always smiling.', perk: '+5% light radius', apply: (s) => { s.lightRadius += 0.05; } }),
  r({ id: 'bluebell', name: 'Crystal Bell', biome: 'grotto', lore: 'Its ring makes nearby crystal tremble.', perk: 'Shards deal +10% damage', apply: (s) => { s.shardDamage *= 1.1; } }),
  r({ id: 'mapcase', name: 'Cartographer\'s Case', biome: 'grotto', lore: 'Maps of tunnels nobody has dug yet.', perk: '+1 Relic Sense: relics lie nearer, the pointer reaches farther', apply: (s) => { s.prospect.relicSense += 1; s.surveyRange += 30; } }),
  // Emberdeep
  r({ id: 'forgecoal', name: 'Undying Coal', biome: 'emberdeep', lore: 'It has been burning since the world was young.', perk: '+8 lantern fuel', apply: (s) => { s.maxLight += 8; } }),
  r({ id: 'anvil', name: 'Thumb Anvil', biome: 'emberdeep', lore: 'Small enough for a pocket. Heavy as a promise.', perk: '+3% drill power', apply: (s) => { s.drillPower *= 1.03; } }),
  r({ id: 'salamander', name: 'Salamander Scale', biome: 'emberdeep', lore: 'It shimmers like heat over stone.', perk: 'Ember shards burst into +1 spark', apply: (s) => { s.emberSplit += 1; } }),
  r({ id: 'bellows', name: 'Tiny Bellows', biome: 'emberdeep', lore: 'One puff and the drill runs hotter.', perk: 'Drill heat +5% speed', apply: (s) => { s.heatMax += 0.05; } }),
  // Hollow
  r({ id: 'starcompass', name: 'Star Compass', biome: 'hollow', lore: 'It points down. Always down.', perk: 'Ore 4% chance to drop double', apply: (s) => { s.doubleOre += 0.04; } }),
  r({ id: 'voidpearl', name: 'Void Pearl', biome: 'hollow', lore: 'Darker than the dark around it.', perk: 'Chains refuel 10% more', apply: (s) => { s.chainFuel *= 1.1; } }),
  r({ id: 'moonlamp', name: 'Moon Lamp', biome: 'hollow', lore: 'Someone carried light this far before you.', perk: 'Fuel drains 4% slower', apply: (s) => { s.lightDrain *= 0.96; } }),
  r({ id: 'hourglass', name: 'Still Hourglass', biome: 'hollow', lore: 'The sand inside refuses to fall.', perk: 'Chains last +0.15 s', apply: (s) => { s.chainTime += 0.15; } }),
  // Mantle
  r({ id: 'crown', name: 'Magma Crown', biome: 'mantle', lore: 'Made for a head far larger than yours.', perk: '+8% gold', apply: (s) => { s.goldMul += 0.08; } }),
  r({ id: 'chalice', name: 'Molten Chalice', biome: 'mantle', lore: 'Whatever it held, it held it hot.', perk: 'Ore has +1% chance to drop a gem', apply: (s) => { s.gemChance += 0.01; } }),
  r({ id: 'gearheart', name: 'Clockwork Heart', biome: 'mantle', lore: 'Tick. Tick. Tick. It has never stopped.', perk: '+5% drill speed', apply: (s) => { s.drillRate *= 1.05; } }),
  r({ id: 'sunstone', name: 'Sunstone', biome: 'mantle', lore: 'A little of the Heart\'s light, broken off.', perk: 'Chain pot grows 8% faster', apply: (s) => { s.chainPot *= 1.08; } }),
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(RELICS.map((x) => [x.id, x]));
