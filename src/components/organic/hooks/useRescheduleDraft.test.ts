import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { movePlannerDraftToDay, plannerInstantFromDayTime } from '@continuum/contracts';
import { act, renderHook } from '@testing-library/react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useCalendarStore } from '@/lib/organic/store';

type RequestOptions = {
  path: string;
  method?: string;
  body?: { dayId?: string; timeOfDay?: string };
};

const requestCalls: RequestOptions[] = [];
let requestImpl: (opts: RequestOptions) => Promise<unknown> = async () => ({});
const request = mock((opts: RequestOptions) => {
  requestCalls.push(opts);
  return requestImpl(opts);
});
const show = mock(() => {});

mock.module('@/lib/api/http', () => ({ request, http: { request } }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));

// Imported AFTER the module mocks so the hook binds to them.
const { useRescheduleDraft } = await import('./useRescheduleDraft');

function draft(id: string, over: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id,
    title: 'Draft',
    summary: '',
    timeLabel: '5:00 PM',
    dateLabel: 'Mon, Aug 3',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Draft',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    origin: 'agent',
    backendDraftId: `srv-${id}`,
    ...over,
  };
}

function dayIdAhead(daysAhead: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const FROM_DAY = '2026-08-03';

function seedDays(slots: OrganicCalendarDraft[]): void {
  useCalendarStore.setState({
    days: [
      { id: FROM_DAY, label: 'Mon', dateLabel: 'Aug 3', suggestedTimes: [], slots },
      { id: '2026-08-04', label: 'Tue', dateLabel: 'Aug 4', suggestedTimes: [], slots: [] },
    ],
    selectedDraftId: null,
    selectedDraftIds: [],
  });
}

function findDraft(id: string): { dayId: string; draft: OrganicCalendarDraft } | null {
  for (const day of useCalendarStore.getState().days) {
    const found = day.slots.find((s) => s.id === id);
    if (found) return { dayId: day.id, draft: found };
  }
  return null;
}

describe('useRescheduleDraft', () => {
  beforeEach(() => {
    requestCalls.length = 0;
    requestImpl = async () => ({});
    request.mockClear();
    show.mockClear();
  });

  it('persists the new day + the chip’s existing time-of-day', async () => {
    seedDays([draft('a', { timeLabel: '5:00 PM' })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target);
    });

    expect(requestCalls).toHaveLength(1);
    const body = requestCalls[0]?.body;
    // The shared field-edit route, so a manual and an agent draft move identically.
    expect(requestCalls[0]?.path).toBe(`/api/organic/calendar/drafts/srv-a/fields`);
    expect(body?.dayId).toBe(target);
    expect(body?.timeOfDay).toBe('17:00');
    // Optimistic move landed the draft on the target day.
    expect(findDraft('a')?.dayId).toBe(target);
  });

  // The past guard now lives server-side, in the one place that composes the
  // instant. The client sends the day and the time-of-day the user chose; inventing
  // a floored timestamp here as well is what let the two sides disagree.
  it('sends the target day and chip time verbatim, leaving the past guard to the server', async () => {
    seedDays([draft('a', { timeLabel: '9:00 AM' })]);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', '2020-01-01');
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body?.dayId).toBe('2020-01-01');
    expect(requestCalls[0]?.body?.timeOfDay).toBe('09:00');
  });

  it('rolls back the draft to its origin day + label when the PATCH rejects', async () => {
    seedDays([draft('a', { dateLabel: 'Mon, Aug 3' })]);
    requestImpl = async () => {
      throw new Error('500');
    };
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target);
    });

    const after = findDraft('a');
    expect(after?.dayId).toBe(FROM_DAY);
    expect(after?.draft.dateLabel).toBe('Mon, Aug 3');
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0]?.variant).toBe('error');
  });

  // Anti-drift: the canonical time-of-day this hook sends must be the one the
  // Backend's own move helper derives, so the UI has not grown its own arithmetic.
  it('normalizes the chip time through the shared @continuum/contracts vocabulary', async () => {
    seedDays([draft('a', { timeLabel: '5:00 PM' })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target);
    });

    const sentTimeOfDay = requestCalls[0]?.body?.timeOfDay;
    const backendMove = movePlannerDraftToDay({
      fromIso: plannerInstantFromDayTime({ dayId: FROM_DAY, timeOfDay: '5:00 PM' }),
      targetDayId: target,
    });
    expect(sentTimeOfDay).toBe(backendMove?.timeOfDay);
    expect(sentTimeOfDay).toBe('17:00');
  });

  // A manual drag used to be left entirely to the browser autosave, which did not
  // persist the move — so the draft silently snapped back to its original day. The
  // field-edit route rewrites `slot_data.dayId` server-side, so it persists now.
  it('DOES PATCH a manual-origin draft — the autosave never persisted the move', async () => {
    seedDays([draft('a', { origin: 'manual' })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target);
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.path).toBe('/api/organic/calendar/drafts/srv-a/fields');
    expect(findDraft('a')?.dayId).toBe(target);
  });

  it('DOES PATCH a non-manual draft that carries a backendDraftId', async () => {
    seedDays([draft('a', { origin: 'agent', backendDraftId: 'srv-a' })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target);
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.path).toContain('srv-a');
  });

  it('rescheduleMany respects the concurrency cap', async () => {
    const many = Array.from({ length: 6 }, (_, i) => draft(`m${i}`));
    seedDays(many);
    let inFlight = 0;
    let maxInFlight = 0;
    requestImpl = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return {};
    };
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.rescheduleMany(
        many.map((m) => m.id),
        target,
      );
    });

    expect(requestCalls).toHaveLength(6);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    // All six moved to the (materialized) target day.
    expect(
      useCalendarStore
        .getState()
        .days.find((d) => d.id === target)
        ?.slots.map((s) => s.id)
        .sort(),
    ).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });
});
