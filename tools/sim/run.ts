/**
 * Economy / pacing simulation: a bot plays many descents in a row, banking
 * loot and buying Workshop upgrades between runs, and we log milestones.
 *   npm run sim -- [runs] [--build=balanced|drill|shard|chain|lantern|fortune|surveyor|arcana]
 * A build is a shopping priority: the bot favours that playstyle's nodes.
 */
import { Bot } from '../../src/core/bot';
import { computeStats, rockHp } from '../../src/core/progression';
import { Sim } from '../../src/core/sim';
import { shardDepthScale } from '../../src/data/shards';
import { costOf, isAvailable, UPGRADES } from '../../src/data/upgrades';
import { bankRun } from '../../src/systems/bank';
import { newSave } from '../../src/systems/save';

import { BALANCE } from '../../src/data/balance';

// experiments: BAL_ECON=9 BAL_ROCK=1.5 npm run sim ...
for (const k of Object.keys(BALANCE) as (keyof typeof BALANCE)[]) {
  const v = process.env[`BAL_${k.toUpperCase()}`];
  if (v) BALANCE[k] = Number(v);
}
const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => !a.startsWith('--')) ?? 120);
const BUILD = (args.find((a) => a.startsWith('--build='))?.split('=')[1] ?? 'balanced') as BuildId;
const DIAG = !!process.env.DIAG;
const SEED_OFFSET = Number(process.env.SIM_SEED ?? 0);
/** --boons=<family>: the bot always takes boons from this family first (to see whether any family is an auto-pick or an auto-skip) */
const BOON_FAMILIES: Record<string, string[]> = {
  money: ['gilded', 'luckystrike', 'potluck', 'deeppockets', 'midastouch'],
  shard: ['splinters', 'keenshards', 'piercing', 'shrapnel', 'prismheart', 'supernova', 'ricochet', 'faultline', 'rupture'],
  lantern: ['kindling', 'shardlight', 'lanternnova', 'secondwind'],
  drill: ['overcharge', 'quickhands', 'widebit', 'echo', 'redhot', 'seismic'],
  chain: ['longfuse', 'echochain', 'glassharvest', 'potluck'],
  burn: ['overburn', 'keenshards', 'splinters'],
};
/** --grant=a,b: every dig starts with these boons (one stack each), and every other boon hand is skipped: each boon's own worth */
const GRANT = args.find((a) => a.startsWith('--grant='))?.split('=')[1]?.split(',') ?? [];
const BOON_FAMILY = args.find((a) => a.startsWith('--boons='))?.split('=')[1];
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
  drill: { branches: { drill: 1 }, nodes: [] },
  shard: { branches: { shatter: 1, drill: 0.02 }, nodes: ['gyro', 'splitter', 'shrapnel', 'shardveins'] },
  chain: { branches: {}, nodes: ['bounty', 'longfuse', 'potplus', 'recycler', 'resonance', 'heatsink', 'treads', 'gyro', 'brittle', 'keen'] },
  lantern: { branches: { light: 1 }, nodes: ['flora'] },
  fortune: { branches: { fortune: 1 }, nodes: ['richveins'] },
  surveyor: { branches: { world: 1 }, nodes: [] },
  arcana: { branches: { arcana: 1 }, nodes: [] },
};
const OFF = 0.12; // weight for nodes outside the build
function priority(id: string, branch: string): number {
  const b = BUILDS[BUILD];
  if (BUILD === 'balanced') return BALANCED[branch] ?? 0.5;
  if (b.nodes.includes(id)) return 1;
  return b.branches[branch] ?? (branch === 'core' ? 0.3 : OFF);
}

/** hits to break plain rock at a depth: the drill, and one shard, for the stats a build has when it first gets there */
function hitsAt(depth: number) {
  const st = computeStats(save.upgrades);
  const hp = rockHp(depth) * BALANCE.rock;
  return {
    drill: Math.ceil(hp / (st.drillPower * st.rockMul)),
    shard: Math.ceil(hp / (st.shardDamage * BALANCE.shardDmg * shardDepthScale(depth) * st.rockMul)),
  };
}
const bandTimes: Record<number, number> = {};
/** seconds the first run that got through a band spent crossing it (from the 100 m above) */
const bandPass: Record<number, number> = {};
const bandHits: Record<number, { drill: number; shard: number }> = {};
const totalBreaks: Record<string, number> = {};
const drainSplit = { chainT: 0, chainFuel: 0, freeT: 0, freeFuel: 0 };

