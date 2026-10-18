import { T, TILES } from '../data/tiles';
import { Chunk, CHUNK, GenContext, generateChunk, Prospect } from './worldgen';

/** A unique number for any tile, including negative x (|x| < 2^20). */
export const tileKey = (x: number, y: number) => (x + 1048576) * 4194304 + y;
export const keyX = (k: number) => Math.floor(k / 4194304) - 1048576;
export const keyY = (k: number) => k % 4194304;

interface LiveChunk extends Chunk {
  hp: Float32Array;
}

/**
 * The open world: chunks generated on first touch and cached for the rest of the
 * dig. Rows above 0 are sky; there is no floor and no side wall.
 */
export class World {
  private chunks = new Map<number, LiveChunk>();
  private lastKey = NaN;
  private last: LiveChunk | null = null;

  constructor(
    private ctx: GenContext,
    /** prospecting stats at the moment a chunk is generated */
    private prospect: () => Prospect,
    /** rock hardness multiplier for a row */
    private hpScale: (row: number) => number,
  ) {}

  get generated(): number {
    return this.chunks.size;
  }

  chunk(cx: number, cy: number): LiveChunk {
    const k = (cx + 32768) * 65536 + cy;
    if (k === this.lastKey) return this.last!;
    let c = this.chunks.get(k);
    if (!c) {
      const g = generateChunk(cx, cy, this.prospect(), this.ctx);
      const hp = new Float32Array(CHUNK * CHUNK);
      for (let ly = 0; ly < CHUNK; ly++) {
        const s = this.hpScale(cy * CHUNK + ly);
        for (let lx = 0; lx < CHUNK; lx++) hp[ly * CHUNK + lx] = TILES[g.tiles[ly * CHUNK + lx]].hp * s;
      }
      c = { ...g, hp };
      this.chunks.set(k, c);
    }
    this.lastKey = k;
    this.last = c;
    return c;
  }

  /** is this chunk already generated? (never generates) */
  has(cx: number, cy: number): boolean {
    return this.chunks.has((cx + 32768) * 65536 + cy);
  }

  get(x: number, y: number): number {
    if (y < 0) return T.air;
    const c = this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    return c.tiles[(y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1))];
  }

  set(x: number, y: number, tile: number) {
    if (y < 0) return;
    const c = this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    const i = (y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1));
    c.tiles[i] = tile;
    c.hp[i] = TILES[tile].hp * this.hpScale(y);
  }

  hp(x: number, y: number): number {
    if (y < 0) return 0;
    const c = this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    return c.hp[(y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1))];
  }

  setHp(x: number, y: number, v: number) {
    if (y < 0) return;
    const c = this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    c.hp[(y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1))] = v;
  }

  natural(x: number, y: number): boolean {
    if (y < 0) return true;
    const c = this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    return c.natural[(y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1))] === 1;
  }

  rich(x: number, y: number): boolean {
    if (y < 0) return false;
    return this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK)).rich;
  }
}
