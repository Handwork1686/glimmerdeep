import { T } from './tiles';

export type BiomeId = 'rootsoil' | 'amberstone' | 'grotto' | 'emberdeep' | 'hollow' | 'mantle' | 'heart';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  from: number;
  to: number;
  /** base materials: [tile, weight at biome top, weight at biome bottom] */
  base: [number, number, number][];
  ores: { tile: number; perBand: number; len: [number, number]; minT?: number }[];
  /** scattered specials replacing solid tiles: [tile, chance] */
  scatter: [number, number][];
  cave: number; // 0..1 openness
  drain: number; // lantern fuel drain multiplier: the deep is darker
  ambient: number; // background tint colour
  music: string;
  /** crystal that fills this biome's geode vaults */
  geodeFill: number;
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'rootsoil', name: 'Rootsoil', from: 0, to: 120,
    base: [[T.dirt, 10, 1], [T.clay, 1.2, 2.5], [T.stone, 0.15, 7]],
    ores: [
      { tile: T.copper, perBand: 3.2, len: [3, 7] },
      { tile: T.tin, perBand: 1.4, len: [2, 5], minT: 0.15 },
      { tile: T.quartz, perBand: 1.3, len: [2, 5], minT: 0.08 },
    ],
    scatter: [[T.lampmoss, 0.0045], [T.boulder, 0.004]],
    cave: 0.32, ambient: 0x3c2420, music: 'rootsoil', drain: 1.0, geodeFill: T.quartz,
  },
  {
    id: 'amberstone', name: 'Amberstone', from: 120, to: 300,
    base: [[T.sandstone, 6, 3], [T.limestone, 1.5, 5], [T.stone, 1, 0.4]],
    ores: [
      { tile: T.silver, perBand: 2.6, len: [3, 7] },
      { tile: T.amber, perBand: 1.2, len: [2, 4] },
      { tile: T.jade, perBand: 0.9, len: [2, 4], minT: 0.25 },
      { tile: T.copper, perBand: 1.0, len: [3, 6] },
      { tile: T.quartz, perBand: 1.6, len: [3, 6] },
      { tile: T.fossil, perBand: 0.45, len: [1, 2] },
    ],
    scatter: [[T.lampmoss, 0.0025], [T.boulder, 0.008]],
    cave: 0.36, ambient: 0x6e4a32, music: 'amberstone', drain: 1.12, geodeFill: T.quartz,
  },
  {
    id: 'grotto', name: 'Glimmer Grotto', from: 300, to: 520,
    base: [[T.crystalrock, 8, 8], [T.limestone, 1, 0.2], [T.stone, 0.6, 0.2]],
    ores: [
      { tile: T.gold, perBand: 2.4, len: [3, 6] },
      { tile: T.glimmer, perBand: 2.3, len: [3, 8] },
      { tile: T.opal, perBand: 0.9, len: [2, 4], minT: 0.2 },
      { tile: T.sapphire, perBand: 0.7, len: [1, 2] },
      { tile: T.silver, perBand: 0.6, len: [2, 5] },
    ],
    scatter: [[T.lampmoss, 0.003], [T.amber, 0.003]],
    cave: 0.42, ambient: 0x1a2352, music: 'grotto', drain: 1.28, geodeFill: T.glimmer,
  },
  {
    id: 'emberdeep', name: 'Emberdeep', from: 520, to: 760,
    base: [[T.basalt, 8, 6], [T.obsidian, 0.6, 2.6]],
    ores: [
      { tile: T.fireopal, perBand: 2.2, len: [3, 6] },
      { tile: T.ruby, perBand: 0.7, len: [1, 2] },
      { tile: T.emerald, perBand: 0.6, len: [1, 2], minT: 0.2 },
      { tile: T.gold, perBand: 0.9, len: [2, 4] },
      { tile: T.ember, perBand: 1.4, len: [1, 3] },
    ],
    scatter: [[T.ember, 0.005], [T.amber, 0.003]],
    cave: 0.38, ambient: 0x3b0f22, music: 'emberdeep', drain: 1.45, geodeFill: T.glimmer,
  },
  {
    id: 'hollow', name: 'The Hollow', from: 760, to: 1050,
    base: [[T.voidstone, 8, 8], [T.obsidian, 1.2, 0.6]],
    ores: [
      { tile: T.starmetal, perBand: 2.0, len: [3, 6] },
      { tile: T.voidglass, perBand: 2.2, len: [3, 8] },
      { tile: T.aether, perBand: 0.8, len: [2, 4], minT: 0.25 },
      { tile: T.prism, perBand: 0.6, len: [1, 2] },
      { tile: T.ember, perBand: 0.8, len: [1, 3] },
    ],
    scatter: [[T.amber, 0.004], [T.lampmoss, 0.002]],
    cave: 0.45, ambient: 0x2a0f3c, music: 'hollow', drain: 1.65, geodeFill: T.voidglass,
  },
  {
    id: 'mantle', name: 'The Mantle', from: 1050, to: 1500,
    base: [[T.magmarock, 8, 8], [T.basalt, 1.5, 0.3], [T.obsidian, 1, 1.5]],
    ores: [
      { tile: T.mithril, perBand: 1.8, len: [3, 6] },
      { tile: T.moonstone, perBand: 2.0, len: [3, 7] },
      { tile: T.cinnabar, perBand: 1.2, len: [1, 3] },
      { tile: T.starmetal, perBand: 0.6, len: [2, 4] },
      { tile: T.heartstone, perBand: 0.12, len: [1, 1], minT: 0.5 },
    ],
    scatter: [[T.amber, 0.004], [T.ember, 0.004]],
    cave: 0.4, ambient: 0x3b0f22, music: 'mantle', drain: 1.8, geodeFill: T.moonstone,
  },
  {
    id: 'heart', name: "The World's Heart", from: 1500, to: 99999,
    base: [[T.heartrock, 8, 8], [T.magmarock, 1, 1]],
    ores: [
      { tile: T.heartstone, perBand: 0.8, len: [1, 3] },
      { tile: T.mithril, perBand: 1.4, len: [3, 6] },
      { tile: T.moonstone, perBand: 1.4, len: [3, 7] },
      { tile: T.aether, perBand: 1.2, len: [2, 5] },
      { tile: T.cinnabar, perBand: 0.8, len: [1, 3] },
      { tile: T.prism, perBand: 0.5, len: [1, 2] },
    ],
    scatter: [[T.amber, 0.005]],
    cave: 0.44, ambient: 0x6b3410, music: 'heart', drain: 2.0, geodeFill: T.heartstone,
  },
];

export function biomeAt(depth: number): BiomeDef {
  for (const b of BIOMES) if (depth < b.to) return b;
  return BIOMES[BIOMES.length - 1];
}

/**
 * Strata Seals: glowing bands at biome boundaries that only a strong enough
 * drill can break. They replace the old guardians as the game's gates.
 */
export interface SealDef {
  depth: number;
  /** drill power needed to break it */
  power: number;
  name: string;
}

export const SEALS: SealDef[] = [
  { depth: 300, power: 10, name: 'The Amber Seal' },
  { depth: 520, power: 22, name: 'The Glimmer Seal' },
  { depth: 760, power: 40, name: 'The Ember Seal' },
  { depth: 1050, power: 90, name: 'The Hollow Seal' },
  { depth: 1494, power: 150, name: 'The Mantle Seal' },
];
export const SEAL_ROWS = 3;

/** The World's Heart chamber: a great cavern with the heart crystal at its centre. */
export const HEART_DEPTH = 1500;
export const HEART_CHAMBER = 18;
