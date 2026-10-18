import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { CREDITS } from '../data/credits';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { COLORS, fadeTo, txt, wrap } from '../ui/widgets';

const ENDING = [
  "The World's Heart broke open like a sunrise.",
  'Its light poured up through the Mantle, the Hollow,',
  'the embers, the grotto and the amber -',
  'up the long shaft the Wick had carved -',
  'and into the Great Lantern of Hearthmoor.',
  '',
  'That night nobody in the village slept.',
  'They sat in the square and watched it burn.',
];

export class CreditsScene extends Phaser.Scene {
  private roll!: Phaser.GameObjects.Container;
  private ending = false;
  private speed = 14;

  constructor() {
    super('Credits');
  }

  private skipText = false;

  init(data: { ending?: boolean; skipText?: boolean }) {
    this.ending = !!data.ending;
    this.skipText = !!data.skipText;
  }

  create() {
    this.add.image(0, 0, this.ending ? 'ending_bg' : 'title_bg').setOrigin(0, 0).setAlpha(this.ending ? 1 : 0.5);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060c, 0.45).setOrigin(0, 0);
    this.roll = this.add.container(VIEW_W / 2, VIEW_H + 10);
    let y = 0;
    if (this.ending && !this.skipText) {
      for (const line of ENDING) {
        this.roll.add(txt(this, 0, y, wrap(this, line, 380), COLORS.text).setOrigin(0.5, 0));
        y += 14;
      }
      y += 60;
    }
    this.roll.add(this.add.image(0, y + 20, 'logo').setScale(0.75));
    y += 70;
    for (const [head, names] of CREDITS) {
      this.roll.add(txt(this, 0, y, head, COLORS.dim).setOrigin(0.5, 0));
      y += 13;
      for (const n of names) {
        this.roll.add(txt(this, 0, y, n, COLORS.gold).setOrigin(0.5, 0));
        y += 12;
      }
      y += 16;
    }
    y += 40;
    this.roll.add(txt(this, 0, y, this.ending ? 'The world goes deeper still. Deep Pressure is now open.' : 'Thank you for playing.', COLORS.teal).setOrigin(0.5, 0));
    this.roll.setData('h', y + 20);
    Audio.playMusic(this.ending ? 'ending' : 'title', 2000);
    this.cameras.main.fadeIn(1500, 7, 6, 12);
  }

  update(_t: number, deltaMs: number) {
    Controls.poll(this);
    const dt = deltaMs / 1000;
    const fast = Controls.isDown('confirm') || Controls.isDown('down') ? 6 : 1;
    this.roll.y -= this.speed * dt * fast;
    if (this.roll.y < -(this.roll.getData('h') as number) || Controls.pressed('back')) {
      this.roll.y = 1e6;
      fadeTo(this, this.ending ? 'Camp' : 'Title', {}, 1200);
    }
  }
}
