import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { COLORS, txt } from '../ui/widgets';

/**
 * The ending: the World's Heart breaks open, its light climbs the shaft the
 * Wick carved, and the Great Lantern of Hearthmoor burns again.
 */
export class EndingScene extends Phaser.Scene {
  private t = 0;
  private shaft!: Phaser.GameObjects.Image;
  private beam!: Phaser.GameObjects.Graphics;
  private beamHead!: Phaser.GameObjects.Image;
  private rising!: Phaser.GameObjects.Particles.ParticleEmitter;
  private phase = 0;
  private done = false;

  constructor() {
    super('Ending');
  }

  create() {
    this.t = 0;
    this.phase = 0;
    this.done = false;
    this.cameras.main.setBackgroundColor('#07060c');
    Audio.playMusic('ending', 2500);
    Audio.play('heart_break');

    // 1. the World's Heart breaks open
    const heart = this.add.image(VIEW_W / 2, VIEW_H / 2, 'atlas', 'heart_core').setScale(2);
    const halo = this.add.image(VIEW_W / 2, VIEW_H / 2, 'atlas', 'glow_lg').setScale(4).setTint(0xf7b740).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    const wisps = this.add.particles(VIEW_W / 2, VIEW_H / 2, 'atlas', {
      frame: ['pixel', 'dot2', 'spark'], lifespan: 1600, speed: { min: 20, max: 140 }, angle: { min: 0, max: 360 },
      tint: [0xffd877, 0xfff0b5, 0xf7b740], alpha: { start: 1, end: 0 }, frequency: 20, quantity: 3, blendMode: Phaser.BlendModes.ADD,
    });
    this.tweens.add({ targets: heart, scale: 3.2, alpha: 0, duration: 2400, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: halo, scale: 7, alpha: 0, duration: 2600, ease: 'Quad.easeOut' });
    this.cameras.main.shake(2200, 0.004);
    this.time.delayedCall(2300, () => wisps.stop());

    // 2. the light climbs the shaft
    this.shaft = this.add.image(0, 0, 'ending_shaft').setOrigin(0, 0).setAlpha(0);
    this.beam = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.beamHead = this.add.image(240, 0, 'atlas', 'glow_lg').setScale(2.2).setTint(0xffd877).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.rising = this.add.particles(0, 0, 'atlas', {
      frame: ['pixel', 'dot2'], lifespan: 1400, speedY: { min: -140, max: -60 }, speedX: { min: -8, max: 8 },
      tint: [0xffd877, 0xfff0b5, 0xf7b740], alpha: { start: 1, end: 0 }, emitting: false, blendMode: Phaser.BlendModes.ADD,
    });
    this.cameras.main.fadeIn(600, 255, 240, 200);
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.t += dt;
    Controls.poll(this);
    if (Controls.pressed('back')) return this.finish();
    const cam = this.cameras.main;
    const H = this.shaft.height;
    if (this.phase === 0 && this.t > 2.6) {
      this.phase = 1;
      this.shaft.setAlpha(1);
      this.beamHead.setAlpha(1);
      this.rising.emitting = true;
      cam.setBounds(0, 0, VIEW_W, H);
      cam.scrollY = H - VIEW_H;
      cam.flash(400, 255, 240, 200);
      Audio.play('second_wind');
    }
    if (this.phase === 1) {
      // camera and beam race up the shaft together
      const k = Phaser.Math.Clamp((this.t - 2.6) / 6.5, 0, 1);
      const e = Phaser.Math.Easing.Sine.InOut(k);
      cam.scrollY = (H - VIEW_H) * (1 - e);
      const headY = H - 60 - (H - 170) * Phaser.Math.Easing.Sine.InOut(Math.min(1, k * 1.08));
      this.beam.clear();
      this.beam.fillStyle(0xf7b740, 0.35).fillRect(232, headY, 16, H - headY);
      this.beam.fillStyle(0xfff0b5, 0.55).fillRect(237, headY, 6, H - headY);
      this.beamHead.setPosition(240, headY);
      this.rising.setPosition(240, headY + 10);
      if (Math.random() < 0.15) Audio.play('crystal', { volume: 0.3, rate: 0.8 + k * 0.8 });
      if (k >= 1) {
        this.phase = 2;
        this.rising.emitting = false;
        this.reveal();
      }
    }
  }

  // 3. Hearthmoor lights up
  private reveal() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, VIEW_W, VIEW_H);
    cam.scrollY = 0;
    cam.flash(900, 255, 251, 234);
    Audio.play('pylon');
    this.shaft.setVisible(false);
    this.beam.setVisible(false);
    this.beamHead.setVisible(false);
    const town = this.add.image(0, 0, 'ending_bg').setOrigin(0, 0);
    const glow = this.add.image(130, 108, 'atlas', 'glow_lg').setScale(1.6).setTint(0xffd877).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
    this.tweens.add({ targets: glow, alpha: 0.5, scale: 1.9, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.easeInOut' });
    this.add.particles(0, 0, 'atlas', {
      frame: ['pixel', 'dot2'], x: { min: 0, max: VIEW_W }, y: VIEW_H + 2, lifespan: 7000, speedY: { min: -16, max: -6 },
      frequency: 160, tint: [0xffd877, 0xfff0b5], alpha: { start: 0.9, end: 0 }, blendMode: Phaser.BlendModes.ADD,
    });
    void town;
    const lines = ['The Great Lantern of Hearthmoor burns again.', 'That night nobody in the village slept.', 'They sat in the square and watched it shine.'];
    lines.forEach((l, i) => {
      const t = txt(this, VIEW_W / 2, 206 + i * 14, l, i === 0 ? COLORS.gold : COLORS.text).setOrigin(0.5, 0).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 1200 + i * 1600, duration: 900 });
    });
    this.time.delayedCall(9000, () => this.finish());
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(1200, 7, 6, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Credits', { ending: true, skipText: true }));
  }
}
