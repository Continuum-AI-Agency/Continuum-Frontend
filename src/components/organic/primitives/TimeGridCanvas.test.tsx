import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import { buildPlannerPlatforms } from './planner-platforms';
import type { OrganicCalendarDay } from './types';

// The planner cards surface errors as toasts, so the tree needs the same provider the
// (post-auth) layout wraps the app in.
const render = (ui: ReactNode) => rtlRender(<ToastProvider>{ui}</ToastProvider>);

const store = {
  ghosts: {},
};

mock.module('@/lib/organic/store', () => createCalendarStoreStub(store));

// Radix dropdowns do not open under fireEvent in happy-dom. What this file owns is the
// WIRING — that each cell hands its own dayId/platform to the menu — so stub the menu as
// a button that fires the same payload its "New post" item does. (CalendarToolbar.test
// stubs it the same way.)
mock.module('./AddPostMenu', () => ({
  AddPostMenu: ({
    onCreatePost,
    dayId,
    platformKey,
    children,
  }: {
    onCreatePost: (options: Record<string, unknown>) => void;
    dayId?: string;
    platformKey?: string;
    children: ReactNode;
  }) =>
    cloneElement(children as ReactElement<{ onClick?: () => void }>, {
      onClick: () =>
        onCreatePost({ dayId, platformKey, status: 'draft', mode: 'manual', format: 'Post' }),
    }),
}));

mock.module('./DraggableDraftCard', () => ({
  DraggableDraftCard: ({ draft }: { draft: { title: string } }) => <div>{draft.title}</div>,
}));

mock.module('@/lib/organic/carousel', () => ({
  isCarouselMediaType: () => false,
}));

mock.module('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: mock(),
    isOver: false,
  }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: mock(),
    transform: null,
    isDragging: false,
  }),
}));

const { TimeGridCanvas } = await import('./TimeGridCanvas');

