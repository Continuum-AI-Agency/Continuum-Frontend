import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { movePlannerDraftToDay, plannerInstantFromDayTime } from '@continuum/contracts';
import { act, renderHook } from '@testing-library/react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useCalendarStore } from '@/lib/organic/store';

type RequestOptions = {
  path: string;
  method?: string;
  body?: {
    dayId?: string;
    timeOfDay?: string;
    expected_updated_at?: string | null;
    platform?: string;
    accountId?: string | null;
  };
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

// The hook must never write the row from the browser: a Supabase client import is the
// regression this mock catches.
const supabaseClient = mock(() => {
  throw new Error('the reschedule hook wrote the row from the browser');
});
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: supabaseClient }));

// Imported AFTER the module mocks so the hook binds to them.
const { retargetDraft, useRescheduleDraft } = await import('./useRescheduleDraft');

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

describe('retargetDraft', () => {
  it('takes the destination platform and its default account', () => {
    const next = retargetDraft(draft('a', { platforms: ['facebook'], targetAccountId: 'acct-fb' }), {
      platform: 'instagram',
      accountId: 'acct-ig',
    });
    expect(next?.platforms).toEqual(['instagram']);
    expect(next?.targetAccountId).toBe('acct-ig');
  });

  // Production 2026-09-22: an Instagram draft dragged into the TikTok row kept its IG
  // account, and every scheduled publish was refused as "not linked to this brand".
  it("drops the source platform's account when the destination has no default", () => {
    const next = retargetDraft(draft('a', { platforms: ['instagram'], targetAccountId: 'acct-ig' }), {
      platform: 'tiktok',
      accountId: undefined,
    });
    expect(next?.platforms).toEqual(['tiktok']);
    expect(next?.targetAccountId).toBeUndefined();
  });

  it('keeps a chosen account when the primary platform stays', () => {
    const next = retargetDraft(
      draft('a', { platforms: ['instagram', 'facebook'], targetAccountId: 'acct-ig-second' }),
      { platform: 'instagram', accountId: 'acct-ig' },
    );
    expect(next?.platforms).toEqual(['instagram']);
    expect(next?.targetAccountId).toBe('acct-ig-second');
  });

  it('changes nothing for a drop on its own row', () => {
    expect(retargetDraft(draft('a'), { platform: 'instagram', accountId: 'acct-ig' })).toBeNull();
  });

  // Publish reads its targets from groupMembers, so a restamp that left them would post
  // to the old platform.
  it('moves the single group member with the draft', () => {
    const member = { backendDraftId: 'srv-a', platform: 'facebook' as const, status: 'draft' as const };
    const next = retargetDraft(draft('a', { platforms: ['facebook'], groupMembers: [member] }), {
      platform: 'instagram',
      accountId: undefined,
    });
    expect(next?.groupMembers).toEqual([{ ...member, platform: 'instagram' }]);
  });

  it('leaves a fan-out group alone: one card is several rows', () => {
    const members = (['instagram', 'facebook'] as const).map((platform) => ({
      backendDraftId: `srv-${platform}`,
      platform,
      status: 'draft' as const,
    }));
    expect(
      retargetDraft(draft('a', { platforms: ['instagram', 'facebook'], groupMembers: members }), {
        platform: 'tiktok',
        accountId: undefined,
      }),
    ).toBeNull();
  });
});

describe('useRescheduleDraft — a drop on another platform row', () => {
  const RETARGET = { draftId: 'a', platform: 'instagram' as const, accountId: 'acct-ig' };

  beforeEach(() => {
    requestCalls.length = 0;
    requestImpl = async () => ({ updated_at: 'T1' });
    supabaseClient.mockClear();
    show.mockClear();
  });

  // Gating #1/#15: the platform used to be written straight to Supabase from the browser.
  it('sends the platform, its account and the day in ONE field-route PATCH', async () => {
    seedDays([draft('a', { platforms: ['facebook'], targetAccountId: 'acct-fb', updatedAt: 'T0' })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', target, RETARGET);
    });

    expect(supabaseClient).not.toHaveBeenCalled();
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.path).toContain('/srv-a/fields');
    expect(requestCalls[0]?.body).toMatchObject({
      platform: 'instagram',
      accountId: 'acct-ig',
      dayId: target,
      expected_updated_at: 'T0',
    });
    // The store says what the row now says, with the CAS token the write left.
    const after = findDraft('a');
    expect(after?.dayId).toBe(target);
    expect(after?.draft.platforms).toEqual(['instagram']);
    expect(after?.draft.targetAccountId).toBe('acct-ig');
    expect(after?.draft.updatedAt).toBe('T1');
  });

  it('retargets a drop on the same day with the platform alone', async () => {
    seedDays([draft('a', { platforms: ['facebook'] })]);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', FROM_DAY, RETARGET);
    });

    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body?.platform).toBe('instagram');
    expect(requestCalls[0]?.body?.dayId).toBeUndefined();
    expect(findDraft('a')?.dayId).toBe(FROM_DAY);
    expect(findDraft('a')?.draft.platforms).toEqual(['instagram']);
  });

  it('sends a null account when the destination platform has none, never the old one', async () => {
    seedDays([draft('a', { platforms: ['facebook'], targetAccountId: 'acct-fb' })]);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', FROM_DAY, { ...RETARGET, accountId: undefined });
    });

    expect(requestCalls[0]?.body?.accountId).toBeNull();
  });

  it('restores day and platform when the route refuses the write', async () => {
    requestImpl = async () => {
      throw new Error('stale_draft');
    };
    seedDays([draft('a', { platforms: ['facebook'], targetAccountId: 'acct-fb' })]);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.reschedule('a', dayIdAhead(20), RETARGET);
    });

    const after = findDraft('a');
    expect(after?.dayId).toBe(FROM_DAY);
    expect(after?.draft.platforms).toEqual(['facebook']);
    expect(after?.draft.targetAccountId).toBe('acct-fb');
    expect(show.mock.calls[0]?.[0]?.variant).toBe('error');
  });

  it('retargets only the dragged draft of a selection', async () => {
    seedDays([draft('a', { platforms: ['facebook'] }), draft('b', { platforms: ['facebook'] })]);
    const target = dayIdAhead(20);
    const { result } = renderHook(() => useRescheduleDraft());

    await act(async () => {
      await result.current.rescheduleMany(['a', 'b'], target, RETARGET);
    });

    expect(requestCalls.filter((call) => call.body?.platform !== undefined)).toHaveLength(1);
    expect(findDraft('a')?.draft.platforms).toEqual(['instagram']);
    expect(findDraft('b')?.draft.platforms).toEqual(['facebook']);
    expect(findDraft('b')?.dayId).toBe(target);
  });
});
