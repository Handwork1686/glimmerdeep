import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { RELICS } from '../data/relics';
import { SHARD_BY_ID, SHARD_TYPES, shardCodexKey, type ShardId } from '../data/shards';
import { ORE_KINDS, TILES } from '../data/tiles';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, fmt, panel, txt, wrap } from '../ui/widgets';

/** Every ore, shard and relic the deep holds: undiscovered entries stay a mystery. */
const ORE_INFO: Record<string, [string, string]> = {
  copper: ['Copper', 'Warm, soft and everywhere near the surface. Every fortune starts here.'],
  tin: ['Tin', 'Grey and humble. Hearthmoor\'s lamps were once made of little else.'],
  quartz: ['Quartz', 'Clear crystal that bursts into shards when it breaks. The first chain you ever make.'],
  silver: ['Silver', 'Runs in long bright veins through the Amberstone.'],
  amber: ['Amber', 'Old sunlight, set hard. It refuels your lantern.'],
  jade: ['Jade', 'Green and cool. The deeper it lies, the clearer it gets.'],
  fossil: ['Fossil', 'Spiral shells from a sea that dried up long ago. Worth a gem.'],
  gold: ['Gold', 'The Grotto\'s pride. Heavy, bright and worth the trip.'],
  glimmer: ['Glimmer', 'Teal crystal that sings when it shatters. Chains love it.'],
  sapphire: ['Sapphire', 'A cold blue gem, hard to cut and harder to find.'],
  opal: ['Opal', 'Full of trapped colour. It splinters into shards of its own.'],
  fireopal: ['Fire Opal', 'Carries a little of Emberdeep\'s heat inside it.'],
  ruby: ['Ruby', 'Red as a forge. Two gems in every one.'],
  emerald: ['Emerald', 'Grows only where the heat is fierce and the stone is patient.'],
  starmetal: ['Starmetal', 'Fell from the sky, once, and kept on falling.'],
  voidglass: ['Voidglass', 'Black crystal from The Hollow. It shatters violently.'],
  prism: ['Prism', 'Splits light into every colour at once. Three gems inside.'],
  aether: ['Aether', 'Barely there. It bursts into seven shards at a touch.'],
  cinnabar: ['Cinnabar', 'Mantle ore, red and restless. It explodes when broken.'],
  moonstone: ['Moonstone', 'Pale and glowing, as if it remembers the moon.'],
  mithril: ['Mithril', 'Lighter than silver, harder than steel, rarer than both.'],
  heartstone: ['Heartstone', 'A splinter of the World\'s Heart. It holds a core.'],
};

type Entry = { kind: 'ore' | 'shard' | 'relic'; id: string };
/** each section: label, label y, first row y */
const SECTIONS: Record<Entry['kind'], [string, number, number, number]> = {
  ore: ['ORES', 30, 40, COLORS.teal],
  shard: ['SHARDS', 100, 110, COLORS.blue],
  relic: ['RELICS', 141, 151, COLORS.amber],
};

export class CodexScene extends Phaser.Scene {
  private from = 'Camp';
  private sel = 0;
  private cells: Phaser.GameObjects.NineSlice[] = [];
  private nameT!: Phaser.GameObjects.BitmapText;
  private subT!: Phaser.GameObjects.BitmapText;
  private descT!: Phaser.GameObjects.BitmapText;
  private entries: Entry[] = [];

  constructor() {
    super('Codex');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'Camp';
    this.sel = 0;
    this.cells = [];
  }

