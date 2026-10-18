import Phaser from 'phaser';
import { DEMO, GAME_VERSION, VIEW_H, VIEW_W } from '../config';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, Menu, panel, txt } from '../ui/widgets';
import { showToasts } from '../ui/toasts';

export class TitleScene extends Phaser.Scene {
  private menu!: Menu;
  private confirmNew = false;
  private logo!: Phaser.GameObjects.Image;

  constructor() {
    super('Title');
  }

  create() {
    showToasts(this);
    this.confirmNew = false;
    this.add.image(0, 0, 'title_bg').setOrigin(0, 0);
    // fireflies / embers drifting up from the village
    this.add.particles(0, 0, 'atlas', {
      frame: ['pixel', 'dot2'], x: { min: 0, max: VIEW_W }, y: VIEW_H + 4, lifespan: 7000, speedY: { min: -18, max: -8 }, speedX: { min: -6, max: 6 },
      frequency: 220, alpha: { start: 0.9, end: 0 }, tint: [0xffd877, 0xf7b740, 0xfff0b5], blendMode: Phaser.BlendModes.ADD,
    });
    const glow = this.add.image(VIEW_W / 2, 52, 'atlas', 'glow_lg').setScale(5, 2).setTint(0xf7b740).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.4, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // crystals in the cutaway twinkle now and then
    this.time.addEvent({
      delay: 350, loop: true, callback: () => {
        const x = Phaser.Math.Between(10, VIEW_W - 10);
        const y = Phaser.Math.Between(140, VIEW_H - 6);
        const tw = this.add.sprite(x, y, 'atlas', 'twinkle_0').setTint(Phaser.Utils.Array.GetRandom([0x5fe0c4, 0x72aef2, 0xf7b740, 0xb862de])).setBlendMode(Phaser.BlendModes.ADD).play('twinkle');
        tw.once('animationcomplete', () => tw.destroy());
      },
    });
    this.logo = this.add.image(VIEW_W / 2, 56, 'logo');
    this.logo.setAlpha(0).setY(48);
    this.tweens.add({ targets: this.logo, alpha: 1, y: 56, duration: 1200, ease: 'Cubic.easeOut' });

    const hasSave = Save.data.stats.runs > 0;
    const items = [
      { label: hasSave ? 'Continue' : 'Begin', onSelect: () => this.start() },
      ...(hasSave ? [{ label: () => (this.confirmNew ? 'Erase progress? Confirm' : 'New game'), onSelect: () => this.newGame() }] : []),
      { label: 'Settings', onSelect: () => this.openSettings() },
      { label: 'Achievements', onSelect: () => fadeTo(this, 'Achievements', { from: 'Title' }) },
      { label: 'Credits', onSelect: () => fadeTo(this, 'Credits', { ending: false }) },
      ...(window.glimmer?.quit ? [{ label: 'Quit', onSelect: () => window.glimmer!.quit!() }] : []),
    ];
    panel(this, VIEW_W / 2 - 66, 124, 132, items.length * 14 + 14, 'panel_dark').setAlpha(0.92);
    this.menu = new Menu(this, VIEW_W / 2, 132, items, 14, 'center');
    this.menu.onChange = () => {
      this.confirmNew = false;
      this.menu.refresh();
    };
    txt(this, VIEW_W - 4, VIEW_H - 12, `v${GAME_VERSION}${DEMO ? ' demo' : ''}`, COLORS.dim, true).setOrigin(1, 0);
    if (DEMO) txt(this, VIEW_W / 2 + 112, 74, 'DEMO', COLORS.teal).setOrigin(0.5);
    const sub = txt(this, VIEW_W / 2, 84, 'carry the light down', 0xdcb172).setOrigin(0.5, 0).setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 0.9, delay: 900, duration: 1200 });
    if (Save.recovered) txt(this, 4, VIEW_H - 12, Save.restoredFromBackup ? 'Your save was damaged, so we restored the backup.' : 'Your save was damaged and could not be recovered.', COLORS.red, false);
    this.cameras.main.fadeIn(800, 7, 6, 12);
    Audio.playMusic('title', 1500);
    this.events.on('resume', () => this.menu.refresh());
  }

  private start() {
    Audio.play('descend');
    // first ever descent goes straight down; afterwards the Workshop
    fadeTo(this, Save.data.stats.runs === 0 ? 'Run' : 'Camp', {}, 500);
  }

  private newGame() {
    if (!this.confirmNew) {
      this.confirmNew = true;
      return;
    }
    Save.reset();
    this.confirmNew = false;
    fadeTo(this, 'Run', {}, 500);
  }

  private openSettings() {
    this.scene.launch('Settings', { from: 'Title' });
    this.scene.pause();
  }

  update(_t: number, dt: number) {
    Controls.poll(this);
    this.menu.update(dt / 1000);
    this.logo.y = 56 + Math.sin(this.time.now / 1400) * 1.5;
  }
}
