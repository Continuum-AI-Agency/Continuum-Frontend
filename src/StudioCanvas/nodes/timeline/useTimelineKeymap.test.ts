import { describe, expect, it } from 'bun:test';
import { resolveTimelineHistoryShortcut } from './useTimelineKeymap';

describe('resolveTimelineHistoryShortcut', () => {
  it('maps platform undo and redo combinations', () => {
    expect(
      resolveTimelineHistoryShortcut({
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe('undo');
    expect(
      resolveTimelineHistoryShortcut({
        key: 'Z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBe('redo');
    expect(
      resolveTimelineHistoryShortcut({
        key: 'y',
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe('redo');
  });

  it('leaves unrelated and alt-modified combinations alone', () => {
    expect(
      resolveTimelineHistoryShortcut({
        key: 's',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBeNull();
    expect(
      resolveTimelineHistoryShortcut({
        key: 'z',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
      }),
    ).toBeNull();
  });
});
