/**
 * A simple autopilot used for balance simulation, soak tests and the attract
 * mode. It greedily mines toward nearby ore, crystals and relics, throws the
 * Shard Bomb when that would set off a chain, and otherwise digs downward.
 */
import { TILE } from '../config';
import { TILES } from '../data/tiles';
import { Rng } from './rng';
import { NO_INPUT, Sim, SimInput } from './sim';
import { tileKey } from './world';

/** how far either side of the shaft the bot will roam */
const ROAM = 40;

export class Bot {
  private goal: { x: number; y: number } | null = null;
  private stuck = 0;
  private lastPos = { x: 0, y: 0 };
  private wander = 1;
  private skill: number;
  private goalT = 0;
  private blacklist = new Set<number>();

  private rng: Rng;

  constructor(skill = 1, seed = 1234) {
    this.skill = skill;
    this.rng = new Rng(seed);
  }

  think(sim: Sim): SimInput {
    const inp: SimInput = { ...NO_INPUT };
    if (sim.choices) {
      sim.choose(sim.choices[0].id);
      return inp;
    }
    const p = sim.player;
    const px = Math.floor(p.x / TILE);
    const py = Math.floor(p.y / TILE);

    // pick a goal: nearest ore within a few tiles, else straight down
    if (!this.goal || !TILES[sim.tileAt(this.goal.x, this.goal.y)].solid || this.rng.next() < 0.01) {
      this.goal = null;
      let best = 1e9;
      for (let dy = -2; dy <= 6; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const t = TILES[sim.tileAt(px + dx, py + dy)];
          if (!(t.ore || t.light || t.shards || t.name === 'relic' || t.name === 'geode')) continue;
          if (this.blacklist.has(tileKey(px + dx, py + dy))) continue;
          let d = Math.abs(dx) + Math.abs(dy) * 0.7;
          // the world is open, but the Heart is under the shaft: stay within reach of it
          if (Math.abs(px + dx) > ROAM) d += 6;
          if (t.name === 'worldheart') d -= 100;
          if (d < best) {
            best = d;
            this.goal = { x: px + dx, y: py + dy };
            this.goalT = 0;
          }
        }
      }
    }
    // the World's Heart is the whole point: go straight for it
    if (!sim.reachedHeart && Math.abs(py - sim.heart.y) < 14) this.goal = { x: sim.heart.x + (px > sim.heart.x ? 1 : 0), y: sim.heart.y };
    let gx = px;
    let gy = py + 3;
    if (this.goal && this.skill > 0.5) {
      gx = this.goal.x;
      gy = this.goal.y;
    }
    const below = TILES[sim.tileAt(px, py + 1)];
    const sealed = below.name === 'seal' && sim.stats.drillPower < sim.sealNeed(py + 1);
    if (below.unbreakable || sealed) {
      // mine sideways under a seal we cannot break yet
      gx = px + this.wander * 6;
      gy = py;
    }
    // deep down, drift back toward the shaft and the Heart beneath it
    if (sim.depth() > 1380 && !this.goal && !sim.reachedHeart && Math.abs(px - sim.heart.x) > 2) gx = sim.heart.x;
    const belowT = TILES[sim.tileAt(px, py + 1)];
    const diggingDown = p.drill === 'down' && belowT.solid && !belowT.unbreakable;
    if (!diggingDown) {
      if (gx < px) inp.left = true;
      else if (gx > px) inp.right = true;
    }
    if (gy > py) inp.down = true;
    else if (gy < py) inp.up = true;
    if (gx === px && gy === py) inp.down = true;
    // give up on goals we are not making progress toward
    if (this.goal) {
      this.goalT += 1;
      if (this.goalT > 240) {
        this.blacklist.add(tileKey(this.goal.x, this.goal.y));
        this.goal = null;
        this.goalT = 0;
      }
    }

    // stuck detection
    if (Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y) < 0.2 && !p.drill) {
      this.stuck += 1;
    } else this.stuck = 0;
    this.lastPos = { x: p.x, y: p.y };
    if (this.stuck > 40) {
      this.wander = -this.wander as 1 | -1;
      this.goal = null;
      inp.up = true;
      this.stuck = 0;
    }
    if (px <= -ROAM) this.wander = 1;
    if (px >= ROAM) this.wander = -1;

    // Shard Bomb when it would set off a chain: shard sources within reach
    let fuel = 0;
    if (p.bombCd <= 0) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (TILES[sim.tileAt(px + dx, py + dy)].shards) fuel++;
    }
    inp.shardBomb = fuel >= 2 && p.bombCd <= 0;
    inp.bomb = p.dynamite > 0 && sim.time % 20 < 0.02;
    return inp;
  }
}
