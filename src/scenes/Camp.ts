import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { BIOMES, BLEND_M } from '../data/biomes';
import { BRANCH_ANGLE, BRANCH_COLOR, BRANCH_HINT, BRANCH_NAME, costOf, isAvailable, UPGRADE_BY_ID, UPGRADES, UpgradeNode } from '../data/upgrades';
import { computeStats, GLOOM_DESCRIPTIONS } from '../core/progression';
import { RELICS } from '../data/relics';
import { checkAll } from '../systems/achievements';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, fmt, Menu, panel, txt, wrap } from '../ui/widgets';
import { showToasts } from '../ui/toasts';
import { fmtKeys, S as STR } from '../data/strings';
import type { Stats } from '../core/stats';
import type { Prospect } from '../core/worldgen';

const D = 46;
const S = 36;
const WEB_W = 318;

function nodePos(n: UpgradeNode): { x: number; y: number } {
  if (n.at) {
    const a = (n.at[0] * Math.PI) / 180;
    return { x: Math.cos(a) * n.at[1] * D, y: Math.sin(a) * n.at[1] * D };
  }
  if (n.branch === 'core') return { x: 0, y: 0 };
  const a = (BRANCH_ANGLE[n.branch] * Math.PI) / 180;
  const [dist, side] = n.pos;
  return {
    x: Math.cos(a) * dist * D + Math.cos(a + Math.PI / 2) * side * S * 0.5,
    y: Math.sin(a) * dist * D + Math.sin(a + Math.PI / 2) * side * S * 0.5,
  };
}

const LINES = [
  'The lantern in the square burns lower every night. Its light came from the Heart of the world. Go and find it.',
  'Ore is ore. Every scrap you find makes the Wick a little braver.',
  'Crystals sing when they break. Make them sing together, and the pot sings louder.',
  'The rune ribbons are old stone, older than the town. Break one and the runes fly.',
  'Down past the grotto it gets hot. The embers go off like fireworks. Use them.',
  'They say the Mantle glows from below. That\'s the Heart, love. You\'re close.',
  'The square is bright again. Go on, then. The world goes deeper still.',
];

const STAT_LINES: [keyof Stats, string, (v: number) => string][] = [
  ['maxLight', 'Lantern fuel', (v) => v.toFixed(0)],
  ['lightDrain', 'Drain', (v) => `${Math.max(0.4, v).toFixed(2)}/s`],
  ['lightRadius', 'Light radius', (v) => `${Math.round(v * 100)}%`],
  ['drillPower', 'Drill power', (v) => v.toFixed(1).replace(/\.0$/, '')],
  ['drillRate', 'Drill speed', (v) => `${v.toFixed(1)}/s`],
  ['moveSpeed', 'Speed', (v) => v.toFixed(0)],
  ['thrust', 'Thrust', (v) => v.toFixed(0)],
  ['chainPot', 'Chain pot growth', (v) => `x${v.toFixed(3)}`],
  ['chainTime', 'Chain timer', (v) => `${v.toFixed(2)}s`],
  ['chainFuel', 'Fuel per link', (v) => v.toFixed(2)],
  ['heatMax', 'Drill heat', (v) => `+${Math.round(v * 100)}%`],
  ['auger', 'Auger', (v) => `${Math.round(v * 100)}%`],
  ['wideBit', 'Side bite', (v) => `${Math.round(v * 100)}%`],
  ['plow', 'Plow', (v) => `x${v}`],
  ['shardDamage', 'Shard damage', (v) => v.toFixed(1).replace(/\.0$/, '')],
  ['shardBonus', 'Shards per burst', (v) => `+${v}`],
  ['shardSpeed', 'Shard speed', (v) => `${Math.round(v * 100)}%`],
  ['shardPierce', 'Shard pierce', (v) => `+${v}`],
  ['shardSplit', 'Shard split', (v) => `${Math.round(v * 100)}%`],
  ['burstBonus', 'Burst size', (v) => `+${Math.round(v * 100)}%`],
  ['faultChance', 'Fault shards', (v) => `${Math.round(v * 100)}%`],
  ['veinRupture', 'Vein rupture', (v) => `${Math.round(Math.min(0.9, v) * 100)}%`],
  ['emberSplit', 'Ember sparks', (v) => `+${v}`],
  ['cinnabarMul', 'Cinnabar damage', (v) => `x${v.toFixed(1)}`],
  ['goldMul', 'Gold', (v) => `x${v.toFixed(2)}`],
  ['doubleOre', 'Double ore', (v) => `${Math.round(v * 100)}%`],
  ['xpMul', 'Experience', (v) => `x${v.toFixed(2)}`],
  ['bombCooldown', 'Shard Bomb recharge', (v) => `${v.toFixed(1)}s`],
  ['dynamite', 'Dynamite', (v) => v.toFixed(0)],
  ['boonEcho', 'Boon echo', (v) => `${Math.round(v * 100)}%`],
  ['chainKeeper', 'Chain keeper', (v) => `+${v.toFixed(2)}s`],
  ['rerolls', 'Rerolls', (v) => v.toFixed(0)],
  ['gemChance', 'Gem chance', (v) => `${Math.round(v * 100)}%`],
];

