import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { type DragEndEvent, KeyboardCode } from '@dnd-kit/core';
import { act, renderHook } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { OrganicCalendarDay, OrganicCalendarDraft } from '../primitives/types';

const updateDraft = mock(() => {});
const show = mock((_toast: { title: string }) => {});
const addDraft = mock(() => {});
const reschedule = mock(() => Promise.resolve());
const rescheduleMany = mock(() => Promise.resolve());

const storeStub = createCalendarStoreStub({ updateDraft, addDraft });
mock.module('@/lib/organic/store', () => storeStub);
mock.module('zustand/react/shallow', () => ({ useShallow: (fn: (s: unknown) => unknown) => fn }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));

const {
  crossPlatformDropRefusal,
  plannerCellKeyboardCoordinates,
  plannerCellLabel,
  useCalendarDnD,
} = await import('./useCalendarDnD');

const DAYS: OrganicCalendarDay[] = [
  { id: '2026-08-03', label: 'Mon', dateLabel: 'Aug 3', suggestedTimes: [], slots: [] },
];
const DRAFTS: OrganicCalendarDraft[] = [];

function dragOntoCellId(
  overId: string,
  selectedIds: string[],
  options: { drafts?: OrganicCalendarDraft[]; delta?: { x: number; y: number } } = {},
): void {
  const { result } = renderHook(() =>
    useCalendarDnD(DAYS, options.drafts ?? DRAFTS, { instagram: 'acct-ig' }, selectedIds, {
      reschedule,
      rescheduleMany,
    }),
  );
  const event = {
    active: { id: 'd1', data: { current: { type: 'draft' } } },
    over: { id: overId },
    delta: options.delta ?? { x: 140, y: 0 },
  } as unknown as DragEndEvent;
  act(() => {
    result.current.handleDragEnd(event);
  });
}

function dragOntoCell(selectedIds: string[]): void {
  dragOntoCellId('planner-cell::2026-08-10::instagram', selectedIds);
}

