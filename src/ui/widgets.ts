import Phaser from 'phaser';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';

export const COLORS = {
  text: 0xfffbea,
  dim: 0x8a80a6,
  faint: 0x4f4669,
  gold: 0xffd877,
  amber: 0xf7b740,
  teal: 0x5fe0c4,
  blue: 0x72aef2,
  red: 0xf0564a,
  violet: 0xb862de,
  green: 0x6aaa4a,
  void: 0x07060c,
};

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, color = COLORS.text, outline = true): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(x, y, outline ? 'pixel_o' : 'pixel', s);
  t.setTint(color);
  return t;
}

/** Wrap text to a pixel width using the bitmap font metrics. */
export function wrap(scene: Phaser.Scene, s: string, width: number): string {
  const probe = scene.add.bitmapText(0, 0, 'pixel', '');
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    probe.setText(test);
    if (probe.width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  probe.destroy();
  return lines.join('\n');
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, frame = 'panel'): Phaser.GameObjects.NineSlice {
  const slice = frame.startsWith('btn') ? 5 : 6;
  const p = scene.add.nineslice(x, y, 'atlas', frame, w, h, slice, slice, slice, slice);
  p.setOrigin(0, 0);
  return p;
}

export interface MenuItem {
  label: string | (() => string);
  onSelect?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  disabled?: () => boolean;
  hint?: string;
}

/**
 * Vertical keyboard/gamepad/mouse menu with a lantern cursor.
 */
export class Menu {
  index = 0;
  items: MenuItem[];
  texts: Phaser.GameObjects.BitmapText[] = [];
  cursor: Phaser.GameObjects.Image;
  active = true;
  private align: 'left' | 'center';
  onBack?: () => void;
  onChange?: (i: number) => void;
  private repeat = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, items: MenuItem[], spacing = 14, align: 'left' | 'center' = 'center') {
    this.items = items;
    this.align = align;
    this.cursor = scene.add.image(0, 0, 'atlas', 'arrow').setOrigin(1, 0.5);
    items.forEach((it, i) => {
      const t = txt(scene, x, y + i * spacing, this.labelOf(it));
      if (align === 'center') t.setOrigin(0.5, 0);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => {
        if (!this.active) return;
        if (this.index !== i) {
          this.index = i;
          Audio.play('ui_move', { volume: 0.6 });
          this.onChange?.(i);
        }
        this.refresh();
      });
      t.on('pointerdown', () => {
        if (!this.active) return;
        this.index = i;
        this.select();
      });
      this.texts.push(t);
    });
    this.refresh();
  }

  labelOf(it: MenuItem) {
    return typeof it.label === 'function' ? it.label() : it.label;
  }

  refresh() {
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      t.setText(this.labelOf(it));
      const dis = it.disabled?.() ?? false;
      t.setTint(i === this.index ? (dis ? COLORS.dim : COLORS.gold) : dis ? COLORS.faint : COLORS.text);
    });
    const t = this.texts[this.index];
    if (t) {
      const left = this.align === 'center' ? t.x - t.width / 2 : t.x;
      this.cursor.setPosition(left - 4, t.y + 4);
      this.cursor.setVisible(this.active);
    }
  }

  select() {
    const it = this.items[this.index];
    if (it.disabled?.()) {
      Audio.play('ui_deny');
      return;
    }
    Audio.play('ui_select');
    it.onSelect?.();
    this.refresh();
  }

  update(dt: number) {
    if (!this.active) return;
    this.repeat -= dt;
    const move = (d: number) => {
      this.index = (this.index + d + this.items.length) % this.items.length;
      Audio.play('ui_move', { volume: 0.6 });
      this.onChange?.(this.index);
      this.refresh();
    };
    if (Controls.pressed('down')) {
      move(1);
      this.repeat = 0.35;
    } else if (Controls.pressed('up')) {
      move(-1);
      this.repeat = 0.35;
    } else if (this.repeat <= 0 && (Controls.isDown('down') || Controls.isDown('up'))) {
      move(Controls.isDown('down') ? 1 : -1);
      this.repeat = 0.09;
    }
    const it = this.items[this.index];
    if (Controls.pressed('left') && it.onLeft) {
      it.onLeft();
      Audio.play('ui_move');
      this.refresh();
    }
    if (Controls.pressed('right') && it.onRight) {
      it.onRight();
      Audio.play('ui_move');
      this.refresh();
    }
    if (Controls.pressed('confirm')) this.select();
    else if (Controls.pressed('back') && this.onBack) {
      Audio.play('ui_back');
      this.onBack();
    }
  }

  setVisible(v: boolean) {
    this.texts.forEach((t) => t.setVisible(v));
    this.cursor.setVisible(v && this.active);
  }

  destroy() {
    this.texts.forEach((t) => t.destroy());
    this.cursor.destroy();
  }
}

const BIG = ['k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** 1234 -> 1234, 12345 -> 12.3k, 4.2e9 -> 4.20B ... up to decillions */
export function fmt(n: number): string {
  n = Math.floor(n);
  if (!isFinite(n)) return 'MAX';
  if (n < 10000) return n.toString();
  let i = -1;
  let v = n;
  while (v >= 1000 && i < BIG.length - 1) {
    v /= 1000;
    i++;
  }
  return (v < 100 ? v.toFixed(v < 10 ? 2 : 1) : v.toFixed(0)) + BIG[i];
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

/** Fade camera in/out helper. */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object, ms = 280) {
  scene.cameras.main.fadeOut(ms, 7, 6, 12);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}
