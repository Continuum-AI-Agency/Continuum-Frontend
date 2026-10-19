import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';

import { publishAccountsKey } from '@/lib/organic/publishTargets';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = vi.fn();
const updateDraftMock = vi.fn();
const BRAND_ID = '32841a24-9e31-480c-8a3a-7ebc3cde0569';

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft: updateDraftMock,
    accountContext: { accountIds: {}, brandId: BRAND_ID },
  }),
);

import { useApproveScheduleDraft } from './useApproveScheduleDraft';

const API_BASE = 'https://api.trycontinuum.ai';

const candidate = (id: string, platform: string, handle: string) => ({
  id,
  platform,
  handle,
  displayName: null,
  avatarUrl: null,
  needsReauth: false,
  isDefault: true,
});

// The brand's posting accounts, already in the cache: the toast names them, never their ids.
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(publishAccountsKey(BRAND_ID), {
    accounts: [
      candidate('acct-ig', 'instagram', 'acme_a'),
      candidate('acct-tt', 'tiktok', 'acme_tt'),
    ],
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

const render = () => renderHook(() => useApproveScheduleDraft(), { wrapper });

const draft = {
  id: 'placement-1',
  backendDraftId: 'draft-1',
  status: 'draft',
  platforms: ['instagram'],
  targetAccountId: 'acct-ig',
  dateLabel: 'Tue, Oct 20',
  timeLabel: '9:00 AM',
  groupMembers: [
    { backendDraftId: 'draft-1', platform: 'instagram', status: 'draft', accountId: 'acct-ig' },
  ],
} as never;

const group = {
  ...(draft as object),
  platforms: ['instagram', 'tiktok'],
  groupId: 'group-1',
  groupMembers: [
    { backendDraftId: 'draft-1', platform: 'instagram', status: 'draft', accountId: 'acct-ig' },
    {
      backendDraftId: 'draft-2',
      platform: 'tiktok',
      status: 'draft',
      accountId: 'acct-tt',
      draft: {
        id: 'placement-1::tiktok',
        backendDraftId: 'draft-2',
        status: 'draft',
        platforms: ['tiktok'],
        targetAccountId: 'acct-tt',
      },
    },
  ],
} as never;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const approved = (ids: Array<[string, string]>) =>
  jsonResponse(200, {
    groupId: 'group-1',
    status: 'approved',
    results: ids.map(([id, platform]) => ({
      id,
      platform,
      outcome: 'approved',
      reason: null,
      message: null,
    })),
  });

describe('useApproveScheduleDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives the gated backend chain: POST group/approve then PATCH status=scheduled', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(approved([['draft-1', 'instagram']]))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'draft-1', status: 'scheduled' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    let outcome = false;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(draft);
    });

    expect(outcome).toBe(true);
    const [approveUrl, approveInit] = fetchMock.mock.calls[0];
    expect(approveUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1/group/approve`);
    expect(approveInit.method).toBe('POST');
    expect(approveInit.body).toBeUndefined();
    const [scheduleUrl, scheduleInit] = fetchMock.mock.calls[1];
    expect(scheduleUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1`);
    expect(scheduleInit.method).toBe('PATCH');
    // scheduled_date must be ABSENT (the route treats its presence as an overwrite).
    expect(JSON.parse(scheduleInit.body as string)).toEqual({ status: 'scheduled' });
    expect(updateDraftMock).toHaveBeenCalledWith('placement-1', expect.any(Function));
  });

  // End state 9: the approve toast names where the post goes, by handle.
  it('approves and schedules EVERY member of a group with one toast naming the accounts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        approved([
          ['draft-1', 'instagram'],
          ['draft-2', 'tiktok'],
        ]),
      )
      .mockResolvedValue(jsonResponse(200, { status: 'scheduled' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    await act(async () => {
      await result.current.approveAndSchedule(group);
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      [`${API_BASE}/api/organic/calendar/drafts/draft-1/group/approve`, 'POST'],
      [`${API_BASE}/api/organic/calendar/drafts/draft-1`, 'PATCH'],
      [`${API_BASE}/api/organic/calendar/drafts/draft-2`, 'PATCH'],
    ]);
    expect(updateDraftMock.mock.calls.map(([id]) => id)).toEqual([
      'placement-1',
      'placement-1::tiktok',
    ]);
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      title: 'Approved & scheduled',
      description: 'Scheduled for Tue, Oct 20 at 9:00 AM · Instagram @acme_a, TikTok @acme_tt',
      variant: 'success',
    });
  });

  it('never re-schedules a member that is already live', async () => {
    const g = group as unknown as { groupMembers: { draft?: { status: string } }[] };
    const partlyLive = {
      ...g,
      groupMembers: g.groupMembers.map((member, index) =>
        index === 1 && member.draft
          ? { ...member, status: 'published', draft: { ...member.draft, status: 'published' } }
          : member,
      ),
    } as never;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(approved([['draft-1', 'instagram']]))
      .mockResolvedValue(jsonResponse(200, { status: 'scheduled' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    let ok = false;
    await act(async () => {
      ok = await result.current.approveAndSchedule(partlyLive);
    });

    expect(ok).toBe(true);
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      [`${API_BASE}/api/organic/calendar/drafts/draft-1/group/approve`, 'POST'],
      [`${API_BASE}/api/organic/calendar/drafts/draft-1`, 'PATCH'],
    ]);
  });

  // All or nothing: one blocked member approves none, and the user reads why, per platform.
  it('shows each blocked member and schedules nothing when the group gate refuses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(422, {
        groupId: 'group-1',
        status: 'blocked',
        results: [
          {
            id: 'draft-1',
            platform: 'instagram',
            outcome: 'approved',
            reason: null,
            message: null,
          },
          {
            id: 'draft-2',
            platform: 'tiktok',
            outcome: 'blocked',
            reason: 'account_missing',
            message: 'Choose which TikTok account posts this: @acme_tt or @acme_tt2',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(group);
    });

    expect(outcome).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(showMock.mock.calls[0][0]).toMatchObject({
      title: 'Approval blocked',
      description: 'TikTok: Choose which TikTok account posts this: @acme_tt or @acme_tt2',
      variant: 'error',
    });
  });

  it('hands a silent caller the gate reason instead of a toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(422, {
          error: 'not_publishable',
          reason: 'caption_missing',
          message: 'This draft has no caption — add copy before publishing',
        }),
      ),
    );
    const onFailure = vi.fn();

    const { result } = render();
    await act(async () => {
      await result.current.approveAndSchedule(draft, { silent: true, onFailure });
    });

    expect(onFailure).toHaveBeenCalledWith(
      'This draft has no caption — add copy before publishing',
    );
    expect(showMock).not.toHaveBeenCalled();
  });

  it('reports a scheduling failure without flipping the local store', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(approved([['draft-1', 'instagram']]))
      .mockResolvedValueOnce(
        jsonResponse(422, { error: 'approval_required', message: 'Draft must be approved' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
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

  // A mid-loop failure used to leave the members before it scheduled: the poller then
  // published the post on some of its platforms while the user read "Scheduling failed".
  it('returns already-scheduled members to draft and says nothing was scheduled when one fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        approved([
          ['draft-1', 'instagram'],
          ['draft-2', 'tiktok'],
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: 'scheduled' }))
      .mockResolvedValueOnce(jsonResponse(422, { message: 'Draft must be approved' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'draft' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule(group);
    });

    expect(outcome).toBe(false);
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body ?? null]),
    ).toEqual([
      [`${API_BASE}/api/organic/calendar/drafts/draft-1/group/approve`, 'POST', null],
      [`${API_BASE}/api/organic/calendar/drafts/draft-1`, 'PATCH', '{"status":"scheduled"}'],
      [`${API_BASE}/api/organic/calendar/drafts/draft-2`, 'PATCH', '{"status":"scheduled"}'],
      [`${API_BASE}/api/organic/calendar/drafts/draft-1`, 'PATCH', '{"status":"draft"}'],
    ]);
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      title: 'Scheduling failed',
      description: 'Nothing was scheduled. TikTok: Draft must be approved',
      variant: 'error',
    });
  });

  it('refuses a draft with no backendDraftId (nothing on the server to approve)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = render();
    let outcome = true;
    await act(async () => {
      outcome = await result.current.approveAndSchedule({ id: 'local-only' } as never);
    });

    expect(outcome).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
