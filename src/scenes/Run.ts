import Phaser from 'phaser';
import { DEMO, SKY_ROWS, STEP, TILE, VIEW_H, VIEW_W } from '../config';
import { biomeAt } from '../data/biomes';
import { SHARD_BY_ID } from '../data/shards';
import { ITEM_GLOW, T, TILES } from '../data/tiles';
import { UPGRADES } from '../data/upgrades';
import { Bot } from '../core/bot';
import { Sim, SimEvent, SimInput } from '../core/sim';
import { tileKey } from '../core/world';
import { depthOfRow } from '../core/worldgen';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { bankRun } from '../systems/bank';
import { checkAll } from '../systems/achievements';
import { fmt } from '../ui/widgets';

export interface RunData {
  attract?: boolean;
  seed?: number;
}

type Spr = Phaser.GameObjects.Sprite;
type Img = Phaser.GameObjects.Image;

const DARK = 0x07060c;
/** the tilemap is a window onto the open world that follows the camera */
const WIN_W = 48;
const WIN_H = 32;

export class RunScene extends Phaser.Scene {
  sim!: Sim;
  attract = false;
  private bot: Bot | null = null;
  private acc = 0;
  private hitstop = 0;
  private map!: Phaser.Tilemaps.Tilemap;
  private terrain!: Phaser.Tilemaps.TilemapLayer;
  private aoLayer!: Phaser.Tilemaps.TilemapLayer;
  private back!: Phaser.GameObjects.TileSprite;
  private backNext!: Phaser.GameObjects.TileSprite;
  private backBiome = '';
  private skyLayers: Phaser.GameObjects.GameObject[] = [];
  private player!: Spr;
  private drill!: Spr;
  private flame!: Spr;
  private pickupSpr = new Map<number, Spr>();
  private shardSpr = new Map<number, Img>();
  private bombSpr = new Map<number, Img>();
  private rockSpr = new Map<number, Img>();
  private droneSpr: Img[] = [];
  private decorSpr: Img[] = [];
  private cracks = new Map<number, Img>();
  private chips!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private coins!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastGeode = 0;
  private ambient: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private far!: Phaser.GameObjects.TileSprite;
  private dark!: Phaser.GameObjects.RenderTexture;
  private lightImg!: Img;
  private smallLight!: Img;
  private tileLight!: Img;
  private skyEraser!: Phaser.GameObjects.Graphics;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private lastFlash = 0;
  private glowPool: Img[] = [];
  private glowUsed = 0;
  private popups: Phaser.GameObjects.BitmapText[] = [];
  private pendingGold = 0;
  private goldPopTimer = 0;
  private endTimer = -1;
  private camY = 0;
  private camX = 0;
  /** world tile at the window's top-left */
  private winX = 0;
  private winY = 0;
  private mountains!: Phaser.GameObjects.TileSprite;
  private flicker = 1;
  /** Shard Bomb / dynamite presses wait here until a fixed step consumes them */
  private shardBombQueued = false;
  /** set once this run's loot has been written to the save */
  banked = false;
  private recoil = 0;
  private bombQueued = false;
  private wasThrusting = false;
  private drillSoundT = 0;
  private burstSoundT = 0;
  private drillLoop: ReturnType<typeof Audio.loop> = null;
  private lowLightT = 0;
  private lastDepthShown = -1;

  constructor() {
    super('Run');
  }

