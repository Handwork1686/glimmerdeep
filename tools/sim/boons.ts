/**
 * What is each boon worth? Every boon is handed to a mid-game build at the start of a dig (one stack, or
 * all of them with --max), every other hand is skipped, and the dig is compared with a dig that took no
 * boon at all: depth reached, gold earned, tiles broken. Boons that change nothing are auto-skips; boons
 * that dwarf the rest are auto-picks.
 *   npm run sim:boons [-- --max]
 */
import { Bot } from '../../src/core/bot';
import { Sim } from '../../src/core/sim';
import { BOONS } from '../../src/data/boons';

const MID: Record<string, number> = {
  root: 1, oil: 3, steady: 2, lens: 1, mosslore: 1, reserve: 1, recycler: 1, bit: 5, gearing: 3, pulverize: 2, diamond: 2, brittle: 3, keen: 3,
  bounty: 2, fault: 1, treads: 2, gyro: 2, longfuse: 1, appraise: 3, lucky: 2, draw: 1, shardveins: 2,
};
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX = process.argv.includes('--max');

function dig(ids: string[], seed: number) {
  const sim = new Sim({ seed: 500 + seed, upgrades: MID, gloom: 0 });
  for (const id of ids) {
    const def = BOONS.find((b) => b.id === id)!;
    for (let k = 0; k < (MAX ? def.max : 1); k++) {
      sim.choices = [];
      sim.choose(id);
    }
    sim.choices = null;
  }
  const bot = new Bot();
  let steps = 0;
  while (!sim.over && steps < 60 * 900) {
    if (sim.pendingLevels > 0) {
      sim.openChoice();
      sim.skipChoice();
    }
    sim.step(bot.think(sim));
    sim.drainEvents();
    steps++;
  }
  const s = sim.summary();
  return { depth: s.maxDepth, gold: s.gold, time: s.time, breaks: Object.values(sim.breaksBy).reduce((a, b) => a + b, 0) };
}
function mean(ids: string[]) {
  const rs = SEEDS.map((s) => dig(ids, s));
  const avg = (k: 'depth' | 'gold' | 'time' | 'breaks') => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return { depth: avg('depth'), gold: avg('gold'), time: avg('time'), breaks: avg('breaks') };
}
const base = mean([]);
console.log(`no boon: depth ${base.depth.toFixed(0)} m, gold ${base.gold.toFixed(0)}, ${base.time.toFixed(0)} s, ${base.breaks.toFixed(0)} tiles`);
console.log(`${MAX ? 'max stacks' : 'one stack'} of each boon, vs no boon (x = ratio):`);
const rows = BOONS.map((b) => {
  const m = mean([b.id]);
  return { id: b.id, rarity: b.rarity, depth: m.depth / base.depth, gold: m.gold / Math.max(1, base.gold), time: m.time / base.time, breaks: m.breaks / base.breaks };
}).sort((a, b) => b.depth * b.gold - a.depth * a.gold);
for (const r of rows) {
  console.log(`  ${r.id.padEnd(13)} ${r.rarity.padEnd(7)} depth x${r.depth.toFixed(2)}  gold x${r.gold.toFixed(2)}  length x${r.time.toFixed(2)}  tiles x${r.breaks.toFixed(2)}`);
}
