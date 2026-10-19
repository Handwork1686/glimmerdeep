// Round 2 visual checks: affordability in the Workshop, the boon bar and its tooltip, batched toasts,
// the Camp's next-layer band, board clears. node tools/qa/round2_shots.mjs  (needs `npm run dev` on :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = 'tools/qa/capture/round2';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('audioManifest')) errors.push(m.text()); });
const save = {
  version: 6, gold: 900, gems: 3, cores: 0,
  upgrades: { root: 1, oil: 2, bit: 2, brittle: 1, appraise: 1, gearing: 1, keen: 1 },
  maxDepth: 330, milestones: ['amberstone', 'grotto'], gloom: 0, maxGloom: 0, seedCounter: 40,
  stats: { runs: 6, totalGold: 4000, totalGems: 8, bombs: 3, bestChain: 112, playTime: 900, nodesBought: 8, longestRun: 200, mythics: 0, maxBoons: 2, endless: 0, bestPot: 1800, seals: 1, geodes: 1, hearts: 0 },
  codex: { copper: 90, tin: 30, quartz: 70, silver: 40 }, relics: ['oldpick'], achievements: { first_light: 1 }, tips: { workshop: true, move: true }, seenNodes: {}, credits: false,
};
await page.addInitScript((s) => { if (!localStorage.getItem('glimmerdeep.save')) localStorage.setItem('glimmerdeep.save', JSON.stringify(s)); }, save);
await page.goto('http://localhost:5173/?capture');
const wait = (ms) => page.waitForTimeout(ms);
const tap = async (k) => { await page.keyboard.down(k); await wait(70); await page.keyboard.up(k); await wait(150); };
const grab = async (name) => {
  const d = await page.evaluate(() => { const g = window.__game; g.loop.sleep(); const t = performance.now(); g.step(t, 16.6); const u = g.canvas.toDataURL('image/png'); g.loop.wake(); return u; });
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
};
await wait(3500);
await tap('Enter'); await wait(1500);
await grab('camp_next_layer');
for (let i = 0; i < 2; i++) await tap('ArrowDown');
await tap('Enter'); await wait(600);
await tap('ArrowDown'); await wait(300); await tap('ArrowRight'); await wait(700);
await grab('workshop_affordability');
// three-plus achievements at once: one batched toast, bottom-left
await page.evaluate(() => { const q = window.__qa; for (const id of ['down_we_go', 'amber_age', 'gold1k', 'chain25']) q.unlock(id); });
await wait(1200);
await grab('toast_batched');
await wait(3500);
// a NEW SHARD toast and a lone achievement
await page.evaluate(() => { const q = window.__qa; q.pushToast({ kind: 'shard', title: 'NEW SHARD: Ember Shard', sub: 'Ember Shards split into sparks the moment they hit', icon: 'shard_ember', tint: 0xff9a73 }); });
await wait(1000);
await grab('toast_shard');
await tap('Escape'); await wait(800);
// into a dig with boons in hand
await page.evaluate(() => window.__game.scene.start('Run'));
await wait(2500);
await page.evaluate(() => {
  const run = window.__game.scene.getScene('Run');
  for (const id of ['splinters', 'splinters', 'keenshards', 'kindling', 'shardlight', 'overburn', 'lanternnova', 'echochain', 'glassharvest']) { run.sim.choices = []; run.sim.choose(id); }
  run.sim.choices = null;
});
await wait(600);
await page.mouse.move(468, 79);
await wait(400);
await grab('boonbar_tooltip');
await page.mouse.move(100, 100);
await wait(300);
await grab('boonbar');
await browser.close();
console.log('ok', errors.length ? errors.join('\n') : 'no errors');