  init(data: RunData) {
    this.attract = !!data.attract;
    const q = new URLSearchParams(window.location.search);
    this.bot = this.attract || q.has('autoplay') ? new Bot() : null;
    const save = Save.data;
    const seed = data.seed ?? (q.has('seed') ? Number(q.get('seed')) : (Date.now() ^ (save.seedCounter * 2654435761)) >>> 0);
    if (!this.attract) save.seedCounter++;
    let upgrades = this.attract ? { root: 1, bit: 2, brittle: 2, oil: 2 } : save.upgrades;
    // every dig starts at the surface
    let debugDepth: number | undefined;
    if (import.meta.env.DEV && q.has('depth')) {
      // developer shortcut (QA only): ?depth=290&lvl=3 starts deep with every node at that level
      debugDepth = Number(q.get('depth'));
      const lvl = Number(q.get('lvl') ?? 3);
      upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, Math.min(u.max, lvl)]));
    }
    this.sim = new Sim({
      seed,
      upgrades,
      relics: this.attract ? [] : save.relics,
      sealsBroken: this.attract ? [] : save.sealsBroken,
      debugDepth,
      gloom: this.attract ? 0 : save.gloom,
      demo: DEMO,
    });
    this.acc = 0;
    this.hitstop = 0;
    this.endTimer = -1;
    this.pickupSpr.clear();
    this.shardSpr.clear();
    this.bombSpr.clear();
    this.rockSpr.clear();
    this.cracks.clear();
    this.droneSpr = [];
    this.decorSpr = [];
    this.glowPool = [];
    this.popups = [];
    this.backBiome = '';
    this.lastDepthShown = -1;
    this.banked = false;
  }

  create() {
    const sim = this.sim;
    // the world is open sideways: no camera bounds, the camera clamps itself at the sky
    this.cameras.main.setRoundPixels(true);

    // ---- sky & surface scenery (only visible near the top)
    const sky = this.add.image(0, 0, 'sky').setOrigin(0, 0).setScrollFactor(0, 0).setDepth(-10);
    const mt = this.textures.get('mountains').getSourceImage();
    this.mountains = this.add.tileSprite(0, SKY_ROWS * TILE - 150, VIEW_W, mt.height, 'mountains').setOrigin(0, 0).setScrollFactor(0, 0.5).setDepth(-9);
    // Hearthmoor sits over the shaft (x = 0)
    const village = this.add.image(-VIEW_W / 2, SKY_ROWS * TILE - 118, 'village').setOrigin(0, 0).setDepth(-8);
    this.skyLayers = [sky, this.mountains, village];

    // ---- cave back walls (two layers for cross-fades)
    this.far = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'backfar_rootsoil').setOrigin(0, 0).setScrollFactor(0).setDepth(-6).setAlpha(0);
    this.back = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'backwall_rootsoil').setOrigin(0, 0).setScrollFactor(0).setDepth(-5).setAlpha(0);
    this.backNext = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'backwall_rootsoil').setOrigin(0, 0).setScrollFactor(0).setDepth(-4).setAlpha(0);

    // ---- tilemap
    this.map = this.make.tilemap({ width: WIN_W, height: WIN_H, tileWidth: TILE, tileHeight: TILE });
    const ts = this.map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0, 0)!;
    const aoTs = this.map.addTilesetImage('ao', 'ao', TILE, TILE, 0, 0, 100000)!;
    this.aoLayer = this.map.createBlankLayer('ao', aoTs, 0, 0)!.setDepth(-3);
    this.terrain = this.map.createBlankLayer('terrain', ts, 0, 0)!.setDepth(0);
    this.winX = Number.NaN;

    // ---- actors
    this.flame = this.add.sprite(0, 0, 'atlas', 'flame_0').play('flame').setDepth(4).setVisible(false);
    this.player = this.add.sprite(sim.player.x, sim.player.y, 'atlas', 'wick_idle_0').play('wick_idle').setDepth(5);
    this.drill = this.add.sprite(0, 0, 'atlas', 'drill_0').play('drill').setDepth(5);

    // ---- particles
    this.chips = this.add.particles(0, 0, 'atlas', {
      frame: ['chip_0', 'chip_1', 'chip_2', 'chip_3'], lifespan: { min: 280, max: 700 }, speed: { min: 30, max: 130 },
      angle: { min: 200, max: 340 }, gravityY: 520, emitting: false,
    }).setDepth(6);
    this.sparks = this.add.particles(0, 0, 'atlas', {
      frame: ['spark', 'pixel', 'dot2'], lifespan: { min: 150, max: 420 }, speed: { min: 40, max: 160 },
      angle: { min: 0, max: 360 }, gravityY: 120, emitting: false, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(11);
    this.embers = this.add.particles(0, 0, 'atlas', {
      frame: ['pixel', 'dot2'], lifespan: { min: 400, max: 1100 }, speed: { min: 10, max: 50 }, angle: { min: 240, max: 300 },
      gravityY: -30, emitting: false, tint: [0xffd877, 0xf7b740, 0xf0564a], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(11);
    this.coins = this.add.particles(0, 0, 'atlas', {
      frame: ['item_gold', 'item_copper', 'spark'], lifespan: { min: 500, max: 1000 }, speed: { min: 60, max: 190 },
      angle: { min: 220, max: 320 }, gravityY: 480, rotate: { min: -180, max: 180 }, scale: { start: 1, end: 0.6 }, emitting: false,
    }).setDepth(12);
    // biome atmosphere: dust, golden motes, glitter, rising embers, void wisps
    const amb: Record<string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
      rootsoil: { frame: 'pixel', speedX: { min: -3, max: 3 }, speedY: { min: 2, max: 7 }, tint: 0xa3673f, lifespan: 5000, frequency: 220 },
      amberstone: { frame: 'pixel', speedX: { min: -5, max: 5 }, speedY: { min: -3, max: 3 }, tint: 0xf7b740, lifespan: 5000, frequency: 240 },
      grotto: { frame: ['pixel', 'spark'], speedX: { min: -2, max: 2 }, speedY: { min: -2, max: 2 }, tint: [0x5fe0c4, 0x72aef2, 0xc8ecff], lifespan: 2600, frequency: 120 },
      emberdeep: { frame: ['pixel', 'dot2'], speedX: { min: -6, max: 6 }, speedY: { min: -22, max: -8 }, tint: [0xff9a73, 0xf0564a, 0xf7b740], lifespan: 4000, frequency: 110 },
      hollow: { frame: ['pixel', 'dot2'], speedX: { min: -8, max: 8 }, speedY: { min: -4, max: 4 }, tint: [0xb862de, 0x8034a6], lifespan: 5000, frequency: 180 },
      mantle: { frame: ['pixel', 'dot2'], speedX: { min: -4, max: 4 }, speedY: { min: -30, max: -12 }, tint: [0xf0564a, 0xbd2d3a, 0xff9a73], lifespan: 3600, frequency: 90 },
      heart: { frame: ['pixel', 'spark', 'dot2'], speedX: { min: -3, max: 3 }, speedY: { min: -14, max: -4 }, tint: [0xffd877, 0xfff0b5, 0xf7b740], lifespan: 4200, frequency: 70 },
    };
    this.ambient = {};
    for (const [id, cfg] of Object.entries(amb)) {
      this.ambient[id] = this.add.particles(0, 0, 'atlas', {
        ...cfg, quantity: 1, x: { min: 0, max: VIEW_W }, y: { min: 0, max: VIEW_H }, alpha: { start: 0.45, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false,
      }).setDepth(11).setScrollFactor(0);
    }

    // ---- darkness
    this.dark = this.add.renderTexture(0, 0, VIEW_W, VIEW_H).setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.lightImg = this.make.image({ x: 0, y: 0, key: 'atlas', frame: 'lightmask', add: false });
    this.smallLight = this.make.image({ x: 0, y: 0, key: 'atlas', frame: 'glow', add: false });
    this.tileLight = this.make.image({ x: 0, y: 0, key: 'atlas', frame: 'glow', add: false }).setAlpha(0.45);
    this.skyEraser = this.make.graphics({}, false);
    this.flashRect = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(14).setAlpha(0);

    this.camY = Math.max(0, sim.player.y - VIEW_H * 0.45);
    this.camX = sim.player.x - VIEW_W / 2;
    this.cameras.main.scrollY = this.camY;
    this.cameras.main.scrollX = this.camX;
    this.syncWindow();
    this.cameras.main.fadeIn(400, 7, 6, 12);

    if (!this.attract) {
      this.drillLoop = Audio.loop('drill_loop');
      this.scene.launch('Hud', { run: this });
      Audio.playMusic(biomeAt(sim.depth()).music);
      Audio.playAmbience(biomeAt(sim.depth()).id);
    }
    // auto-pause when the window loses focus (alt-tab, Steam overlay)
    const onBlur = () => {
      if (!this.attract && !this.bot && this.scene.isActive() && !this.sim.over && !this.sim.choices) {
        this.scene.launch('Pause', { from: 'Run' });
        this.scene.pause();
        this.scene.pause('Hud');
      }
    };
    window.addEventListener('blur', onBlur);
    // closing the game mid-descent still banks everything found so far
    const onUnload = () => {
      if (this.attract || this.bot || this.banked) return;
      this.banked = true;
      if (!this.sim.over) this.sim.endRun('quit');
      bankRun(Save.data, this.sim.summary());
      checkAll(this.sim.summary());
      Save.save();
    };
    window.addEventListener('beforeunload', onUnload);
    this.events.on('pause', () => this.drillLoop?.hush());
    this.events.once('shutdown', () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onUnload);
      this.scene.stop('Hud');
      this.drillLoop?.stop();
      this.drillLoop = null;
      Audio.playAmbience('');
    });
  }

  // ------------------------------------------------------------------ tiles
  private solid(x: number, y: number) {
    return TILES[this.sim.tileAt(x, y)].solid;
  }

  /** keep the tilemap window over the camera; re-base and refill it when the view nears its edge */
  private syncWindow() {
    const cam = this.cameras.main;
    const vx = Math.floor(cam.scrollX / TILE);
    const vy = Math.floor(cam.scrollY / TILE);
    const vw = Math.ceil(VIEW_W / TILE) + 1;
    const vh = Math.ceil(VIEW_H / TILE) + 1;
    if (vx >= this.winX + 1 && vx + vw <= this.winX + WIN_W - 1 && vy >= this.winY + 1 && vy + vh <= this.winY + WIN_H - 1) return;
    this.winX = vx - Math.floor((WIN_W - vw) / 2);
    this.winY = vy - Math.floor((WIN_H - vh) / 2);
    this.terrain.setPosition(this.winX * TILE, this.winY * TILE);
    this.aoLayer.setPosition(this.winX * TILE, this.winY * TILE);
    for (let y = this.winY; y < this.winY + WIN_H; y++) for (let x = this.winX; x < this.winX + WIN_W; x++) this.refreshTile(x, y);
  }

  private refreshTile(x: number, y: number) {
    const lx = x - this.winX;
    const ly = y - this.winY;
    if (!(lx >= 0 && lx < WIN_W && ly >= 0 && ly < WIN_H)) return;
    const t = this.sim.tileAt(x, y);
    if (t === T.air) {
      this.terrain.removeTileAt(lx, ly, false, false);
      if (y > SKY_ROWS) {
        const m = (this.solid(x, y - 1) ? 1 : 0) | (this.solid(x + 1, y) ? 2 : 0) | (this.solid(x, y + 1) ? 4 : 0) | (this.solid(x - 1, y) ? 8 : 0);
        if (m) this.aoLayer.putTileAt(100000 + m, lx, ly, false);
        else this.aoLayer.removeTileAt(lx, ly, false, false);
      } else this.aoLayer.removeTileAt(lx, ly, false, false);
      return;
    }
    this.aoLayer.removeTileAt(lx, ly, false, false);
    const mask = (this.solid(x, y - 1) ? 0 : 1) | (this.solid(x + 1, y) ? 0 : 2) | (this.solid(x, y + 1) ? 0 : 4) | (this.solid(x - 1, y) ? 0 : 8);
    const v = (x & 3) + ((y & 3) << 2);
    this.terrain.putTileAt(t * 256 + mask * 16 + v, lx, ly, false);
  }

  private refreshAround(x: number, y: number) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.refreshTile(x + dx, y + dy);
    const key = tileKey(x, y);
    const c = this.cracks.get(key);
    if (c && this.sim.tileAt(x, y) === T.air) {
      c.destroy();
      this.cracks.delete(key);
    }
  }

  // ----------------------------------------------------------------- update
  update(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    Controls.poll(this);
    const sim = this.sim;

    if (!this.attract && Controls.pressed('pause') && !sim.over && !sim.choices) {
      this.scene.launch('Pause', { from: 'Run' });
      this.scene.pause();
      this.scene.pause('Hud');
      return;
    }

    if (this.bot && sim.pendingLevels > 0 && !sim.over) {
      const hand = sim.openChoice();
      if (hand && hand.length) sim.choose(hand[0].id);
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
    } else if ((!sim.choices || sim.reachedHeart) && !sim.over) {
      this.acc += dt * (this.attract ? 1 : Save.data.settings.speed);
      if (Controls.pressed('shardbomb')) this.shardBombQueued = true;
      if (Controls.pressed('bomb')) this.bombQueued = true;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        let inp: SimInput;
        if (this.bot) inp = this.bot.think(sim);
        else {
          inp = {
            left: Controls.isDown('left'), right: Controls.isDown('right'), up: Controls.isDown('up'), down: Controls.isDown('down'),
            shardBomb: this.shardBombQueued, bomb: this.bombQueued,
          };
          this.shardBombQueued = false;
          this.bombQueued = false;
        }
        sim.step(inp);
        if (sim.choices || sim.over) break;
      }
    }

    for (const e of sim.drainEvents()) this.handle(e);
    this.syncActors(dt);
    this.updateCamera(dt);
    this.updateBackdrop(dt);
    this.drawDarkness(dt);
    this.updatePopups(dt);

    if (sim.over) {
      if (this.endTimer < 0) {
        this.endTimer = 1.6;
        Audio.play(sim.endReason === 'dark' ? 'death_gutter' : 'run_end');
        if (sim.endReason === 'dark') this.time.delayedCall(700, () => Audio.play('run_end', { volume: 0.7 }));
        Audio.stopMusic(1400);
        this.cameras.main.shake(300, 0.004 * Save.data.settings.shake);
      }
      this.endTimer -= dt;
      if (this.endTimer <= 0 && this.endTimer > -10) {
        this.endTimer = -100;
        if (this.attract) {
          this.scene.restart({ attract: true });
          return;
        }
        this.cameras.main.fadeOut(500, 7, 6, 12);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.stop('Hud');
          this.scene.start('Results', { summary: sim.summary() });
        });
      }
    }
  }

  quit() {
    this.sim.endRun('quit');
  }

  private shake(ms: number, amt: number) {
    const s = Save.data.settings.shake;
    if (s <= 0 || this.attract) return;
    this.cameras.main.shake(ms, amt * s);
  }

  /** Gentle, rate-limited screen flash (never a full-screen white-out). */
  private flash(color: number, ms: number, strength = 0.22) {
    if (Save.data.settings.flash || this.attract) return;
    const now = this.time.now;
    if (now - this.lastFlash < 350) return;
    this.lastFlash = now;
    this.flashRect.setFillStyle(color, 1).setAlpha(strength);
    this.tweens.killTweensOf(this.flashRect);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: ms + 120, ease: 'Quad.easeOut' });
  }

  // ----------------------------------------------------------------- events
  private handle(e: SimEvent) {
    const sim = this.sim;
    const px = sim.player.x;
    const pan = (x: number) => (x - px) / 200;
    switch (e.t) {
      case 'tile':
        this.refreshAround(e.x, e.y);
        break;
      case 'hit': {
        const def = TILES[e.tile];
        const key = tileKey(e.x, e.y);
        const max = def.hp * sim.hpScale(e.y);
        const frac = Math.max(0, sim.hpAt(e.x, e.y) / max);
        const stage = Math.min(3, Math.floor((1 - frac) * 4));
        let c = this.cracks.get(key);
        if (!c) {
          c = this.add.image(e.x * TILE + 8, e.y * TILE + 8, 'atlas', 'crack_0').setDepth(1);
          this.cracks.set(key, c);
        }
        c.setFrame(`crack_${stage}`);
        if (e.src === 'drill') {
          this.chips.setParticleTint(def.tint);
          const p = sim.player;
          const dx = Math.sign(p.x - (e.x * TILE + 8));
          const dy = Math.sign(p.y - (e.y * TILE + 8));
          this.chips.explode(2, e.x * TILE + 8 + dx * 7, e.y * TILE + 8 + dy * 7);
          if (this.drillSoundT <= 0) {
            Audio.play(def.ore ? 'drill_ore' : 'drill_rock', { volume: 0.55, jitter: 0.05, rate: 0.92 + (1 - frac) * 0.3 });
            this.drillSoundT = 0.07;
          }
          if (Math.random() < 0.5) {
            this.sparks.setParticleTint(def.ore ? def.tint : 0xfff0b5);
            this.sparks.explode(1, e.x * TILE + 8 + dx * 8, e.y * TILE + 8 + dy * 8);
          }
          this.recoil = 1;
        }
        break;
      }
      case 'break': {
        const def = TILES[e.tile];
        const cx = e.x * TILE + 8;
        const cy = e.y * TILE + 8;
        this.chips.setParticleTint(def.tint);
        this.chips.explode(def.ore ? 9 : 6, cx, cy);
        if (def.ore || def.shards) {
          this.sparks.setParticleTint(def.tint);
          this.sparks.explode(6, cx, cy);
          this.add.sprite(cx, cy, 'atlas', 'twinkle_0').setDepth(11).setTint(def.tint).setBlendMode(Phaser.BlendModes.ADD).play('twinkle').once('animationcomplete', (_: unknown, __: unknown, s: Spr) => s.destroy());
        }
        const dust = this.add.sprite(cx, cy, 'atlas', 'dust_0').setDepth(6).play('dust');
        dust.once('animationcomplete', () => dust.destroy());
        if (e.chain > 0) {
          const semis = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
          const rate = Math.pow(2, semis[Math.min(semis.length - 1, Math.floor(e.chain / 2))] / 12);
          Audio.play('shatter', { rate, volume: 0.55, pan: pan(cx) });
        } else {
          Audio.play(def.ore ? 'break_ore' : 'break_rock', { volume: 0.7, jitter: 0.1, pan: pan(cx) });
        }
        if (def.shards) Audio.play('crystal', { volume: 0.6, jitter: 0.1 });
        if (e.src === 'drill') this.hitstop = Math.max(this.hitstop, def.ore ? 0.03 : 0.012);
        break;
      }
      case 'pickup': {
        if (e.light > 0) Audio.play('light_pickup', { volume: 0.7 });
        else if (e.cores > 0) Audio.play('core_pickup');
        else if (e.gems > 0) Audio.play('gem_pickup', { volume: 0.8 });
        else {
          // pentatonic climb while collecting quickly
          const steps = [0, 2, 4, 7, 9, 12, 14, 16];
          const k = Math.min(steps.length - 1, Math.floor((this.goldPopTimer > 0 ? this.pendingGold : 0) / 6));
          Audio.play('pickup', { volume: 0.45, rate: Math.pow(2, steps[k % steps.length] / 12), jitter: 0.01 });
        }
        if (e.gold > 0) {
          this.pendingGold += e.gold;
          if (this.goldPopTimer <= 0) this.goldPopTimer = 0.35;
        }
        if (e.gems > 0) this.popup(`+${e.gems}`, sim.player.x, sim.player.y - 14, 0x72aef2, 'ico_gem');
        if (e.cores > 0) this.popup(`+${e.cores} core`, sim.player.x, sim.player.y - 14, 0x5fe0c4);
        if (e.light > 0) this.popup(`+${Math.round(e.light)}`, sim.player.x, sim.player.y - 14, 0xffd877, 'ico_light');
        break;
      }
      case 'shard': {
        // every burst is a little flash of its shard colour; big ones kick the camera
        if (e.n >= 4) {
          this.sparks.setParticleTint(SHARD_BY_ID[e.type].color);
          this.sparks.explode(Math.min(14, e.n), e.x, e.y);
        }
        if (e.type === 'ember' || e.type === 'cinnabar') {
          this.embers.explode(Math.min(10, e.n * 2), e.x, e.y);
          if (this.burstSoundT <= 0) {
            Audio.play('embershard', { volume: 0.55, jitter: 0.1, pan: pan(e.x) });
            this.burstSoundT = 0.07;
          }
        }
        if (e.n >= 10) this.shake(90, 0.0025);
        break;
      }
      case 'boonEcho':
        this.popup('ECHO!', sim.player.x, sim.player.y - 20, 0xb862de);
        Audio.play('boon_pick', { volume: 0.6, rate: 1.3 });
        break;
      case 'cataclysm': {
        const ring = this.add.circle(e.x, e.y, 6).setStrokeStyle(3, 0xffd877).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: ring, radius: 70, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onUpdate: () => ring.setRadius(ring.radius), onComplete: () => ring.destroy() });
        this.flash(0xffd877, 110, 0.18);
        this.shake(260, 0.006);
        this.hitstop = Math.max(this.hitstop, 0.05);
        Audio.play('shardbomb', { volume: 1, rate: 0.8 });
        break;
      }
      case 'dynamite': {
        const s = this.add.sprite(e.x, e.y, 'atlas', 'boom_0').setDepth(11).setScale(1.2).play('boom');
        s.once('animationcomplete', () => s.destroy());
        this.embers.explode(14, e.x, e.y);
        this.chips.setParticleTint(0x685e86);
        this.chips.explode(12, e.x, e.y);
        this.shake(220, 0.006);
        this.hitstop = Math.max(this.hitstop, 0.05);
        this.flash(0xf7b740, 80, 0.12);
        Audio.play('explode', { volume: 0.9, jitter: 0.08, pan: pan(e.x) });
        break;
      }
      case 'shardBomb': {
        const ring = this.add.circle(e.x, e.y, 4).setStrokeStyle(2, 0xc8ecff).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: ring, radius: 44, alpha: 0, duration: 300, ease: 'Cubic.easeOut', onUpdate: () => ring.setRadius(ring.radius), onComplete: () => ring.destroy() });
        this.sparks.setParticleTint(0xc8ecff);
        this.sparks.explode(24, e.x, e.y);
        this.flicker = 2.2;
        this.flash(0xc8ecff, 90, 0.15);
        this.shake(160, 0.004);
        this.hitstop = Math.max(this.hitstop, 0.035);
        Audio.play('shardbomb', { pan: pan(e.x) });
        break;
      }
      case 'bombThrow':
        Audio.play('throw');
        break;
      case 'levelup':
        Audio.play('levelup');
        break;
      case 'chainEnd': {
        // the pot pays out: a shower of coins and a rising chime, bigger for bigger pots
        if (e.count >= 10) Audio.play('chain_big', { volume: 0.8 });
        if (e.bonus >= 1) {
          const big = Math.min(1, Math.log10(1 + e.bonus) / 5);
          Audio.play('cashout', { volume: 0.55 + 0.4 * big, rate: 0.9 + big * 0.3 });
          this.coins.explode(Math.round(6 + 26 * big), sim.player.x, sim.player.y - 8);
          if (e.count >= 50) this.shake(160 + 200 * big, 0.003 + 0.004 * big);
        }
        break;
      }
      case 'chainLink':
        break;
      case 'sealDeny':
        this.sparks.setParticleTint(0x5fe0c4);
        this.sparks.explode(4, e.x, e.y);
        Audio.play('clank', { volume: 0.7, rate: 0.8 });
        this.popup(isFinite(e.need) ? `Drill power ${Math.floor(sim.stats.drillPower)} / ${e.need}` : 'Sealed in the demo', e.x, e.y - 6, 0x5fe0c4);
        break;
      case 'sealBreak':
        Audio.play('seal_break');
        this.shake(900, 0.008);
        this.hitstop = Math.max(this.hitstop, 0.12);
        this.flash(0x5fe0c4, 500, 0.3);
        this.sparks.setParticleTint(0x5fe0c4);
        this.sparks.explode(40, e.x, e.y);
        break;
      case 'geode':
        if (this.time.now - this.lastGeode > 900) {
          this.lastGeode = this.time.now;
          Audio.play('geode', { volume: 0.8 });
          this.sparks.setParticleTint(0xe9acff);
          this.sparks.explode(18, e.x, e.y);
        }
        break;
      case 'relic':
        Audio.play('relic');
        this.flash(0xfff0b5, 300, 0.2);
        this.sparks.setParticleTint(0xfff0b5);
        this.sparks.explode(30, e.x, e.y);
        this.hitstop = Math.max(this.hitstop, 0.15);
        break;
      case 'heart':
        Audio.play('heart_break');
        Audio.stopMusic(2500);
        this.shake(2000, 0.01);
        this.hitstop = Math.max(this.hitstop, 0.3);
        this.flash(0xfffbea, 1200, 0.6);
        this.coins.explode(60, e.x, e.y);
        break;
      case 'land':
        if (e.speed > 180) {
          const d = this.add.sprite(sim.player.x, sim.player.y + 6, 'atlas', 'dust_0').setDepth(6).play('dust');
          d.once('animationcomplete', () => d.destroy());
          Audio.play('land', { volume: Math.min(1, e.speed / 300) });
          this.player.setScale(1.15, 0.85);
          this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
        }
        break;
      case 'quake':
        this.shake(200, 0.008);
        Audio.play('explode', { rate: 0.6 });
        break;
      case 'rockShatter':
        this.chips.setParticleTint(0x8a80a6);
        this.chips.explode(12, e.x, e.y);
        this.shake(100, 0.003);
        Audio.play('break_rock', { rate: 0.75 });
        break;
      case 'clank':
        this.sparks.setParticleTint(0xd3dde8);
        this.sparks.explode(3, e.x, e.y);
        Audio.play('clank', { volume: 0.6, jitter: 0.1 });
        break;
      case 'secondWind':
        this.flash(0xfff0b5, 400, 0.35);
        Audio.play('second_wind');
        break;
      case 'biome':
        Audio.playMusic(biomeAt(sim.depth()).music, 2000);
        Audio.playAmbience(biomeAt(sim.depth()).id);
        window.glimmer?.richPresence?.(`Descending through ${biomeAt(sim.depth()).name}`);
        break;
      case 'end':
        break;
    }
    this.events.emit('sim', e);
  }

  // ----------------------------------------------------------------- actors
  private syncActors(dt: number) {
    const sim = this.sim;
    const p = sim.player;
    this.drillSoundT -= dt;
    this.burstSoundT -= dt;
    this.goldPopTimer -= dt;
    if (this.goldPopTimer <= 0 && this.pendingGold > 0) {
      this.popup(`+${fmt(Math.max(1, this.pendingGold))}`, p.x, p.y - 14, 0xffd877, 'ico_gold');
      this.pendingGold = 0;
    }
    // player
    let rx = 0;
    let ry = 0;
    if (this.recoil > 0) {
      // the hull kicks back 1 px on every drill bite
      if (p.drill === 'down') ry = -1;
      else if (p.drill === 'up') ry = 1;
      else rx = -p.facing;
      this.recoil = 0;
    }
    this.player.setPosition(Math.round(p.x) + rx, Math.round(p.y - 3) + ry);
    if (sim.over && sim.endReason === 'dark') this.player.setTint(0x6a6080);
    else this.player.clearTint();
    this.player.setFlipX(p.facing < 0);
    const moving = Math.abs(p.vx) > 5 && p.grounded;
    const anim = !p.grounded && p.thrusting ? 'wick_fly' : moving || p.drill ? 'wick_move' : 'wick_idle';
    if (this.player.anims.currentAnim?.key !== anim) this.player.play(anim);
    if (p.thrusting) {
      this.flame.setVisible(true).setPosition(Math.round(p.x - p.facing * 1), Math.round(p.y + 10));
      if (!this.wasThrusting) Audio.play('thrust_start', { volume: 0.5 });
      if (Math.random() < 0.4) {
        this.embers.explode(1, p.x + Phaser.Math.Between(-3, 3), p.y + 12);
      }
    } else this.flame.setVisible(false);
    this.wasThrusting = p.thrusting;
    // drill bit placement
    const shake = p.drill ? Math.round(Math.random()) : 0;
    let dx = p.facing * 13;
    let dy = 2;
    let rot = p.facing > 0 ? 0 : Math.PI;
    if (p.drill === 'down') {
      dx = 0; dy = 12; rot = Math.PI / 2;
    } else if (p.drill === 'up') {
      dx = 0; dy = -12; rot = -Math.PI / 2;
    }
    this.drill.setPosition(Math.round(p.x + dx + (p.drill ? shake : 0)), Math.round(p.y + dy - 2));
    this.drill.setRotation(rot);
    this.drill.setFlipY(false);
    // the motor hums under every bite and rises with the heat
    this.drillLoop?.set(p.drill && !sim.over && !sim.choices ? 0.45 + 0.35 * p.heat : 0, 0.9 + 0.5 * p.heat);
    // a hot bit spins faster and glows
    this.drill.anims.timeScale = p.drill ? 1.5 + p.heat * 2.5 : 0.25;
    this.drill.setDepth(p.drill === 'up' ? 4 : 6);
    if (p.heat > 0.35) {
      const k = (p.heat - 0.35) / 0.65;
      this.drill.setTint(Phaser.Display.Color.GetColor(255, Math.round(255 - 90 * k), Math.round(255 - 150 * k)));
      if (p.drill && Math.random() < k * 0.5) {
        this.embers.explode(1, this.drill.x, this.drill.y);
      }
    } else this.drill.clearTint();

    // pickups
    const alive = new Set<number>();
    for (const pk of sim.pickups) {
      alive.add(pk.id);
      let s = this.pickupSpr.get(pk.id);
      if (!s) {
        s = this.add.sprite(pk.x, pk.y, 'atlas', pk.kind === 'orb' ? 'orb_0' : `item_${pk.kind}`).setDepth(4);
        if (pk.kind === 'orb') s.play('orb');
        this.pickupSpr.set(pk.id, s);
      }
      s.setPosition(Math.round(pk.x), Math.round(pk.y));
    }
    for (const [id, s] of this.pickupSpr) if (!alive.has(id)) {
      s.destroy();
      this.pickupSpr.delete(id);
    }

    // shards
    alive.clear();
    for (const sh of sim.shards) {
      alive.add(sh.id);
      let s = this.shardSpr.get(sh.id);
      if (!s) {
        s = this.add.image(sh.x, sh.y, 'atlas', `shard_${sh.type}`).setDepth(11).setTint(sh.color).setBlendMode(Phaser.BlendModes.ADD);
        this.shardSpr.set(sh.id, s);
      }
      s.setPosition(Math.round(sh.x), Math.round(sh.y)).setRotation(Math.atan2(sh.vy, sh.vx));
      if (Math.random() < (sim.shards.length > 60 ? 0.12 : 0.5)) {
        this.sparks.setParticleTint(sh.color);
        this.sparks.emitParticleAt(sh.x, sh.y, 1);
      }
    }
    for (const [id, s] of this.shardSpr) if (!alive.has(id)) {
      s.destroy();
      this.shardSpr.delete(id);
    }

    // bombs
    alive.clear();
    for (const b of sim.bombs) {
      alive.add(b.id);
      let s = this.bombSpr.get(b.id);
      if (!s) {
        s = this.add.image(b.x, b.y, 'atlas', 'icon_bomb').setDepth(5);
        this.bombSpr.set(b.id, s);
      }
      s.setPosition(Math.round(b.x), Math.round(b.y));
      s.setTint(Math.floor(b.fuse * 8) % 2 ? 0xffffff : 0xff9a73);
      if (Math.random() < 0.6) this.embers.explode(1, b.x + 3, b.y - 6);
    }
    for (const [id, s] of this.bombSpr) if (!alive.has(id)) {
      s.destroy();
      this.bombSpr.delete(id);
    }

    // falling rocks
    alive.clear();
    for (const r of sim.rocks) {
      alive.add(r.id);
      let s = this.rockSpr.get(r.id);
      if (!s) {
        s = this.add.image(r.x, r.y, 'tiles', 'boulder').setDepth(5);
        this.rockSpr.set(r.id, s);
      }
      s.setPosition(Math.round(r.x), Math.round(r.y));
    }
    for (const [id, s] of this.rockSpr) if (!alive.has(id)) {
      s.destroy();
      this.rockSpr.delete(id);
    }

    // drones
    while (this.droneSpr.length < sim.drones.length) {
      const has = this.textures.get('atlas').has('drone_0');
      const s = this.add.image(0, 0, 'atlas', has ? 'drone_0' : 'icon_drone').setDepth(6);
      this.droneSpr.push(s);
    }
    sim.drones.forEach((d, i) => this.droneSpr[i].setPosition(Math.round(d.x), Math.round(d.y)));

    this.syncDecor();
  }

  /** Cave decorations: deterministic per cell, only in natural caves, gone when their support breaks. */
  private syncDecor() {
    const sim = this.sim;
    const cam = this.cameras.main;
    const y0 = Math.max(SKY_ROWS + 1, Math.floor(cam.scrollY / TILE) - 1);
    const y1 = y0 + Math.ceil(VIEW_H / TILE) + 2;
    const x0 = Math.floor(cam.scrollX / TILE) - 1;
    const x1 = x0 + Math.ceil(VIEW_W / TILE) + 2;
    let used = 0;
    const counts: Record<string, [number, number]> = { rootsoil: [4, 3], amberstone: [3, 3], grotto: [3, 3], emberdeep: [3, 3], hollow: [3, 3], mantle: [3, 3], heart: [3, 3] };
    const put = (frame: string, x: number, y: number, hang: boolean) => {
      let s = this.decorSpr[used];
      if (!s) {
        s = this.add.image(0, 0, 'atlas', frame).setDepth(-1);
        this.decorSpr.push(s);
      }
      used++;
      s.setVisible(true).setFrame(frame).setOrigin(0.5, hang ? 0 : 1).setPosition(x, y);
      // hanging roots and tendrils sway a little
      s.setRotation(hang ? Math.sin(this.time.now / 900 + x * 0.37) * 0.06 : 0);
    };
    for (let ty = y0; ty <= y1; ty++) {
      const biome = biomeAt(depthOfRow(ty));
      const [nf, nc] = counts[biome.id];
      for (let tx = x0; tx <= x1; tx++) {
        if (!sim.naturalAirAt(tx, ty) || sim.tileAt(tx, ty) !== T.air) continue;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        if (this.solid(tx, ty + 1) && !sim.naturalAirAt(tx, ty + 1) && h % 100 < 38) {
          put(`decor_${biome.id}_f${(h >>> 8) % nf}`, tx * TILE + 8, ty * TILE + TILE, false);
        } else if (this.solid(tx, ty - 1) && !sim.naturalAirAt(tx, ty - 1) && (h >>> 4) % 100 < 32) {
          put(`decor_${biome.id}_c${(h >>> 12) % nc}`, tx * TILE + 8, ty * TILE, true);
        }
      }
    }
    for (let k = used; k < this.decorSpr.length; k++) this.decorSpr[k].setVisible(false);
  }

  // ----------------------------------------------------------------- camera
  private updateCamera(dt: number) {
    const p = this.sim.player;
    const lookAhead = p.vy > 100 ? 24 : p.drill === 'down' ? 18 : p.drill === 'up' || p.thrusting ? -10 : 0;
    const focusY = p.y;
    const target = Math.max(0, focusY - VIEW_H * 0.45 + lookAhead);
    this.camY += (target - this.camY) * Math.min(1, dt * 7);
    // sideways the camera follows loosely, leading a little in the facing direction
    const targetX = p.x - VIEW_W / 2 + p.facing * 18 + p.vx * 0.12;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 5);
    this.cameras.main.scrollY = Math.round(this.camY);
    this.cameras.main.scrollX = Math.round(this.camX);
    this.syncWindow();
  }

  private updateBackdrop(dt: number) {
    const cam = this.cameras.main;
    const d = this.sim.depth();
    const biome = biomeAt(d);
    if (biome.id !== this.backBiome) {
      this.far.setTexture(`backfar_${biome.id}`);
      for (const [id, em] of Object.entries(this.ambient)) em.emitting = id === biome.id;
      if (this.backBiome === '') {
        this.back.setTexture(`backwall_${biome.id}`);
      } else {
        this.backNext.setTexture(`backwall_${biome.id}`).setAlpha(0);
        this.tweens.add({
          targets: this.backNext, alpha: 1, duration: 1500,
          onComplete: () => {
            this.back.setTexture(`backwall_${biome.id}`);
            this.backNext.setAlpha(0);
          },
        });
      }
      this.backBiome = biome.id;
    }
    // rich ground glows warm, and glitters
    const rich = this.sim.world.rich(Math.floor(this.sim.player.x / TILE), Math.floor(this.sim.player.y / TILE));
    const tint = rich ? 0xffe2a0 : 0xffffff;
    this.back.setTint(tint);
    this.backNext.setTint(tint);
    if (rich && Math.random() < 0.25) {
      this.sparks.setParticleTint(0xffd877);
      this.sparks.emitParticleAt(cam.scrollX + Math.random() * VIEW_W, cam.scrollY + Math.random() * VIEW_H, 1);
    }
    const groundY = SKY_ROWS * TILE - cam.scrollY;
    this.back.tilePositionX = cam.scrollX;
    this.backNext.tilePositionX = cam.scrollX;
    this.far.tilePositionX = cam.scrollX * 0.55;
    this.mountains.tilePositionX = cam.scrollX * 0.5;
    this.back.tilePositionY = cam.scrollY;
    this.backNext.tilePositionY = cam.scrollY;
    // the distant cave scrolls slower than the wall in front of it
    this.far.tilePositionY = cam.scrollY * 0.55;
    // backwall visible only below the ground line
    const show = groundY < VIEW_H;
    this.back.setAlpha(show ? 1 : 0);
    this.far.setAlpha(show ? 1 : 0);
    if (show && groundY > 0) {
      this.back.y = groundY;
      this.backNext.y = groundY;
      this.far.y = groundY;
      this.back.tilePositionY = 0;
      this.backNext.tilePositionY = 0;
      this.far.tilePositionY = 0;
    } else {
      this.back.y = 0;
      this.backNext.y = 0;
      this.far.y = 0;
    }
    if (groundY > VIEW_H * 0.5) for (const em of Object.values(this.ambient)) em.emitting = false;
    else if (this.ambient[this.backBiome]) this.ambient[this.backBiome].emitting = true;
    for (const l of this.skyLayers) (l as Img).setVisible(groundY > -40);
    void dt;
  }

  // --------------------------------------------------------------- darkness
  private glow(x: number, y: number, color: number, scale: number, alpha = 1, big = false) {
    let g = this.glowPool[this.glowUsed];
    if (!g) {
      g = this.add.image(0, 0, 'atlas', 'glow').setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
      this.glowPool.push(g);
    }
    this.glowUsed++;
    g.setFrame(big ? 'glow_lg' : 'glow').setVisible(true).setPosition(Math.round(x), Math.round(y)).setTint(color).setScale(scale).setAlpha(alpha);
  }

  private drawDarkness(dt: number) {
    const sim = this.sim;
    const cam = this.cameras.main;
    const sx = cam.scrollX;
    const sy = cam.scrollY;
    const settings = Save.data.settings;
    this.glowUsed = 0;
    this.dark.clear();
    const d = sim.depth();
    let alpha = Phaser.Math.Clamp(0.55 + d * 0.04, 0, settings.darkAssist ? 0.8 : 0.97);
    if (sim.over && sim.endReason === 'dark' && this.endTimer > -10) alpha = Math.min(1, alpha + (1 - Math.max(0, this.endTimer) / 1.6) * 0.3);
    if (this.attract) alpha = Math.min(alpha, 0.9);
    this.dark.fill(DARK, alpha);
    // the sky is never dark
    const groundY = SKY_ROWS * TILE - sy;
    if (groundY > 0) {
      const g = this.skyEraser;
      g.clear();
      g.fillStyle(0xffffff, 1).fillRect(0, 0, VIEW_W, Math.min(VIEW_H, groundY + 6));
      for (let i = 0; i < 4; i++) g.fillStyle(0xffffff, 0.75 - i * 0.2).fillRect(0, groundY + 6 + i * 6, VIEW_W, 6);
      this.dark.erase(g, 0, 0);
    }
    // lantern
    this.flicker += (1 - this.flicker) * Math.min(1, dt * 3);
    const p = sim.player;
    let lr = sim.lightRadius() * this.flicker * (0.985 + Math.random() * 0.03);
    if (sim.over && sim.endReason === 'dark' && this.endTimer > -10) {
      const k = Phaser.Math.Clamp(1 - this.endTimer / 1.6, 0, 1);
      lr *= Math.max(0.05, (1 - k) * (1 - k)) * (0.8 + Math.random() * 0.4);
      if (Math.random() < 0.3) this.embers.explode(1, p.x + p.facing * 9, p.y - 6);
    }
    const lx = p.x + p.facing * 9 - sx;
    const ly = p.y - 6 - sy;
    this.lightImg.setScale((lr * 2) / 128);
    this.dark.erase(this.lightImg, lx, ly);
    this.glow(p.x + p.facing * 9, p.y - 6, 0xffd877, 1.4, 0.9);
    this.glow(p.x + p.facing * 9, p.y - 6, 0xf7b740, lr / 26, 0.18, true);

    // luminous tiles in view
    const survey = 1 + sim.stats.survey * 0.5;
    const y0 = Math.floor(sy / TILE) - 1;
    const y1 = y0 + Math.ceil(VIEW_H / TILE) + 2;
    const tx0 = Math.floor(sx / TILE) - 1;
    const tx1 = tx0 + Math.ceil(VIEW_W / TILE) + 2;
    for (let ty = Math.max(0, y0); ty <= y1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = sim.tileAt(tx, ty);
        const def = TILES[tile];
        let gl = def.glow ?? (def.ore && sim.stats.survey > 0 ? { r: 0.6, color: def.tint } : undefined);
        if (!gl) continue;
        if (sim.stats.survey > 0 && (tile === T.relic || tile === T.geode)) gl = { r: gl.r * (1 + 0.6 * sim.stats.survey), color: gl.color };
        const wx = tx * TILE + 8;
        const wy = ty * TILE + 8;
        const pulse = 0.85 + 0.15 * Math.sin(this.time.now / 400 + tx * 1.7 + ty);
        this.tileLight.setScale((gl.r * TILE * 2 * pulse) / 32);
        this.dark.erase(this.tileLight, wx - sx, wy - sy);
        if (this.glowUsed < 160) this.glow(wx, wy, gl.color, gl.r * 0.8 * pulse, 0.35 + 0.15 * (survey - 1));
      }
    }
    // pickups and shards emit a little light so they stay readable
    // cap per-frame light draws so huge cascades stay cheap
    let budget = 48;
    for (const pk of sim.pickups) {
      if (budget-- <= 0) break;
      this.smallLight.setScale(0.7);
      this.dark.erase(this.smallLight, pk.x - sx, pk.y - sy);
      const col = ITEM_GLOW[pk.kind];
      if (col && this.glowUsed < 200) this.glow(pk.x, pk.y, col, 0.6, 0.8);
    }
    budget = 40;
    for (const sh of sim.shards) {
      if (budget-- <= 0) break;
      this.smallLight.setScale(0.9);
      this.dark.erase(this.smallLight, sh.x - sx, sh.y - sy);
    }
    for (const dr of sim.drones) {
      this.smallLight.setScale(0.8);
      this.dark.erase(this.smallLight, dr.x - sx, dr.y - sy);
      this.glow(dr.x, dr.y, 0x5fe0c4, 0.5, 0.7);
    }
    for (let i = this.glowUsed; i < this.glowPool.length; i++) this.glowPool[i].setVisible(false);

    // low light: heartbeat pulse of the vignette (HUD reads this)
    this.lowLightT += dt;
    const depthShown = Math.floor(depthOfRow(Math.floor(p.y / TILE)));
    if (depthShown !== this.lastDepthShown) this.lastDepthShown = depthShown;
  }

  // ---------------------------------------------------------------- popups
  private popup(s: string, x: number, y: number, color: number, icon?: string) {
    const t = this.add.bitmapText(Math.round(x), Math.round(y), 'pixel_o', s).setOrigin(0.5, 1).setTint(color).setDepth(13);
    this.popups.push(t);
    const parts: Phaser.GameObjects.GameObject[] = [t];
    if (icon) {
      const ic = this.add.image(Math.round(x - t.width / 2 - 5), Math.round(y - 5), 'atlas', icon).setDepth(13);
      parts.push(ic);
    }
    this.tweens.add({
      targets: parts, y: '-=18', duration: 750, ease: 'Cubic.easeOut',
      onComplete: () => parts.forEach((o) => o.destroy()),
    });
    this.tweens.add({ targets: parts, alpha: 0, delay: 450, duration: 300 });
  }

  private updatePopups(_dt: number) {
    this.popups = this.popups.filter((p) => p.active);
  }
}