const pct = (v: number) => `+${Math.round(v * 100)}%`;
/** world-shaping stats: what newly generated ground holds */
const WORLD_LINES: [keyof Prospect, string, (v: number) => string][] = [
  ['shards', 'Shard sources', pct],
  ['geodes', 'Geodes', pct],
  ['caves', 'Caves', pct],
  ['ores', 'Ore veins', pct],
  ['flora', 'Moss and amber', pct],
  ['relicSense', 'Relic sense', (v) => `${v}`],
  ['rich', 'Rich ground', (v) => `${Math.round(Math.min(0.15, v) * 100)}%`],
];

/** one line summing up how the player has shaped the world, or '' */
function worldLine(st: Stats): string {
  const parts = WORLD_LINES.filter(([k]) => st.prospect[k] > 0).map(([k, label, f]) => `${label} ${f(st.prospect[k])}`);
  return parts.join(', ');
}

/** "Drill power 5 -> 6" lines for the next level of a node (up to three). */
function statDelta(id: string, owned: Record<string, number>): string[] {
  const now = computeStats(owned, {}, Save.data.relics);
  const next = computeStats({ ...owned, [id]: (owned[id] ?? 0) + 1 }, {}, Save.data.relics);
  const out: string[] = [];
  for (const [k, label, f] of STAT_LINES) {
    const a = now[k] as number;
    const b = next[k] as number;
    if (typeof a === 'number' && Math.abs(a - b) > 1e-6 && f(a) !== f(b)) out.push(`${label} ${f(a)} > ${f(b)}`);
    if (out.length >= 3) break;
  }
  for (const [k, label, f] of WORLD_LINES) {
    const a = now.prospect[k];
    const b = next.prospect[k];
    if (out.length < 3 && f(a) !== f(b)) out.push(`${label} ${f(a)} > ${f(b)}`);
  }
  return out;
}

