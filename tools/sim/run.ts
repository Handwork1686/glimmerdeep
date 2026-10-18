/**
 * Economy / pacing simulation: a bot plays many descents in a row, banking
 * loot and buying Workshop upgrades between runs, and we log milestones.
 *   npx vite-node tools/sim/run.ts [runs] [seed]
 */
import { Bot } from '../../src/core/bot';
import { computeStats } from '../../src/core/progression';
import { Sim } from '../../src/core/sim';
import { costOf, isAvailable, UPGRADES } from '../../src/data/upgrades';
import { availableStops, bankRun } from '../../src/systems/bank';
import { newSave } from '../../src/systems/save';

const RUNS = Number(process.argv[2] ?? 120);
const CAMP_OVERHEAD = 25; // seconds spent in the workshop per run
const save = newSave();
let clock = 0;
const milestones: Record<string, number> = {};
const mark = (k: string) => {
  if (!(k in milestones)) milestones[k] = clock;
};
const PRIORITY: Record<string, number> = { drill: 1.0, light: 0.95, fortune: 0.85, shatter: 0.8, hull: 0.7, arcana: 0.6, core: 0.5 };

function shop() {
  for (let guard = 0; guard < 200; guard++) {
    const st = computeStats(save.upgrades);
    let best: { id: string; score: number } | null = null;
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] ?? 0;
      if (lvl >= u.max || !isAvailable(u, save.upgrades)) continue;
      const c = costOf(u, lvl, st.costMul);
      if (c.gold > save.gold || (c.gems ?? 0) > save.gems || (c.cores ?? 0) > save.cores) continue;
      const score = PRIORITY[u.branch] / Math.log10(10 + c.gold);
      if (!best || score > best.score) best = { id: u.id, score };
    }
    if (!best) return;
    const u = UPGRADES.find((x) => x.id === best!.id)!;
    const lvl = save.upgrades[u.id] ?? 0;
    const c = costOf(u, lvl, computeStats(save.upgrades).costMul);
    save.gold -= c.gold;
    save.gems -= c.gems ?? 0;
    save.cores -= c.cores ?? 0;
    save.upgrades[u.id] = lvl + 1;
    save.stats.nodesBought++;
  }
}

for (let r = 0; r < RUNS; r++) {
  // deepest available lift stop
  const stops = availableStops(save);
  const stop = stops[stops.length - 1];
  const sim = new Sim({ seed: 1000 + r, upgrades: save.upgrades, relics: save.relics, startDepth: stop.depth, gloom: 0 });
  const bot = new Bot();
  let steps = 0;
  while (!sim.over && steps < 60 * 900) {
    if (sim.pendingLevels > 0) {
      const h = sim.openChoice();
      if (h && h.length) sim.choose(h[0].id);
    }
    sim.step(bot.think(sim));
    sim.drainEvents();
    steps++;
  }
  const sum = sim.summary();
  if (r < 4 || sum.time > 300) console.log("   light:", JSON.stringify(Object.fromEntries(Object.entries(sim.lightLog).map(([k, v]) => [k, Math.round(v)]))), "max", Math.round(sim.stats.maxLight), "drain", sim.stats.lightDrain.toFixed(2));
  clock += sum.time + CAMP_OVERHEAD;
  bankRun(save, sum);
  if (save.maxDepth >= 50) mark('50m');
  if (save.maxDepth >= 120) mark('Amberstone 120m');
  if (save.maxDepth >= 304) mark('Amber Seal (300m)');
  if (save.maxDepth >= 524) mark('Glimmer Seal (520m)');
  if (save.maxDepth >= 764) mark('Ember Seal (760m)');
  if (save.maxDepth >= 1054) mark('Hollow Seal (1050m)');
  if (save.maxDepth >= 1498) mark('Mantle Seal (1494m)');
  if (save.stats.hearts > 0) mark("World's Heart (credits)");
  const before = save.stats.nodesBought;
  shop();
  const st = computeStats(save.upgrades);
  if (r < 12 || r % 5 === 0 || sum.reachedHeart) {
    console.log(
      `run ${String(r + 1).padStart(3)} t=${(clock / 60).toFixed(1).padStart(5)}m from ${String(stop.depth).padStart(4)}m -> ${String(sum.maxDepth).padStart(4)}m ` +
        `${sum.time.toFixed(0).padStart(3)}s gold +${String(sum.gold).padStart(6)} gems +${sum.gems} cores +${sum.cores} chain ${sum.bestChain} ` +
        `bought ${save.stats.nodesBought - before} | power ${st.drillPower.toFixed(0)} rate ${st.drillRate.toFixed(1)} light ${st.maxLight.toFixed(0)} pot ${sum.bestPot} relics ${save.relics.length}${sum.reachedHeart ? ' HEART' : ''}`,
    );
  }
  if (save.stats.hearts > 0) break;
}
console.log('\nmilestones (minutes):');
for (const [k, v] of Object.entries(milestones)) console.log(`  ${k.padEnd(22)} ${(v / 60).toFixed(1)}`);
console.log(`nodes bought ${save.stats.nodesBought}, total gold ${save.stats.totalGold}`);
