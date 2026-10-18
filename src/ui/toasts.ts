import Phaser from 'phaser';
import { VIEW_W } from '../config';
import { AchievementDef, onUnlock } from '../systems/achievements';
import { Audio } from '../systems/audio';
import { COLORS, panel, txt } from './widgets';

const queue: AchievementDef[] = [];
let busy = false;
let current: Phaser.Scene | null = null;

/** Achievement toasts render in whichever scene called this most recently. */
export function showToasts(scene: Phaser.Scene) {
  current = scene;
  onUnlock((a) => {
    queue.push(a);
    pump();
  });
  scene.events.once('shutdown', () => {
    if (current === scene) current = null;
    busy = false;
  });
  pump();
}

function pump() {
  const scene = current;
  if (!scene || busy || queue.length === 0) return;
  const a = queue.shift()!;
  busy = true;
  const c = scene.add.container(VIEW_W - 152, -40).setDepth(1000).setScrollFactor(0);
  const bg = panel(scene, 0, 0, 148, 34, 'panel_hi');
  const icon = scene.add.image(16, 17, 'atlas', `icon_${a.icon}`);
  const t1 = txt(scene, 30, 6, 'Achievement', COLORS.gold);
  const t2 = txt(scene, 30, 18, a.name, COLORS.text);
  c.add([bg, icon, t1, t2]);
  Audio.play('achievement');
  scene.tweens.add({
    targets: c, y: 6, duration: 350, ease: 'Back.easeOut', hold: 2400, yoyo: true,
    onComplete: () => {
      c.destroy();
      busy = false;
      pump();
    },
  });
}
