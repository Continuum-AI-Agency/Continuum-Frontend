import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, renderHook } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = vi.fn();
const updateDraftMock = vi.fn();

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft: updateDraftMock,
  }),
);

import { useUnscheduleDraft } from './useUnscheduleDraft';

const API_BASE = 'https://api.trycontinuum.ai';

const scheduledDraft = {
  id: 'placement-1',
  backendDraftId: 'draft-1',
  status: 'scheduled',
  platforms: ['instagram'],
} as never;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe('useUnscheduleDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // REGRESSION: the planner card used to flip status locally only. The card read "Draft" while
  // the server row stayed 'scheduled', so the poller published a post the user had pulled.
  it('PATCHes status=draft on the server so the poller stops seeing the draft', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'draft' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUnscheduleDraft());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.unschedule(scheduledDraft);
    });

    expect(outcome).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'draft' });
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(updateDraftMock).toHaveBeenCalled();
  });

  it('does not flip local state when the server refuses, and says the post is still scheduled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(422, { message: 'Draft can no longer be edited.' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUnscheduleDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.unschedule(scheduledDraft);
    });

    expect(outcome).toBe(false);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not move back to draft', variant: 'error' }),
    );
  });

  it('does not flip local state on a network error — the post may still be scheduled', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUnscheduleDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.unschedule(scheduledDraft);
    });

    expect(outcome).toBe(false);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it('skips the request for a draft with no server row and flips locally', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUnscheduleDraft());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.unschedule({
        id: 'placement-2',
        backendDraftId: undefined,
        status: 'draft',
      } as never);
    });

    expect(outcome).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateDraftMock).toHaveBeenCalled();
  });
});
