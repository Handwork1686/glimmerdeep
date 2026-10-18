/**
 * Terrain definitions. ORDER MUST MATCH tools/art/tiles.py TILE_NAMES — a unit
 * test asserts this against public/assets/tiles.json.
 */
export const TILE_NAMES = [
  'air', 'bedrock', 'dirt', 'clay', 'stone', 'copper', 'quartz', 'lampmoss',
  'boulder', 'sandstone', 'limestone', 'silver', 'amber', 'fossil',
  'crystalrock', 'gold', 'sapphire', 'glimmer', 'basalt', 'obsidian',
  'fireopal', 'ruby', 'ember', 'voidstone', 'starmetal', 'prism', 'voidglass',
  'brick', 'turf',
  // added for the dig to the World's Heart (append only: the tileset is indexed by order)
  'tin', 'jade', 'opal', 'emerald', 'aether', 'magmarock', 'cinnabar', 'moonstone', 'mithril',
  'heartrock', 'heartstone', 'geode', 'seal', 'relic', 'worldheart',
] as const;

export type TileName = (typeof TILE_NAMES)[number];
export const T = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i])) as Record<TileName, number>;

export type ItemKind =
  | 'copper' | 'quartz' | 'silver' | 'amber' | 'fossil' | 'gold' | 'sapphire' | 'glimmer'
  | 'fireopal' | 'ruby' | 'starmetal' | 'prism' | 'voidglass'
  | 'tin' | 'jade' | 'opal' | 'emerald' | 'aether' | 'cinnabar' | 'moonstone' | 'mithril' | 'heartstone'
  | 'orb' | 'core';

/** Every collectible ore, in codex order (shallow to deep). */
export const ORE_KINDS: ItemKind[] = [
  'copper', 'tin', 'quartz', 'silver', 'amber', 'jade', 'fossil', 'gold', 'glimmer', 'sapphire', 'opal',
  'fireopal', 'ruby', 'emerald', 'starmetal', 'voidglass', 'prism', 'aether', 'cinnabar', 'moonstone', 'mithril', 'heartstone',
];

export interface TileDef {
  name: TileName;
  hp: number;
  solid: boolean;
  /** Can never be broken. */
  unbreakable?: boolean;
  /** Is an ore (affected by ore-specific bonuses). */
  ore?: boolean;
  /** Item drops: kind, count, gold per item. */
  drop?: { kind: ItemKind; count: number; gold: number };
  /** Gems awarded directly on break. */
  gems?: number;
  /** Light restored on break. */
  light?: number;
  /** Breaks into N crystal shards. */
  shards?: number;
  /** Explodes on break (radius in tiles, damage). */
  explode?: { radius: number; damage: number };
  /** Falls when unsupported. */
  falls?: boolean;
  /** Emits light (radius in tiles) and a glow colour. */
  glow?: { r: number; color: number };
  xp: number;
  /** Debris tint. */
  tint: number;
  /** Cores awarded on break. */
  cores?: number;
}

const d = (name: TileName, o: Omit<TileDef, 'name' | 'solid'> & { solid?: boolean }): TileDef => ({
  name,
  solid: o.solid ?? true,
  ...o,
});

