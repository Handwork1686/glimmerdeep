import { Bot } from '../../src/core/bot';
import { Sim } from '../../src/core/sim';

const t0 = performance.now();
for (const seed of [1, 2, 3]) {
  const sim = new Sim({ seed, upgrades: {}, gloom: 0 });
  const bot = new Bot();
  let steps = 0;
  const evCount: Record<string, number> = {};
  while (!sim.over && steps < 60 * 600) {
    sim.step(bot.think(sim));
    for (const e of sim.drainEvents()) evCount[e.t] = (evCount[e.t] ?? 0) + 1;
    steps++;
  }
  const s = sim.summary();
  console.log(`seed ${seed}: time ${s.time.toFixed(1)}s depth ${s.maxDepth} gold ${s.gold} gems ${s.gems} lvl ${s.level} chain ${s.bestChain}`, JSON.stringify(evCount));
}
console.log('ms', (performance.now() - t0).toFixed(0));
