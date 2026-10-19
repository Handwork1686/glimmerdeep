import Phaser from 'phaser';
import { onUnlock } from '../systems/achievements';
import { Audio } from '../systems/audio';
import { achievementToast, Toast, TOAST_H, TOAST_W, TOAST_Y, ToastQueue } from './toastQueue';
import { COLORS, fadeTo, panel, txt } from './widgets';

/** Toasts show one at a time in the bottom-left corner (see toastQueue.ts for where, and why). */
const SHOW_MS = 3000;
/** unlocks that land together are collected for this long, so they can batch */
const COLLECT_MS = 160;

const queue = new ToastQueue();
let busy = false;
let current: Phaser.Scene | null = null;
let pumpTimer: Phaser.Time.TimerEvent | null = null;

/** Add a toast to the shared queue. */
export function pushToast(t: Toast) {
  queue.push(t);
  schedule();
}

/** Toasts render in whichever scene called this most recently. */
export function showToasts(scene: Phaser.Scene) {
  current = scene;
  onUnlock((a) => pushToast(achievementToast(a)));
  scene.events.once('shutdown', () => {
    if (current === scene) current = null;
    busy = false;
    pumpTimer = null;
  });
  schedule();
}

function schedule() {
  const scene = current;
  if (!scene || busy || pumpTimer) return;
  pumpTimer = scene.time.delayedCall(COLLECT_MS, () => {
    pumpTimer = null;
    pump();
  });
}

function pump() {
  const scene = current;
  if (!scene || busy) return;
  const t = queue.take();
  if (!t) return;
  busy = true;
  const more = queue.waiting;
  const c = scene.add.container(-TOAST_W - 4, TOAST_Y).setDepth(1000).setScrollFactor(0);
  const bg = panel(scene, 0, 0, TOAST_W, TOAST_H, t.kind === 'achievement' || t.kind === 'batch' ? 'panel_hi' : 'panel');
  const icon = scene.add.image(16, 17, 'atlas', t.icon && scene.textures.get('atlas').has(t.icon) ? t.icon : 'icon_star');
  if (t.tint !== undefined) icon.setTint(t.tint);
  const color = t.kind === 'shard' ? COLORS.blue : t.kind === 'milestone' ? COLORS.teal : COLORS.gold;
  const t1 = txt(scene, 30, 6, t.title, color);
  const t2 = txt(scene, 30, 18, fit(scene, t.sub, TOAST_W - 34), COLORS.text);
  c.add([bg, icon, t1, t2]);
  if (more > 0) c.add(txt(scene, TOAST_W - 4, TOAST_H + 1, `+${more} more`, COLORS.dim).setOrigin(1, 0));
  Audio.play(t.kind === 'achievement' || t.kind === 'batch' ? 'achievement' : 'discover', { volume: 0.7 });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    scene.tweens.add({
      targets: c, x: -TOAST_W - 4, duration: 220, ease: 'Cubic.easeIn',
      onComplete: () => {
        c.destroy();
        busy = false;
        schedule();
      },
    });
  };
  // click it away; a batch click opens the achievements list
  bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    if (t.kind === 'batch') {
      finish();
      fadeTo(scene, 'Achievements', { from: scene.scene.key });
    } else finish();
  });
  scene.tweens.add({ targets: c, x: 4, duration: 300, ease: 'Back.easeOut' });
  scene.time.delayedCall(SHOW_MS, finish);
}

/** trim a line to a pixel width with an ellipsis */
function fit(scene: Phaser.Scene, s: string, width: number): string {
  const probe = scene.add.bitmapText(0, 0, 'pixel_o', s);
  let out = s;
  while (probe.width > width && out.length > 4) {
    out = out.slice(0, -2);
    probe.setText(out + '..');
  }
  probe.destroy();
  return out === s ? s : out + '..';
}
