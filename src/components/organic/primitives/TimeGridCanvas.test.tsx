import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import { buildPlannerPlatforms } from './planner-platforms';
import { TimeGridCanvas } from './TimeGridCanvas';
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
  }) => (
    <button
      type="button"
      onClick={() =>
        onCreatePost({ dayId, platformKey, status: 'draft', mode: 'manual', format: 'Post' })
      }
    >
      {children}
    </button>
  ),
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
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={mock()}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
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

  it('updates planner view mode from the segmented controls', () => {
    const onViewModeChange = mock();

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        platforms={buildPlannerTestPlatforms(buildWeekDays())}
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={onViewModeChange}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={mock()}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
      />,
    );

    // The grid's own segmented control is Day/Week; Month lives on the workspace toolbar.
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));

    expect(onViewModeChange).toHaveBeenCalledWith('day');
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
        selectedDraftId={null}
        selectedDraftIds={[]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={mock()}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
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
});
