// node tools/qa/deep.mjs <outdir> <depth> <lvl> <seconds>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, depth, lvl, secs] = [process.argv[2], process.argv[3] ?? '0', process.argv[4] ?? '0', Number(process.argv[5] ?? 20)];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:5173/?autoplay&depth=${depth}&lvl=${lvl}`);
await page.waitForTimeout(2500);
await page.keyboard.press('Enter');
for (let i = 0; i < secs / 2; i++) {
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/t${String(i).padStart(2, '0')}.png` });
}
fs.writeFileSync(`${out}/console.txt`, errors.join('\n'));
console.log('errors', errors.length, errors.slice(0, 8).join('\n'));
await browser.close();
