import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { biomeAt } from '../data/biomes';
import { BoonDef, RARITY_COLOR } from '../data/boons';
import { RELIC_BY_ID } from '../data/relics';
import { SHARD_BY_ID, shardCodexKey, type ShardId } from '../data/shards';
import { xpForLevel } from '../core/progression';
import { potMultiplier, type SimEvent } from '../core/sim';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fmt, panel, txt, wrap } from '../ui/widgets';
import type { RunScene } from './Run';
import { fmtKeys, S } from '../data/strings';

const ORE_NAME: Record<string, string> = {
  copper: 'Copper', tin: 'Tin', quartz: 'Quartz', silver: 'Silver', amber: 'Amber', jade: 'Jade', fossil: 'Fossil', gold: 'Gold',
  glimmer: 'Glimmer', sapphire: 'Sapphire', opal: 'Opal', fireopal: 'Fire Opal', ruby: 'Ruby', emerald: 'Emerald', starmetal: 'Starmetal',
  voidglass: 'Voidglass', prism: 'Prism', aether: 'Aether', cinnabar: 'Cinnabar', moonstone: 'Moonstone', mithril: 'Mithril', heartstone: 'Heartstone',
};

export class HudScene extends Phaser.Scene {
  run!: RunScene;
  private lightBar!: Phaser.GameObjects.Graphics;
  private lightText!: Phaser.GameObjects.BitmapText;
  private depthText!: Phaser.GameObjects.BitmapText;
  private biomeText!: Phaser.GameObjects.BitmapText;
  private goldText!: Phaser.GameObjects.BitmapText;
  private gemText!: Phaser.GameObjects.BitmapText;
  private coreText!: Phaser.GameObjects.BitmapText;
  private gemIcon!: Phaser.GameObjects.Image;
  private coreIcon!: Phaser.GameObjects.Image;
  private xpBar!: Phaser.GameObjects.Graphics;
  private lvText!: Phaser.GameObjects.BitmapText;
  private shardBombIcon!: Phaser.GameObjects.Image;
  private shardBombFill!: Phaser.GameObjects.Graphics;
  private shardBombKey!: Phaser.GameObjects.BitmapText;
  private bombIcon!: Phaser.GameObjects.Image;
  private bombText!: Phaser.GameObjects.BitmapText;
  private chainText!: Phaser.GameObjects.BitmapText;
  private chainShown = 0;
  private potText!: Phaser.GameObjects.BitmapText;
  private relicArrow!: Phaser.GameObjects.Image;
  private relicDist!: Phaser.GameObjects.BitmapText;
  /** the way home: points back to the shaft when far out, and to the Heart when deep */
  private homeArrow!: Phaser.GameObjects.Image;
  private homeText!: Phaser.GameObjects.BitmapText;
  private seen = new Set<string>();
  private flyT = 0;
  private card!: Phaser.GameObjects.Container;
  private tipText!: Phaser.GameObjects.BitmapText;
  private vignette!: Phaser.GameObjects.Image;
  private shownGold = 0;
  private goldBump = 0;
  private choice: Phaser.GameObjects.Container | null = null;
  private choiceIndex = 0;
  private choiceCards: Phaser.GameObjects.Container[] = [];
  private choiceDefs: BoonDef[] = [];
  private choiceDelay = 0;
  private lowPulse = 0;
  private beatLatch = false;
  private lastMilestone = 0;
  private tipQueue: string[] = [];
  private tipT = 0;
  private tilesBroken = 0;
  private fps!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Hud');
  }

  init(data: { run: RunScene }) {
    this.run = data.run;
    this.choice = null;
    this.choiceCards = [];
    this.shownGold = 0;
    this.chainShown = 0;
    this.lastMilestone = 0;
    this.seen = new Set(Object.keys(Save.data.codex).filter((k) => Save.data.codex[k] > 0));
    this.tipQueue = [];
    this.tipT = 0;
    this.tilesBroken = 0;
  }

  create() {
    // light bar
    this.add.image(10, 10, 'atlas', 'ico_light').setOrigin(0.5);
    this.lightBar = this.add.graphics();
    this.lightText = txt(this, 18, 15, '', COLORS.text).setOrigin(0, 0);
    // Shard Bomb + dynamite
    this.shardBombIcon = this.add.image(11, 32, 'atlas', 'icon_shardbomb');
    this.shardBombFill = this.add.graphics();
    this.shardBombKey = txt(this, 20, 28, '', COLORS.dim);
    this.bombIcon = this.add.image(48, 32, 'atlas', 'icon_bomb').setVisible(false);
    this.bombText = txt(this, 56, 28, '', COLORS.text).setVisible(false);
    // depth & currencies
    this.depthText = txt(this, VIEW_W - 6, 4, '0 m').setOrigin(1, 0).setScale(2);
    this.biomeText = txt(this, VIEW_W - 6, 24, '', COLORS.dim).setOrigin(1, 0);
    this.add.image(VIEW_W - 8, 41, 'atlas', 'ico_gold');
    this.goldText = txt(this, VIEW_W - 14, 37, '0', COLORS.gold).setOrigin(1, 0);
    this.gemIcon = this.add.image(VIEW_W - 8, 52, 'atlas', 'ico_gem').setVisible(false);
    this.gemText = txt(this, VIEW_W - 14, 48, '0', COLORS.blue).setOrigin(1, 0).setVisible(false);
    this.coreIcon = this.add.image(VIEW_W - 8, 63, 'atlas', 'ico_core').setVisible(false);
    this.coreText = txt(this, VIEW_W - 14, 59, '0', COLORS.teal).setOrigin(1, 0).setVisible(false);
    // xp
    this.xpBar = this.add.graphics();
    this.lvText = txt(this, 4, VIEW_H - 14, 'Lv 1', COLORS.teal);
    // chain
    this.chainText = txt(this, VIEW_W / 2, 30, '', COLORS.teal).setOrigin(0.5).setScale(2).setAlpha(0);
    this.potText = txt(this, VIEW_W / 2, 44, '', COLORS.gold).setOrigin(0.5).setAlpha(0);
    // relic pointer (Survey Lamp II)
    this.relicArrow = this.add.image(0, 0, 'atlas', 'arrow').setVisible(false).setTint(0xfff0b5);
    this.relicDist = txt(this, 0, 0, '', COLORS.text).setOrigin(0.5).setVisible(false);
    this.homeArrow = this.add.image(0, 0, 'atlas', 'arrow').setVisible(false);
    this.homeText = txt(this, 0, 0, '', COLORS.faint).setOrigin(0.5).setVisible(false);
    // tip line
    this.tipText = txt(this, VIEW_W / 2, VIEW_H - 8, '', COLORS.text).setOrigin(0.5, 1).setAlpha(0).setCenterAlign();
    // biome card
    this.card = this.add.container(VIEW_W / 2, 92).setAlpha(0);
    // vignette (low light)
    this.vignette = this.add.image(0, 0, this.makeVignette()).setOrigin(0, 0).setAlpha(0).setDepth(-1);
    this.fps = txt(this, 4, VIEW_H - 26, '', COLORS.dim).setVisible(Save.data.settings.showFps);

    this.run.events.on('sim', this.onSim, this);
    this.events.once('shutdown', () => this.run.events.off('sim', this.onSim, this));
    const b = biomeAt(this.run.sim.depth());
    this.showCard(b.name.toUpperCase(), `${this.run.sim.depth()} m`);
  }

  /** Queue a tip the player has never seen (each shows once per save). */
  private tip(id: keyof typeof S.tips) {
    if (Save.data.tips[id] || this.tipQueue.includes(id) || window.location.search.includes('capture')) return;
    Save.data.tips[id] = true;
    this.tipQueue.push(id);
  }

  private milestone(m: number, name: string) {
    const big = m >= 100;
    const t = txt(this, VIEW_W / 2, 58, `${name}!  x${m}`, big ? COLORS.gold : COLORS.teal).setOrigin(0.5).setScale(1).setDepth(30);
    this.tweens.add({ targets: t, scale: big ? 2 : 1.5, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 50, delay: 900, duration: 500, onComplete: () => t.destroy() });
    const idx = S.streaks.findIndex(([n]) => n === m);
    Audio.play('chain_milestone', { rate: 1 + Math.min(0.6, idx * 0.09) });
    // the screen breathes with the streak
    if (big && !Save.data.settings.flash) {
      const r = this.add.rectangle(0, 0, VIEW_W, VIEW_H, m >= 500 ? 0xffd877 : 0x5fe0c4, 0.16).setOrigin(0).setDepth(25).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: r, alpha: 0, duration: 500, onComplete: () => r.destroy() });
    }
  }

  /** Cash-out of a chain pot: the multiplied bonus rises off the chain counter. */
  private cashOut(bonus: number, mult: number, count: number) {
    if (bonus < 1) return;
    const t = txt(this, VIEW_W / 2, 44, `+${fmt(bonus)}  x${mult.toFixed(1)}`, COLORS.gold).setOrigin(0.5).setDepth(30);
    t.setScale(count >= 100 ? 2 : 1.5);
    this.tweens.add({ targets: t, y: 70, alpha: 0, delay: 500, duration: 700, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    this.goldBump = 1.5;
  }

  /** A little icon that flies from the hull into its HUD counter. */
  private fly(frame: string, wx: number, wy: number, tx: number, ty: number) {
    const cam = this.run.cameras.main;
    const sx = wx - cam.scrollX;
    const sy = wy - cam.scrollY;
    const ic = this.add.image(sx, sy, 'atlas', frame).setDepth(20);
    const mx = (sx + tx) / 2 + Phaser.Math.Between(-30, 30);
    const my = Math.min(sy, ty) - 30;
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(sx, sy), new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(tx, ty));
    const o = { t: 0 };
    this.tweens.add({
      targets: o, t: 1, duration: 420, ease: 'Quad.easeIn',
      onUpdate: () => {
        const pt = curve.getPoint(o.t);
        ic.setPosition(Math.round(pt.x), Math.round(pt.y));
      },
      onComplete: () => {
        ic.destroy();
        this.goldBump = Math.min(1.4, this.goldBump + 0.4);
      },
    });
  }

  private discover(kind: string) {
    if (this.seen.has(kind) || !ORE_NAME[kind]) return;
    this.seen.add(kind);
    this.showCard(`${S.cards.newOre}: ${ORE_NAME[kind].toUpperCase()}`, 'Added to the Codex');
    Audio.play('discover');
  }

  /** first time a kind of shard flies: a card, and it joins the Codex when the dig is banked */
  private discoverShard(id: ShardId) {
    const key = shardCodexKey(id);
    if (this.seen.has(key) || (Save.data.codex[key] ?? 0) > 0) return;
    this.seen.add(key);
    this.showCard(`${S.cards.newShard}: ${SHARD_BY_ID[id].name.toUpperCase()}`, SHARD_BY_ID[id].desc);
    Audio.play('discover');
  }

  private makeVignette(): string {
    const key = 'vignette';
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, VIEW_W, VIEW_H)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    g.addColorStop(0, 'rgba(118,25,47,0)');
    g.addColorStop(1, 'rgba(118,25,47,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    tex.refresh();
    return key;
  }

  private showCard(title: string, sub: string) {
    this.card.removeAll(true);
    const t = txt(this, 0, 0, title, COLORS.text).setOrigin(0.5).setScale(3);
    const s = txt(this, 0, 20, sub, COLORS.dim).setOrigin(0.5);
    const line = this.add.graphics();
    line.fillStyle(0xffd877, 0.8).fillRect(-t.displayWidth / 2, 12, t.displayWidth, 1);
    this.card.add([t, s, line]);
    this.card.setAlpha(0).setY(98);
    this.tweens.killTweensOf(this.card);
    this.tweens.add({ targets: this.card, alpha: 1, y: 92, duration: 500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.card, alpha: 0, delay: 2400, duration: 700 });
  }

  private onSim(e: SimEvent) {
    switch (e.t) {
      case 'biome':
        this.showCard(e.name.toUpperCase(), `${this.run.sim.depth()} m`);
        Audio.play('biome');
        break;
      case 'pickup':
        if (e.gold > 0) this.tip('ore');
        if (e.kind !== 'orb' && e.kind !== 'core') this.discover(e.kind);
        if (this.flyT <= 0 && e.gold > 0) {
          this.flyT = 0.06;
          this.fly(`item_${e.kind === 'gold' ? 'gold' : e.kind}`, e.x, e.y, VIEW_W - 8, 41);
        }
        if (e.gems > 0) this.fly('ico_gem', e.x, e.y, VIEW_W - 8, 52);
        if (e.cores > 0) this.fly('ico_core', e.x, e.y, VIEW_W - 8, 63);
        break;
      case 'chainEnd':
        this.cashOut(e.bonus, e.mult, e.count);
        if (e.count >= 8) this.tip('chain');
        break;
      case 'sealDeny':
        this.tip('seal');
        break;
      case 'sealBreak':
        this.showCard(S.cards.sealBroken, e.name);
        break;
      case 'geode':
        this.tip('geode');
        break;
      case 'shard':
        this.tip('shards');
        this.discoverShard(e.type);
        break;
      case 'relic': {
        const r = RELIC_BY_ID[e.id];
        if (r) this.showCard(r.name.toUpperCase(), `${S.cards.relic}: ${r.perk}`);
        this.tip('relic');
        break;
      }
      case 'heart':
        this.showCard(S.cards.heart, S.cards.heartSub);
        break;
      case 'break':
        this.tilesBroken++;
        if (this.tilesBroken === 6) this.tip('thrust');
        if (e.chain >= 3) this.tip('crystal');
        if (this.tilesBroken === 60) this.tip('shardbomb');
        break;
      case 'levelup':
        this.tip('levelup');
        break;
      case 'rockShatter':
        this.tip('boulder');
        break;
      case 'secondWind':
        this.showCard(S.cards.secondWind, S.cards.secondWindSub);
        break;
    }
  }

  update(_t: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    const sim = this.run.sim;
    this.flyT -= dt;
    // light bar
    const frac = sim.lightFrac();
    const w = 110;
    this.lightBar.clear();
    this.lightBar.fillStyle(0x07060c).fillRect(17, 6, w + 2, 8);
    this.lightBar.fillStyle(0x241f3d).fillRect(18, 7, w, 6);
    const low = frac < 0.22;
    this.lowPulse += dt * (low ? 7 : 3);
    const col = frac > 0.5 ? 0xffd877 : frac > 0.22 ? 0xf7b740 : Math.sin(this.lowPulse) > 0 ? 0xf0564a : 0xbd2d3a;
    this.lightBar.fillStyle(col).fillRect(18, 7, Math.round(w * frac), 6);
    this.lightBar.fillStyle(0xfffbea, 0.6).fillRect(18, 7, Math.round(w * frac), 1);
    // a tick every 20 light so growth in max light is visible
    const per = 20 / sim.stats.maxLight;
    for (let k = per; k < 0.999; k += per) this.lightBar.fillStyle(0x07060c, 0.55).fillRect(18 + Math.round(w * k), 7, 1, 6);
    // lantern cap at the end of the bar
    this.lightBar.fillStyle(0xc98a2e).fillRect(19 + w, 6, 2, 8);
    this.lightText.setText(`${Math.ceil(Math.min(sim.light, sim.stats.maxLight))} / ${Math.ceil(sim.stats.maxLight)}`);
    this.vignette.setAlpha(low ? 0.35 + 0.25 * Math.sin(this.lowPulse) : Math.max(0, this.vignette.alpha - dt));
    // one heartbeat per pulse, on the upward crossing
    const beat = Math.sin(this.lowPulse) > 0.95;
    if (low && beat && !this.beatLatch) Audio.play('heartbeat', { volume: 0.5 });
    this.beatLatch = beat;

    // Shard Bomb recharge
    const cd = sim.player.bombCd;
    const ready = cd <= 0;
    this.shardBombIcon.setAlpha(ready ? 1 : 0.45);
    this.shardBombFill.clear();
    if (!ready) {
      const k = 1 - cd / Math.max(2, sim.stats.bombCooldown);
      this.shardBombFill.fillStyle(0xfff0b5, 0.5).fillRect(4, 39 - Math.round(14 * k), 14, Math.round(14 * k));
    }
    this.shardBombKey.setText(ready ? Controls.label('shardbomb') : `${cd.toFixed(1)}`);
    const dyn = sim.player.dynamite;
    this.bombIcon.setVisible(sim.stats.dynamite > 0);
    this.bombText.setVisible(sim.stats.dynamite > 0).setText(`${dyn}`);

    // depth & currencies
    this.depthText.setText(`${sim.depth()} m`);
    this.biomeText.setText(biomeAt(sim.depth()).name);
    this.shownGold += (sim.gold - this.shownGold) * Math.min(1, dt * 10);
    if (Math.abs(sim.gold - this.shownGold) < 1) this.shownGold = sim.gold;
    this.goldText.setText(fmt(this.shownGold));
    this.goldBump = Math.max(0, this.goldBump - dt * 6);
    this.goldText.setScale(1 + this.goldBump * 0.25);
    const hasGems = sim.gems > 0;
    this.gemIcon.setVisible(hasGems);
    this.gemText.setVisible(hasGems).setText(fmt(sim.gems));
    const hasCores = sim.cores > 0;
    this.coreIcon.setVisible(hasCores).setY(hasGems ? 63 : 52);
    this.coreText.setVisible(hasCores).setText(fmt(sim.cores)).setY(hasGems ? 59 : 48);

    // xp
    const need = xpForLevel(sim.level);
    this.xpBar.clear();
    this.xpBar.fillStyle(0x07060c).fillRect(0, VIEW_H - 3, VIEW_W, 3);
    this.xpBar.fillStyle(0x2ea59a).fillRect(0, VIEW_H - 2, Math.round(VIEW_W * Math.min(1, sim.xp / need)), 2);
    this.lvText.setText(`Lv ${sim.level}`);

    // chain, its live pot, and streak tiers
    for (const [m, name] of S.streaks) {
      if (sim.chain >= m && this.lastMilestone < m) {
        this.lastMilestone = m;
        this.milestone(m, name);
      }
    }
    if (sim.chain < 3) this.lastMilestone = 0;
    if (sim.chain >= 3) {
      if (sim.chain !== this.chainShown) {
        this.chainShown = sim.chain;
        this.chainText.setText(`CHAIN x${sim.chain}`).setAlpha(1).setScale(2.6);
        this.tweens.add({ targets: this.chainText, scale: 2, duration: 140, ease: 'Back.easeOut' });
        this.chainText.setTint(sim.chain >= 100 ? COLORS.gold : sim.chain >= 25 ? COLORS.amber : COLORS.teal);
      }
      const mult = potMultiplier(sim.chain, sim.stats.chainPot);
      this.potText.setText(sim.potGold > 0 ? `pot ${fmt(sim.potGold)}  x${mult.toFixed(1)}` : '').setAlpha(1);
      // the timer, drawn as a draining underline
      const k = Phaser.Math.Clamp(sim.chainTimer / sim.stats.chainTime, 0, 1);
      this.xpBar.fillStyle(0x07060c, 0.6).fillRect(VIEW_W / 2 - 40, 52, 80, 2);
      this.xpBar.fillStyle(sim.chain >= 100 ? 0xffd877 : 0x5fe0c4).fillRect(VIEW_W / 2 - 40, 52, Math.round(80 * k), 2);
    } else if (this.chainText.alpha > 0) {
      this.chainText.setAlpha(Math.max(0, this.chainText.alpha - dt * 2));
      this.potText.setAlpha(this.chainText.alpha);
      if (this.chainText.alpha <= 0) this.chainShown = 0;
    }
    // music intensity layer follows the live chain
    Audio.setIntensity(Math.min(1, sim.chain / 25));

    // relic pointer
    const rel = sim.stats.survey >= 2 ? sim.nearestRelic() : null;
    this.relicArrow.setVisible(!!rel);
    this.relicDist.setVisible(!!rel);
    const cam = this.run.cameras.main;
    const psx = sim.player.x - cam.scrollX;
    const psy = sim.player.y - cam.scrollY;
    if (rel) {
      const a = Math.atan2(rel.y - sim.player.y, rel.x - sim.player.x);
      const cx = psx + Math.cos(a) * 40;
      const cy = psy + Math.sin(a) * 34;
      this.relicArrow.setPosition(Math.round(cx), Math.round(cy)).setRotation(a).setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 200));
      this.relicDist.setPosition(Math.round(cx), Math.round(cy + 10)).setText(`${Math.round(rel.dist)} m`);
    }

    // the way home: back to the shaft when far out sideways; deep down, the Heart beneath it
    const tx = sim.player.x / 16;
    const deep = !sim.reachedHeart && sim.depth() > 1380;
    const far = Math.abs(tx) > 24;
    this.homeArrow.setVisible(far || deep);
    this.homeText.setVisible(far || deep);
    if (far || deep) {
      const hx = deep ? sim.heart.x * 16 + 16 : 8;
      const hy = deep ? sim.heart.y * 16 + 16 : sim.player.y;
      const a = Math.atan2(hy - sim.player.y, hx - sim.player.x);
      const ex = Phaser.Math.Clamp(psx + Math.cos(a) * 200, 18, VIEW_W - 18);
      const ey = Phaser.Math.Clamp(psy + Math.sin(a) * 110, 74, VIEW_H - 30);
      const dist = Math.round(Math.hypot(hx - sim.player.x, hy - sim.player.y) / 16);
      this.homeArrow.setPosition(Math.round(ex), Math.round(ey)).setRotation(a).setTint(deep ? 0xffd877 : 0x9a8fb0).setAlpha(0.55 + 0.25 * Math.sin(this.time.now / 300));
      this.homeText.setPosition(Math.round(ex), Math.round(ey + 10)).setText(deep ? `Heart ${dist} m` : `shaft ${dist} m`);
      if (far) this.tip('farOut');
    }
    if (Save.data.sealsBroken.some((dep) => sim.depth() >= dep && sim.depth() < dep + 8)) this.tip('sealOpen');

    // one-time contextual tips
    if (sim.time > 0.6) this.tip('move');
    if (sim.lightFrac() < 0.3) this.tip('lowlight');
    this.tipT -= dt;
    if (this.tipT <= 0 && this.tipQueue.length) {
      const id = this.tipQueue.shift()!;
      this.tipText.setText(wrap(this, fmtKeys(S.tips[id as keyof typeof S.tips], (a) => Controls.label(a as never)), 380));
      this.tipT = 4.5;
      Audio.play('tip', { volume: 0.5 });
    }
    const showTip = this.tipT > 0.4 && !this.choice;
    this.tipText.setY(VIEW_H - 8);
    this.tipText.setAlpha(Phaser.Math.Clamp(this.tipText.alpha + (showTip ? dt * 4 : -dt * 4), 0, 1));

    this.fps.setVisible(Save.data.settings.showFps).setText(`${Math.round(this.game.loop.actualFps)} fps`);

    // level-up choice
    if (sim.pendingLevels > 0 && !this.choice && !sim.over) {
      this.choiceDelay += dt;
      if (this.choiceDelay > 0.25) {
        this.choiceDelay = 0;
        const defs = sim.openChoice();
        if (defs) this.openChoice(defs);
      }
    }
    if (this.choice && !sim.choices) this.closeChoice();
    if (this.choice) this.updateChoice();
  }

  // ------------------------------------------------------------ level up UI
  private openChoice(defs: BoonDef[]) {
    Controls.clear();
    this.choiceDefs = defs;
    this.choiceIndex = 0;
    const c = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060c, 0.72).setOrigin(0, 0);
    const title = txt(this, VIEW_W / 2, 30, 'LEVEL UP', COLORS.gold).setOrigin(0.5).setScale(2);
    const sub = txt(this, VIEW_W / 2, 46, 'Choose a boon for this dig', COLORS.dim).setOrigin(0.5);
    c.add([dim, title, sub]);
    const n = defs.length;
    const cw = 104;
    const gap = 8;
    const total = n * cw + (n - 1) * gap;
    this.choiceCards = defs.map((d, i) => {
      const x = VIEW_W / 2 - total / 2 + i * (cw + gap);
      const card = this.add.container(x, 62);
      const bg = panel(this, 0, 0, cw, 132, `card_${d.rarity}`);
      const icon = this.add.image(cw / 2, 24, 'atlas', `icon_${d.icon}`).setScale(2);
      const name = txt(this, cw / 2, 44, d.name, RARITY_COLOR[d.rarity]).setOrigin(0.5, 0);
      const rar = txt(this, cw / 2, 56, d.rarity.toUpperCase(), COLORS.faint, false).setOrigin(0.5, 0);
      const desc = txt(this, 8, 72, wrap(this, d.desc, cw - 16), COLORS.text, false);
      const owned = this.run.sim.boons[d.id] ?? 0;
      const stack = txt(this, cw / 2, 118, `${owned} / ${d.max}`, COLORS.dim, false).setOrigin(0.5, 0);
      card.add([bg, icon, name, rar, desc, stack]);
      card.setSize(cw, 132);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        this.choiceIndex = i;
        this.refreshChoice();
      });
      bg.on('pointerdown', () => this.pick(i));
      card.setAlpha(0).setY(76);
      this.tweens.add({ targets: card, alpha: 1, y: 62, delay: i * 60, duration: 220, ease: 'Back.easeOut' });
      c.add(card);
      return card;
    });
    const sim = this.run.sim;
    const opts: string[] = [];
    if (sim.rerolls > 0) opts.push(`${Controls.label('bomb')}: reroll (${sim.rerolls})`);
    if (sim.banishes > 0) opts.push(`${Controls.label('shardbomb')}: banish (${sim.banishes})`);
    opts.push(`${Controls.label('back')}: skip (+8 fuel)`);
    c.add(txt(this, VIEW_W / 2, 204, opts.join('     '), COLORS.dim).setOrigin(0.5, 0));
    this.choice = c;
    this.choiceLock = 0.35;
    this.refreshChoice();
    Audio.setDuck(0.5);
  }

  private choiceArrow: Phaser.GameObjects.Image | null = null;

  private refreshChoice() {
    this.choiceCards.forEach((card, i) => {
      const sel = i === this.choiceIndex;
      card.setScale(sel ? 1.04 : 1);
      card.list.forEach((o) => {
        if (o instanceof Phaser.GameObjects.NineSlice) o.setTint(sel ? 0xffffff : 0x9a9aa8);
        else if (o instanceof Phaser.GameObjects.BitmapText || o instanceof Phaser.GameObjects.Image) (o as Phaser.GameObjects.Image).setAlpha(sel ? 1 : 0.75);
      });
      if (sel && this.choice) {
        if (!this.choiceArrow || !this.choiceArrow.active) {
          this.choiceArrow = this.add.image(0, 0, 'atlas', 'arrow').setRotation(Math.PI / 2).setDepth(60);
          this.choice.add(this.choiceArrow);
          this.tweens.add({ targets: this.choiceArrow, y: '+=3', yoyo: true, repeat: -1, duration: 300 });
        }
        this.tweens.killTweensOf(this.choiceArrow);
        this.choiceArrow.setPosition(card.x + 52, 56);
        this.tweens.add({ targets: this.choiceArrow, y: 59, yoyo: true, repeat: -1, duration: 300 });
      }
    });
  }

  private pick(i: number) {
    const d = this.choiceDefs[i];
    if (!d) return;
    Audio.play('boon_pick');
    this.run.sim.choose(d.id);
    this.closeChoice();
  }

  private closeChoice() {
    this.choiceArrow = null;
    this.choice?.destroy();
    this.choice = null;
    this.choiceCards = [];
    Audio.setDuck(1);
    Controls.clear();
  }

  private choiceLock = 0;

  private updateChoice() {
    Controls.poll(this);
    this.choiceLock -= this.game.loop.delta / 1000;
    if (this.choiceLock > 0) return;
    const n = this.choiceDefs.length;
    if (Controls.pressed('left')) {
      this.choiceIndex = (this.choiceIndex + n - 1) % n;
      Audio.play('ui_move');
      this.refreshChoice();
    }
    if (Controls.pressed('right')) {
      this.choiceIndex = (this.choiceIndex + 1) % n;
      Audio.play('ui_move');
      this.refreshChoice();
    }
    if (Controls.pressed('confirm')) this.pick(this.choiceIndex);
    else if (Controls.pressed('bomb') && this.run.sim.rerolls > 0) {
      this.closeChoice();
      const defs = (this.run.sim.reroll(), this.run.sim.choices);
      Audio.play('reroll');
      if (defs) this.openChoice(defs);
    } else if (Controls.pressed('shardbomb') && this.run.sim.banishes > 0) {
      const id = this.choiceDefs[this.choiceIndex].id;
      this.closeChoice();
      this.run.sim.banish(id);
      Audio.play('banish');
      const defs = this.run.sim.choices;
      if (defs) this.openChoice(defs);
    } else if (Controls.pressed('back')) {
      this.run.sim.skipChoice();
      this.closeChoice();
    }
  }
}
