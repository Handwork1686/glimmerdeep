import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { Audio, AudioManifest } from '../systems/audio';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const bar = this.add.graphics();
    const w = 160;
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(0x241f3d).fillRect(VIEW_W / 2 - w / 2, VIEW_H / 2, w, 4);
      bar.fillStyle(0xffd877).fillRect(VIEW_W / 2 - w / 2, VIEW_H / 2, w * v, 4);
    });
    this.load.setPath('assets/');
    this.load.atlas('atlas', 'atlas.png', 'atlas.json');
    this.load.image('tiles', 'tiles.png');
    this.load.json('tilesMeta', 'tiles.json');
    this.load.image('ao', 'ao.png');
    for (const b of ['rootsoil', 'amberstone', 'grotto', 'emberdeep', 'hollow', 'mantle', 'heart']) {
      this.load.image(`backwall_${b}`, `backwall_${b}.png`);
      this.load.image(`backfar_${b}`, `backfar_${b}.png`);
    }
    for (const img of ['sky', 'mountains', 'village', 'logo', 'title_bg', 'camp_bg', 'ending_bg', 'ending_shaft']) this.load.image(img, `${img}.png`);
    this.load.bitmapFont('pixel', 'fonts/pixel.png', 'fonts/pixel.xml');
    this.load.bitmapFont('pixel_o', 'fonts/pixel_o.png', 'fonts/pixel_o.xml');
    this.load.json('audioManifest', 'audio/manifest.json');
    this.load.on('loaderror', () => {
      /* optional assets (e.g. audio during development) may be missing */
    });
  }

  create() {
    const manifest = (this.cache.json.get('audioManifest') as AudioManifest | undefined) ?? { sfx: {}, music: {} };
    // queue audio as a second phase so the title appears quickly
    this.load.setPath('assets/audio/');
    for (const [key, n] of Object.entries(manifest.sfx)) {
      for (let i = 0; i < n; i++) this.load.audio(`sfx_${key}_${i}`, `sfx/${key}_${i}.ogg`);
    }
    for (const [key, info] of Object.entries(manifest.music)) {
      this.load.audio(`music_${key}`, `music/${key}.ogg`);
      for (const stem of info.stems ?? []) this.load.audio(`music_${key}_${stem}`, `music/${key}_${stem}.ogg`);
    }
    for (const kind of Object.keys(manifest.ambience ?? {})) this.load.audio(`amb_${kind}`, `music/amb_${kind}.ogg`);
    this.load.once('complete', () => {
      Audio.init(this.game, manifest);
      this.makeAnims();
      // dev shortcut: ?scene=Ending jumps straight to a scene
      const q = new URLSearchParams(window.location.search).get('scene');
      this.scene.start(import.meta.env.DEV && q ? q : 'Title');
    });
    this.load.start();
  }

  private makeAnims() {
    const a = this.anims;
    const seq = (prefix: string, n: number, order?: number[]) =>
      (order ?? [...Array(n).keys()]).map((i) => ({ key: 'atlas', frame: `${prefix}_${i}` }));
    a.create({ key: 'wick_idle', frames: seq('wick_idle', 2), frameRate: 3, repeat: -1 });
    a.create({ key: 'wick_move', frames: seq('wick_move', 4), frameRate: 12, repeat: -1 });
    a.create({ key: 'wick_fly', frames: seq('wick_fly', 2), frameRate: 10, repeat: -1 });
    a.create({ key: 'drill', frames: seq('drill', 3), frameRate: 24, repeat: -1 });
    a.create({ key: 'orb', frames: seq('orb', 2), frameRate: 6, repeat: -1 });
    a.create({ key: 'boom', frames: seq('boom', 7), frameRate: 20, repeat: 0 });
    a.create({ key: 'dust', frames: seq('dust', 4), frameRate: 14, repeat: 0 });
    a.create({ key: 'hit', frames: seq('hit', 3), frameRate: 24, repeat: 0 });
    a.create({ key: 'twinkle', frames: seq('twinkle', 4, [0, 1, 2, 3, 2, 1]), frameRate: 14, repeat: 0 });
    a.create({ key: 'flame', frames: seq('flame', 3), frameRate: 16, repeat: -1 });
    const has = (f: string) => this.textures.get('atlas').has(f);
    if (has('fire_0')) a.create({ key: 'fire', frames: seq('fire', 3), frameRate: 10, repeat: -1 });
    // boulder frame from the tileset (material 8, mask 0, variant 0)
    const meta = this.cache.json.get('tilesMeta') as { columns: number; rowsPerMaterial: number };
    const tex = this.textures.get('tiles');
    const mat = 8;
    const idx = mat * meta.columns * meta.rowsPerMaterial;
    tex.add('boulder', 0, (idx % meta.columns) * 16, Math.floor(idx / meta.columns) * 16, 16, 16);
  }
}
