import { describe, expect, it } from 'vitest';
import { VIEW_H, VIEW_W } from '../src/config';
import { ACHIEVEMENTS, unlock, onUnlock } from '../src/systems/achievements';
import { newSave, Save } from '../src/systems/save';
import { achievementToast, BATCH_AT, TOAST_BOTTOM_GAP, TOAST_H, TOAST_W, TOAST_Y, ToastQueue } from '../src/ui/toastQueue';

describe('toasts', () => {
  it('show one at a time, in the order they arrived, across achievements, shards and milestones', () => {
    const q = new ToastQueue();
    q.push(achievementToast(ACHIEVEMENTS[0]));
    q.push({ kind: 'shard', title: 'NEW SHARD', sub: 'x' });
    q.push({ kind: 'milestone', title: 'NEW DEPTH', sub: 'y' });
    expect(q.waiting).toBe(3);
    expect(q.take()!.kind).toBe('achievement');
    expect(q.take()!.kind).toBe('shard');
    expect(q.take()!.kind).toBe('milestone');
    expect(q.take()).toBeNull();
  });

  it('three or more achievements at once become one toast, and two stay separate', () => {
    expect(BATCH_AT).toBe(3);
    const two = new ToastQueue();
    two.push(achievementToast(ACHIEVEMENTS[0]));
    two.push(achievementToast(ACHIEVEMENTS[1]));
    expect(two.take()!.kind).toBe('achievement');
    expect(two.take()!.kind).toBe('achievement');
    const five = new ToastQueue();
    for (let i = 0; i < 5; i++) five.push(achievementToast(ACHIEVEMENTS[i]));
    five.push({ kind: 'shard', title: 'NEW SHARD', sub: 'z' });
    expect(five.waiting).toBe(2);
    const first = five.take()!;
    expect(first.kind).toBe('batch');
    expect(first.title).toBe('5 achievements!');
    expect(first.count).toBe(5);
    // the other kinds are still waiting, and nothing else is
    expect(five.take()!.kind).toBe('shard');
    expect(five.take()).toBeNull();
  });

  it('a burst of new shard types is one toast, not a queue', () => {
    const q = new ToastQueue();
    for (const n of ['Glass Shard', 'Ember Shard', 'Fault Shard', 'Vein Shard']) q.push({ kind: 'shard', title: `NEW SHARD: ${n}`, sub: 'x' });
    q.push(achievementToast(ACHIEVEMENTS[0]));
    expect(q.waiting).toBe(2);
    const first = q.take()!;
    expect(first.title).toBe('4 NEW SHARDS');
    expect(first.sub).toBe('Glass Shard, Ember Shard, Fault Shard, Vein Shard');
    expect(q.take()!.kind).toBe('achievement');
    expect(q.take()).toBeNull();
    // two stay separate
    const two = new ToastQueue();
    two.push({ kind: 'shard', title: 'NEW SHARD: A', sub: 'a' });
    two.push({ kind: 'shard', title: 'NEW SHARD: B', sub: 'b' });
    expect(two.take()!.title).toBe('NEW SHARD: A');
  });

  it('sit bottom-left, above the level bar, clear of the currency row and the chain counter', () => {
    expect(TOAST_Y + TOAST_H).toBeLessThanOrEqual(VIEW_H - TOAST_BOTTOM_GAP);
    expect(TOAST_BOTTOM_GAP).toBeGreaterThanOrEqual(34);
    // the Workshop's currency row is in the top-right column, the chain counter top-centre
    expect(TOAST_Y).toBeGreaterThan(100);
    expect(4 + TOAST_W).toBeLessThan(VIEW_W / 2);
  });

  it('an achievement is never awarded or toasted twice', () => {
    const was = Save.data;
    const prev = onUnlock;
    Save.data = newSave();
    const got: string[] = [];
    onUnlock((a) => got.push(a.id));
    unlock('first_light');
    unlock('first_light');
    unlock('first_light');
    expect(got).toEqual(['first_light']);
    const stamp = Save.data.achievements.first_light;
    unlock('first_light');
    expect(Save.data.achievements.first_light).toBe(stamp);
    onUnlock(null);
    Save.data = was;
    void prev;
  });
});
