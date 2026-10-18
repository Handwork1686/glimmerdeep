import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { RELICS } from '../data/relics';
import { ORE_KINDS, TILES } from '../data/tiles';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Save } from '../systems/save';
import { COLORS, fadeTo, fmt, panel, txt, wrap } from '../ui/widgets';

/** Every ore and relic the deep holds: undiscovered entries stay a mystery. */
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

export class CodexScene extends Phaser.Scene {
  private from = 'Camp';
  private sel = 0;
  private cells: Phaser.GameObjects.NineSlice[] = [];
  private nameT!: Phaser.GameObjects.BitmapText;
  private subT!: Phaser.GameObjects.BitmapText;
  private descT!: Phaser.GameObjects.BitmapText;
  private entries: { kind: 'ore' | 'relic'; id: string }[] = [];

  constructor() {
    super('Codex');
  }

  init(data: { from?: string }) {
    this.from = data.from ?? 'Camp';
    this.sel = 0;
    this.cells = [];
  }

  create() {
    const save = Save.data;
    this.add.image(0, 0, 'camp_bg').setOrigin(0, 0).setTint(0x505060);
    this.entries = [...ORE_KINDS.map((id) => ({ kind: 'ore' as const, id })), ...RELICS.map((r) => ({ kind: 'relic' as const, id: r.id }))];
    const found = ORE_KINDS.filter((k) => (save.codex[k] ?? 0) > 0).length + save.relics.length;
    txt(this, VIEW_W / 2, 6, 'CODEX', COLORS.gold).setOrigin(0.5, 0).setScale(2);
    txt(this, VIEW_W / 2, 26, `${found} / ${this.entries.length} discovered`, COLORS.dim).setOrigin(0.5, 0);
    txt(this, 20, 40, 'ORES', COLORS.teal);
    txt(this, 20, 118, 'RELICS', COLORS.amber);
    const cols = 12;
    this.entries.forEach((e, i) => {
      const local = e.kind === 'ore' ? i : i - ORE_KINDS.length;
      const x = 20 + (local % cols) * 37;
      const y = (e.kind === 'ore' ? 50 : 128) + Math.floor(local / cols) * 32;
      const known = this.known(e);
      const p = panel(this, x, y, 30, 28, known ? 'panel' : 'panel_dark');
      p.setInteractive({ useHandCursor: true }).on('pointerover', () => this.select(i));
      this.cells.push(p);
      const frame = e.kind === 'ore' ? `item_${e.id}` : `relic_${e.id}`;
      const tex = this.textures.get('atlas');
      const ic = this.add.image(x + 15, y + 14, 'atlas', tex.has(frame) ? frame : 'icon_star').setScale(e.kind === 'ore' ? 2 : 1);
      if (!known) ic.setTintFill(0x241f3d);
    });
    panel(this, 20, 196, 440, 68, 'panel');
    this.nameT = txt(this, 30, 202, '', COLORS.gold);
    this.subT = txt(this, 450, 202, '', COLORS.dim).setOrigin(1, 0);
    this.descT = txt(this, 30, 216, '', COLORS.text, false);
    this.select(0);
    this.cameras.main.fadeIn(250, 7, 6, 12);
  }

  private known(e: { kind: 'ore' | 'relic'; id: string }) {
    return e.kind === 'ore' ? (Save.data.codex[e.id] ?? 0) > 0 : Save.data.relics.includes(e.id);
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
