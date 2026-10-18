// Native-resolution captures of menu screens for store screenshots and visual QA.
// node tools/qa/menu_shots.mjs   (needs `npm run dev` on :5173)
import { chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('tools/qa/capture/menus', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const save = {
  version: 4, gold: 48200, gems: 63, cores: 2,
  upgrades: { root: 1, oil: 5, steady: 4, lens: 3, mosslore: 2, reserve: 2, recycler: 2, bit: 5, gearing: 5, pulverize: 3, diamond: 3, prospect: 2, widebit: 1,
    treads: 4, magnet: 3, thrusters: 3, heatsink: 3, auger: 1, longfuse: 2, brittle: 4, keen: 4, bounty: 3, fault: 2, volatile: 1, rupture: 1, appraise: 5, lucky: 3, assay: 2, gemsense: 2, deeppockets: 1,
    flarecd: 4, flarer: 2, flarep: 2, reroll: 1, dynamite: 2 },
  maxDepth: 640, sealsBroken: [300, 520], gloom: 0, maxGloom: 0, seedCounter: 40,
  stats: { runs: 38, totalGold: 410000, totalGems: 120, flares: 260, bestChain: 412, playTime: 6000, nodesBought: 90, longestRun: 280, mythics: 1, maxBoons: 9, endless: 0, bestPot: 18400, seals: 2, geodes: 9, hearts: 0 },
  codex: { copper: 900, tin: 300, quartz: 700, silver: 400, amber: 120, jade: 40, fossil: 12, gold: 260, glimmer: 380, sapphire: 18, opal: 30, fireopal: 50, ruby: 4 },
  relics: ['oldpick', 'acorn', 'brasskey', 'ambereye', 'sundial', 'shellhorn', 'geodeheart', 'mirror', 'forgecoal'],
  achievements: { first_light: 1, down_we_go: 1, amber_age: 1, seal_breaker: 1, glimmering: 1, into_the_fire: 1, chain25: 1, chain100: 1, gold1k: 1, gold25k: 1, tinkerer: 1, fully_lit: 1, geode: 1, relic1: 1, pot10k: 1 },
  tips: { workshop: true }, seenNodes: {}, credits: false,
};
await page.addInitScript((s) => localStorage.setItem('glimmerdeep.save', JSON.stringify(s)), save);
await page.goto('http://localhost:5173/');
const wait = (ms) => page.waitForTimeout(ms);
const tap = async (k) => { await page.keyboard.down(k); await wait(70); await page.keyboard.up(k); await wait(150); };
const grab = async (name) => {
  const d = await page.evaluate(() => { const g = window.__game; g.loop.sleep(); const t = performance.now(); g.step(t, 16.6); const u = g.canvas.toDataURL('image/png'); g.loop.wake(); return u; });
  fs.writeFileSync(`tools/qa/capture/menus/${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
};
await wait(3500);
await grab('title');
await tap('Enter'); await wait(1500);
await grab('camp');
// Workshop is the 4th menu item
for (let i = 0; i < 3; i++) await tap('ArrowDown');
await tap('Enter'); await wait(600);
await tap('ArrowDown'); await wait(300); await tap('ArrowRight'); await wait(700);
await grab('workshop');
await tap('Escape'); await wait(500);
await tap('ArrowDown'); await tap('Enter'); await wait(900);
await grab('codex');
for (let i = 0; i < 26; i++) await page.keyboard.press('ArrowRight');
await wait(400);
await grab('codex_relic');
await tap('Escape'); await wait(1200);
await page.evaluate(() => window.__game.scene.start('Achievements', { from: 'Camp' }));
await wait(900);
await grab('achievements');
await browser.close();
console.log('ok', errors.length ? errors.join('\n') : 'no errors');
