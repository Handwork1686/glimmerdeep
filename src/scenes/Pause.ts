import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { Audio } from '../systems/audio';
import { Controls } from '../systems/controls';
import { BoonBar } from '../ui/boonbar';
import { COLORS, Menu, panel, txt } from '../ui/widgets';
import type { RunScene } from './Run';

export class PauseScene extends Phaser.Scene {
  private menu!: Menu;
  private boonBar!: BoonBar;

  constructor() {
    super('Pause');
  }

  create() {
    Audio.setDuck(0.35);
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x07060c, 0.7).setOrigin(0, 0);
    panel(this, VIEW_W / 2 - 80, 70, 160, 120);
    txt(this, VIEW_W / 2, 80, 'PAUSED', COLORS.gold).setOrigin(0.5, 0).setScale(2);
    this.menu = new Menu(this, VIEW_W / 2, 112, [
      { label: 'Resume', onSelect: () => this.resume() },
      { label: 'Settings', onSelect: () => { this.scene.launch('Settings', { from: 'Pause' }); this.scene.pause(); } },
      { label: 'Return to surface', onSelect: () => this.abandon() },
    ], 16);
    this.menu.onBack = () => this.resume();
    txt(this, VIEW_W / 2, 172, 'Returning keeps everything you found.', COLORS.dim, false).setOrigin(0.5, 0);
    this.events.on('resume', () => this.menu.refresh());
    // what you are carrying this dig, in the same corner it sits in during play
    const run = this.scene.get('Run') as RunScene;
    this.boonBar = new BoonBar(this);
    this.boonBar.update(run.sim.boons, { overburnT: run.sim.overburnT, novaUsed: run.sim.lanternNovaUsed });
    this.events.once('shutdown', () => this.boonBar.destroy());
  }

  private resume() {
    Audio.setDuck(1);
    Controls.clear();
    this.scene.stop();
    this.scene.resume('Run');
    this.scene.resume('Hud');
  }

  private abandon() {
    const run = this.scene.get('Run') as RunScene;
    run.quit();
    this.resume();
  }

  update(_t: number, dt: number) {
    Controls.poll(this);
    if (Controls.pressed('pause')) {
      this.resume();
      return;
    }
    this.menu.update(dt / 1000);
  }
}