describe('useCalendarDnD — multi-select drag', () => {
  beforeEach(() => {
    updateDraft.mockClear();
    addDraft.mockClear();
    reschedule.mockClear();
    rescheduleMany.mockClear();
  });

  afterEach(() => {
    storeStub.useCalendarStore.mockImplementation(storeStub.useCalendarStore.defaultImplementation);
  });

  it('moves the whole selection when the dragged draft is part of a multi-selection', () => {
    dragOntoCell(['d1', 'd2', 'd3']);

    expect(rescheduleMany).toHaveBeenCalledTimes(1);
    expect(rescheduleMany).toHaveBeenCalledWith(['d1', 'd2', 'd3'], '2026-08-10', {
      draftId: 'd1',
      platform: 'instagram',
      accountId: 'acct-ig',
    });
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('moves only the dragged draft for a single selection', () => {
    dragOntoCell(['d1']);

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule.mock.calls[0]?.slice(0, 2)).toEqual(['d1', '2026-08-10']);
    expect(rescheduleMany).not.toHaveBeenCalled();
  });

  it('moves only the dragged draft when nothing is selected', () => {
    dragOntoCell([]);

    expect(reschedule.mock.calls[0]?.slice(0, 2)).toEqual(['d1', '2026-08-10']);
    expect(rescheduleMany).not.toHaveBeenCalled();
  });

  // The restamp and its persistence live in the reschedule hook, so the store and the row
  // cannot disagree; the drop only names the row it landed on.
  it('hands the destination platform and its default account to the reschedule', () => {
    dragOntoCell(['d1']);

    expect(reschedule).toHaveBeenCalledWith('d1', '2026-08-10', {
      draftId: 'd1',
      platform: 'instagram',
      accountId: 'acct-ig',
    });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('retargets only the dragged draft of a multi-selection', () => {
    dragOntoCellId('planner-cell::2026-08-10::tiktok', ['d1', 'd2']);

    expect(rescheduleMany).toHaveBeenCalledWith(['d1', 'd2'], '2026-08-10', {
      draftId: 'd1',
      platform: 'tiktok',
      accountId: undefined,
    });
  });
});

// A month cell spans every platform, so its droppable id carries the day and no platform
// segment. The drop must still land on the right day, and must NOT invent a channel.
describe('useCalendarDnD — month-cell drop (no platform segment)', () => {
  beforeEach(() => {
    updateDraft.mockClear();
    reschedule.mockClear();
    rescheduleMany.mockClear();
  });

  afterEach(() => {
    storeStub.useCalendarStore.mockImplementation(storeStub.useCalendarStore.defaultImplementation);
  });

  it('reschedules the day named by a platform-less planner-cell id', () => {
    dragOntoCellId('planner-cell::2026-08-11', ['d1']);

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule.mock.calls[0]?.slice(0, 2)).toEqual(['d1', '2026-08-11']);
  });

  it('leaves the draft on its own platform — a month cell names no channel', () => {
    dragOntoCellId('planner-cell::2026-08-11', ['d1']);

    expect(reschedule).toHaveBeenCalledWith('d1', '2026-08-11', undefined);
  });

  it('moves the whole selection from a month cell too', () => {
    dragOntoCellId('planner-cell::2026-08-12', ['d1', 'd2']);

    expect(rescheduleMany).toHaveBeenCalledWith(['d1', 'd2'], '2026-08-12', undefined);
    expect(reschedule).not.toHaveBeenCalled();
  });
});

describe('useCalendarDnD — a drop that goes nowhere', () => {
  beforeEach(() => {
    reschedule.mockClear();
    rescheduleMany.mockClear();
  });

  // Space, Space on an undated dock row used to persist a drop onto the nearest cell.
  it('moves nothing when the draft was picked up and put down in place', () => {
    dragOntoCellId('planner-cell::2026-08-10::instagram', ['d1'], { delta: { x: 0, y: 0 } });

    expect(reschedule).not.toHaveBeenCalled();
    expect(rescheduleMany).not.toHaveBeenCalled();
  });

  it('still moves a draft whose drag only travelled vertically', () => {
    dragOntoCellId('planner-cell::2026-08-10::instagram', ['d1'], { delta: { x: 0, y: -120 } });

    expect(reschedule).toHaveBeenCalledTimes(1);
  });
});

function plannerDraft(overrides: Partial<OrganicCalendarDraft>): OrganicCalendarDraft {
  return {
    id: 'd1',
    title: 'Behind the scenes',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Aug 3',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    ...overrides,
  } as OrganicCalendarDraft;
}

describe('crossPlatformDropRefusal', () => {
  const instagramOnly: OrganicCalendarDraft['platforms'] = ['instagram'];

  it('refuses a Story on every platform but Instagram', () => {
    const story = { format: 'Story', platforms: instagramOnly };
    for (const platform of ['facebook', 'linkedin', 'tiktok', 'youtube'] as const) {
      expect(crossPlatformDropRefusal(story, platform)).toBe('Stories only post to Instagram');
    }
    expect(crossPlatformDropRefusal(story, 'instagram')).toBeNull();
  });

  it('refuses a post or carousel on YouTube, which takes video only', () => {
    for (const format of ['Post', 'carousel']) {
      expect(crossPlatformDropRefusal({ format, platforms: instagramOnly }, 'youtube')).toBe(
        'YouTube takes video reels only',
      );
    }
    expect(
      crossPlatformDropRefusal({ format: 'Reel', platforms: instagramOnly }, 'youtube'),
    ).toBeNull();
  });

  it('lets a draft land on its own row, and lets a format it cannot judge through', () => {
    expect(
      crossPlatformDropRefusal({ format: 'Post', platforms: ['youtube'] }, 'youtube'),
    ).toBeNull();
    expect(
      crossPlatformDropRefusal({ format: 'HyperFrame', platforms: instagramOnly }, 'youtube'),
    ).toBeNull();
  });
});

describe('useCalendarDnD — cross-platform drop', () => {
  beforeEach(() => {
    reschedule.mockClear();
    rescheduleMany.mockClear();
    show.mockClear();
  });

  it('leaves a Story where it is and says why when it lands on the Facebook row', () => {
    dragOntoCellId('planner-cell::2026-08-10::facebook', ['d1', 'd2'], {
      drafts: [plannerDraft({ format: 'Story' })],
    });

    expect(reschedule).not.toHaveBeenCalled();
    expect(rescheduleMany).not.toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].title).toBe('Stories only post to Instagram');
  });

  it('moves a Story along its own Instagram row', () => {
    dragOntoCellId('planner-cell::2026-08-10::instagram', ['d1'], {
      drafts: [plannerDraft({ format: 'Story' })],
    });

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });

  // C5/C7: a group dropped on another platform's row used to be ignored without a word.
  const groupDraft = () =>
    plannerDraft({
      platforms: ['instagram', 'tiktok'],
      groupMembers: (['instagram', 'tiktok'] as const).map((platform) => ({
        backendDraftId: `srv-${platform}`,
        platform,
        status: 'draft' as const,
        accountId: null,
      })),
    });

  it('refuses a group dropped on a platform it is not on, and says where to change it', () => {
    dragOntoCellId('planner-cell::2026-08-10::linkedin', ['d1'], { drafts: [groupDraft()] });

    expect(reschedule).not.toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0].title).toBe(
      'Change its platforms with "Change platforms" on the post',
    );
  });

  it('moves a group to another day along any of its own platforms', () => {
    dragOntoCellId('planner-cell::2026-08-10::tiktok', ['d1'], { drafts: [groupDraft()] });

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();
  });
});

