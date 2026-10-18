/**
 * Economy / pacing simulation: a bot plays many descents in a row, banking
 * loot and buying Workshop upgrades between runs, and we log milestones.
 *   npm run sim -- [runs] [--build=balanced|drill|shard|chain|lantern|fortune|surveyor|arcana]
 * A build is a shopping priority: the bot favours that playstyle's nodes.
 */
import { Bot } from '../../src/core/bot';
import { computeStats } from '../../src/core/progression';
import { Sim } from '../../src/core/sim';
import { costOf, isAvailable, UPGRADES } from '../../src/data/upgrades';
import { bankRun } from '../../src/systems/bank';
import { SEALS } from '../../src/data/biomes';
import { newSave } from '../../src/systems/save';

const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => !a.startsWith('--')) ?? 120);
const BUILD = (args.find((a) => a.startsWith('--build='))?.split('=')[1] ?? 'balanced') as BuildId;
const DIAG = !!process.env.DIAG;
const CAMP_OVERHEAD = 25; // seconds spent in the workshop per run
const save = newSave();
const stallGaps: number[] = [];
let clock = 0;
const milestones: Record<string, number> = {};
const mark = (k: string) => {
  if (!(k in milestones)) milestones[k] = clock;
};
const BALANCED: Record<string, number> = { drill: 1.0, light: 0.95, fortune: 0.85, shatter: 0.85, hull: 0.75, arcana: 0.65, world: 0.75, core: 0.5 };
/** each playstyle: the branches and nodes it favours (everything else is bought only when nothing better is affordable) */
type BuildId = 'balanced' | 'drill' | 'shard' | 'chain' | 'lantern' | 'fortune' | 'surveyor' | 'arcana';
const BUILDS: Record<BuildId, { branches: Record<string, number>; nodes: string[] }> = {
  balanced: { branches: BALANCED, nodes: [] },
  drill: { branches: { drill: 1 }, nodes: ['refine_bit'] },
  shard: { branches: { shatter: 1 }, nodes: ['gyro', 'splitter', 'shrapnel', 'shardveins'] },
  chain: { branches: {}, nodes: ['bounty', 'longfuse', 'potplus', 'recycler', 'refine_chain', 'resonance', 'heatsink', 'treads', 'gyro', 'brittle', 'keen'] },
  lantern: { branches: { light: 1 }, nodes: ['refine_wick', 'flora'] },
  fortune: { branches: { fortune: 1 }, nodes: ['refine_purse', 'refine_luck', 'richveins'] },
  surveyor: { branches: { world: 1 }, nodes: [] },
  arcana: { branches: { arcana: 1 }, nodes: ['refine_luck'] },
};
const OFF = 0.12; // weight for nodes outside the build
function priority(id: string, branch: string, gated: boolean): number {
  const b = BUILDS[BUILD];
  if (BUILD === 'balanced') return BALANCED[branch] ?? 0.5;
  if (b.nodes.includes(id)) return 1;
  // like a real player, every build buys the drill power the next seal demands
  if (gated && (branch === 'drill' || id === 'refine_bit')) return 1;
  return b.branches[branch] ?? (branch === 'core' ? 0.3 : OFF);
}

function shop() {
  for (let guard = 0; guard < 200; guard++) {
    const st = computeStats(save.upgrades);
    const next = SEALS.find((sl) => !save.sealsBroken.includes(sl.depth));
    const gated = !!next && st.drillPower < next.power;
    let best: { id: string; score: number } | null = null;
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] ?? 0;
      if (lvl >= u.max || !isAvailable(u, save.upgrades)) continue;
      const c = costOf(u, lvl, st.costMul);
      if (c.gold > save.gold || (c.gems ?? 0) > save.gems || (c.cores ?? 0) > save.cores) continue;
      // gems and cores are scarcer than gold: count them in the price
      const score = priority(u.id, u.branch, gated) / Math.log10(10 + c.gold + 400 * (c.gems ?? 0) + 25000 * (c.cores ?? 0));
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
  // every dig starts at the surface; broken seals stay broken
  const sim = new Sim({ seed: 1000 + r, upgrades: save.upgrades, relics: save.relics, sealsBroken: save.sealsBroken, gloom: 0 });
  const bot = new Bot();
  let steps = 0;
  const breaks: number[] = [];
  const diag: Record<string, number> = {};
  let frontierT = 0;
  while (!sim.over && steps < 60 * 900) {
    if (sim.pendingLevels > 0) {
      const h = sim.openChoice();
      if (h && h.length) sim.choose(h[0].id);
    }
    sim.step(bot.think(sim));
    for (const e of sim.drainEvents()) if (e.t === 'break') {
      breaks.push(sim.time);
      if (DIAG) diag[e.src] = (diag[e.src] ?? 0) + 1;
    }
    // "power frontier": the last moment the bot was still breaking >= 6 tiles per 10 s
    while (breaks.length && breaks[0] < sim.time - 10) breaks.shift();
    if (breaks.length >= 6) frontierT = sim.time;
    steps++;
  }
  const sum = sim.summary();
  if (DIAG) console.log('   diag', JSON.stringify(diag), JSON.stringify(sum.shardTypes), JSON.stringify(sum.boons), JSON.stringify(save.upgrades));
  if (sum.reason === 'dark') stallGaps.push(sum.time - frontierT);
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
      `run ${String(r + 1).padStart(3)} t=${(clock / 60).toFixed(1).padStart(5)}m -> ${String(sum.maxDepth).padStart(4)}m ` +
        `${sum.time.toFixed(0).padStart(3)}s gold +${String(sum.gold).padStart(6)} gems +${sum.gems} cores +${sum.cores} chain ${sum.bestChain} ` +
        `bought ${save.stats.nodesBought - before} | power ${st.drillPower.toFixed(0)} rate ${st.drillRate.toFixed(1)} light ${st.maxLight.toFixed(0)} pot ${sum.bestPot} relics ${save.relics.length}${sum.reachedHeart ? ' HEART' : ''}`,
    );
  }
  if (save.stats.hearts > 0) break;
}
console.log(`\nbuild: ${BUILD}`);
console.log('milestones (minutes):');
for (const [k, v] of Object.entries(milestones)) console.log(`  ${k.padEnd(22)} ${(v / 60).toFixed(1)}`);
const sg = [...stallGaps].sort((a, b) => a - b);
console.log(`stall gap (frontier -> lantern out): median ${sg[sg.length >> 1]?.toFixed(1)}s, p90 ${sg[Math.floor(sg.length * 0.9)]?.toFixed(1)}s over ${sg.length} dark endings`);
console.log(`nodes bought ${save.stats.nodesBought}, total gold ${save.stats.totalGold}`);
console.log(`RESULT ${BUILD} heart=${milestones["World's Heart (credits)"] !== undefined ? (milestones["World's Heart (credits)"] / 60).toFixed(1) : 'never'} runs=${save.stats.runs}`);
