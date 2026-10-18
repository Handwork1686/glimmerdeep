import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { COLORS, fadeTo, txt, wrap } from '../ui/widgets';

/** Shown once in the demo when the Wick reaches the first Strata Seal. */
export class DemoEndScene extends Phaser.Scene {
  constructor() {
    super('DemoEnd');
  }

  create() {
    this.add.image(0, 0, 'title_bg').setOrigin(0, 0).setAlpha(0.45);
    this.add.image(VIEW_W / 2, 48, 'logo');
    const body = [
      'You reached the Amber Seal. Thank you for playing the Glimmerdeep demo!',
      '',
      "Past the seal, the full game holds five more layers of the world, 18 more ores, 24 relics, the World's Heart and endless depths beyond it.",
    ].map((l) => wrap(this, l, 380)).join('\n');
    txt(this, VIEW_W / 2, 92, body, COLORS.text).setOrigin(0.5, 0).setCenterAlign();
    txt(this, VIEW_W / 2, 200, 'Wishlist Glimmerdeep on Steam', COLORS.gold).setOrigin(0.5, 0).setScale(2);
    txt(this, VIEW_W / 2, VIEW_H - 16, `${Controls.label('confirm')}  continue`, COLORS.dim).setOrigin(0.5, 0);
    Audio.playMusic('ending', 1500);
    this.cameras.main.fadeIn(600, 7, 6, 12);
  }

  update() {
    Controls.poll(this);
    if (Controls.pressed('confirm') || Controls.pressed('back')) fadeTo(this, 'Camp');
  }
}