export const TILES: TileDef[] = [
  d('air', { hp: 0, solid: false, xp: 0, tint: 0x000000 }),
  d('bedrock', { hp: 1e9, unbreakable: true, xp: 0, tint: 0x352c52 }),
  d('dirt', { hp: 2, xp: 0.25, tint: 0x7c4a30 }),
  d('clay', { hp: 5, xp: 0.4, tint: 0x8f4425 }),
  d('stone', { hp: 10, xp: 0.6, tint: 0x8a80a6 }),
  d('copper', { hp: 12, ore: true, drop: { kind: 'copper', count: 3, gold: 1 }, xp: 2, tint: 0xec9446 }),
  d('quartz', { hp: 9, ore: true, shards: 4, drop: { kind: 'quartz', count: 2, gold: 2 }, xp: 2, glow: { r: 1.2, color: 0x5fe0c4 }, tint: 0xc4fff0 }),
  d('lampmoss', { hp: 3, light: 4, xp: 1, glow: { r: 1.6, color: 0xb3dd7a }, tint: 0x6aaa4a }),
  d('boulder', { hp: 14, falls: true, xp: 0.6, tint: 0x8a80a6 }),
  d('sandstone', { hp: 18, xp: 0.8, tint: 0xdcb172 }),
  d('limestone', { hp: 28, xp: 1, tint: 0xaab6c9 }),
  d('silver', { hp: 34, ore: true, drop: { kind: 'silver', count: 3, gold: 4 }, xp: 4, tint: 0xd3dde8 }),
  d('amber', { hp: 20, ore: true, light: 8, drop: { kind: 'amber', count: 2, gold: 3 }, xp: 4, glow: { r: 1.8, color: 0xf7b740 }, tint: 0xf7b740 }),
  d('fossil', { hp: 30, ore: true, gems: 1, drop: { kind: 'fossil', count: 1, gold: 5 }, xp: 6, tint: 0xf2d79f }),
  d('crystalrock', { hp: 55, xp: 1.2, tint: 0x3a6fd0 }),
  d('gold', { hp: 65, ore: true, drop: { kind: 'gold', count: 3, gold: 12 }, xp: 7, glow: { r: 1.0, color: 0xffd877 }, tint: 0xffd877 }),
  d('sapphire', { hp: 70, ore: true, gems: 1, drop: { kind: 'sapphire', count: 1, gold: 10 }, xp: 9, glow: { r: 1.0, color: 0x72aef2 }, tint: 0x72aef2 }),
  d('glimmer', { hp: 50, ore: true, shards: 5, drop: { kind: 'glimmer', count: 3, gold: 10 }, xp: 7, glow: { r: 1.8, color: 0x5fe0c4 }, tint: 0x5fe0c4 }),
  d('basalt', { hp: 110, xp: 1.6, tint: 0x685e86 }),
  d('obsidian', { hp: 260, xp: 2.5, tint: 0x4f1f6e }),
  d('fireopal', { hp: 120, ore: true, drop: { kind: 'fireopal', count: 3, gold: 22 }, xp: 12, glow: { r: 1.2, color: 0xf0564a }, tint: 0xf0564a }),
  d('ruby', { hp: 130, ore: true, gems: 2, drop: { kind: 'ruby', count: 1, gold: 25 }, xp: 14, glow: { r: 1.0, color: 0xf0564a }, tint: 0xbd2d3a }),
  d('ember', { hp: 40, explode: { radius: 2.0, damage: 70 }, xp: 3, glow: { r: 1.8, color: 0xf0564a }, tint: 0xf0564a }),
  d('voidstone', { hp: 450, xp: 3, tint: 0x8034a6 }),
  d('starmetal', { hp: 500, ore: true, drop: { kind: 'starmetal', count: 4, gold: 45 }, xp: 22, glow: { r: 1.0, color: 0xe9acff }, tint: 0xd3dde8 }),
  d('prism', { hp: 420, ore: true, gems: 3, drop: { kind: 'prism', count: 1, gold: 40 }, xp: 26, glow: { r: 1.3, color: 0xc4fff0 }, tint: 0xe9acff }),
  d('voidglass', { hp: 300, ore: true, shards: 6, drop: { kind: 'voidglass', count: 3, gold: 30 }, xp: 20, glow: { r: 1.8, color: 0xb862de }, tint: 0xb862de }),
  d('brick', { hp: 1e9, unbreakable: true, xp: 0, tint: 0x8a80a6 }),
  d('turf', { hp: 2, xp: 0.25, tint: 0x6aaa4a }),
  d('tin', { hp: 8, ore: true, drop: { kind: 'tin', count: 2, gold: 2 }, xp: 1.5, tint: 0xaab6c9 }),
  d('jade', { hp: 40, ore: true, drop: { kind: 'jade', count: 2, gold: 7 }, xp: 5, glow: { r: 0.9, color: 0x6aaa4a }, tint: 0x6aaa4a }),
  d('opal', { hp: 60, ore: true, shards: 3, drop: { kind: 'opal', count: 2, gold: 16 }, xp: 8, glow: { r: 1.4, color: 0xc8ecff }, tint: 0xc8ecff }),
  d('emerald', { hp: 140, ore: true, gems: 2, drop: { kind: 'emerald', count: 1, gold: 32 }, xp: 15, glow: { r: 1.1, color: 0x6aaa4a }, tint: 0x3b7a3d }),
  d('aether', { hp: 320, ore: true, shards: 7, drop: { kind: 'aether', count: 3, gold: 42 }, xp: 22, glow: { r: 2.0, color: 0xc4fff0 }, tint: 0xc4fff0 }),
  d('magmarock', { hp: 800, xp: 4, tint: 0x76192f }),
  d('cinnabar', { hp: 520, ore: true, explode: { radius: 2.5, damage: 900 }, drop: { kind: 'cinnabar', count: 2, gold: 65 }, xp: 26, glow: { r: 1.6, color: 0xf0564a }, tint: 0xf0564a }),
  d('moonstone', { hp: 560, ore: true, shards: 6, drop: { kind: 'moonstone', count: 3, gold: 75 }, xp: 28, glow: { r: 1.8, color: 0xc8ecff }, tint: 0xd3dde8 }),
  d('mithril', { hp: 900, ore: true, drop: { kind: 'mithril', count: 4, gold: 110 }, xp: 34, glow: { r: 1.0, color: 0xf4f8fb }, tint: 0xf4f8fb }),
  d('heartrock', { hp: 1100, xp: 5, tint: 0xdd8a1c }),
  d('heartstone', { hp: 700, ore: true, shards: 8, cores: 1, drop: { kind: 'heartstone', count: 3, gold: 160 }, xp: 50, glow: { r: 2.2, color: 0xffd877 }, tint: 0xffd877 }),
  d('geode', { hp: 30, shards: 6, gems: 1, xp: 6, glow: { r: 0.8, color: 0xb862de }, tint: 0xb862de }),
  d('seal', { hp: 60, xp: 30, glow: { r: 0.7, color: 0x5fe0c4 }, tint: 0x5fe0c4 }),
  d('relic', { hp: 20, xp: 25, glow: { r: 1.0, color: 0xfff0b5 }, tint: 0xfff0b5 }),
  d('worldheart', { hp: 9000, xp: 400, glow: { r: 4.0, color: 0xfffbea }, tint: 0xfffbea }),
];

export const ITEM_GLOW: Partial<Record<ItemKind, number>> = {
  orb: 0xffd877,
  core: 0x5fe0c4,
};
