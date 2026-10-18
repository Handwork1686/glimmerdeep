// Frame-exact gameplay capture for the trailer and screenshots.
// node tools/qa/capture.mjs <name> <depth> <lvl> <seed> <warmupSeconds> <frames> [every]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [name, depth, lvl, seed, warm, frames, every] = process.argv.slice(2);
const out = `tools/qa/capture/${name}`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const extra = depth === 'title' ? '' : depth.startsWith('scene:') ? `?capture&scene=${depth.slice(6)}` : `?autoplay&capture&depth=${depth}&lvl=${lvl}&seed=${seed}`;
await page.goto(`http://localhost:5173/${extra}`);
await page.waitForTimeout(3000);
if (depth !== 'title' && !depth.startsWith('scene:')) {
  await page.keyboard.down('Enter'); await page.waitForTimeout(60); await page.keyboard.up('Enter');
}
// fast-forward the warm-up in real time, then switch to manual stepping
await page.waitForTimeout(Number(warm) * 1000);
await page.evaluate(() => {
  const g = window.__game;
  g.loop.sleep();
  window.__t = performance.now();
});
const n = Number(frames);
const k = Number(every ?? 1);
for (let i = 0; i < n; i++) {
  const data = await page.evaluate((k) => {
    const g = window.__game;
    for (let j = 0; j < k; j++) {
      window.__t += 1000 / 60;
      g.step(window.__t, 1000 / 60);
    }
    return g.canvas.toDataURL('image/png');
  }, k);
  fs.writeFileSync(`${out}/f${String(i).padStart(5, '0')}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
console.log(name, 'captured', n);
await browser.close();
