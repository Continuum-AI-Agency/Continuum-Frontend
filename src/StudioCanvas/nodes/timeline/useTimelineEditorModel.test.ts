import { describe, expect, it } from 'bun:test';
import type { TimelineItem } from '../../types';
import {
  clipAtTime,
  computeLayout,
  DEFAULT_STILL_SEC,
  effectiveItemDuration,
  placeItem,
  removeItem,
  duplicateItem,
  toggleMarkerTime,
  reorderItems,
  setItemAudio,
  setItemMuteAudio,
  setStillDuration,
  splitItem,
  trimItem,
} from './useTimelineEditorModel';

const video = (id: string, order: number, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  id,
  order,
  sourceNodeId: `src-${id}`,
  kind: 'video',
  ...extra,
});

const image = (id: string, order: number, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  id,
  order,
  sourceNodeId: `src-${id}`,
  kind: 'image',
  ...extra,
});

describe('setItemMuteAudio', () => {
  it('toggles muteAudio on the matching video item only', () => {
    const items = [video('a', 0), video('b', 1)];
    const muted = setItemMuteAudio(items, 'a', true);
    expect(muted.find((item) => item.id === 'a')?.muteAudio).toBe(true);
    expect(muted.find((item) => item.id === 'b')?.muteAudio).toBeUndefined();
    expect(setItemMuteAudio(muted, 'a', false).find((item) => item.id === 'a')?.muteAudio).toBe(
      false,
    );
  });

  it('never mutes image stills', () => {
    const items = [image('a', 0)];
    expect(setItemMuteAudio(items, 'a', true)[0].muteAudio).toBeUndefined();
  });
});

describe('effectiveItemDuration', () => {
  it('uses trim window for video and falls back to source duration', () => {
    expect(effectiveItemDuration(video('a', 0, { trimStartSec: 1, trimEndSec: 4 }))).toBe(3);
    expect(effectiveItemDuration(video('a', 0), 10)).toBe(10);
  });

  it('uses durationSec for stills and defaults when unset', () => {
    expect(effectiveItemDuration(image('a', 0, { durationSec: 5 }))).toBe(5);
    expect(effectiveItemDuration(image('a', 0))).toBe(DEFAULT_STILL_SEC);
  });
});

describe('computeLayout / clipAtTime', () => {
  it('lays clips end-to-end and maps a time to its clip', () => {
    const items = [
      video('a', 0, { trimStartSec: 0, trimEndSec: 2 }),
      image('b', 1, { durationSec: 3 }),
    ];
    const layout = computeLayout(items, (item) => effectiveItemDuration(item), 100);

    expect(layout.totalSec).toBe(5);
    expect(layout.clips[0]).toMatchObject({ startSec: 0, durationSec: 2, leftPx: 0, widthPx: 200 });
    expect(layout.clips[1]).toMatchObject({
      startSec: 2,
      durationSec: 3,
      leftPx: 200,
      widthPx: 300,
    });
    expect(clipAtTime(layout, 0.5)?.item.id).toBe('a');
    expect(clipAtTime(layout, 3)?.item.id).toBe('b');
    expect(clipAtTime(layout, 99)?.item.id).toBe('b');
  });
});

describe('placeItem / removeItem / reorderItems', () => {
  it('appends a placement referencing the pool source', () => {
    const next = placeItem([video('a', 0)], 'src-x', 'image');
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ sourceNodeId: 'src-x', kind: 'image', order: 1 });
  });

  it('removes by id and renumbers order', () => {
    const next = removeItem([video('a', 0), video('b', 1), video('c', 2)], 'b');
    expect(next.map((i) => i.id)).toEqual(['a', 'c']);
    expect(next.map((i) => i.order)).toEqual([0, 1]);
  });

  it('reorders via arrayMove and renumbers order', () => {
    const next = reorderItems([video('a', 0), video('b', 1), video('c', 2)], 'a', 'c');
    expect(next.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(next.map((i) => i.order)).toEqual([0, 1, 2]);
  });
});

