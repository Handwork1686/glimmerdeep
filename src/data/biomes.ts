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
    cave: 0.32, ambient: 0x3c2420, music: 'rootsoil', geodeFill: T.quartz,
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
    cave: 0.36, ambient: 0x6e4a32, music: 'amberstone', geodeFill: T.quartz,
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
    cave: 0.42, ambient: 0x1a2352, music: 'grotto', geodeFill: T.glimmer,
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
    cave: 0.38, ambient: 0x3b0f22, music: 'emberdeep', geodeFill: T.glimmer,
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
    cave: 0.45, ambient: 0x2a0f3c, music: 'hollow', geodeFill: T.voidglass,
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
    cave: 0.4, ambient: 0x3b0f22, music: 'mantle', geodeFill: T.moonstone,
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
    cave: 0.44, ambient: 0x6b3410, music: 'heart', geodeFill: T.heartstone,
  },
];

export function biomeAt(depth: number): BiomeDef {
  for (const b of BIOMES) if (depth < b.to) return b;
  return BIOMES[BIOMES.length - 1];
}

/** layers melt into each other over this many metres, centred on the boundary */
export const BLEND_M = 50;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * The biome at a depth, blended: inside a boundary's band each cell belongs to
 * the next biome with probability `p` (a smooth-step from 0 to 1), otherwise `a`.
 */
export function blendAt(depth: number): { a: BiomeDef; b: BiomeDef | null; p: number } {
  for (let i = 0; i < BIOMES.length - 1; i++) {
    const edge = BIOMES[i].to;
    if (Math.abs(depth - edge) < BLEND_M / 2) return { a: BIOMES[i], b: BIOMES[i + 1], p: smooth((depth - (edge - BLEND_M / 2)) / BLEND_M) };
  }
  return { a: biomeAt(depth), b: null, p: 0 };
}

/**
 * Optional rune ribbons: a 2-row band of breakable rune stone, with gaps, at the
 * old seal depths. They are a rich shard source, never a wall.
 */
export interface SealDef {
  depth: number;
  name: string;
}

export const SEALS: SealDef[] = [
  { depth: 300, name: 'The Amber Ribbon' },
  { depth: 520, name: 'The Glimmer Ribbon' },
  { depth: 760, name: 'The Ember Ribbon' },
  { depth: 1050, name: 'The Hollow Ribbon' },
  { depth: 1494, name: 'The Mantle Ribbon' },
];
export const SEAL_ROWS = 2;

/** The World's Heart chamber: a great cavern with the heart crystal at its centre. */
export const HEART_DEPTH = 1500;
export const HEART_CHAMBER = 18;