export class CampScene extends Phaser.Scene {
  private web!: Phaser.GameObjects.Container;
  private edges!: Phaser.GameObjects.Graphics;
  private nodes = new Map<string, { frame: Phaser.GameObjects.Image; icon: Phaser.GameObjects.Image; lvl: Phaser.GameObjects.BitmapText; pip: Phaser.GameObjects.BitmapText }>();
  private holdT = 0;
  private repeatT = 0;
  private sel = 'root';
  private focus: 'menu' | 'web' = 'menu';
  private menu!: Menu;
  private info!: Phaser.GameObjects.Container;
  private goldT!: Phaser.GameObjects.BitmapText;
  private gemT!: Phaser.GameObjects.BitmapText;
  private coreT!: Phaser.GameObjects.BitmapText;
  private selRing!: Phaser.GameObjects.Graphics;
  private camX = 0;
  private camY = 0;
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  private hintT!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Camp');
  }

  create() {
    showToasts(this);
    this.costMul = computeStats(Save.data.upgrades).costMul;
    this.nodes.clear();
    this.focus = 'menu';
    this.add.image(0, 0, 'camp_bg').setOrigin(0, 0);
    this.add.rectangle(0, 0, WEB_W, VIEW_H, 0x07060c, 0.72).setOrigin(0, 0);

    // ---- web
    this.web = this.add.container(WEB_W / 2, VIEW_H / 2 + 6);
    this.edges = this.add.graphics();
    this.web.add(this.edges);
    this.selRing = this.add.graphics();
    this.web.add(this.selRing);
    for (const n of UPGRADES) {
      const p = nodePos(n);
      const frame = this.add.image(p.x, p.y, 'atlas', 'node_locked');
      const icon = this.add.image(p.x, p.y, 'atlas', `icon_${n.icon}`);
      const lvl = txt(this, p.x, p.y + 10, '', COLORS.text, true).setOrigin(0.5, 0);
      const pip = txt(this, p.x + 9, p.y - 13, '!', COLORS.gold, true).setOrigin(0.5, 0).setVisible(false);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => {
        if (!this.visibleNode(n)) return;
        this.sel = n.id;
        this.focus = 'web';
        this.menu.active = false;
        this.markSeen();
        this.refresh();
      });
      frame.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.getDistance() < 4 && this.visibleNode(n)) this.buy(n);
      });
      this.web.add([frame, icon, lvl, pip]);
      this.nodes.set(n.id, { frame, icon, lvl, pip });
    }
    // branch labels
    for (const b of Object.keys(BRANCH_ANGLE)) {
      if (b === 'core') continue;
      const a = (BRANCH_ANGLE[b as keyof typeof BRANCH_ANGLE] * Math.PI) / 180;
      const t = txt(this, Math.cos(a) * 6.2 * D, Math.sin(a) * 6.2 * D, BRANCH_NAME[b as keyof typeof BRANCH_NAME].toUpperCase(), BRANCH_COLOR[b as keyof typeof BRANCH_COLOR]).setOrigin(0.5).setAlpha(0.7);
      this.web.add(t);
    }
    // mouse drag panning
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x < WEB_W) this.drag = { x: p.x, y: p.y, cx: this.camX, cy: this.camY };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.drag && p.isDown) {
        this.camX = this.drag.cx - (p.x - this.drag.x);
        this.camY = this.drag.cy - (p.y - this.drag.y);
      }
    });
    this.input.on('pointerup', () => (this.drag = null));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      this.camX += dx * 0.4;
      this.camY += dy * 0.4;
    });

    // ---- right column
    panel(this, WEB_W, 0, VIEW_W - WEB_W, VIEW_H, 'panel_dark');
    this.add.image(WEB_W + 12, 12, 'atlas', 'ico_gold');
    this.goldT = txt(this, WEB_W + 20, 8, '', COLORS.gold);
    this.add.image(WEB_W + 72, 12, 'atlas', 'ico_gem');
    this.gemT = txt(this, WEB_W + 80, 8, '', COLORS.blue);
    this.add.image(WEB_W + 120, 12, 'atlas', 'ico_core');
    this.coreT = txt(this, WEB_W + 128, 8, '', COLORS.teal);
    this.info = this.add.container(WEB_W + 8, 26);

    const cycleGloom = (d: number) => {
      Save.data.gloom = Phaser.Math.Clamp(Save.data.gloom + d, 0, Save.data.maxGloom);
      Save.save();
    };
    this.menu = new Menu(this, WEB_W + 18, 142, [
      { label: 'DESCEND', onSelect: () => this.descend() },
      { label: () => `Pressure: < ${Save.data.gloom} >`, onLeft: () => cycleGloom(-1), onRight: () => cycleGloom(1), onSelect: () => cycleGloom(1), disabled: () => Save.data.maxGloom === 0 },
      { label: 'Workshop', onSelect: () => this.enterWeb() },
      { label: 'Codex', onSelect: () => fadeTo(this, 'Codex', { from: 'Camp' }) },
      { label: 'Achievements', onSelect: () => fadeTo(this, 'Achievements', { from: 'Camp' }) },
      { label: 'Settings', onSelect: () => this.openSettings() },
      { label: 'Title screen', onSelect: () => fadeTo(this, 'Title') },
    ], 13, 'left');
    this.menu.onChange = () => this.refresh();
    // first visit after a descent: point at the Workshop
    if (!Save.data.tips.workshop && Save.data.stats.runs > 0) {
      Save.data.tips.workshop = true;
      const t = this.menu.texts[3];
      const arrow = this.add.image(t.x - 10, t.y + 4, 'atlas', 'arrow').setTint(COLORS.gold);
      this.tweens.add({ targets: arrow, x: t.x - 14, yoyo: true, repeat: -1, duration: 300 });
      const tipT = txt(this, WEB_W / 2, VIEW_H - 30, STR.tips.workshop, COLORS.gold).setOrigin(0.5, 0);
      this.time.delayedCall(6000, () => {
        arrow.destroy();
        tipT.destroy();
      });
    }
    // top and bottom bands keep the quote and hints readable over the web
    this.add.rectangle(0, 0, WEB_W, 28, 0x07060c, 0.88).setOrigin(0, 0);
    this.add.rectangle(0, VIEW_H - 16, WEB_W, 16, 0x07060c, 0.88).setOrigin(0, 0);
    this.hintT = txt(this, WEB_W / 2, VIEW_H - 12, '', COLORS.dim).setOrigin(0.5, 0);

    // Ottilie's line
    const depth = Save.data.maxDepth;
    const li = Save.data.stats.hearts > 0 ? 6 : depth >= 1050 ? 5 : depth >= 520 ? 4 : depth >= 290 ? 3 : depth >= 120 ? 2 : Save.data.stats.runs > 0 ? 1 : 0;
    const q = txt(this, 8, 6, wrap(this, `Ottilie: "${LINES[li]}"`, WEB_W - 16), 0xdcb172);
    q.setAlpha(0);
    this.tweens.add({ targets: q, alpha: 1, duration: 800, delay: 300 });

    // center camera on owned frontier
    this.camX = 0;
    this.camY = 0;
    this.refresh();
    this.cameras.main.fadeIn(300, 7, 6, 12);
    Audio.playMusic('camp');
    window.glimmer?.richPresence?.('In the Workshop');
    this.events.on('resume', () => this.refresh());
  }

  private visibleNode(n: UpgradeNode) {
    const owned = Save.data.upgrades;
    if ((owned[n.id] ?? 0) > 0 || isAvailable(n, owned)) return true;
    return false;
  }

  private ghostNode(n: UpgradeNode) {
    // one step beyond the frontier: shown as a silhouette
    const owned = Save.data.upgrades;
    return n.requires.some((r) => isAvailable(UPGRADE_BY_ID[r], owned));
  }

  private markSeen() {
    if (!Save.data.seenNodes[this.sel]) {
      Save.data.seenNodes[this.sel] = true;
      const node = this.nodes.get(this.sel);
      node?.pip.setVisible(false);
    }
  }

  private enterWeb() {
    this.focus = 'web';
    this.menu.active = false;
    if (!this.visibleNode(UPGRADE_BY_ID[this.sel])) this.sel = 'root';
    this.refresh();
  }

  private openSettings() {
    this.scene.launch('Settings', { from: 'Camp' });
    this.scene.pause();
  }

  private descend() {
    Audio.play('descend');
    Save.save();
    fadeTo(this, 'Run', {}, 400);
  }

  /** Haggler discount, recomputed only when upgrades change */
  private costMul = 1;

  private canAfford(n: UpgradeNode, lvl: number) {
    const c = costOf(n, lvl, this.costMul);
    const s = Save.data;
    return { c, ok: s.gold >= c.gold && s.gems >= (c.gems ?? 0) && s.cores >= (c.cores ?? 0) };
  }

  private buy(n: UpgradeNode) {
    const s = Save.data;
    const lvl = s.upgrades[n.id] ?? 0;
    if (lvl >= n.max || !isAvailable(n, s.upgrades)) {
      Audio.play('ui_deny');
      return;
    }
    const { c, ok } = this.canAfford(n, lvl);
    if (!ok) {
      Audio.play('ui_deny');
      const node = this.nodes.get(n.id)!;
      this.tweens.add({ targets: [node.frame, node.icon], x: '+=2', yoyo: true, repeat: 2, duration: 40 });
      return;
    }
    s.gold -= c.gold;
    s.gems -= c.gems ?? 0;
    s.cores -= c.cores ?? 0;
    s.upgrades[n.id] = lvl + 1;
    s.stats.nodesBought++;
    this.costMul = computeStats(s.upgrades).costMul;
    checkAll();
    Save.save();
    Audio.play('buy', { rate: 1 + Math.min(0.5, lvl * 0.08) });
    const node = this.nodes.get(n.id)!;
    node.frame.setScale(1.35);
    this.tweens.add({ targets: node.frame, scale: 1, duration: 260, ease: 'Back.easeOut' });
    const burst = this.add.particles(0, 0, 'atlas', {
      frame: ['spark', 'pixel'], lifespan: 500, speed: { min: 30, max: 90 }, emitting: false, tint: BRANCH_COLOR[n.branch], blendMode: Phaser.BlendModes.ADD,
    });
    this.web.add(burst);
    burst.explode(18, node.frame.x, node.frame.y);
    this.time.delayedCall(700, () => burst.destroy());
    this.refresh();
  }

  private refresh() {
    const s = Save.data;
    this.goldT.setText(fmt(s.gold));
    this.gemT.setText(fmt(s.gems));
    this.coreT.setText(fmt(s.cores));
    // nodes
    this.edges.clear();
    for (const n of UPGRADES) {
      const vis = this.visibleNode(n);
      const ghost = !vis && this.ghostNode(n);
      const node = this.nodes.get(n.id)!;
      const lvl = s.upgrades[n.id] ?? 0;
      node.frame.setVisible(vis || ghost);
      node.icon.setVisible(vis || ghost);
      node.lvl.setVisible(vis && n.max > 1 && n.id !== 'root');
      node.pip.setVisible(vis && !s.seenNodes[n.id] && (s.upgrades[n.id] ?? 0) === 0);
      if (!vis && !ghost) continue;
      const { ok } = vis ? this.canAfford(n, lvl) : { ok: false };
      const frame = lvl >= n.max ? 'node_max' : lvl > 0 ? 'node_owned' : vis ? 'node_open' : 'node_locked';
      node.frame.setFrame(frame);
      node.icon.setTint(ghost ? 0x241f3d : lvl > 0 ? 0xffffff : ok ? 0xd0d0d0 : 0x707080);
      node.icon.setAlpha(ghost ? 0.8 : 1);
      node.lvl.setText(n.infinite ? `${lvl}` : `${lvl}/${n.max}`).setTint(lvl >= n.max ? COLORS.gold : COLORS.text);
      if (vis && lvl < n.max && ok && n.id !== 'root') {
        // affordable: soft pulse
        node.frame.setTint(0xffffff);
      } else node.frame.clearTint();
      for (const r of n.requires) {
        const rn = UPGRADE_BY_ID[r];
        if (!rn) continue;
        const a = nodePos(n);
        const b = nodePos(rn);
        const lit = lvl > 0 && (s.upgrades[r] ?? 0) > 0;
        this.edges.lineStyle(lit ? 2 : 1, lit ? BRANCH_COLOR[n.branch] : 0x352c52, lit ? 0.9 : ghost ? 0.4 : 0.8);
        this.edges.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // selection
    this.selRing.clear();
    const sn = UPGRADE_BY_ID[this.sel];
    if (this.focus === 'web' && sn) {
      const p = nodePos(sn);
      this.selRing.lineStyle(1, 0xffd877, 1).strokeCircle(p.x, p.y, 13);
    }
    this.drawInfo();
    this.hintT.setText(this.focus === 'web' ? fmtKeys(STR.camp.hintWeb, (a) => Controls.label(a as never)) : STR.camp.hintMenu);
  }

  private drawInfo() {
    this.info.removeAll(true);
    const W = VIEW_W - WEB_W - 16;
    if (this.focus === 'menu') {
      const st = computeStats(Save.data.upgrades, {}, Save.data.relics);
      // the next layer is a band, never a line: it melts in around its boundary
      const next = BIOMES.find((b) => b.to < 99999 && Save.data.maxDepth < b.to + BLEND_M / 2);
      const nextLayer = next ? BIOMES[BIOMES.indexOf(next) + 1] : null;
      const lines = [
        ['Lantern fuel', `${Math.round(st.maxLight)}`],
        ['Drill power', `${Math.floor(st.drillPower)}`],
        ['Drill speed', `${st.drillRate.toFixed(1)}/s`],
        ['Relics', `${Save.data.relics.length} / ${RELICS.length}`],
        ['Deepest', `${Save.data.maxDepth} m`],
        ['Best chain', `${fmt(Save.data.stats.bestChain)}`],
      ];
      this.info.add(txt(this, 0, 0, 'THE WICK', COLORS.gold));
      lines.forEach(([a, b], i) => {
        this.info.add(txt(this, 0, 14 + i * 11, a, COLORS.dim, false));
        this.info.add(txt(this, W, 14 + i * 11, b, COLORS.text, false).setOrigin(1, 0));
      });
      let y = 82;
      if (next && nextLayer) {
        const t = txt(this, 0, y, wrap(this, `Next: ${nextLayer.name}, blending in around ${next.to - BLEND_M / 2}-${next.to + BLEND_M / 2} m`, W), COLORS.dim, false);
        this.info.add(t);
        y += t.height + 4;
      }
      const world = worldLine(st);
      if (world) this.info.add(txt(this, 0, y, wrap(this, `World: ${world}`, W), COLORS.green, false));
      else if (Save.data.gloom > 0) this.info.add(txt(this, 0, y, wrap(this, GLOOM_DESCRIPTIONS[Save.data.gloom], W), COLORS.violet, false));
      return;
    }
    const n = UPGRADE_BY_ID[this.sel];
    const lvl = Save.data.upgrades[n.id] ?? 0;
    this.info.add(txt(this, 0, 0, n.name, BRANCH_COLOR[n.branch]));
    this.info.add(txt(this, 0, 12, n.id === 'root' ? 'Origin' : n.infinite ? `Refinement  -  level ${lvl}` : `${BRANCH_NAME[n.branch]}  -  ${lvl}/${n.max}`, COLORS.dim, false));
    // the first node of a branch says what kind of play the branch opens up
    const desc = n.pos[0] === 1 && !n.infinite && n.branch !== 'core' ? `${n.desc}\n${BRANCH_HINT[n.branch]}` : n.desc;
    const body = txt(this, 0, 26, wrap(this, desc, W), COLORS.text, false);
    this.info.add(body);
    if (n.id === 'root') return;
    if (lvl >= n.max) {
      this.info.add(txt(this, 0, 76, STR.camp.mastered, COLORS.gold));
      return;
    }
    if (!isAvailable(n, Save.data.upgrades)) {
      this.info.add(txt(this, 0, 76, STR.camp.unlockFirst, COLORS.faint, false));
      return;
    }
    const { c } = this.canAfford(n, lvl);
    const s = Save.data;
    let y = Math.max(64, 30 + body.height);
    for (const line of statDelta(n.id, s.upgrades)) {
      this.info.add(txt(this, 0, y, line, COLORS.teal, false));
      y += 10;
    }
    y = Math.max(y + 4, 84);
    if (y > 150) y = 150;
    const row = (icon: string, have: number, need: number, color: number) => {
      this.info.add(this.add.image(4, y + 4, 'atlas', icon));
      this.info.add(txt(this, 12, y, fmt(need), have >= need ? color : COLORS.red));
      y += 11;
    };
    if (c.gold > 0) row('ico_gold', s.gold, c.gold, COLORS.gold);
    if (c.gems) row('ico_gem', s.gems, c.gems, COLORS.blue);
    if (c.cores) row('ico_core', s.cores, c.cores, COLORS.teal);
  }

  private navigate(dx: number, dy: number) {
    const cur = nodePos(UPGRADE_BY_ID[this.sel]);
    let best: string | null = null;
    let bestScore = 1e9;
    for (const n of UPGRADES) {
      if (n.id === this.sel || !this.visibleNode(n)) continue;
      const p = nodePos(n);
      const vx = p.x - cur.x;
      const vy = p.y - cur.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = n.id;
      }
    }
    if (best) {
      this.sel = best;
      Audio.play('ui_move', { volume: 0.6 });
      this.markSeen();
      this.refresh();
    }
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    Controls.poll(this);
    if (this.focus === 'menu') {
      this.menu.active = true;
      this.menu.update(dt);
    } else {
      this.menu.active = false;
      this.menu.refresh();
      if (Controls.pressed('left')) this.navigate(-1, 0);
      if (Controls.pressed('right')) this.navigate(1, 0);
      if (Controls.pressed('up')) this.navigate(0, -1);
      if (Controls.pressed('down')) this.navigate(0, 1);
      if (Controls.pressed('confirm')) {
        this.buy(UPGRADE_BY_ID[this.sel]);
        this.holdT = 0;
      } else if (Controls.isDown('confirm')) {
        // hold to keep buying levels of the selected node
        this.holdT += dt;
        this.repeatT -= dt;
        const n = UPGRADE_BY_ID[this.sel];
        const lvl = Save.data.upgrades[n.id] ?? 0;
        if (this.holdT > 0.45 && this.repeatT <= 0 && lvl < n.max && this.canAfford(n, lvl).ok) {
          this.repeatT = 0.12;
          this.buy(n);
        }
      } else this.holdT = 0;
      if (Controls.pressed('back')) {
        this.focus = 'menu';
        Audio.play('ui_back');
        this.refresh();
      }
      // keep the selection in view
      const p = nodePos(UPGRADE_BY_ID[this.sel]);
      if (!this.drag) {
        const tx = Phaser.Math.Clamp(p.x, -260, 260);
        const ty = Phaser.Math.Clamp(p.y, -240, 240);
        this.camX += (tx * 0.8 - this.camX) * Math.min(1, dt * 5);
        this.camY += (ty * 0.8 - this.camY) * Math.min(1, dt * 5);
      }
    }
    this.web.setPosition(Math.round(WEB_W / 2 - this.camX), Math.round(VIEW_H / 2 + 6 - this.camY));
    // affordable pulse
    const pulse = 0.75 + 0.25 * Math.sin(this.time.now / 250);
    for (const n of UPGRADES) {
      const node = this.nodes.get(n.id)!;
      const lvl = Save.data.upgrades[n.id] ?? 0;
      if (node.frame.visible && this.visibleNode(n) && lvl < n.max && n.id !== 'root' && this.canAfford(n, lvl).ok) node.frame.setAlpha(pulse);
      else node.frame.setAlpha(1);
    }
  }
}
