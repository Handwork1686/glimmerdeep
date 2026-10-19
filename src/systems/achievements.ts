/** Achievement definitions, unlock checks and the Steam bridge. */
import { RELICS } from '../data/relics';
import { SHARD_TYPES, shardCodexKey } from '../data/shards';
import { ORE_KINDS } from '../data/tiles';
import { UPGRADES } from '../data/upgrades';
import type { RunSummary } from '../core/sim';
import { Save, SaveData } from './save';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  hidden?: boolean;
  check: (s: SaveData, run?: RunSummary) => boolean;
}

/** share of the whole Codex discovered: ores, shard types and relics (22 + 11 + 24) */
export const codexPct = (s: SaveData) => {
  const ores = ORE_KINDS.filter((k) => (s.codex[k] ?? 0) > 0).length;
  const shards = SHARD_TYPES.filter((t) => (s.codex[shardCodexKey(t.id)] ?? 0) > 0).length;
  return (ores + shards + s.relics.length) / (ORE_KINDS.length + SHARD_TYPES.length + RELICS.length);
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_light', name: 'First Light', desc: 'Finish your first dig.', icon: 'lantern', check: (s) => s.stats.runs >= 1 },
  { id: 'down_we_go', name: 'Down We Go', desc: 'Reach 50 m.', icon: 'drill', check: (s) => s.maxDepth >= 50 },
  { id: 'amber_age', name: 'Amber Age', desc: 'Reach the Amberstone.', icon: 'drill', check: (s) => s.maxDepth >= 120 },
  { id: 'seal_breaker', name: 'Ribbon Cutter', desc: 'Break into a rune ribbon.', icon: 'shard', check: (s) => s.stats.seals >= 1 },
  { id: 'glimmering', name: 'Glimmering', desc: 'Reach the Glimmer Grotto.', icon: 'shard', check: (s) => s.maxDepth >= 306 },
  { id: 'into_the_fire', name: 'Into the Fire', desc: 'Reach Emberdeep.', icon: 'bomb', check: (s) => s.maxDepth >= 526 },
  { id: 'hollowed', name: 'Hollowed', desc: 'Reach The Hollow.', icon: 'eye', check: (s) => s.maxDepth >= 766 },
  { id: 'mantle', name: 'Under Pressure', desc: 'Reach The Mantle.', icon: 'heart', check: (s) => s.maxDepth >= 1056 },
  { id: 'lightbringer', name: 'Lightbringer', desc: "Reach the World's Heart and relight Hearthmoor.", icon: 'star', check: (s) => s.stats.hearts >= 1 },
  { id: 'endless', name: 'Deeper Still', desc: 'Reach 2,000 m.', icon: 'radius', check: (s) => s.maxDepth >= 2000 },
  { id: 'chain25', name: 'Chain Reaction', desc: 'Make a chain of 25.', icon: 'chain', check: (s) => s.stats.bestChain >= 25 },
  { id: 'chain100', name: 'Avalanche', desc: 'Make a chain of 100.', icon: 'chain', check: (s) => s.stats.bestChain >= 100 },
  { id: 'chain500', name: 'Quake', desc: 'Make a chain of 500.', icon: 'chain', check: (s) => s.stats.bestChain >= 500 },
  { id: 'chain1000', name: 'Worldbreaker', desc: 'Make a chain of 1,000.', icon: 'chain', check: (s) => s.stats.bestChain >= 1000 },
  { id: 'pot10k', name: 'Jackpot', desc: 'Cash out a chain pot worth 10,000 gold.', icon: 'coin', check: (s) => s.stats.bestPot >= 10000 },
  { id: 'gold1k', name: 'Pocket Change', desc: 'Earn 1,000 gold in total.', icon: 'coin', check: (s) => s.stats.totalGold >= 1000 },
  { id: 'gold25k', name: 'Rich Vein', desc: 'Earn 25,000 gold in total.', icon: 'coin', check: (s) => s.stats.totalGold >= 25000 },
  { id: 'gold1m', name: 'Motherlode', desc: 'Earn 1,000,000 gold in total.', icon: 'coin', check: (s) => s.stats.totalGold >= 1e6 },
  { id: 'gems50', name: 'Gem Collector', desc: 'Find 50 gems in total.', icon: 'gem', check: (s) => s.stats.totalGems >= 50 },
  { id: 'geode', name: 'Hollow Treasure', desc: 'Crack open a geode.', icon: 'gem', check: (s) => s.stats.geodes >= 1 },
  { id: 'relic1', name: 'Keepsake', desc: 'Find a relic.', icon: 'eye', check: (s) => s.relics.length >= 1 },
  { id: 'relic12', name: 'Curator', desc: 'Find 12 relics.', icon: 'eye', check: (s) => s.relics.length >= 12 },
  { id: 'relic24', name: 'Every Last Treasure', desc: 'Find all 24 relics.', icon: 'star', check: (s) => s.relics.length >= RELICS.length },
  { id: 'codex50', name: 'Field Notes', desc: 'Fill half the Codex.', icon: 'plus', check: (s) => codexPct(s) >= 0.5 },
  { id: 'codex100', name: 'Natural Historian', desc: 'Complete the Codex.', icon: 'star', check: (s) => codexPct(s) >= 1 },
  { id: 'fully_lit', name: 'Fully Lit', desc: 'Max out Wick Oil.', icon: 'lantern', check: (s) => (s.upgrades.oil ?? 0) >= 5 },
  { id: 'tinkerer', name: 'Tinkerer', desc: 'Buy 25 Workshop upgrades.', icon: 'plus', check: (s) => s.stats.nodesBought >= 25 },
  { id: 'artisan', name: 'Master Artisan', desc: 'Max out every Workshop node.', icon: 'star', check: (s) => UPGRADES.every((u) => u.infinite || (s.upgrades[u.id] ?? 0) >= u.max) },
  { id: 'hoarder', name: 'Boon Hoarder', desc: 'Hold 10 boons in a single dig.', icon: 'dice', check: (s) => s.stats.maxBoons >= 10 },
  { id: 'mythic', name: 'Touched by Myth', desc: 'Take a mythic boon.', icon: 'star', check: (s) => s.stats.mythics >= 1 },
  { id: 'flare_gun', name: 'Shard Bomber', desc: 'Throw 500 Shard Bombs.', icon: 'shardbomb', check: (s) => s.stats.bombs >= 500 },
  { id: 'deep_breath', name: 'Deep Breath', desc: 'Make a single dig last 5 minutes.', icon: 'clock', check: (s) => s.stats.longestRun >= 300 },
  { id: 'gloom1', name: 'Feeling the Weight', desc: 'Finish a dig on Deep Pressure 1.', icon: 'eye', check: (s, r) => !!r && s.gloom >= 1 },
  { id: 'gloom5', name: 'Crushing Depths', desc: "Reach the World's Heart on Deep Pressure 5.", icon: 'eye', check: (s, r) => !!r && s.gloom >= 5 && r.reachedHeart },
  { id: 'gloom10', name: 'The Full Weight', desc: "Reach the World's Heart on Deep Pressure 10.", icon: 'star', check: (s, r) => !!r && s.gloom >= 10 && r.reachedHeart },
  { id: 'no_moss', name: 'Self-Reliant', desc: 'Reach 120 m in one dig without picking up fuel.', icon: 'drain', check: (_s, r) => !!r && r.maxDepth >= 120 && r.lightPickups === 0 },
  { id: 'speedy', name: 'Plummet', desc: 'Reach 100 m within 60 seconds of a dig.', icon: 'speed', hidden: true, check: () => false },
];

export type Unlock = (a: AchievementDef) => void;
let listener: Unlock | null = null;
export function onUnlock(fn: Unlock | null) {
  listener = fn;
}

export function unlock(id: string) {
  const s = Save.data;
  if (s.achievements[id]) return;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return;
  s.achievements[id] = Date.now();
  try {
    window.glimmer?.achievement?.(id);
  } catch {
    /* steam not present */
  }
  listener?.(def);
}

export function checkAll(run?: RunSummary) {
  for (const a of ACHIEVEMENTS) {
    if (!Save.data.achievements[a.id] && a.check(Save.data, run)) unlock(a.id);
  }
}