function buildWeekDays(): OrganicCalendarDay[] {
  return [
    {
      id: '2026-02-23',
      label: 'Mon',
      dateLabel: 'Feb 23',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-02-24',
      label: 'Tue',
      dateLabel: 'Feb 24',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-02-25',
      label: 'Wed',
      dateLabel: 'Feb 25',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-02-26',
      label: 'Thu',
      dateLabel: 'Feb 26',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-02-27',
      label: 'Fri',
      dateLabel: 'Feb 27',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-02-28',
      label: 'Sat',
      dateLabel: 'Feb 28',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
    {
      id: '2026-03-01',
      label: 'Sun',
      dateLabel: 'Mar 1',
      suggestedTimes: ['9:00 AM'],
      slots: [],
    },
  ];
}

function buildPlannerTestPlatforms(days: OrganicCalendarDay[]) {
  return buildPlannerPlatforms(['instagram', 'linkedin'], days);
}

describe('TimeGridCanvas', () => {
  beforeEach(() => {
    mock.restore();
    (window as unknown as { SyntaxError?: typeof SyntaxError }).SyntaxError = SyntaxError;
  });

  afterEach(() => {
    cleanup();
  });

  // The header "+" was intentionally removed — add-post is the per-day hover "+"
  // (AddPostMenu) in the planner cells, not a header control.

  it('calls onCreatePost with day and platform when clicking an empty cell', () => {
    const onCreatePost = mock();

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        platforms={buildPlannerTestPlatforms(buildWeekDays())}
        postedContent={[]}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        onPreviousWeek={mock()}
        onToday={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
        onSelectPost={mock()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add post for 2026-02-23 Instagram' }));

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-02-23',
      platform: 'instagram',
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });

  it('offers a direct return to the current week', () => {
    const onToday = mock();

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        platforms={buildPlannerTestPlatforms(buildWeekDays())}
        postedContent={[]}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        onPreviousWeek={mock()}
        onToday={onToday}
        onNextWeek={mock()}
        onCreatePost={mock()}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
        onSelectPost={mock()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(onToday).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Day' })).toBeNull();
  });

  it('still allows adding posts when a cell already has a draft', () => {
    const onCreatePost = mock();
    const days = buildWeekDays();
    days[0] = {
      ...days[0],
      slots: [
        {
          id: 'draft-1',
          title: 'Existing post',
          summary: 'Summary',
          timeLabel: '9:00 AM',
          dateLabel: 'Mon, Feb 23',
          status: 'draft',
          platforms: ['instagram'],
          format: 'Post',
          objective: 'Engagement',
          captionPreview: 'Caption',
          tags: [],
          mediaCount: 1,
        },
      ],
    };

    render(
      <TimeGridCanvas
        days={days}
        platforms={buildPlannerTestPlatforms(days)}
        postedContent={[]}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        onPreviousWeek={mock()}
        onToday={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
        onSelectPost={mock()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add post for 2026-02-23 Instagram' }));

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-02-23',
      platform: 'instagram',
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });

  // This case used to pin "published YouTube content, and no + on its row", because YouTube
  // was the planner's read-only channel: it could carry published posts but had no publisher.
  // A YouTube publisher has since shipped — `PLATFORM_CAPABILITIES.youtube` is populated and
  // `planner-platforms.test` pins "gives a platform with a publisher a creatable row from its
  // posts alone" — so a YouTube row is now correctly creatable, and the old assertion was
  // asserting the opposite of the product. Every platform that can carry posted content
  // (`OrganicPlatformTag`) is publishable now, so the "no create affordance where you cannot
  // post" guard moves to the one channel that still has no publisher: X, which the planner
  // only surfaces when coming-soon rows are asked for.
  it('opens published content in the preview panel, and offers no create control on a channel with no publisher', () => {
    const days = buildWeekDays();
    const platforms = buildPlannerPlatforms(
      [],
      days,
      [
        {
          id: 'youtube-post',
          source: 'external',
          platform: 'youtube',
          timestamp: '2026-02-23T15:00:00.000Z',
          dayId: '2026-02-23',
          timeLabel: '3:00 PM',
          title: 'Published video',
          caption: 'A published cross-platform calendar entry.',
          permalink: 'https://youtube.example.com/watch/123',
        },
      ],
      { includeComingSoon: true },
    );

    const onSelectPost = mock();
    render(
      <TimeGridCanvas
        days={days}
        platforms={platforms}
        postedContent={[
          {
            id: 'youtube-post',
            source: 'external',
            platform: 'youtube',
            timestamp: '2026-02-23T15:00:00.000Z',
            dayId: '2026-02-23',
            timeLabel: '3:00 PM',
            title: 'Published video',
            caption: 'A published cross-platform calendar entry.',
            permalink: 'https://youtube.example.com/watch/123',
          },
        ]}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 - March 1, 2026"
        onPreviousWeek={mock()}
        onToday={mock()}
        onNextWeek={mock()}
        onCreatePost={mock()}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
        onSelectPost={onSelectPost}
      />,
    );

    // The week chip hands the post to the workspace's preview panel, the month chip's path,
    // instead of opening a popover of its own.
    fireEvent.click(
      screen.getByRole('button', { name: '3:00 PM Posted on YouTube: Published video' }),
    );
    expect(onSelectPost).toHaveBeenCalledTimes(1);
    expect(onSelectPost.mock.calls[0]?.[0]).toMatchObject({ id: 'youtube-post' });
    expect(onSelectPost.mock.calls[0]?.[1]).toBeNull();
    expect(screen.queryByRole('link', { name: /Open post/ })).toBeNull();
    // YouTube has a publisher, so its row IS creatable — that is the behaviour change.
    expect(screen.getByRole('button', { name: 'Add post for 2026-02-23 YouTube' })).toBeDefined();
    // X has none, so its row must never offer one.
    expect(screen.queryByRole('button', { name: /Add post for .* X$/ })).toBeNull();
  });

  it('keeps posted-content loading and retry states inside the week surface', () => {
    const onRetry = mock();
    const days = buildWeekDays();

    render(
      <TimeGridCanvas
        days={days}
        platforms={buildPlannerTestPlatforms(days)}
        postedContent={[]}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 - March 1, 2026"
        onPreviousWeek={mock()}
        onToday={mock()}
        onNextWeek={mock()}
        onCreatePost={mock()}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
        onSelectPost={mock()}
        isLoadingPostedContent
        postedContentError="Published posts could not be loaded"
        onRetryPostedContent={onRetry}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Loading published posts');
    expect(screen.getByRole('alert').textContent).toContain('Published posts could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
