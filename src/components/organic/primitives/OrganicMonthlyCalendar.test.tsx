import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { OrganicCalendarDay, OrganicCalendarDraft, OrganicCalendarPostedContent } from './types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Every droppable the month grid registers, so the spec can assert the id GRAMMAR — the
// contract `useCalendarDnD.parsePlannerCellId` reads on the other side.
const registeredDroppableIds: string[] = [];
const routerPush = mock((_href: string) => undefined);
mock.module('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

mock.module('@dnd-kit/core', () => ({
  useDroppable: ({ id }: { id: string }) => {
    registeredDroppableIds.push(id);
    return { setNodeRef: () => undefined, isOver: false };
  },
}));

// The drag handle is stubbed so the spec can put the chip INTO a drag without a real
// pointer sequence; `isDragging` is what the click guard reads.
let isDragging = false;
mock.module('./useDraftDragHandle', () => ({
  useDraftDragHandle: () => ({
    setNodeRef: () => undefined,
    listeners: {},
    attributes: {},
    isDragging,
    style: {},
  }),
}));

mock.module('@/lib/organic/store', () => createCalendarStoreStub({}));

mock.module('./AddPostMenu', () => ({
  AddPostMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./AddPostContextMenu', () => ({
  AddPostContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./DraftHoverCardContent', () => ({
  DraftHoverCardContent: () => <div data-testid="hover-preview" />,
}));
mock.module('./PostedContentQuickLook', () => ({
  PostedContentPreview: ({ onViewMetrics }: { onViewMetrics?: () => void }) => (
    <div>
      {onViewMetrics && <button type="button" onClick={onViewMetrics}>View post metrics</button>}
    </div>
  ),
}));
mock.module('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

afterAll(() => mock.restore());

const { OrganicMonthlyCalendar } = await import('./OrganicMonthlyCalendar');

const ANCHOR = new Date(2026, 7, 1);
const DAY_ID = '2026-08-03';

function draft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'Launch teaser',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Aug 3',
    status: 'scheduled',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    ...overrides,
  } as OrganicCalendarDraft;
}

const days = (slots: OrganicCalendarDraft[]): OrganicCalendarDay[] => [
  { id: DAY_ID, label: 'Mon', dateLabel: 'Aug 3', suggestedTimes: [], slots },
];

const NOOP = () => undefined;

function renderMonth(
  overrides: {
    slots?: OrganicCalendarDraft[];
    selectedDraftIds?: string[];
    onSelectDraft?: (id: string) => void;
    onSelectPost?: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
    onToggleSelection?: (id: string) => void;
    onToday?: () => void;
    postedContent?: OrganicCalendarPostedContent[];
  } = {},
) {
  render(
    <OrganicMonthlyCalendar
      days={days(overrides.slots ?? [draft()])}
      monthAnchorDate={ANCHOR}
      platforms={[]}
      postedContent={overrides.postedContent ?? []}
      selectedDraftId={null}
      selectedDraftIds={overrides.selectedDraftIds}
      onSelectDraft={overrides.onSelectDraft ?? NOOP}
      onSelectPost={overrides.onSelectPost ?? NOOP}
      onToggleSelection={overrides.onToggleSelection}
      onCreatePost={NOOP}
      onPreviousMonth={NOOP}
      onNextMonth={NOOP}
      onToday={overrides.onToday ?? NOOP}
    />,
  );
}

const chip = () => screen.getByTitle(/Launch teaser/);

describe('OrganicMonthlyCalendar drag and drop', () => {
  beforeEach(() => {
    cleanup();
    registeredDroppableIds.length = 0;
    isDragging = false;
  });

  // H-15: the month view imported no dnd-kit at all, so a drag there was only ever a
  // click. Its cells now register under the week grid's own id grammar.
  it('registers every day cell as a droppable in the planner-cell grammar', () => {
    renderMonth();

    expect(registeredDroppableIds).toContain(`planner-cell::${DAY_ID}`);
    expect(registeredDroppableIds.every((id) => /^planner-cell::\d{4}-\d{2}-\d{2}$/.test(id))).toBe(
      true,
    );
  });

  // A month cell spans platforms, so its id carries no platform segment — which
  // parsePlannerCellId reads as "move the day, leave the channel alone".
  it('omits the platform segment, which is what keeps the drop from re-stamping a channel', () => {
    renderMonth();

    const monthCellId = registeredDroppableIds.find((id) => id.includes(DAY_ID));
    expect(monthCellId?.split('::')).toHaveLength(2);
  });

  it('selects the draft on a plain click', () => {
    const onSelectDraft = mock((_id: string) => undefined);
    renderMonth({ onSelectDraft });

    fireEvent.click(chip());
    expect(onSelectDraft).toHaveBeenCalledWith('draft-1');
  });

  it('does NOT select when the click is the tail of a drag', () => {
    isDragging = true;
    const onSelectDraft = mock((_id: string) => undefined);
    renderMonth({ onSelectDraft });

    fireEvent.click(chip());
    expect(onSelectDraft).not.toHaveBeenCalled();
  });

  // The changelog advertises bulk move/duplicate/delete, but multi-select existed only in
  // List view — so the advertised bulk drag was not true on the calendar.
  it('extends the multi-selection on a shift-click', () => {
    const onToggleSelection = mock((_id: string) => undefined);
    const onSelectDraft = mock((_id: string) => undefined);
    renderMonth({ onToggleSelection, onSelectDraft });

    fireEvent.click(chip(), { shiftKey: true });

    expect(onToggleSelection).toHaveBeenCalledWith('draft-1');
    expect(onSelectDraft).not.toHaveBeenCalled();
  });
});

