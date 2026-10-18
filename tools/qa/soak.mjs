// Browser soak test: autoplay at many depths, fail on any page error.
import { chromium } from 'playwright';
const cases = [[0, 0], [120, 2], [296, 4], [400, 4], [600, 5], [755, 5], [900, 6], [1045, 6], [1200, 7], [1490, 8], [1530, 9], [2400, 9]];
const secs = Number(process.argv[2] ?? 40);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const [depth, lvl] of cases) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('audioManifest')) errors.push(m.text()); });
  await page.goto(`http://localhost:5173/?autoplay&capture&depth=${depth}&lvl=${lvl}&seed=${depth + 7}`);
  await page.waitForTimeout(2500);
  await page.keyboard.down('Enter'); await page.waitForTimeout(60); await page.keyboard.up('Enter');
  await page.waitForTimeout(secs * 1000);
  const state = await page.evaluate(() => {
    const g = window.__game;
    const run = g.scene.getScene('Run');
    return { scenes: g.scene.getScenes(true).map((s) => s.scene.key), depth: run?.sim?.depth?.(), fps: Math.round(g.loop.actualFps) };
  });
  console.log(`depth ${depth}: ${errors.length ? 'FAIL' : 'ok'} ${JSON.stringify(state)}`);
  if (errors.length) { failures++; console.log(errors.slice(0, 3).join('\n---\n')); }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
