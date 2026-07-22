import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { act, renderHook } from '@testing-library/react';
import { useCalendarDnD } from '@/components/organic/hooks/useCalendarDnD';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicSeedDragPayload,
} from '@/components/organic/primitives/types';
import { useCalendarStore } from '@/lib/organic/store';

// Mock the store module
const mockMoveDraft = mock(() => {});
const mockAddDraft = mock(() => {});

mock.module('@/lib/organic/store', () => ({
  useCalendarStore: () => ({
    moveDraft: mockMoveDraft,
    addDraft: mockAddDraft,
  }),
}));

describe('useCalendarDnD', () => {
  beforeEach(() => {
    mockMoveDraft.mockClear();
    mockAddDraft.mockClear();
  });

  const mockDays: OrganicCalendarDay[] = [
    {
      id: '2026-01-26',
      label: 'Mon',
      dateLabel: 'Jan 26',
      suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
      slots: [
        {
          id: 'draft-1',
          title: 'Test Draft',
          summary: 'Test Summary',
          timeLabel: '9:00 AM',
          dateLabel: 'Mon, Jan 26',
          status: 'draft',
          platforms: ['instagram'],
          format: 'Post',
          objective: 'Awareness',
          captionPreview: 'Test caption',
          tags: ['trend-1'],
          mediaCount: 1,
        },
      ],
    },
    {
      id: '2026-01-27',
      label: 'Tue',
      dateLabel: 'Jan 27',
      suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
      slots: [],
    },
  ];

  const mockDrafts: OrganicCalendarDraft[] = mockDays[0].slots;

  const mockPlatformAccountIds = {
    instagram: 'ig-account-1',
    twitter: 'tw-account-1',
  };

  test('handleDragStart sets active drag draft', () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragStartEvent = {
      active: { id: 'draft-1' },
    } as DragStartEvent;

    act(() => {
      result.current.handleDragStart(dragStartEvent);
    });

    expect(result.current.activeDragDraft).not.toBeNull();
    expect(result.current.activeDragDraft?.id).toBe('draft-1');
    expect(result.current.activeDragDraft?.title).toBe('Test Draft');
  });

  test('handleDragStart does not set draft if ID not found', () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragStartEvent = {
      active: { id: 'non-existent-draft' },
    } as DragStartEvent;

    act(() => {
      result.current.handleDragStart(dragStartEvent);
    });

    expect(result.current.activeDragDraft).toBeNull();
  });

  test('handleDragEnd moves draft to target day', () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    act(() => {
      result.current.handleDragStart({
        active: { id: 'draft-1' },
      } as DragStartEvent);
    });

    const dragEndEvent = {
      active: { id: 'draft-1' },
      over: { id: '2026-01-27' },
    } as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(dragEndEvent);
    });

    expect(mockMoveDraft).toHaveBeenCalledWith('draft-1', '2026-01-27');
    expect(result.current.activeDragDraft).toBeNull();
  });

  test('handleDragEnd does nothing if no over target', () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragEndEvent = {
      active: { id: 'draft-1' },
      over: null,
    } as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(dragEndEvent);
    });

    expect(mockMoveDraft).not.toHaveBeenCalled();
  });

  test('handleDragEnd clears active draft even on no-op', () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    act(() => {
      result.current.handleDragStart({
        active: { id: 'draft-1' },
      } as DragStartEvent);
    });

    const dragEndEvent = {
      active: { id: 'draft-1' },
      over: null,
    } as DragEndEvent;

    act(() => {
      result.current.handleDragEnd(dragEndEvent);
    });

    expect(result.current.activeDragDraft).toBeNull();
  });

  test('handleNativeDrop creates seeded draft from trend drag', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'Viral Trend Topic',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-27', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.status).toBe('placeholder');
    expect(addedDraft.title).toBe('Viral Trend Topic');
    expect(addedDraft.tags).toContain('trend-123');
    expect(addedDraft.seedTrendId).toBe('trend-123');
  });

  test('handleNativeDrop creates seeded draft from question drag', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'question',
      trendId: 'question-456',
      title: 'Interesting Question',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-27', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.tags).toContain('question-456');
    expect(addedDraft.tags).toContain('question');
    expect(addedDraft.seedTrendId).toBe('question-456');
  });

  test('handleNativeDrop creates seeded draft from event drag', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'event',
      trendId: 'event-789',
      title: 'Upcoming Event',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-27', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.tags).toContain('event-789');
    expect(addedDraft.tags).toContain('event');
  });

  test('handleNativeDrop does nothing if trendId is missing', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: '',
      title: 'Invalid Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-27', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).not.toHaveBeenCalled();
  });

  test('handleNativeDrop does nothing for invalid day', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'Valid Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('invalid-day-id', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).not.toHaveBeenCalled();
  });

  test('handleNativeDrop resolves platform from ORGANIC_BETA_LAUNCH_SCHEDULE', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'Test Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-26', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.platforms.length).toBeGreaterThan(0);
  });

  test('handleNativeDrop uses provided time for empty day', async () => {
    const { result } = renderHook(() =>
      useCalendarDnD(mockDays, mockDrafts, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'Test Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-27', '09:00', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.timeLabel).toBe('9:00 AM');
  });

  test('handleNativeDrop calculates next time slot when day has existing slots', async () => {
    const daysWithExistingSlots: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
        slots: [
          {
            id: 'draft-1',
            title: 'Existing Draft',
            summary: 'Summary',
            timeLabel: '9:00 AM',
            dateLabel: 'Mon, Jan 26',
            status: 'draft',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Awareness',
            captionPreview: 'Caption',
            tags: [],
            mediaCount: 1,
          },
        ],
      },
    ];

    const { result } = renderHook(() =>
      useCalendarDnD(daysWithExistingSlots, daysWithExistingSlots[0].slots, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'New Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-26', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.timeLabel).toBe('11:00 AM');
  });

  test('handleNativeDrop uses fallback time when calculation fails', async () => {
    const daysWithLateSlot: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'draft-1',
            title: 'Late Draft',
            summary: 'Summary',
            timeLabel: '11:00 PM',
            dateLabel: 'Mon, Jan 26',
            status: 'draft',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Awareness',
            captionPreview: 'Caption',
            tags: [],
            mediaCount: 1,
          },
        ],
      },
    ];

    const { result } = renderHook(() =>
      useCalendarDnD(daysWithLateSlot, daysWithLateSlot[0].slots, mockPlatformAccountIds),
    );

    const dragPayload: OrganicSeedDragPayload = {
      type: 'trend',
      trendId: 'trend-123',
      title: 'New Trend',
    };

    await act(async () => {
      await result.current.handleNativeDrop('2026-01-26', '9:00 AM', dragPayload);
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const addedDraft = mockAddDraft.mock.calls[0][1];
    expect(addedDraft.timeLabel).toBeDefined();
  });
});
