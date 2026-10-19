import { VIEW_H } from '../config';
import type { AchievementDef } from '../systems/achievements';

/**
 * The toast queue, with no rendering in it: achievements, NEW SHARD lines and
 * layer milestones all wait here and are shown one at a time. Three or more
 * achievements waiting together collapse into one "N achievements!" toast.
 */
export type ToastKind = 'achievement' | 'shard' | 'milestone' | 'batch';

export interface Toast {
  kind: ToastKind;
  title: string;
  sub: string;
  icon?: string;
  tint?: number;
  /** how many achievements a batch stands for */
  count?: number;
}

/** this many achievements waiting at once become a single toast */
export const BATCH_AT = 3;

export const achievementToast = (a: AchievementDef): Toast => ({ kind: 'achievement', title: 'Achievement', sub: a.name, icon: `icon_${a.icon}` });

/**
 * Where toasts sit: the bottom-left corner, with their bottom edge 34 px above the
 * screen bottom (the Lv / XP bar lives below that), clear of the currency row, the
 * Workshop's purchase panel and the chain counter.
 */
export const TOAST_W = 200;
export const TOAST_H = 40;
export const TOAST_BOTTOM_GAP = 34;
export const TOAST_Y = VIEW_H - TOAST_BOTTOM_GAP - TOAST_H;

export class ToastQueue {
  private items: Toast[] = [];

  push(t: Toast) {
    this.items.push(t);
  }

  /** how many toasts are waiting (a batch counts as one) */
  get waiting(): number {
    const ach = this.items.filter((t) => t.kind === 'achievement').length;
    return this.items.length - (ach >= BATCH_AT ? ach - 1 : 0);
  }

  /** the next toast to show, or null */
  take(): Toast | null {
    const ach = this.items.filter((t) => t.kind === 'achievement');
    if (ach.length >= BATCH_AT) {
      this.items = this.items.filter((t) => t.kind !== 'achievement');
      return { kind: 'batch', title: `${ach.length} achievements!`, sub: 'Click to see them', icon: 'star', count: ach.length };
    }
    return this.items.shift() ?? null;
  }

  clear() {
    this.items = [];
  }
}
