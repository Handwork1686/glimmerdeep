import { BOON_BY_ID, BOONS, BoonDef, RARITY_WEIGHT } from '../data/boons';
import { RELIC_BY_ID } from '../data/relics';
import { UPGRADES } from '../data/upgrades';
import { Rng } from './rng';
import { baseStats, Stats } from './stats';

/**
 * Deep Pressure tiers (optional difficulty, unlocked by reaching the World's
 * Heart). Each tier pays more but burns fuel faster and hardens the rock.
 */
export interface GloomMods {
  drainMul: number;
  rockMul: number;
  goldMul: number;
  boonChoiceDelta: number;
}

export const GLOOM_DESCRIPTIONS = [
  'The ordinary deep.',
  'Fuel burns 10% faster.',
  'Rock is 15% tougher.',
  'Fuel burns 15% faster.',
  'Rock is 25% tougher.',
  'Fuel burns 20% faster.',
  'Rock is 35% tougher.',
  'One fewer boon to choose from.',
  'Fuel burns 30% faster.',
  'Rock is 50% tougher.',
  'The full weight of the world. Everything at once.',
];

export function gloomMods(tier: number): GloomMods {
  const m: GloomMods = { drainMul: 1, rockMul: 1, goldMul: 1 + 0.25 * tier, boonChoiceDelta: 0 };
  if (tier >= 1) m.drainMul = 1.1;
  if (tier >= 2) m.rockMul = 1.15;
  if (tier >= 3) m.drainMul = 1.15;
  if (tier >= 4) m.rockMul = 1.25;
  if (tier >= 5) m.drainMul = 1.2;
  if (tier >= 6) m.rockMul = 1.35;
  if (tier >= 7) m.boonChoiceDelta = -1;
  if (tier >= 8) m.drainMul = 1.3;
  if (tier >= 9) m.rockMul = 1.5;
  if (tier >= 10) {
    m.drainMul = 1.4;
    m.rockMul = 1.65;
  }
  return m;
}

/**
 * Stats from Workshop upgrades, found relics and this run's boons. The
 * repeatable Refine nodes multiply last, so they scale the real totals.
 */
export function computeStats(upgrades: Record<string, number>, boons: Record<string, number> = {}, relics: string[] = []): Stats {
  const s = baseStats();
  for (const u of UPGRADES) {
    const lvl = upgrades[u.id] ?? 0;
    if (lvl > 0 && !u.infinite) u.apply(s, lvl);
  }
  for (const id of relics) RELIC_BY_ID[id]?.apply(s);
  for (const [id, k] of Object.entries(boons)) {
    const def = BOON_BY_ID[id];
    if (def && k > 0) def.apply(s, k);
  }
  for (const u of UPGRADES) {
    const lvl = upgrades[u.id] ?? 0;
    if (lvl > 0 && u.infinite) u.apply(s, lvl);
  }
  return s;
}

/** Roll a hand of distinct boons, respecting stack caps and banishes. */
export function rollBoons(rng: Rng, count: number, owned: Record<string, number>, banished: Set<string>, luck: number): BoonDef[] {
  const pool = BOONS.filter((b) => !banished.has(b.id) && (owned[b.id] ?? 0) < b.max);
  const out: BoonDef[] = [];
  const weights = (b: BoonDef) => {
    let w = RARITY_WEIGHT[b.rarity];
    if (b.rarity === 'rare') w *= 1 + 0.35 * luck;
    if (b.rarity === 'mythic') w *= 1 + 0.6 * luck;
    return w;
  };
  while (out.length < count && pool.length > 0) {
    const pick = rng.weighted(pool.map((b) => [b, weights(b)] as const));
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

export function xpForLevel(level: number): number {
  // level 1 -> 2 needs 10 xp; grows ~28% per level
  return Math.round(10 * Math.pow(1.3, level - 1));
}