describe('trimItem / setStillDuration', () => {
  it('clamps the trim window within the source duration', () => {
    const [trimmed] = trimItem([video('a', 0)], 'a', { startSec: -2, endSec: 99 }, 8);
    expect(trimmed.trimStartSec).toBe(0);
    expect(trimmed.trimEndSec).toBe(8);
  });

  it('keeps a minimum window when edges cross', () => {
    const [trimmed] = trimItem(
      [video('a', 0, { trimStartSec: 0, trimEndSec: 5 })],
      'a',
      { endSec: 0 },
      10,
    );
    expect(trimmed.trimEndSec! - trimmed.trimStartSec!).toBeGreaterThanOrEqual(0.1);
  });

  it('sets still duration with a floor', () => {
    expect(setStillDuration([image('a', 0)], 'a', 6)[0].durationSec).toBe(6);
    expect(setStillDuration([image('a', 0)], 'a', 0)[0].durationSec).toBeGreaterThan(0);
  });
});

describe('splitItem', () => {
  it('splits a video into two complementary trim ranges summing to the original', () => {
    const next = splitItem([video('a', 0, { trimStartSec: 2, trimEndSec: 8 })], 'a', 2);
    expect(next).toHaveLength(2);
    const [first, second] = next;
    expect(first).toMatchObject({ trimStartSec: 2, trimEndSec: 4 });
    expect(second).toMatchObject({ trimStartSec: 4, trimEndSec: 8 });
    expect(second.id).not.toBe(first.id);
    const total =
      first.trimEndSec! - first.trimStartSec! + (second.trimEndSec! - second.trimStartSec!);
    expect(total).toBe(6);
    expect(next.map((i) => i.order)).toEqual([0, 1]);
  });

  it('splits a still into two durations summing to the original', () => {
    const next = splitItem([image('a', 0, { durationSec: 5 })], 'a', 2);
    expect(next.map((i) => i.durationSec)).toEqual([2, 3]);
  });

  it('is a no-op when the split point is at an edge', () => {
    const items = [video('a', 0, { trimStartSec: 0, trimEndSec: 5 })];
    expect(splitItem(items, 'a', 0)).toBe(items);
    expect(splitItem(items, 'a', 5)).toBe(items);
  });
});

describe('setItemAudio', () => {
  it('merges volume + fades onto a video clip and clamps to sane ranges', () => {
    const items = [video('a', 0, { trimStartSec: 0, trimEndSec: 5 })];
    const next = setItemAudio(items, 'a', { volume: 9, audioFadeInSec: -1, audioFadeOutSec: 0.5 });
    expect(next[0]).toMatchObject({ volume: 4, audioFadeInSec: 0, audioFadeOutSec: 0.5 });
  });

  it('only patches the provided fields and leaves images untouched', () => {
    const items = [video('a', 0, { volume: 1 }), image('b', 1, { durationSec: 3 })];
    const next = setItemAudio(items, 'a', { audioFadeInSec: 0.3 });
    expect(next[0]).toMatchObject({ volume: 1, audioFadeInSec: 0.3 });
    expect(setItemAudio(items, 'b', { volume: 2 })[1].volume).toBeUndefined();
  });
});

describe('duplicateItem', () => {
  it('inserts a copy with a new id directly after the original and renumbers', () => {
    const next = duplicateItem([video('a', 0, { trimStartSec: 1, trimEndSec: 3 }), video('b', 1)], 'a');
    expect(next.map((i) => i.id).length).toBe(3);
    expect(next[1].id).not.toBe('a');
    expect(next[1]).toMatchObject({ sourceNodeId: 'src-a', trimStartSec: 1, trimEndSec: 3, order: 1 });
    expect(next.map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('is a no-op for an unknown id', () => {
    const items = [video('a', 0)];
    expect(duplicateItem(items, 'zzz')).toBe(items);
  });
});

describe('toggleMarkerTime', () => {
  it('inserts a marker sorted and removes one within epsilon (toggle)', () => {
    const added = toggleMarkerTime([2, 5], 3.5);
    expect(added).toEqual([2, 3.5, 5]);
    expect(toggleMarkerTime(added, 3.52)).toEqual([2, 5]); // within epsilon → removed
  });

  it('ignores negative times', () => {
    expect(toggleMarkerTime([1], -2)).toEqual([1]);
  });
});
