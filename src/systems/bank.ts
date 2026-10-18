/** Applies a finished descent to the save. Pure with respect to its inputs. */
import { BOON_BY_ID } from '../data/boons';
import type { RunSummary } from '../core/sim';
import type { SaveData } from './save';
import { cleanSeals } from './save';

export interface BankResult {
  newDepthRecord: boolean;
  newChainRecord: boolean;
  /** first time the World's Heart was reached: play the ending */
  finale: boolean;
  /** a new Deep Pressure tier opened */
  newPressure: number;
}

export function bankRun(save: SaveData, r: RunSummary): BankResult {
  const res: BankResult = { newDepthRecord: false, newChainRecord: false, finale: false, newPressure: 0 };
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
  // broken seals stay broken
  save.sealsBroken = cleanSeals([...save.sealsBroken, ...r.sealsBroken]);
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
    // reaching the Heart at your highest pressure opens the next tier (every dig starts at the surface)
    if (save.maxGloom === 0 || save.gloom >= save.maxGloom) {
      const next = Math.min(10, Math.max(1, save.gloom + 1));
      if (next > save.maxGloom) {
        save.maxGloom = next;
        res.newPressure = next;
      }
    }
  }
  return res;
}
