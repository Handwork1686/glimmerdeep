import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { BOON_BY_ID, RARITY_COLOR } from '../data/boons';
import { COLORS, panel, txt, wrap } from './widgets';

/** where the bar sits: top right, just under the gold / gem / core rows */
export const BOONBAR_Y = 72;
const CELL = 15;
const PER_ROW = 8;

export interface BoonBarState {
  /** seconds of Overburn left (shown on its icon and in its tooltip) */
  overburnT?: number;
  /** Lantern Nova has already gone off this dig */
  novaUsed?: boolean;
}

/**
 * The boon bar: one icon per boon held this dig, in the order they were picked,
 * with a x2 / x3 badge when one stacks. Hover or tap an icon for what it does.
 * It lives in the top-right corner and never covers fuel, depth, gold or the chain.
 */
export class BoonBar {
  private items: Phaser.GameObjects.GameObject[] = [];
  private tip: Phaser.GameObjects.Container | null = null;
  private key = '';
  private cells: { x: number; y: number; id: string }[] = [];
  private state: BoonBarState = {};
  private boons: Record<string, number> = {};

  constructor(private scene: Phaser.Scene, private rightX = VIEW_W - 4, private y = BOONBAR_Y) {}

  /** call every frame: it rebuilds only when the boons (or a timer's second) change */
  update(boons: Record<string, number>, state: BoonBarState = {}) {
    this.boons = boons;
    this.state = state;
    const key = Object.entries(boons).map(([id, n]) => `${id}${n}`).join() + `|${Math.ceil(state.overburnT ?? 0)}|${state.novaUsed ? 1 : 0}`;
    if (key === this.key) return;
    this.key = key;
    this.build();
  }

  /** the boon icons' screen rectangles (for layout tests and tooltips) */
  get rects(): { x: number; y: number; w: number; h: number; id: string }[] {
    return this.cells.map((c) => ({ ...c, w: CELL - 1, h: CELL - 1 }));
  }

  private build() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
    this.cells = [];
    this.hideTip();
    Object.entries(this.boons).forEach(([id, n], i) => {
      const def = BOON_BY_ID[id];
      if (!def) return;
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      // icons fill leftward from the right edge, then wrap onto the next row down
      const x = this.rightX - CELL * (col + 1);
      const y = this.y + row * CELL;
      this.cells.push({ x, y, id });
      const timed = id === 'overburn' && (this.state.overburnT ?? 0) > 0;
      const spent = id === 'lanternnova' && this.state.novaUsed;
      const bg = panel(this.scene, x, y, CELL - 1, CELL - 1, 'panel_dark').setDepth(20).setScrollFactor(0);
      const ic = this.scene.add.image(x + 7, y + 7, 'atlas', `icon_${def.icon}`).setTint(RARITY_COLOR[def.rarity]).setDepth(21).setScrollFactor(0);
      if (spent) ic.setAlpha(0.35);
      this.items.push(bg, ic);
      if (n > 1) this.items.push(txt(this.scene, x + CELL - 2, y + CELL - 9, `x${n}`, COLORS.text).setOrigin(1, 0).setDepth(22).setScrollFactor(0));
      if (timed) this.items.push(txt(this.scene, x + 7, y + CELL - 1, `${Math.ceil(this.state.overburnT ?? 0)}`, COLORS.red).setOrigin(0.5, 0).setDepth(22).setScrollFactor(0));
      bg.setInteractive({ useHandCursor: false });
      bg.on('pointerover', () => this.showTip(id, x, y));
      bg.on('pointerdown', () => this.showTip(id, x, y));
      bg.on('pointerout', () => this.hideTip());
    });
  }

  private showTip(id: string, x: number, y: number) {
    this.hideTip();
    const def = BOON_BY_ID[id];
    const n = this.boons[id] ?? 1;
    let life = 'this dig';
    if (id === 'overburn') life = (this.state.overburnT ?? 0) > 0 ? `${Math.ceil(this.state.overburnT ?? 0)} s left` : 'burnt out';
    if (id === 'lanternnova') life = this.state.novaUsed ? 'used this dig' : 'ready, once this dig';
    const body = wrap(this.scene, def.desc, 140);
    const lines = body.split('\n').length;
    const h = 22 + lines * 9 + 11;
    const w = 150;
    const tx = Math.max(4, Math.min(VIEW_W - w - 4, x + CELL - w));
    const ty = y + CELL + 2;
    const c = this.scene.add.container(tx, ty).setDepth(40).setScrollFactor(0);
    c.add(panel(this.scene, 0, 0, w, h, 'panel_hi'));
    c.add(txt(this.scene, 6, 5, n > 1 ? `${def.name} x${n}` : def.name, RARITY_COLOR[def.rarity]));
    c.add(txt(this.scene, 6, 16, body, COLORS.text, false));
    c.add(txt(this.scene, 6, h - 11, life, COLORS.dim, false));
    this.tip = c;
  }

  private hideTip() {
    this.tip?.destroy();
    this.tip = null;
  }

  destroy() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
    this.hideTip();
  }
}
