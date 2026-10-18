import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { ACHIEVEMENTS } from '../systems/achievements';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, panel, txt, wrap } from '../ui/widgets';
import { Audio } from '../systems/audio';

export class AchievementsScene extends Phaser.Scene {
  private from = 'Title';
  private sel = 0;
  private cells: Phaser.GameObjects.NineSlice[] = [];
  private desc!: Phaser.GameObjects.BitmapText;
  private name!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Achievements');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'Title';
    this.sel = 0;
    this.cells = [];
  }

  create() {
    this.add.image(0, 0, 'camp_bg').setOrigin(0, 0).setTint(0x505060);
    const got = Object.keys(Save.data.achievements).length;
    txt(this, VIEW_W / 2, 8, 'ACHIEVEMENTS', COLORS.gold).setOrigin(0.5, 0).setScale(2);
    txt(this, VIEW_W / 2, 28, `${got} / ${ACHIEVEMENTS.length}`, COLORS.dim).setOrigin(0.5, 0);
    const cols = 10;
    ACHIEVEMENTS.forEach((a, i) => {
      const x = 24 + (i % cols) * 44;
      const y = 44 + Math.floor(i / cols) * 40;
      const unlocked = !!Save.data.achievements[a.id];
      const p = panel(this, x, y, 34, 34, unlocked ? 'panel_hi' : 'panel_dark');
      p.setInteractive({ useHandCursor: true }).on('pointerover', () => this.select(i));
      this.cells.push(p);
      const ic = this.add.image(x + 17, y + 17, 'atlas', a.hidden && !unlocked ? 'icon_eye' : `icon_${a.icon}`).setScale(unlocked ? 1.5 : 1.2);
      if (!unlocked) ic.setTint(0x352c52);
    });
    panel(this, 40, 212, 400, 50, 'panel');
    this.name = txt(this, 52, 220, '', COLORS.gold);
    this.desc = txt(this, 52, 234, '', COLORS.text, false);
    this.select(0);
    this.cameras.main.fadeIn(250, 7, 6, 12);
  }

  private select(i: number) {
    this.sel = i;
    const a = ACHIEVEMENTS[i];
    const unlocked = !!Save.data.achievements[a.id];
    this.name.setText(a.hidden && !unlocked ? '???' : a.name).setTint(unlocked ? COLORS.gold : COLORS.dim);
    this.desc.setText(wrap(this, a.hidden && !unlocked ? 'A secret, for now.' : a.desc, 380));
    this.cells.forEach((c, k) => c.setScale(k === i ? 1.08 : 1));
  }

  update() {
    Controls.poll(this);
    const n = ACHIEVEMENTS.length;
    if (Controls.pressed('right')) this.move(1);
    if (Controls.pressed('left')) this.move(-1);
    if (Controls.pressed('down')) this.move(10);
    if (Controls.pressed('up')) this.move(-10);
    if (Controls.pressed('back') || Controls.pressed('confirm')) fadeTo(this, this.from);
    void n;
  }

  private move(d: number) {
    const n = ACHIEVEMENTS.length;
    this.select((this.sel + d + n) % n);
    Audio.play('ui_move', { volume: 0.5 });
  }
}