describe('OrganicMonthlyCalendar status signal', () => {
  beforeEach(() => {
    cleanup();
    registeredDroppableIds.length = 0;
    isDragging = false;
  });

  // M-01: the chip is coloured by PLATFORM and rendered only the title, so the toolbar
  // legend's "every status is labeled" was false on the month grid.
  it('names the status in the chip title alongside the post title', () => {
    renderMonth();
    expect(chip().getAttribute('title')).toBe('Scheduled · Launch teaser');
  });

  it('announces the status next to the title, not just as a colour', () => {
    renderMonth({ slots: [draft({ status: 'failed' })] });

    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.getByTitle(/^Failed · /)).toBeTruthy();
  });
});

describe('OrganicMonthlyCalendar day access', () => {
  beforeEach(() => {
    cleanup();
    registeredDroppableIds.length = 0;
    isDragging = false;
  });

  it('returns to today from the month header', () => {
    const onToday = mock(() => undefined);
    renderMonth({ onToday });
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('keeps at most three readable chips in a day and exposes the rest', () => {
    renderMonth({
      slots: Array.from({ length: 5 }, (_, i) => draft({ id: `draft-${i}`, title: `Post ${i}` })),
    });
    expect(screen.getByTitle('Scheduled · Post 0').className).toContain('text-xs');
    expect(screen.queryByTitle('Scheduled · Post 3')).toBeNull();
    expect(screen.getByRole('button', { name: `Show all 5 posts for ${DAY_ID}` }).textContent).toBe(
      '+2 more',
    );
  });

  it('opens every hidden draft and selects one for review', () => {
    const onSelectDraft = mock((_id: string) => undefined);
    renderMonth({
      slots: Array.from({ length: 7 }, (_, i) => draft({ id: `draft-${i}`, title: `Post ${i}` })),
      onSelectDraft,
    });
    fireEvent.click(screen.getByRole('button', { name: `Show all 7 posts for ${DAY_ID}` }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    for (let i = 0; i < 7; i++) {
      expect(screen.getByRole('button', { name: new RegExp(`Post ${i}`) })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: /Post 6/ }));
    expect(onSelectDraft).toHaveBeenCalledWith('draft-6');
  });

  it('selects a published post for the side preview from a visible chip', () => {
    routerPush.mockClear();
    const onSelectPost = mock();
    const post: OrganicCalendarPostedContent = {
      id: 'post-1',
      source: 'published_posts',
      platform: 'instagram',
      integrationAccountId: 'account-1',
      externalPostId: 'media-1',
      timestamp: '2026-08-03T15:00:00Z',
      dayId: DAY_ID,
      timeLabel: '9:00 AM',
      title: 'Published launch',
    };
    renderMonth({
      slots: [],
      postedContent: [post],
      onSelectPost,
    });
    fireEvent.click(screen.getByTitle('Published launch'));
    expect(onSelectPost).toHaveBeenCalledWith(post, '?tab=metrics&platform=instagram&accountId=account-1&postId=media-1');
    expect(routerPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'View post metrics' }));
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it('selects a published post for the side preview from the full day detail', () => {
    routerPush.mockClear();
    const onSelectPost = mock();
    renderMonth({
      slots: Array.from({ length: 5 }, (_, i) => draft({ id: `draft-${i}`, title: `Post ${i}` })),
      postedContent: [{
        id: 'post-1',
        source: 'published_posts',
        platform: 'instagram',
        integrationAccountId: 'account-1',
        externalPostId: 'media-1',
        timestamp: '2026-08-03T15:00:00Z',
        dayId: DAY_ID,
        timeLabel: '9:00 AM',
        title: 'Published launch',
      }],
      onSelectPost,
    });
    fireEvent.click(screen.getByRole('button', { name: `Show all 6 posts for ${DAY_ID}` }));
    fireEvent.click(screen.getByRole('button', { name: /Published launch.*Published/ }));
    expect(onSelectPost).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1' }),
      '?tab=metrics&platform=instagram&accountId=account-1&postId=media-1',
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
