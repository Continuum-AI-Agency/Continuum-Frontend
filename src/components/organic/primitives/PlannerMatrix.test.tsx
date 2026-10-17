import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { PlannerPlatform } from './planner-platforms';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from './types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Every PlannerCell render registers its droppable, so this log is the cell render count.
const renderedCells: string[] = [];
mock.module('@dnd-kit/core', () => ({
  useDroppable: ({ id }: { id: string }) => {
    renderedCells.push(id);
    return { setNodeRef: () => undefined, isOver: false };
  },
}));

mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({
    gridStatus: 'idle',
    gridProgress: { percent: 0 },
    focusedDayId: null,
    ghosts: {},
  }),
);
mock.module('./AddPostMenu', () => ({
  AddPostMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./AddPostContextMenu', () => ({
  AddPostContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./DraggableDraftCard', () => ({
  DraggableDraftCard: ({
    draft,
    isSelected,
    isMultiSelected,
  }: {
    draft: OrganicCalendarDraft;
    isSelected: boolean;
    isMultiSelected: boolean;
  }) => (
    <div
      data-testid={`card-${draft.id}`}
      data-selected={String(isSelected)}
      data-multi-selected={String(isMultiSelected)}
    />
  ),
}));

afterAll(() => mock.restore());

const { PlannerMatrix, groupDraftsByCell } = await import('./PlannerMatrix');

const instagram: PlannerPlatform = {
  key: 'instagram',
  label: 'Instagram',
  shortLabel: 'IG',
  Icon: () => <svg aria-hidden />,
  canCreate: true,
};

function draft(id: string): OrganicCalendarDraft {
  return {
    id,
    title: id,
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
  } as OrganicCalendarDraft;
}

function day(id: string, slots: OrganicCalendarDraft[]): OrganicCalendarDay {
  return { id, label: id, dateLabel: id, suggestedTimes: [], slots };
}

// One week, built once: the claim is about a selection change, so the data must not move.
const DAYS = [
  day('2026-08-03', [draft('d1')]),
  day('2026-08-04', [draft('d2')]),
  day('2026-08-05', []),
];
const POSTED = [
  {
    id: 'p1',
    source: 'instagram',
    platform: 'instagram',
    timestamp: '2026-08-05T14:00:00.000Z',
    dayId: '2026-08-05',
    timeLabel: '2:00 PM',
    title: 'Launch recap',
  },
] as OrganicCalendarPostedContent[];
const PLATFORMS = [instagram];
const NOOP = () => undefined;
const cellId = (dayId: string) => `planner-cell::${dayId}::instagram`;

function matrix(
  selectedDraftId: string | null,
  selectedDraftIds: string[] = [],
  selectedPostId: string | null = null,
  days: OrganicCalendarDay[] = DAYS,
) {
  return (
    <PlannerMatrix
      days={days}
      platforms={PLATFORMS}
      postedContent={POSTED}
      selectedDraftId={selectedDraftId}
      selectedDraftIds={selectedDraftIds}
      selectedPostId={selectedPostId}
      todayId="2026-08-04"
      onSelectDraft={NOOP}
      onToggleSelection={NOOP}
      onRegenerate={NOOP}
      onCreatePost={NOOP}
      onSelectPost={NOOP}
    />
  );
}

