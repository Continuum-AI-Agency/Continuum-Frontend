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

import { useApproveScheduleDraft } from './useApproveScheduleDraft';

const API_BASE = 'https://api.trycontinuum.ai';

const draft = {
  id: 'placement-1',
  backendDraftId: 'draft-1',
  status: 'draft',
  platforms: ['instagram'],
} as never;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

describe('useApproveScheduleDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives the gated backend chain: POST approve then PATCH status=scheduled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'approved' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'scheduled' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApproveScheduleDraft());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(draft);
    });

    expect(outcome).toBe(true);
    const [approveUrl, approveInit] = fetchMock.mock.calls[0];
    expect(approveUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1/approve`);
    expect(approveInit.method).toBe('POST');
    expect(approveInit.body).toBeUndefined();
    expect(approveInit.headers).not.toHaveProperty('Content-Type');
    const [scheduleUrl, scheduleInit] = fetchMock.mock.calls[1];
    expect(scheduleUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1`);
    expect(scheduleInit.method).toBe('PATCH');
    expect(scheduleInit.headers).toMatchObject({ 'Content-Type': 'application/json' });
    // scheduled_date must be ABSENT (the route treats its presence as an overwrite).
    expect(JSON.parse(scheduleInit.body as string)).toEqual({ status: 'scheduled' });
    // Store reflects the server-persisted transition.
    expect(updateDraftMock).toHaveBeenCalledWith('placement-1', expect.any(Function));
  });

  it('stops (no PATCH, no store flip) when the approve gate rejects the draft', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(422, {
        error: 'not_publishable',
        reason: 'media_missing',
        message: 'No generated media artifact found for this draft',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApproveScheduleDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(draft);
    });

    expect(outcome).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approval blocked', variant: 'error' }),
    );
  });

  it('continues to scheduling when approve returns invalid_state (already approved)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(422, { error: 'invalid_state', message: 'Draft cannot be approved' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'scheduled' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApproveScheduleDraft());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(draft);
    });

    expect(outcome).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a scheduling failure without flipping the local store', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'approved' }))
      .mockResolvedValueOnce(
        jsonResponse(422, { error: 'approval_required', message: 'Draft must be approved' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApproveScheduleDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(draft);
    });

    expect(outcome).toBe(false);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Scheduling failed', variant: 'error' }),
    );
  });

  it('refuses a draft with no backendDraftId (nothing on the server to approve)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApproveScheduleDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule({ id: 'local-only' } as never);
    });

    expect(outcome).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
