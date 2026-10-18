/** Applies a finished descent to the save. Pure with respect to its inputs. */
import { BOON_BY_ID } from '../data/boons';
import { LIFT_STOPS } from '../data/biomes';
import type { RunSummary } from '../core/sim';
import type { SaveData } from './save';
import { DEMO } from '../config';

export interface BankResult {
  newDepthRecord: boolean;
  newChainRecord: boolean;
  unlockedStops: string[];
  /** first time the World's Heart was reached: play the ending */
  finale: boolean;
  /** a new Deep Pressure tier opened */
  newPressure: number;
}

/** A run counts toward Deep Pressure only if it started above the Mantle. */
export const PRESSURE_START_LIMIT = 1100;

export function bankRun(save: SaveData, r: RunSummary): BankResult {
  const res: BankResult = { newDepthRecord: false, newChainRecord: false, unlockedStops: [], finale: false, newPressure: 0 };
  const stopsBefore = availableStops(save).map((s) => s.id);
  save.gold += r.gold;
  save.gems += r.gems;
  save.cores += r.cores;
  save.stats.runs++;
  save.stats.totalGold += r.gold;
  save.stats.totalGems += r.gems;
  save.stats.flares += r.flares;
  save.stats.playTime += r.time;
  save.stats.longestRun = Math.max(save.stats.longestRun, r.time);
  save.stats.bestPot = Math.max(save.stats.bestPot, r.bestPot);
  save.stats.seals += r.seals;
  save.stats.geodes += r.geodes;
  if (r.bestChain > save.stats.bestChain) {
    res.newChainRecord = save.stats.bestChain > 0;
    save.stats.bestChain = r.bestChain;
  }
  if (r.maxDepth > save.maxDepth) {
    res.newDepthRecord = save.maxDepth > 0;
    save.maxDepth = r.maxDepth;
  }
  if (r.maxDepth > 1500) save.stats.endless = Math.max(save.stats.endless, r.maxDepth);
  for (const [k, v] of Object.entries(r.ores)) save.codex[k] = (save.codex[k] ?? 0) + (v ?? 0);
  for (const id of r.relics) if (!save.relics.includes(id)) save.relics.push(id);
  const boonCount = Object.values(r.boons).reduce((a, b) => a + b, 0);
  save.stats.maxBoons = Math.max(save.stats.maxBoons, boonCount);
  save.stats.mythics += Object.keys(r.boons).filter((id) => BOON_BY_ID[id]?.rarity === 'mythic').length;
  if (r.reachedHeart) {
    save.stats.hearts++;
    if (!save.credits) res.finale = true;
    // reaching the Heart at your highest pressure, from above the Mantle, opens the next tier
    if (save.maxGloom === 0 || (save.gloom >= save.maxGloom && r.startDepth <= PRESSURE_START_LIMIT)) {
      const next = Math.min(10, Math.max(1, save.gloom + 1));
      if (next > save.maxGloom) {
        save.maxGloom = next;
        res.newPressure = next;
      }
    }
  }
  res.unlockedStops = availableStops(save).map((s) => s.id).filter((id) => !stopsBefore.includes(id));
  return res;
}

export function availableStops(save: SaveData) {
  return LIFT_STOPS.filter((s) => !DEMO || s.depth < 200).filter((s) => s.depth === 0 || (save.maxDepth >= s.depth && (!s.afterHeart || save.stats.hearts > 0)));
}