describe('plannerCellLabel', () => {
  it('names the day and the platform row, not the id', () => {
    expect(plannerCellLabel('planner-cell::2026-08-10::instagram')).toBe('Mon, Aug 10 · Instagram');
    expect(plannerCellLabel('planner-cell::2026-08-11')).toBe('Tue, Aug 11');
    expect(plannerCellLabel('preview-slot')).toBeNull();
  });
});

describe('plannerCellKeyboardCoordinates', () => {
  type Box = { left: number; top: number; width: number; height: number };
  const rect = ({ left, top, width, height }: Box) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  // Two platform rows of three 100x80 day cells, the first at (0, 0).
  const cells = new Map(
    ['ig', 'fb'].flatMap((row, rowIndex) =>
      [0, 1, 2].map(
        (day) =>
          [
            `${row}-${day}`,
            rect({ left: day * 100, top: rowIndex * 80, width: 100, height: 80 }),
          ] as const,
      ),
    ),
  );

  function press(code: string, dragged: Box) {
    const preventDefault = mock(() => {});
    const coordinates = plannerCellKeyboardCoordinates(
      { code, preventDefault } as unknown as KeyboardEvent,
      {
        active: 'd1',
        currentCoordinates: { x: dragged.left, y: dragged.top },
        context: {
          active: { id: 'd1' },
          collisionRect: rect(dragged),
          droppableRects: cells,
          droppableContainers: { getEnabled: () => [...cells.keys()].map((id) => ({ id })) },
        } as never,
      },
    );
    return { coordinates, preventDefault };
  }

  // A 60x40 card inside the first Instagram cell. No droppable carries the draft's id.
  const card = { left: 20, top: 20, width: 60, height: 40 };

  it('moves right one day along the same row, centred on that cell', () => {
    expect(press(KeyboardCode.Right, card).coordinates).toEqual({ x: 120, y: 20 });
  });

  it('moves down one platform row on the same day', () => {
    expect(press(KeyboardCode.Down, card).coordinates).toEqual({ x: 20, y: 100 });
  });

  it('centres a dragged rect wider than the cell, so its centre lands in that cell', () => {
    const overlay = { left: -60, top: 0, width: 220, height: 80 };
    expect(press(KeyboardCode.Right, overlay).coordinates).toEqual({ x: 40, y: 0 });
  });

  it('stays put at the edge, and leaves keys that are not arrows to the sensor', () => {
    expect(press(KeyboardCode.Left, card).coordinates).toBeUndefined();
    const space = press(KeyboardCode.Space, card);
    expect(space.coordinates).toBeUndefined();
    expect(space.preventDefault).not.toHaveBeenCalled();
  });
});
