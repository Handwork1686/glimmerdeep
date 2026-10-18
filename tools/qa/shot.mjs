// Usage: node tools/qa/shot.mjs <outdir> [script]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'tools/qa/out';
const script = process.argv[3] ?? 'basic';
fs.mkdirSync(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader'] });
}
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'load' });
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, ms = 80) => { await page.keyboard.down(k); await wait(ms); await page.keyboard.up(k); };
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });

await wait(2500);
await shot('01_title');
if (script === 'basic' || script === 'run') {
  await key('Enter');
  await wait(1500);
  await shot('02_run_start');
  await page.keyboard.down('ArrowDown');
  await wait(2500);
  await shot('03_digging');
  await wait(3000);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await wait(1500);
  await page.keyboard.up('ArrowRight');
  await shot('04_side');
  await key('e');
  await wait(150);
  await shot('05_flare');
  await page.keyboard.down('ArrowDown');
  await wait(6000);
  await page.keyboard.up('ArrowDown');
  await shot('06_deeper');
}
if (script === 'camp') {
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('glimmerdeep.save') ?? '{}'); });
}
fs.writeFileSync(`${out}/console.txt`, errors.join('\n'));
console.log('errors:', errors.length);
console.log(errors.slice(0, 15).join('\n'));
await browser.close();
