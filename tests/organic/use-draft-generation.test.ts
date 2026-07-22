import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDraftGeneration } from '@/components/organic/hooks/useDraftGeneration';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { useCalendarStore } from '@/lib/organic/store';
import type { Trend } from '@/lib/organic/trends';

// Mock modules
const mockSetGridStatus = mock(() => {});
const mockSetGridProgress = mock(() => {});
const mockSetGridError = mock(() => {});
const mockAddDraft = mock(() => {});
const mockUpdateDraftById = mock(() => {});
const mockSetGhosts = mock(() => {});

const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: mock(() => Promise.resolve({ done: true })),
      }),
    },
  }),
);

global.fetch = mockFetch;

mock.module('@/lib/organic/store', () => ({
  useCalendarStore: () => ({
    gridStatus: 'idle',
    setGridStatus: mockSetGridStatus,
    setGridProgress: mockSetGridProgress,
    setGridError: mockSetGridError,
    addDraft: mockAddDraft,
    updateDraft: mockUpdateDraftById,
    setGhosts: mockSetGhosts,
  }),
}));

describe('useDraftGeneration', () => {
  beforeEach(() => {
    mockSetGridStatus.mockClear();
    mockSetGridProgress.mockClear();
    mockSetGridError.mockClear();
    mockAddDraft.mockClear();
    mockUpdateDraftById.mockClear();
    mockSetGhosts.mockClear();
    mockFetch.mockClear();
  });

  const mockDays: OrganicCalendarDay[] = [
    {
      id: '2026-01-26',
      label: 'Mon',
      dateLabel: 'Jan 26',
      suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
      slots: [],
    },
    {
      id: '2026-01-27',
      label: 'Tue',
      dateLabel: 'Jan 27',
      suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
      slots: [],
    },
    {
      id: '2026-02-01',
      label: 'Sun',
      dateLabel: 'Feb 1',
      suggestedTimes: ['9:00 AM', '1:00 PM', '5:00 PM'],
      slots: [],
    },
  ];

  const mockDrafts: OrganicCalendarDraft[] = [];

  const mockTrends: Trend[] = [
    {
      id: 'trend-1',
      title: 'Trend 1',
      summary: 'Summary 1',
      momentum: 'rising',
      tags: [],
      platforms: ['instagram'],
    },
    {
      id: 'trend-2',
      title: 'Trend 2',
      summary: 'Summary 2',
      momentum: 'stable',
      tags: [],
      platforms: ['instagram'],
    },
    {
      id: 'trend-3',
      title: 'Trend 3',
      summary: 'Summary 3',
      momentum: 'rising',
      tags: [],
      platforms: ['instagram'],
    },
  ];

  const mockPlatformAccountIds: Partial<Record<OrganicPlatformKey, string>> = {
    instagram: 'ig-account-1',
  };

  const defaultProps = {
    brandProfileId: 'brand-123',
    calendarDays: mockDays,
    drafts: mockDrafts,
    selectedTrendIds: ['trend-1', 'trend-2'],
    trends: mockTrends,
    platformAccountIds: mockPlatformAccountIds,
    activePlatforms: ['instagram'] as OrganicPlatformKey[],
    weekStartId: '2026-01-26',
  };

  test('returns correct initial values', () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    expect(result.current.seededDraftCount).toBe(0);
    expect(result.current.gridStatus).toBe('idle');
    expect(typeof result.current.handleAutoSort).toBe('function');
    expect(typeof result.current.handleGenerateDrafts).toBe('function');
    expect(typeof result.current.handleRegenerate).toBe('function');
  });

  test('handleAutoSort creates seeded drafts for each day', async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    await act(async () => {
      await result.current.handleAutoSort();
    });

    expect(mockAddDraft).toHaveBeenCalled();
    const calls = mockAddDraft.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const seededDrafts = calls.filter((call) => call[1].status === 'placeholder');
    expect(seededDrafts.length).toBeGreaterThan(0);
  });

  test('handleAutoSort adds newsletter on Wednesday', async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    await act(async () => {
      await result.current.handleAutoSort();
    });

    const newsletterCalls = mockAddDraft.mock.calls.filter(
      (call) => call[1].tags && call[1].tags.includes('newsletter'),
    );
    expect(newsletterCalls.length).toBeGreaterThan(0);

    const newsletterDraft = newsletterCalls[0][1];
    expect(newsletterDraft.title).toBe('Weekly Newsletter');
    expect(newsletterDraft.format).toBeDefined();
  });

  test('handleAutoSort distributes trends across days', async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    await act(async () => {
      await result.current.handleAutoSort();
    });

    const seededCalls = mockAddDraft.mock.calls.filter(
      (call) => call[1].status === 'placeholder' && !call[1].tags?.includes('newsletter'),
    );

    const trendIds = new Set();
    seededCalls.forEach((call) => {
      const tags = call[1].tags || [];
      tags.forEach((tag: string) => {
        if (tag.startsWith('trend-')) {
          trendIds.add(tag);
        }
      });
    });

    expect(trendIds.size).toBeGreaterThan(0);
  });

  test('handleAutoSort does nothing when no trends available', async () => {
    const propsWithNoTrends = {
      ...defaultProps,
      selectedTrendIds: [],
      trends: [],
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithNoTrends));

    await act(async () => {
      await result.current.handleAutoSort();
    });

    expect(mockAddDraft).not.toHaveBeenCalled();
  });

  test('handleGenerateDrafts returns error when brandProfileId is missing', async () => {
    const propsWithNoBrand = {
      ...defaultProps,
      brandProfileId: undefined,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithNoBrand));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockSetGridStatus).toHaveBeenCalledWith('error');
    expect(mockSetGridError).toHaveBeenCalledWith(expect.stringContaining('Missing brand'));
  });

  test('handleGenerateDrafts updates placeholder drafts to streaming status', async () => {
    const daysWithPlaceholders: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'seed-1',
            title: 'Seeded topic',
            summary: 'Ready to generate',
            timeLabel: '9:00 AM',
            dateLabel: 'Mon, Jan 26',
            status: 'placeholder',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Generation Seed',
            captionPreview: 'Click Generate',
            tags: ['trend-1'],
            mediaCount: 1,
            seedTrendId: 'trend-1',
          },
        ],
      },
    ];

    const propsWithPlaceholders = {
      ...defaultProps,
      calendarDays: daysWithPlaceholders,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithPlaceholders));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockSetGridStatus).toHaveBeenCalledWith('running');
    expect(mockUpdateDraftById).toHaveBeenCalled();
  });

  test('handleGenerateDrafts calls API with correct payload', async () => {
    const daysWithPlaceholders: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'seed-1',
            title: 'Seeded topic',
            summary: 'Ready to generate',
            timeLabel: '9:00 AM',
            dateLabel: 'Mon, Jan 26',
            status: 'placeholder',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Generation Seed',
            captionPreview: 'Click Generate',
            tags: ['trend-1'],
            mediaCount: 1,
            seedTrendId: 'trend-1',
          },
        ],
      },
    ];

    const propsWithPlaceholders = {
      ...defaultProps,
      calendarDays: daysWithPlaceholders,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithPlaceholders));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockFetch).toHaveBeenCalled();
    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe('/api/organic/generate-calendar');
    expect(fetchCall[1].method).toBe('POST');
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(fetchCall[1].body);
    expect(body.brandProfileId).toBe('brand-123');
    expect(body.weekStart).toBe('2026-01-26');
    expect(body.placements).toBeDefined();
    expect(body.placements.length).toBeGreaterThan(0);
  });

  test('handleGenerateDrafts sets error on API failure', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        body: null,
      }),
    );

    const daysWithPlaceholders: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'seed-1',
            title: 'Seeded topic',
            summary: 'Ready to generate',
            timeLabel: '9:00 AM',
            dateLabel: 'Mon, Jan 26',
            status: 'placeholder',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Generation Seed',
            captionPreview: 'Click Generate',
            tags: ['trend-1'],
            mediaCount: 1,
            seedTrendId: 'trend-1',
          },
        ],
      },
    ];

    const propsWithPlaceholders = {
      ...defaultProps,
      calendarDays: daysWithPlaceholders,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithPlaceholders));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockSetGridStatus).toHaveBeenCalledWith('error');
    expect(mockSetGridError).toHaveBeenCalledWith(expect.stringContaining('Failed to start'));
  });

  test('handleRegenerate updates draft status to streaming', async () => {
    const draftsWithExisting: OrganicCalendarDraft[] = [
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
        tags: ['trend-1'],
        mediaCount: 1,
        seedTrendId: 'trend-1',
      },
    ];

    const daysWithDrafts: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: draftsWithExisting,
      },
    ];

    const propsWithDrafts = {
      ...defaultProps,
      calendarDays: daysWithDrafts,
      drafts: draftsWithExisting,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithDrafts));

    await act(async () => {
      await result.current.handleRegenerate('draft-1');
    });

    expect(mockUpdateDraftById).toHaveBeenCalledWith('draft-1', expect.any(Function));
  });

  test('handleRegenerate does nothing for non-existent draft', async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    await act(async () => {
      await result.current.handleRegenerate('non-existent-draft');
    });

    expect(mockUpdateDraftById).not.toHaveBeenCalled();
  });

  test('handleRegenerate returns error when brandProfileId is missing', async () => {
    const draftsWithExisting: OrganicCalendarDraft[] = [
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
        tags: ['trend-1'],
        mediaCount: 1,
        seedTrendId: 'trend-1',
      },
    ];

    const daysWithDrafts: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: draftsWithExisting,
      },
    ];

    const propsWithNoBrand = {
      ...defaultProps,
      brandProfileId: undefined,
      calendarDays: daysWithDrafts,
      drafts: draftsWithExisting,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithNoBrand));

    await act(async () => {
      await result.current.handleRegenerate('draft-1');
    });

    expect(mockSetGridError).toHaveBeenCalledWith(expect.stringContaining('Missing brand'));
  });

  test('calculates seededDraftCount correctly', () => {
    const daysWithPlaceholders: OrganicCalendarDay[] = [
      {
        id: '2026-01-26',
        label: 'Mon',
        dateLabel: 'Jan 26',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'seed-1',
            title: 'Seeded',
            summary: 'Ready',
            timeLabel: '9:00 AM',
            dateLabel: 'Mon, Jan 26',
            status: 'placeholder',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Generation Seed',
            captionPreview: 'Click Generate',
            tags: ['trend-1'],
            mediaCount: 1,
            seedTrendId: 'trend-1',
          },
        ],
      },
      {
        id: '2026-01-27',
        label: 'Tue',
        dateLabel: 'Jan 27',
        suggestedTimes: ['9:00 AM'],
        slots: [
          {
            id: 'seed-2',
            title: 'Seeded 2',
            summary: 'Ready 2',
            timeLabel: '1:00 PM',
            dateLabel: 'Tue, Jan 27',
            status: 'placeholder',
            platforms: ['instagram'],
            format: 'Post',
            objective: 'Generation Seed',
            captionPreview: 'Click Generate',
            tags: ['trend-2'],
            mediaCount: 1,
            seedTrendId: 'trend-2',
          },
        ],
      },
    ];

    const propsWithPlaceholders = {
      ...defaultProps,
      calendarDays: daysWithPlaceholders,
    };

    const { result } = renderHook(() => useDraftGeneration(propsWithPlaceholders));

    expect(result.current.seededDraftCount).toBe(2);
  });
});