function shop() {
  for (let guard = 0; guard < 200; guard++) {
    const st = computeStats(save.upgrades);
    let best: { id: string; score: number } | null = null;
    for (const u of UPGRADES) {
      const lvl = save.upgrades[u.id] ?? 0;
      if (lvl >= u.max || !isAvailable(u, save.upgrades)) continue;
      const c = costOf(u, lvl, st.costMul);
      if (c.gold > save.gold || (c.gems ?? 0) > save.gems || (c.cores ?? 0) > save.cores) continue;
      // gems and cores are scarcer than gold: count them in the price
      const score = priority(u.id, u.branch) / Math.log10(10 + c.gold + 400 * (c.gems ?? 0) + 25000 * (c.cores ?? 0));
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
  // every dig starts at the surface; claimed layer milestones stay claimed
  const sim = new Sim({ seed: 1000 + SEED_OFFSET + r, upgrades: save.upgrades, relics: save.relics, milestones: save.milestones, gloom: 0 });
  const bot = new Bot();
  for (const id of GRANT) {
    sim.choices = [];
    sim.choose(id);
    sim.choices = null;
  }
  if (GRANT.length) {
    bot.skipUnliked = true;
    bot.boonPrefs = [];
  }
  if (BOON_FAMILY) bot.skipUnliked = true;
  if (BOON_FAMILY) bot.boonPrefs = BOON_FAMILY.startsWith('only:') ? BOON_FAMILY.slice(5).split(',') : BOON_FAMILIES[BOON_FAMILY];
  let steps = 0;
  const breaks: number[] = [];
  const diag: Record<string, number> = {};
  let frontierT = 0;
  const runBand: Record<number, number> = {};
  let nextBand = 100;
  while (!sim.over && steps < 60 * 900) {
    while (sim.maxDepth >= nextBand) {
      runBand[nextBand] = sim.time;
      nextBand += 100;
    }
    if (sim.pendingLevels > 0) {
      const h = sim.openChoice();
      if (h && h.length) {
        const id = bot.pickBoon(sim);
        if (id) sim.choose(id);
        else sim.skipChoice();
      }
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
  for (const [k, v] of Object.entries(sim.breaksBy)) totalBreaks[k] = (totalBreaks[k] ?? 0) + v;
  for (const k of Object.keys(drainSplit) as (keyof typeof drainSplit)[]) drainSplit[k] += sim.drainSplit[k];
  for (let band = 100; band <= 1500; band += 100) {
    if (sum.maxDepth >= band && bandPass[band] === undefined) bandPass[band] = runBand[band] - (runBand[band - 100] ?? 0);
    if (sum.maxDepth >= band && bandTimes[band] === undefined) {
      bandTimes[band] = clock;
      bandHits[band] = hitsAt(band);
    }
  }
  bankRun(save, sum);
  if (save.maxDepth >= 50) mark('50m');
  if (save.maxDepth >= 120) mark('Amberstone 120m');
  if (save.maxDepth >= 304) mark('Grotto (300m)');
  if (save.maxDepth >= 524) mark('Emberdeep (520m)');
  if (save.maxDepth >= 764) mark('Hollow (760m)');
  if (save.maxDepth >= 1054) mark('Mantle (1050m)');
  if (save.maxDepth >= 1498) mark('Heart (1500m)');
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
console.log('time to each 100 m band (minutes), seconds the first pass spent crossing it | plain-rock hits to break: drill / one shard');
for (const band of Object.keys(bandTimes).map(Number)) {
  const t = bandTimes[band] / 60;
  const h = bandHits[band];
  console.log(`  ${String(band).padStart(5)} m  ${t.toFixed(1).padStart(6)}  pass ${String(Math.round(bandPass[band])).padStart(4)} s  ${String(h.drill).padStart(4)} / ${String(h.shard).padStart(4)}${h.drill <= 1 ? '  ONE-HIT DRILL' : ''}`);
}
// the brief's shape rule: no band is crossed 5x faster than the one before it
let worst = Infinity;
let worstBand = 0;
const bands = Object.keys(bandPass).map(Number).sort((a, b) => a - b);
for (let i = 1; i < bands.length; i++) {
  const k = bandPass[bands[i]] / Math.max(1, bandPass[bands[i - 1]]);
  if (k < worst) {
    worst = k;
    worstBand = bands[i];
  }
}
console.log(`fastest band vs the one before: x${(1 / worst).toFixed(1)} faster (${worstBand} m)${1 / worst > 5 ? '  <- BREAKS THE 5x RULE' : ''}`);
const oneHit = Object.keys(bandHits).map(Number).find((b) => bandHits[b].drill <= 1);
console.log(`first one-hit drill depth: ${oneHit ?? 'none before the Heart'}`);
const brk = Object.entries(totalBreaks).map(([k, v]) => `${k} ${v}`).join(', ');
const shardShare = (totalBreaks.shard ?? 0) / Math.max(1, (totalBreaks.shard ?? 0) + (totalBreaks.drill ?? 0) + (totalBreaks.seismic ?? 0));
console.log(`tiles broken: ${brk} | shards broke ${(shardShare * 100).toFixed(0)}% (shards + drill)`);
console.log(`fuel burn/s: in a chain ${(drainSplit.chainFuel / Math.max(1, drainSplit.chainT)).toFixed(2)} (${drainSplit.chainT.toFixed(0)} s), outside ${(drainSplit.freeFuel / Math.max(1, drainSplit.freeT)).toFixed(2)} (${drainSplit.freeT.toFixed(0)} s)`);
const sg = [...stallGaps].sort((a, b) => a - b);
console.log(`stall gap (frontier -> lantern out): median ${sg[sg.length >> 1]?.toFixed(1)}s, p90 ${sg[Math.floor(sg.length * 0.9)]?.toFixed(1)}s over ${sg.length} dark endings`);
console.log(`nodes bought ${save.stats.nodesBought}, total gold ${save.stats.totalGold}`);
console.log(`RESULT ${BUILD} heart=${milestones["World's Heart (credits)"] !== undefined ? (milestones["World's Heart (credits)"] / 60).toFixed(1) : 'never'} runs=${save.stats.runs}`);
