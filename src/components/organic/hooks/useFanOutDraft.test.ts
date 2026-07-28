import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, renderHook } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = vi.fn();
const requestCalendarRefetchMock = vi.fn();
const approveAndScheduleMock = vi.fn(async () => true);

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

vi.mock('@/components/organic/hooks/useApproveScheduleDraft', () => ({
  useApproveScheduleDraft: () => ({
    approveAndSchedule: approveAndScheduleMock,
    isApproving: false,
  }),
}));

vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    requestCalendarRefetch: requestCalendarRefetchMock,
    accountContext: {
      accountIds: {
        instagram: '17841400008460056',
        linkedin: 'urn:li:organization:2414183',
      },
      brandId: '32841a24-9e31-480c-8a3a-7ebc3cde0569',
    },
  }),
);

import { useFanOutDraft } from './useFanOutDraft';

const API_BASE = 'https://api.trycontinuum.ai';
// A real v4 uuid: Zod 4's .uuid() enforces the version + variant nibbles.
const GROUP_ID = '3f1c9a2e-6b5d-4a71-9c2f-8d0e1a2b3c4d';

const draft = {
  id: 'placement-1',
  backendDraftId: 'row-instagram',
  platforms: ['instagram', 'linkedin'],
  format: 'Post',
  captionPreview: 'One post, two destinations',
} as never;

const fanOutResponse = {
  sourceId: 'row-instagram',
  sourcePlatform: 'instagram',
  groupId: GROUP_ID,
  members: [
    {
      id: 'row-instagram',
      platform: 'instagram',
      clientKey: 'post-abc',
      platformAccountId: '17841400008460056',
      status: 'draft',
      isSource: true,
      created: false,
    },
    {
      id: 'row-linkedin',
      platform: 'linkedin',
      clientKey: 'post-abc::linkedin',
      platformAccountId: 'urn:li:organization:2414183',
      status: 'draft',
      isSource: false,
      created: true,
    },
  ],
  removed: [],
  retained: [],
};

describe('useFanOutDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approveAndScheduleMock.mockImplementation(async () => true);
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the full selection with explicit per-platform accounts, then approves every member', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fanOutResponse });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFanOutDraft());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.fanOutAndApprove(draft);
    });

    expect(outcome).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE}/api/organic/calendar/drafts/row-instagram/fan-out`,
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // The request is the STATE of the multi-select, not a delta — that is what makes
    // deselection expressible.
    expect(body.platforms).toEqual(['instagram', 'linkedin']);
    // Fan-out never guesses an account: a wrong id would publish to the wrong place.
    expect(body.accounts).toEqual({
      instagram: '17841400008460056',
      linkedin: 'urn:li:organization:2414183',
    });

    expect(approveAndScheduleMock).toHaveBeenCalledTimes(2);
    expect(approveAndScheduleMock.mock.calls[0][0].backendDraftId).toBe('row-instagram');
    expect(approveAndScheduleMock.mock.calls[1][0].backendDraftId).toBe('row-linkedin');
    // Silent per-member approvals: one summary toast beats N toasts.
    expect(approveAndScheduleMock.mock.calls[0][1]).toEqual({ silent: true });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0].title).toBe('Approved for 2 platforms');

    // The siblings are new rows; the grid only learns about them on a refetch.
    expect(requestCalendarRefetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives each member its own platform so a sibling cannot inherit the source platform', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fanOutResponse }),
    );

    const { result } = renderHook(() => useFanOutDraft());
    await act(async () => {
      await result.current.fanOutAndApprove(draft);
    });

    expect(approveAndScheduleMock.mock.calls[0][0].platforms).toEqual(['instagram']);
    expect(approveAndScheduleMock.mock.calls[1][0].platforms).toEqual(['linkedin']);
    // Only the source keeps the local draft id — a sibling must not overwrite the
    // source's store row mid-loop.
    expect(approveAndScheduleMock.mock.calls[0][0].id).toBe('placement-1');
    expect(approveAndScheduleMock.mock.calls[1][0].id).toBe('placement-1::linkedin');
  });

  it('reports a partial approval failure in one toast and returns false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fanOutResponse }),
    );
    approveAndScheduleMock.mockImplementation(
      async (member: { platforms: string[] }) => member.platforms[0] !== 'linkedin',
    );

    const { result } = renderHook(() => useFanOutDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.fanOutAndApprove(draft);
    });

    expect(outcome).toBe(false);
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0].title).toBe('Approved 1 of 2');
    expect(showMock.mock.calls[0][0].description).toContain('LinkedIn');
  });

  it('surfaces a refused fan-out and approves nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'source_published' }),
      }),
    );

    const { result } = renderHook(() => useFanOutDraft());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.fanOutAndApprove(draft);
    });

    expect(outcome).toBe(false);
    expect(approveAndScheduleMock).not.toHaveBeenCalled();
    expect(showMock.mock.calls[0][0].description).toContain('already live');
  });

  it('refuses to fan out a draft that was never persisted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFanOutDraft());
    await act(async () => {
      await result.current.fanOutAndApprove({ ...draft, backendDraftId: undefined } as never);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(showMock.mock.calls[0][0].title).toBe('Not saved yet');
  });
});
