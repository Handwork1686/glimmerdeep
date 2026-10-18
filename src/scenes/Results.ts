import Phaser from 'phaser';
import { DEMO, VIEW_H, VIEW_W } from '../config';
import { BIOMES, HEART_DEPTH, SEALS } from '../data/biomes';
import { RELIC_BY_ID } from '../data/relics';
import { computeStats } from '../core/progression';
import { S as STR } from '../data/strings';
import { BOON_BY_ID, RARITY_COLOR } from '../data/boons';
import type { RunSummary } from '../core/sim';
import { checkAll, unlock } from '../systems/achievements';
import { Audio } from '../systems/audio';
import { bankRun, BankResult } from '../systems/bank';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, fmt, fmtTime, panel, txt } from '../ui/widgets';
import { showToasts } from '../ui/toasts';

export class ResultsScene extends Phaser.Scene {
  private summary!: RunSummary;
  private bank!: BankResult;
  private rows: { label: string; value: number; fmt: (n: number) => string; color: number; record?: boolean; icon?: string }[] = [];
  private shown: number[] = [];
  private t = 0;
  private done = false;
  private tickT = 0;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private prompt!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Results');
  }

  init(data: { summary: RunSummary }) {
    this.summary = data.summary;
    this.t = 0;
    this.done = false;
    this.texts = [];
  }

  create() {
    const r = this.summary;
    this.bank = bankRun(Save.data, r);
    if (r.maxDepth >= 100 && r.time < 60) unlock('speedy');
    checkAll(r);
    Save.save();
    showToasts(this);

    this.add.image(0, 0, 'camp_bg').setOrigin(0, 0).setTint(0x606070);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060c, 0.55).setOrigin(0, 0);
    const title = r.reason === 'quit' ? STR.results.quit : r.reason === 'heart' ? STR.results.heart : STR.results.dark;
    const sub = r.reason === 'quit' ? STR.results.banked : r.reason === 'heart' ? STR.results.heartSub : STR.results.darkSub;
    txt(this, VIEW_W / 2, 16, title, COLORS.gold).setOrigin(0.5, 0).setScale(2);
    txt(this, VIEW_W / 2, 38, sub, COLORS.dim).setOrigin(0.5, 0);
    panel(this, 60, 54, 220, 170);
    this.rows = [
      { label: 'Deepest point', value: r.maxDepth, fmt: (n) => `${Math.round(n)} m`, color: COLORS.text, record: this.bank.newDepthRecord },
      { label: 'Time digging', value: r.time, fmt: (n) => fmtTime(n), color: COLORS.text },
      { label: 'Gold', value: r.gold, fmt: (n) => fmt(n), color: COLORS.gold, icon: 'ico_gold' },
      { label: 'Gems', value: r.gems, fmt: (n) => fmt(n), color: COLORS.blue, icon: 'ico_gem' },
      { label: 'Cores', value: r.cores, fmt: (n) => fmt(n), color: COLORS.teal, icon: 'ico_core' },
      { label: 'Longest chain', value: r.bestChain, fmt: (n) => `x${Math.round(n)}`, color: COLORS.teal, record: this.bank.newChainRecord },
      { label: 'Best chain pot', value: r.bestPot, fmt: (n) => fmt(n), color: COLORS.gold },
      { label: 'Level reached', value: r.level, fmt: (n) => `${Math.round(n)}`, color: COLORS.text },
    ];
    this.shown = this.rows.map(() => 0);
    this.rows.forEach((row, i) => {
      const y = 64 + i * 18;
      txt(this, 72, y, row.label, COLORS.dim);
      if (row.icon) this.add.image(184, y + 4, 'atlas', row.icon);
      const v = txt(this, 268, y, '', row.color).setOrigin(1, 0).setAlpha(0);
      this.texts.push(v);
    });
    // boons taken
    panel(this, 292, 54, 128, 170);
    txt(this, 356, 62, 'BOONS', COLORS.dim).setOrigin(0.5, 0);
    const boons = Object.entries(r.boons);
    boons.slice(0, 18).forEach(([id, n], i) => {
      const def = BOON_BY_ID[id];
      if (!def) return;
      const x = 306 + (i % 3) * 38;
      const y = 84 + Math.floor(i / 3) * 22;
      this.add.image(x + 6, y, 'atlas', `icon_${def.icon}`).setTint(RARITY_COLOR[def.rarity]);
      if (n > 1) txt(this, x + 14, y - 2, `x${n}`, COLORS.text, true);
    });
    if (boons.length === 0) txt(this, 356, 130, 'none', COLORS.faint).setOrigin(0.5);

    const notes: string[] = [];
    for (const id of r.relics) notes.push(`Relic: ${RELIC_BY_ID[id]?.name ?? id}`);
    if (this.bank.newPressure) notes.push(`Deep Pressure ${this.bank.newPressure} unlocked`);
    for (const dep of r.sealsBroken) notes.push(`${SEALS.find((s) => s.depth === dep)?.name ?? 'A seal'} stays broken`);
    // depth bar: the five biomes, this descent and the record
    const bx = 60;
    const bw = 360;
    const maxD = Math.max(1600, Save.data.maxDepth + 50);
    const g = this.add.graphics();
    g.fillStyle(0x07060c).fillRect(bx - 1, 227, bw + 2, 6);
    for (const b of BIOMES) {
      const x0 = bx + (b.from / maxD) * bw;
      const x1 = bx + (Math.min(b.to, maxD) / maxD) * bw;
      g.fillStyle(b.ambient, 1).fillRect(x0, 228, Math.max(1, x1 - x0), 4);
    }
    const rec = bx + (Save.data.maxDepth / maxD) * bw;
    const now = bx + (r.maxDepth / maxD) * bw;
    g.fillStyle(0xffd877).fillRect(Math.round(rec), 225, 1, 10);
    g.fillStyle(0xfffbea).fillRect(Math.round(now) - 1, 226, 3, 8);
    for (const sl of SEALS) {
      const x = Math.round(bx + (sl.depth / maxD) * bw);
      g.fillStyle(0x5fe0c4).fillRect(x, 226, 1, 8);
    }
    const goal = this.nextGoal();
    if (notes.length) txt(this, VIEW_W / 2, 237, notes.join('   '), COLORS.teal).setOrigin(0.5, 0);
    else txt(this, VIEW_W / 2, 237, goal, COLORS.dim).setOrigin(0.5, 0);
    this.prompt = txt(this, VIEW_W / 2, VIEW_H - 14, `${Controls.label('confirm')}  continue`, COLORS.dim).setOrigin(0.5, 0).setAlpha(0);
    this.cameras.main.fadeIn(400, 7, 6, 12);
    Audio.playMusic('results', 1500);
    this.input.on('pointerdown', () => this.advance());
  }

  /** the next seal you cannot break yet, or the Heart, or the endless deep */
  private nextGoal(): string {
    const save = Save.data;
    if (save.stats.hearts > 0) return STR.results.nextEndless;
    const power = computeStats(save.upgrades, {}, save.relics).drillPower;
    for (const sl of SEALS) {
      if (save.maxDepth < sl.depth + 4) {
        if (power < sl.power) return STR.results.nextSeal.replace('{name}', sl.name).replace('{depth}', String(sl.depth)).replace('{power}', String(sl.power));
        return STR.results.nextDepth.replace('{depth}', String(save.maxDepth));
      }
    }
    return save.maxDepth < HEART_DEPTH ? STR.results.nextHeart : STR.results.nextEndless;
  }

  private advance() {
    if (!this.done) {
      // skip the count-up
      this.t = 99;
      return;
    }
    if (DEMO && Save.data.maxDepth >= SEALS[0].depth - 6 && !Save.data.tips.demoEnd) {
      Save.data.tips.demoEnd = true;
      Save.save();
      fadeTo(this, 'DemoEnd', {}, 800);
      return;
    }
    if (this.bank.finale) {
      Save.data.credits = true;
      Save.save();
      fadeTo(this, 'Ending', {}, 800);
    } else fadeTo(this, 'Camp');
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    Controls.poll(this);
    this.t += dt;
    let allDone = true;
    this.rows.forEach((row, i) => {
      const start = 0.3 + i * 0.22;
      const k = Phaser.Math.Clamp((this.t - start) / 0.6, 0, 1);
      if (k < 1) allDone = false;
      if (k <= 0) return;
      this.shown[i] = row.value * Phaser.Math.Easing.Cubic.Out(k);
      const t = this.texts[i];
      t.setAlpha(1).setText(row.fmt(this.shown[i]) + (row.record && k >= 1 ? '  NEW!' : ''));
      if (k < 1 && row.value > 0) {
        this.tickT -= dt;
        if (this.tickT <= 0) {
          this.tickT = 0.05;
          Audio.play('tick', { volume: 0.35, rate: 1 + k * 0.5 });
        }
      }
    });
    if (allDone && !this.done) {
      this.done = true;
      Audio.play('ui_select');
      this.tweens.add({ targets: this.prompt, alpha: 1, duration: 300 });
    }
    if (Controls.pressed('confirm') || Controls.pressed('back')) this.advance();
  }
}
