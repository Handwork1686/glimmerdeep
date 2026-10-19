/**
 * Draws the ground across a layer boundary as one image (each tile a 4x4 block in its debris colour), so the
 * 50 m blend can be seen at a glance: no single-row cut. Writes a PPM; convert with PIL or ImageMagick.
 *   npx vite-node tools/qa/blend_strip.ts <boundary depth> <out.ppm> [seed]
 */
import fs from 'node:fs';
import { CHUNK, generateChunk, NO_PROSPECT, rowOfDepth } from '../../src/core/worldgen';
import { TILES } from '../../src/data/tiles';

const boundary = Number(process.argv[2] ?? 300);
const out = process.argv[3] ?? 'blend.ppm';
const seed = Number(process.argv[4] ?? 7);
const W = 96;
const D0 = boundary - 50;
const D1 = boundary + 50;
const S = 4;
const img = Buffer.alloc(W * S * (D1 - D0) * S * 3);
const ctx = { seed, relics: [], doneLayers: new Set<string>() };
const chunks = new Map<string, Uint8Array>();
const tile = (x: number, y: number) => {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const k = `${cx},${cy}`;
  if (!chunks.has(k)) chunks.set(k, generateChunk(cx, cy, NO_PROSPECT, ctx).tiles);
  return chunks.get(k)![(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
};
for (let d = D0; d < D1; d++) {
  for (let x = 0; x < W; x++) {
    const t = TILES[tile(x - W / 2, rowOfDepth(d))];
    const c = t.name === 'air' ? 0x07060c : t.tint;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const o = (((d - D0) * S + dy) * W * S + x * S + dx) * 3;
      img[o] = (c >> 16) & 255;
      img[o + 1] = (c >> 8) & 255;
      img[o + 2] = c & 255;
    }
  }
}
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W * S} ${(D1 - D0) * S}\n255\n`), img]));
console.log(`wrote ${out}: depths ${D0}-${D1} m`);