describe('PlannerMatrix selection slicing', () => {
  afterEach(() => {
    cleanup();
    renderedCells.length = 0;
  });

  it('re-renders only the cell the selection enters', () => {
    const { rerender } = render(matrix(null));
    renderedCells.length = 0;

    rerender(matrix('d1'));

    expect(renderedCells).toEqual([cellId('2026-08-03')]);
  });

  it('re-renders the cells the selection leaves and enters, nothing else', () => {
    const { rerender, getByTestId } = render(matrix('d1'));
    renderedCells.length = 0;

    rerender(matrix('d2'));

    expect(renderedCells.sort()).toEqual([cellId('2026-08-03'), cellId('2026-08-04')]);
    expect(getByTestId('card-d1').getAttribute('data-selected')).toBe('false');
    expect(getByTestId('card-d2').getAttribute('data-selected')).toBe('true');
  });

  // The workspace hands down a new (empty) array whenever the store notifies; a cell that
  // holds none of the multi-selection must not notice.
  it('keeps cells without a multi-selected draft out of a multi-select change', () => {
    const { rerender, getByTestId } = render(matrix(null, []));
    renderedCells.length = 0;

    rerender(matrix(null, ['d2']));

    expect(renderedCells).toEqual([cellId('2026-08-04')]);
    expect(getByTestId('card-d2').getAttribute('data-multi-selected')).toBe('true');
    expect(getByTestId('card-d1').getAttribute('data-multi-selected')).toBe('false');
  });
});

describe('PlannerMatrix opened-post slicing', () => {
  afterEach(() => {
    cleanup();
    renderedCells.length = 0;
  });

  it('re-renders only the cell holding the opened post, and presses its chip', () => {
    const { rerender, getByRole } = render(matrix(null));
    renderedCells.length = 0;

    rerender(matrix(null, [], 'p1'));

    expect(renderedCells).toEqual([cellId('2026-08-05')]);
    expect(getByRole('button', { name: /Launch recap/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves every cell alone when a draft opens while no post is open', () => {
    const { rerender } = render(matrix(null));
    renderedCells.length = 0;

    rerender(matrix('d1', [], null));

    expect(renderedCells).toEqual([cellId('2026-08-03')]);
  });
});

// A caption keystroke replaces one draft, and with it one day (the store keeps the others).
describe('PlannerMatrix draft-edit slicing', () => {
  afterEach(() => {
    cleanup();
    renderedCells.length = 0;
  });

  it('re-renders only the cell holding the edited draft', () => {
    const { rerender } = render(matrix(null));
    renderedCells.length = 0;

    const [first, ...rest] = DAYS;
    if (!first) throw new Error('no first day');
    const edited = { ...first, slots: [{ ...draft('d1'), captionPreview: 'typed' }] };
    rerender(matrix(null, [], null, [edited, ...rest]));

    expect(renderedCells).toEqual([cellId('2026-08-03')]);
  });

  it('leaves every cell alone when the days are rebuilt around the same drafts', () => {
    const { rerender } = render(matrix(null));
    renderedCells.length = 0;

    rerender(
      matrix(
        null,
        [],
        null,
        DAYS.map((item) => ({ ...item, slots: [...item.slots] })),
      ),
    );

    expect(renderedCells).toEqual([]);
  });
});

describe('groupDraftsByCell', () => {
  const reel = { ...draft('fb'), platforms: ['facebook'] } as OrganicCalendarDraft;

  it('keeps the array of a cell whose drafts are unchanged, beside an edited cell of the same day', () => {
    const before = groupDraftsByCell([day('2026-08-03', [draft('d1'), reel])]);
    const after = groupDraftsByCell(
      [day('2026-08-03', [{ ...draft('d1'), captionPreview: 'typed' }, reel])],
      before,
    );

    expect(after.get('2026-08-03::facebook')).toBe(before.get('2026-08-03::facebook'));
    expect(after.get('2026-08-03::instagram')).not.toBe(before.get('2026-08-03::instagram'));
    expect(after.get('2026-08-03::instagram')?.[0]?.captionPreview).toBe('typed');
  });

  it('files a platformless draft under Instagram, sorted by time', () => {
    const late = { ...draft('late'), timeLabel: '5:00 PM', platforms: [] };
    const early = { ...draft('early'), timeLabel: '8:00 AM' };
    const cells = groupDraftsByCell([day('2026-08-03', [late, early])]);

    expect(cells.get('2026-08-03::instagram')?.map((item) => item.id)).toEqual(['early', 'late']);
    expect(cells.has('2026-08-03::facebook')).toBe(false);
  });
});