  create() {
    this.add.image(0, 0, 'camp_bg').setOrigin(0, 0).setTint(0x505060);
    this.entries = [
      ...ORE_KINDS.map((id) => ({ kind: 'ore' as const, id })),
      ...SHARD_TYPES.map((t) => ({ kind: 'shard' as const, id: t.id })),
      ...RELICS.map((r) => ({ kind: 'relic' as const, id: r.id })),
    ];
    const found = this.entries.filter((e) => this.known(e)).length;
    txt(this, VIEW_W / 2, 4, 'CODEX', COLORS.gold).setOrigin(0.5, 0).setScale(2);
    txt(this, 460, 10, `${found} / ${this.entries.length} discovered`, COLORS.dim).setOrigin(1, 0);
    for (const [label, ly, , color] of Object.values(SECTIONS)) txt(this, 20, ly, label, color);
    const cols = 12;
    const first: Record<string, number> = {};
    this.entries.forEach((e, i) => {
      first[e.kind] ??= i;
      const local = i - first[e.kind];
      const x = 20 + (local % cols) * 37;
      const y = SECTIONS[e.kind][2] + Math.floor(local / cols) * 29;
      const known = this.known(e);
      const p = panel(this, x, y, 30, 27, known ? 'panel' : 'panel_dark');
      p.setInteractive({ useHandCursor: true }).on('pointerover', () => this.select(i));
      this.cells.push(p);
      const frame = e.kind === 'ore' ? `item_${e.id}` : e.kind === 'shard' ? `shard_${e.id}` : `relic_${e.id}`;
      const tex = this.textures.get('atlas');
      const ic = this.add.image(x + 15, y + 13, 'atlas', tex.has(frame) ? frame : 'icon_star').setScale(e.kind === 'relic' ? 1 : 2);
      if (e.kind === 'shard') ic.setTint(SHARD_BY_ID[e.id as ShardId].color).setRotation(-0.6);
      if (!known) ic.setTintFill(0x241f3d);
    });
    panel(this, 20, 210, 440, 56, 'panel');
    this.nameT = txt(this, 30, 215, '', COLORS.gold);
    this.subT = txt(this, 450, 215, '', COLORS.dim).setOrigin(1, 0);
    this.descT = txt(this, 30, 229, '', COLORS.text, false);
    this.select(0);
    this.cameras.main.fadeIn(250, 7, 6, 12);
  }

  private known(e: Entry) {
    if (e.kind === 'ore') return (Save.data.codex[e.id] ?? 0) > 0;
    if (e.kind === 'shard') return (Save.data.codex[shardCodexKey(e.id as ShardId)] ?? 0) > 0;
    return Save.data.relics.includes(e.id);
  }

  private select(i: number) {
    this.sel = i;
    const e = this.entries[i];
    const known = this.known(e);
    if (e.kind === 'ore') {
      const info = ORE_INFO[e.id];
      const tile = TILES.find((t) => t.drop?.kind === e.id);
      this.nameT.setText(known ? info[0] : '???').setTint(known ? COLORS.gold : COLORS.dim);
      this.subT.setText(known ? `mined ${fmt(Save.data.codex[e.id])}   worth ${tile?.drop?.gold ?? 0} each` : '');
      this.descT.setText(wrap(this, known ? info[1] : 'Not yet found. Dig deeper.', 410));
    } else if (e.kind === 'shard') {
      const t = SHARD_BY_ID[e.id as ShardId];
      this.nameT.setText(known ? t.name : '???').setTint(known ? COLORS.blue : COLORS.dim);
      this.subT.setText(known ? `thrown ${fmt(Save.data.codex[shardCodexKey(t.id)])}` : '');
      this.descT.setText(wrap(this, known ? `${t.desc} From: ${t.source}.` : `Not yet seen. It comes from: ${t.source}.`, 410));
    } else {
      const r = RELICS.find((x) => x.id === e.id)!;
      this.nameT.setText(known ? r.name : '???').setTint(known ? COLORS.amber : COLORS.dim);
      this.subT.setText(known ? r.perk : `Somewhere in ${r.biome === 'grotto' ? 'the Grotto' : r.biome[0].toUpperCase() + r.biome.slice(1)}`);
      this.descT.setText(wrap(this, known ? r.lore : 'A relic still buried. It glows faintly in the dark.', 410));
    }
    this.cells.forEach((c, k) => c.setScale(k === i ? 1.1 : 1));
  }

  update() {
    Controls.poll(this);
    if (Controls.pressed('right')) this.move(1);
    if (Controls.pressed('left')) this.move(-1);
    if (Controls.pressed('down')) this.move(12);
    if (Controls.pressed('up')) this.move(-12);
    if (Controls.pressed('back') || Controls.pressed('confirm')) fadeTo(this, this.from);
  }

  private move(d: number) {
    const n = this.entries.length;
    this.select((this.sel + d + n) % n);
    Audio.play('ui_move', { volume: 0.5 });
  }
}
