import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';

import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';

// PP-L2-planner-draft-autosave-fires-from-approvals: hydrating the planner used to
// PATCH every manual draft straight back to organic_calendar_drafts because the
// "last synced" signature started empty and the hydrated grid never matched it.
// The write then outlived the planner (same browser context) and surfaced on
// /scale/approvals as a write nobody asked for.

const requestMock = mock(async () => ({ drafts: [] as unknown[] }));
mock.module('@/lib/api/http', () => ({ request: requestMock }));

const updateCalls: unknown[] = [];
const upsertCalls: unknown[] = [];
const updateChain = {
  update: (payload: unknown) => {
    updateCalls.push(payload);
    return { eq: () => ({ eq: async () => ({ error: null }) }) };
  },
  upsert: (payload: unknown) => {
    upsertCalls.push(payload);
    return { select: () => ({ single: async () => ({ data: { id: 'be-new' }, error: null }) }) };
  },
  delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    schema: () => ({ from: () => updateChain }),
  }),
}));

const { useCalendarDraftPersistence } = await import('./useCalendarDraftPersistence');

const BRAND = 'brand-1';
const DAY = '2026-10-14';

function manualRow(id: string, title: string) {
  return {
    id,
    status: 'draft',
    scheduled_date: `${DAY}T16:00:00Z`,
    platform_account_id: 'ig-1',
    client_key: `ck-${id}`,
    updated_at: '2026-10-10T10:00:00Z',
    slot_data: {
      draftSnapshot: { id, origin: 'manual', title, platforms: ['instagram'] },
    },
  };
}

function useHarness() {
  const [calendarDays, setCalendarDays] = React.useState<OrganicCalendarDay[]>([]);
  const updateDraftById = React.useCallback(
    (draftId: string, updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      setCalendarDays((days) =>
        days.map((day) => ({
          ...day,
          slots: day.slots.map((slot) => (slot.id === draftId ? updater(slot) : slot)),
        })),
      );
    },
    [],
  );
  const appendDraft = React.useCallback((dayId: string, draft: OrganicCalendarDraft) => {
    setCalendarDays((days) =>
      days.map((day) => (day.id === dayId ? { ...day, slots: [...day.slots, draft] } : day)),
    );
  }, []);
  const persistence = useCalendarDraftPersistence({
    brandProfileId: BRAND,
    calendarDays,
    setCalendarDays,
    updateDraftById,
  });
  return { ...persistence, calendarDays, updateDraftById, appendDraft };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 900));

beforeEach(() => {
  updateCalls.length = 0;
  upsertCalls.length = 0;
  requestMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useCalendarDraftPersistence autosave', () => {
  it('hydrating persisted manual drafts writes nothing back', async () => {
    requestMock.mockResolvedValue({
      drafts: [manualRow('be-1', 'Hello'), manualRow('be-2', 'World')],
    });
    const { result } = renderHook(useHarness);

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await waitFor(() =>
      expect(result.current.calendarDays.flatMap((d) => d.slots)).toHaveLength(2),
    );
    await act(settle);

    expect(updateCalls).toEqual([]);
    expect(upsertCalls).toEqual([]);
  });

  it('a never-persisted manual draft is upserted once and only once', async () => {
    requestMock.mockResolvedValue({ drafts: [manualRow('be-1', 'Hello')] });
    const { result } = renderHook(useHarness);
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await waitFor(() =>
      expect(result.current.calendarDays.flatMap((d) => d.slots)).toHaveLength(1),
    );
    await act(settle);

    const day = result.current.calendarDays.find((d) => d.id === DAY) as OrganicCalendarDay;
    act(() => {
      const local = {
        ...day.slots[0],
        id: 'local-1',
        clientKey: 'ck-local-1',
        backendDraftId: undefined,
        title: 'Fresh',
      } as OrganicCalendarDraft;
      result.current.appendDraft(day.id, local);
    });
    await act(settle);

    expect(upsertCalls).toHaveLength(1);
    expect(updateCalls).toEqual([]);
  });

  // Pink Elephant 2026-10-14: a caption pasted into a brand-new manual post landed in
  // slot_data only, the field editor skipped its PATCH for want of a row, and approve
  // refused both fan-out members as caption_missing while the planner showed the caption.
  it('a caption typed before the row existed reaches the field-edit route', async () => {
    requestMock.mockResolvedValue({ drafts: [manualRow('be-1', 'Hello')] });
    const { result } = renderHook(useHarness);
    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    await waitFor(() =>
      expect(result.current.calendarDays.flatMap((d) => d.slots)).toHaveLength(1),
    );
    await act(settle);

    const day = result.current.calendarDays.find((d) => d.id === DAY) as OrganicCalendarDay;
    act(() => {
      result.current.appendDraft(day.id, {
        ...day.slots[0],
        id: 'local-1',
        clientKey: 'ck-local-1',
        backendDraftId: undefined,
        captionPreview: 'La resiliencia operativa no se aprende en un aula',
      } as OrganicCalendarDraft);
    });
    await act(settle);

    const fieldPatches = requestMock.mock.calls
      .map(([args]) => args as unknown as { path: string; method?: string; body?: unknown })
      .filter((args) => args.path.endsWith('/fields'));
    expect(upsertCalls).toHaveLength(1);
    expect(fieldPatches).toHaveLength(1);
    expect(fieldPatches[0].path).toBe('/api/organic/calendar/drafts/be-new/fields');
    expect(fieldPatches[0].method).toBe('PATCH');
    expect(fieldPatches[0].body).toMatchObject({
      caption: 'La resiliencia operativa no se aprende en un aula',
    });
  });
});
