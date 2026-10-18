// Launch the packaged Linux build and verify it boots: node tools/qa/electron.mjs
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
const exe = process.argv[2] ?? 'release/linux-unpacked/glimmerdeep';
fs.mkdirSync('tools/qa/electron', { recursive: true });
const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu-sandbox'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'tools/qa/electron/title.png' });
const hasBridge = await page.evaluate(() => typeof window.glimmer?.writeSave === 'function');
await page.keyboard.down('Enter'); await page.waitForTimeout(80); await page.keyboard.up('Enter');
await page.waitForTimeout(2500);
await page.keyboard.down('ArrowDown'); await page.waitForTimeout(3000); await page.keyboard.up('ArrowDown');
await page.screenshot({ path: 'tools/qa/electron/run.png' });
console.log('bridge', hasBridge, 'errors', errors.length, errors.slice(0, 5).join('\n'));
await app.close();
