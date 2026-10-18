import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { applyScale } from '../main';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { Action, DEFAULT_BINDINGS, Save } from '../systems/save';
import { COLORS, Menu, MenuItem, panel, txt } from '../ui/widgets';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const onoff = (v: boolean) => (v ? 'On' : 'Off');

export class SettingsScene extends Phaser.Scene {
  private from = 'Title';
  private menu!: Menu;
  private page: 'main' | 'controls' = 'main';
  private waiting: Action | null = null;
  private note!: Phaser.GameObjects.BitmapText;
  private confirmReset = false;

  constructor() {
    super('Settings');
  }

  init(data: { from: string }) {
    this.from = data.from;
    this.page = 'main';
    this.waiting = null;
    this.confirmReset = false;
  }

  create() {
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060c, 0.8).setOrigin(0, 0);
    panel(this, 110, 14, 260, 242);
    this.note = txt(this, VIEW_W / 2, 238, '', COLORS.dim, false).setOrigin(0.5, 0);
    this.build();
  }

  private save() {
    Save.save();
    Audio.refreshVolumes();
  }

  private build() {
    this.menu?.destroy();
    this.children.list.filter((c) => c.getData('page')).forEach((c) => c.destroy());
    const s = Save.data.settings;
    const step = (k: 'master' | 'music' | 'sfx' | 'shake', d: number) => {
      s[k] = Phaser.Math.Clamp(Math.round((s[k] + d) * 10) / 10, 0, 1);
      this.save();
    };
    let items: MenuItem[];
    let title = 'SETTINGS';
    if (this.page === 'main') {
      const speeds = [1, 0.85, 0.7];
      items = [
        { label: () => `Master volume   < ${pct(s.master)} >`, onLeft: () => step('master', -0.1), onRight: () => step('master', 0.1) },
        { label: () => `Music           < ${pct(s.music)} >`, onLeft: () => step('music', -0.1), onRight: () => step('music', 0.1) },
        { label: () => `Sound effects   < ${pct(s.sfx)} >`, onLeft: () => step('sfx', -0.1), onRight: () => step('sfx', 0.1) },
        { label: () => `Screen shake    < ${pct(s.shake)} >`, onLeft: () => step('shake', -0.1), onRight: () => step('shake', 0.1) },
        { label: () => `Reduce flashes  < ${onoff(s.flash)} >`, onSelect: () => { s.flash = !s.flash; this.save(); }, onLeft: () => { s.flash = !s.flash; this.save(); }, onRight: () => { s.flash = !s.flash; this.save(); } },
        { label: () => `Darkness assist < ${onoff(s.darkAssist)} >`, onSelect: () => { s.darkAssist = !s.darkAssist; this.save(); }, onLeft: () => { s.darkAssist = !s.darkAssist; this.save(); }, onRight: () => { s.darkAssist = !s.darkAssist; this.save(); } },
        { label: () => `Game speed      < ${pct(s.speed)} >`, onSelect: () => { s.speed = speeds[(speeds.indexOf(s.speed) + 1) % 3]; this.save(); }, onLeft: () => { s.speed = speeds[(speeds.indexOf(s.speed) + 2) % 3]; this.save(); }, onRight: () => { s.speed = speeds[(speeds.indexOf(s.speed) + 1) % 3]; this.save(); } },
        { label: () => `Pixel-perfect   < ${onoff(s.pixelPerfect)} >`, onSelect: () => this.togglePixel(), onLeft: () => this.togglePixel(), onRight: () => this.togglePixel() },
        { label: () => `Fullscreen      < ${onoff(s.fullscreen)} >`, onSelect: () => this.toggleFullscreen(), onLeft: () => this.toggleFullscreen(), onRight: () => this.toggleFullscreen() },
        { label: () => `Show FPS        < ${onoff(s.showFps)} >`, onSelect: () => { s.showFps = !s.showFps; this.save(); } },
        { label: 'Controls...', onSelect: () => { this.page = 'controls'; this.build(); } },
        { label: () => (this.confirmReset ? 'Really erase all progress?' : 'Erase progress'), onSelect: () => this.reset() },
        { label: 'Back', onSelect: () => this.close() },
      ];
    } else {
      title = 'CONTROLS';
      const acts: Action[] = ['left', 'right', 'up', 'down', 'flare', 'bomb', 'pause', 'confirm'];
      const names: Record<string, string> = { left: 'Move left', right: 'Move right', up: 'Thrust / up', down: 'Drill down', flare: 'Flare', bomb: 'Dynamite', pause: 'Pause', confirm: 'Confirm' };
      items = acts.map((a) => ({
        label: () => `${names[a].padEnd(14, ' ')} ${this.waiting === a ? '...press a key' : s.bindings[a].slice(0, 2).join(' / ')}`,
        onSelect: () => this.rebind(a),
      }));
      items.push({ label: 'Reset to defaults', onSelect: () => { s.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.save(); } });
      items.push({ label: 'Back', onSelect: () => { this.page = 'main'; this.build(); } });
    }
    const t = txt(this, VIEW_W / 2, 22, title, COLORS.gold).setOrigin(0.5, 0).setScale(2);
    t.setData('page', true);
    this.menu = new Menu(this, 132, 48, items, 14, 'left');
    this.menu.onBack = () => (this.page === 'main' ? this.close() : (this.page = 'main', this.build()));
    this.note.setText(this.page === 'controls' ? 'Gamepads work out of the box (Xbox / PlayStation / Steam Deck).' : 'Esc to go back');
  }

  private togglePixel() {
    Save.data.settings.pixelPerfect = !Save.data.settings.pixelPerfect;
    this.save();
    applyScale();
  }

  private toggleFullscreen() {
    const s = Save.data.settings;
    s.fullscreen = !s.fullscreen;
    this.save();
    if (window.glimmer?.setFullscreen) window.glimmer.setFullscreen(s.fullscreen);
    else if (s.fullscreen) this.scale.startFullscreen();
    else this.scale.stopFullscreen();
  }

  private reset() {
    if (!this.confirmReset) {
      this.confirmReset = true;
      return;
    }
    Save.reset();
    this.confirmReset = false;
    this.close();
    this.scene.stop(this.from);
    this.scene.start('Title');
  }

  private rebind(a: Action) {
    this.waiting = a;
    this.menu.refresh();
    Controls.captureNextKey((key) => {
      if (key !== 'ESC' || a === 'pause') {
        const list = Save.data.settings.bindings[a];
        Save.data.settings.bindings[a] = [key, ...list.filter((k) => k !== key)].slice(0, 3);
        this.save();
      }
      this.waiting = null;
      Controls.clear();
      this.menu.refresh();
    });
  }

  private close() {
    Save.save();
    this.scene.stop();
    this.scene.resume(this.from);
  }

  update(_t: number, dt: number) {
    if (this.waiting) return;
    Controls.poll(this);
    this.menu.update(dt / 1000);
  }
}
