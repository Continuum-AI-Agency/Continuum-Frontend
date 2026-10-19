import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';

import { makeCalendarDay } from '@/components/organic/primitives/calendar-utils';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

type RequestOptions = { path: string; method?: string; body?: Record<string, unknown> };
const requestCalls: RequestOptions[] = [];
const request = mock(async (opts: RequestOptions) => {
  requestCalls.push(opts);
  if (opts.method === 'PATCH') return { updated_at: 'T1' };
  return { drafts: [] };
});

// Every browser write of a draft row lands in one of these.
const upserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  schema: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        upserts.push(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'srv-new', updated_at: 'T0' }, error: null }),
          }),
        };
      },
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    }),
  }),
};

mock.module('@/lib/api/http', () => ({ request, http: { request } }));
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => supabase }));
mock.module('@/lib/organic/store', () => createCalendarStoreStub({}));

const { useCalendarDraftPersistence } = await import('./useCalendarDraftPersistence');

const DAY_ID = '2030-01-07';

function manualDraft(over: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'local-1',
    clientKey: 'ck-1',
    origin: 'manual',
    title: 'Hand-made',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 7',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: 'Hello from the planner',
    tags: [],
    mediaCount: 0,
    ...over,
  };
}

const onDay = (...slots: OrganicCalendarDraft[]): OrganicCalendarDay[] => [
  { ...makeCalendarDay(DAY_ID), slots },
];

function renderAutosave(initial: OrganicCalendarDay[]) {
  const updateDraftById = mock(
    (_id: string, _updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => {},
  );
  // Stable, as the store's setter is: a new one per render re-runs the hydration fetch.
  const setCalendarDays = mock((_days: OrganicCalendarDay[]) => {});
  const hook = renderHook(
    ({ days }: { days: OrganicCalendarDay[] }) =>
      useCalendarDraftPersistence({
        brandProfileId: 'brand-1',
        calendarDays: days,
        setCalendarDays,
        updateDraftById,
        timeZone: 'America/New_York',
      }),
    { initialProps: { days: initial } },
  );
  return { ...hook, updateDraftById };
}

beforeEach(() => {
  requestCalls.length = 0;
  upserts.length = 0;
  updates.length = 0;
});

describe('useCalendarDraftPersistence', () => {
  it('never writes a draft row that exists from the browser, however it is edited', async () => {
    const saved = manualDraft({ backendDraftId: 'srv-1', updatedAt: 'T0' });
    const { result, rerender } = renderAutosave(onDay(saved));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    rerender({
      days: onDay({ ...saved, captionPreview: 'edited', timeLabel: '1:00 PM', status: 'draft' }),
    });
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(updates).toEqual([]);
    expect(upserts).toEqual([]);
    expect(requestCalls.filter((call) => call.method === 'PATCH')).toEqual([]);
  });

  it("inserts a new manual draft at its time in the brand's zone, then sends its content where publish reads it", async () => {
    const { result, rerender, updateDraftById } = renderAutosave([]);
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    rerender({ days: onDay(manualDraft()) });

    await waitFor(() => expect(upserts).toHaveLength(1), { timeout: 2000 });
    // 9:00 AM in New York on a January day is 14:00 UTC, whatever zone the browser is in.
    expect(upserts[0]).toMatchObject({
      client_key: 'ck-1',
      platform: 'instagram',
      scheduled_date: '2030-01-07T14:00:00.000Z',
    });
    await waitFor(() =>
      expect(requestCalls.filter((call) => call.method === 'PATCH')).toHaveLength(1),
    );
    const patch = requestCalls.find((call) => call.method === 'PATCH');
    expect(patch?.path).toBe('/api/organic/calendar/drafts/srv-new/fields');
    expect(patch?.body).toMatchObject({
      caption: 'Hello from the planner',
      format: 'Post',
      expected_updated_at: 'T0',
    });
    const stamped = updateDraftById.mock.calls
      .filter(([id]) => id === 'local-1')
      .reduce((draft, [, updater]) => updater(draft), manualDraft());
    expect(stamped).toMatchObject({ backendDraftId: 'srv-new', updatedAt: 'T1' });
    expect(updates).toEqual([]);
  });
});
