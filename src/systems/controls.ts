/**
 * Unified keyboard + gamepad input with rebinding. Scenes call `Controls.poll(scene)`
 * once per frame and then query held/pressed state per action.
 */
import Phaser from 'phaser';
import { Action, Save } from './save';

const PAD: Record<Action, number[]> = {
  left: [14],
  right: [15],
  up: [12, 0],
  down: [13],
  flare: [2, 5],
  bomb: [3, 4],
  pause: [9],
  confirm: [0],
  back: [1],
};

const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'flare', 'bomb', 'pause', 'confirm', 'back'];

class ControlsImpl {
  private held = new Set<Action>();
  private prev = new Set<Action>();
  private keysDown = new Set<string>();
  private listening = false;
  lastDevice: 'keyboard' | 'pad' = 'keyboard';
  private capture: ((key: string) => void) | null = null;
  private lastFrame = -1;
  /** keys held when input was cleared; ignored until released */
  private suppressed = new Set<string>();
  /** keys pressed since the last poll (so sub-frame taps are never lost) */
  private tapped = new Set<string>();

  attach() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('keydown', (e) => {
      const k = keyName(e);
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(k);
        return;
      }
      if (!e.repeat) this.tapped.add(k);
      this.keysDown.add(k);
      this.lastDevice = 'keyboard';
      if (['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'TAB'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(keyName(e)));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  /** Next key press is delivered to cb instead of the game (used for rebinding). */
  captureNextKey(cb: (key: string) => void) {
    this.capture = cb;
  }

  /** Idempotent within a game frame, so several scenes may call it. */
  poll(scene?: Phaser.Scene) {
    const f = scene?.game.loop.frame ?? -2;
    if (f === this.lastFrame && f !== -2) return;
    this.lastFrame = f;
    this.prev = new Set(this.held);
    this.held.clear();
    for (const k of this.suppressed) if (!this.keysDown.has(k)) this.suppressed.delete(k);
    const b = Save.data.settings.bindings;
    for (const a of ACTIONS) {
      if (b[a]?.some((k) => (this.keysDown.has(k) || this.tapped.has(k)) && !this.suppressed.has(k))) this.held.add(a);
    }
    this.tapped.clear();
    const pad = scene?.input.gamepad?.pad1 ?? firstPad();
    if (pad) {
      const buttons = (pad as unknown as { buttons: { pressed: boolean }[] }).buttons ?? [];
      const ax = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
      const ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
      let any = false;
      for (const a of ACTIONS) {
        if (PAD[a].some((i) => buttons[i]?.pressed)) {
          this.held.add(a);
          any = true;
        }
      }
      if (ax < -0.4) this.held.add('left');
      if (ax > 0.4) this.held.add('right');
      if (ay < -0.5) this.held.add('up');
      if (ay > 0.5) this.held.add('down');
      if (any || Math.abs(ax) > 0.4 || Math.abs(ay) > 0.5) this.lastDevice = 'pad';
    }
  }

  isDown(a: Action) {
    return this.held.has(a);
  }

  pressed(a: Action) {
    return this.held.has(a) && !this.prev.has(a);
  }

  /** Human-readable label of the first binding for prompts. */
  label(a: Action): string {
    if (this.lastDevice === 'pad') {
      return ({ left: 'D-pad', right: 'D-pad', up: 'A', down: 'Down', flare: 'X', bomb: 'Y', pause: 'Start', confirm: 'A', back: 'B' } as Record<Action, string>)[a];
    }
    const k = Save.data.settings.bindings[a]?.[0] ?? '?';
    return k.length === 1 ? k : k.charAt(0) + k.slice(1).toLowerCase();
  }

  /** Forget current state; keys still held must be released before they count again. */
  clear() {
    this.suppressed = new Set(this.keysDown);
    this.held.clear();
    this.prev.clear();
  }
}

function firstPad(): Phaser.Input.Gamepad.Gamepad | null {
  return null;
}

function keyName(e: KeyboardEvent): string {
  const map: Record<string, string> = {
    ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', ' ': 'SPACE', Escape: 'ESC',
    Enter: 'ENTER', Shift: 'SHIFT', Backspace: 'BACKSPACE', Tab: 'TAB', Control: 'CTRL', Alt: 'ALT',
  };
  if (map[e.key]) return map[e.key];
  if (e.code.startsWith('Key')) return e.code.slice(3);
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  return e.key.toUpperCase();
}

export const Controls = new ControlsImpl();
