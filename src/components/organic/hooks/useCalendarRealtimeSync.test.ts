import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { PostgresChangesSubscription } from '@/lib/supabase/realtime';

const requestCalendarRefetch = mock();
const unsubscribe = mock();
const subscriptions: PostgresChangesSubscription[] = [];

mock.module('@/lib/organic/store', () => createCalendarStoreStub({ requestCalendarRefetch }));

mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: mock((subscription: PostgresChangesSubscription) => {
    subscriptions.push(subscription);
    return unsubscribe;
  }),
}));

import { useCalendarRealtimeSync } from './useCalendarRealtimeSync';

const DEBOUNCE_MS = 400;
const PAST_DEBOUNCE_MS = DEBOUNCE_MS + 60;

const latestBinding = () => {
  const subscription = subscriptions.at(-1);
  if (!subscription) throw new Error('nothing subscribed');
  const binding = subscription.bindings[0];
  if (!binding) throw new Error('subscription registered no bindings');
  return binding;
};

/** Real timers: the hook debounces on setTimeout, and a frozen clock cannot advance it. */
const settleDebounce = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PAST_DEBOUNCE_MS));
  });

beforeEach(() => {
  requestCalendarRefetch.mockClear();
  unsubscribe.mockClear();
  subscriptions.length = 0;
});

afterEach(() => {
  cleanup();
});

describe('useCalendarRealtimeSync', () => {
  it('binds the brand drafts table on the shared realtime seam', () => {
    renderHook(() => useCalendarRealtimeSync({ brandProfileId: 'brand-1' }));

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.label).toBe('organic-calendar-drafts-brand-1');
    expect(latestBinding()).toMatchObject({
      event: '*',
      schema: 'organic',
      table: 'organic_calendar_drafts',
      filter: 'brand_id=eq.brand-1',
    });
  });

  it('subscribes to nothing without a brand', () => {
    renderHook(() => useCalendarRealtimeSync({}));

    expect(subscriptions).toHaveLength(0);
  });

  it('bumps the refetch nonce once a write settles', async () => {
    renderHook(() => useCalendarRealtimeSync({ brandProfileId: 'brand-1' }));

    act(() => {
      latestBinding().onRow({ id: 'draft-1' });
    });
    expect(requestCalendarRefetch).not.toHaveBeenCalled();

    await settleDebounce();

    expect(requestCalendarRefetch).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of writes into a single bump', async () => {
    renderHook(() => useCalendarRealtimeSync({ brandProfileId: 'brand-1' }));

    act(() => {
      const binding = latestBinding();
      binding.onRow({ id: 'draft-1' });
      binding.onRow({ id: 'draft-1' });
      binding.onRow({ id: 'draft-1' });
    });
    await settleDebounce();

    expect(requestCalendarRefetch).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCalendarRealtimeSync({ brandProfileId: 'brand-1' }));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('drops a debounce still in flight at unmount', async () => {
    const { unmount } = renderHook(() => useCalendarRealtimeSync({ brandProfileId: 'brand-1' }));

    act(() => {
      latestBinding().onRow({ id: 'draft-1' });
    });
    unmount();
    await settleDebounce();

    expect(requestCalendarRefetch).not.toHaveBeenCalled();
  });

  it('resubscribes against the new brand when the brand changes', () => {
    const { rerender } = renderHook(
      ({ brandProfileId }: { brandProfileId: string }) =>
        useCalendarRealtimeSync({ brandProfileId }),
      { initialProps: { brandProfileId: 'brand-1' } },
    );

    rerender({ brandProfileId: 'brand-2' });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]?.label).toBe('organic-calendar-drafts-brand-2');
    expect(latestBinding().filter).toBe('brand_id=eq.brand-2');
  });
});
