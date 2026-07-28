import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = vi.fn();
const updateDraftMock = vi.fn();

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

// mock.module/vi.mock is process-wide: the shared stub answers keys this file does not
// name with a no-op, so sibling specs' hooks never receive `undefined` for a selector.
vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft: updateDraftMock,
    accountContext: {
      accountIds: {
        instagram: '17841400008460056',
        facebook: '1099123',
        linkedin: 'urn:li:organization:2414183',
      },
      brandId: '32841a24-9e31-480c-8a3a-7ebc3cde0569',
    },
  }),
);

import { usePublishGroup } from './usePublishGroup';

const API_BASE = 'https://api.trycontinuum.ai';
const BULK_URL = `${API_BASE}/api/organic/calendar/drafts/bulk-publish`;

function sseStream(frames: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const { event, data } of frames) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

const groupDraft = {
  id: 'placement-1',
  backendDraftId: 'row-instagram',
  status: 'scheduled',
  platforms: ['instagram', 'facebook', 'linkedin'],
  format: 'Post',
  captionPreview: 'One post, three destinations',
  hashtags: { high: [], medium: [], low: [] },
  publishingAssets: [
    { role: 'primary', kind: 'image', storageUrl: 'https://cdn.example/image.jpg' },
  ],
  groupMembers: [
    { backendDraftId: 'row-instagram', platform: 'instagram', status: 'scheduled' },
    { backendDraftId: 'row-facebook', platform: 'facebook', status: 'scheduled' },
    { backendDraftId: 'row-linkedin', platform: 'linkedin', status: 'scheduled' },
  ],
} as never;

const publishedFrame = (id: string, platform: string, postId: string) => ({
  event: 'published',
  data: { id, type: 'published', platform, postId, format: 'POST', accountId: 'acct' },
});

const failedFrame = (id: string, error: string, code: string) => ({
  event: 'failed',
  data: { id, type: 'failed', error, code },
});

describe('usePublishGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends one bulk-publish item per group member, keyed by its own row id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, body: sseStream([]) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    expect(fetchMock.mock.calls[0][0]).toBe(BULK_URL);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([
      'row-instagram',
      'row-facebook',
      'row-linkedin',
    ]);
    // Each row gets ITS platform's account. An Instagram account id on the LinkedIn
    // row would publish to the wrong place and only fail at the provider.
    expect(body.items.map((item: { platform: string }) => item.platform)).toEqual([
      'instagram',
      'facebook',
      'linkedin',
    ]);
    expect(body.items[2].accountId).toBe('urn:li:organization:2414183');
  });

  // Members publish concurrently, so their frames interleave. `id` is the ONLY thing
  // that says which platform a frame belongs to.
  it('routes interleaved per-item frames by id, not by arrival order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream([
          { event: 'started', data: { id: 'row-linkedin', type: 'started' } },
          publishedFrame('row-linkedin', 'linkedin', 'urn:li:share:7301'),
          { event: 'started', data: { id: 'row-instagram', type: 'started' } },
          publishedFrame('row-facebook', 'facebook', 'fb-9'),
          publishedFrame('row-instagram', 'instagram', 'ig-1'),
        ]),
      }),
    );

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    const byId = Object.fromEntries(
      result.current.members.map((member) => [member.draftId, member]),
    );
    expect(byId['row-instagram'].postId).toBe('ig-1');
    expect(byId['row-facebook'].postId).toBe('fb-9');
    expect(byId['row-linkedin'].postId).toBe('urn:li:share:7301');
    expect(result.current.members.every((member) => member.status === 'published')).toBe(true);
  });

  it('reports a partial failure as 2 published + 1 failed in exactly ONE summary toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream([
          publishedFrame('row-instagram', 'instagram', 'ig-1'),
          publishedFrame('row-facebook', 'facebook', 'fb-9'),
          failedFrame('row-linkedin', 'LinkedIn rejected the post', 'token_expired'),
        ]),
      }),
    );

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    const published = result.current.members.filter((member) => member.status === 'published');
    const failed = result.current.members.filter((member) => member.status === 'failed');
    expect(published).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].platform).toBe('linkedin');

    // ONE toast for the whole group — not one per member.
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0].title).toBe('Published to 2 of 3');
    expect(showMock.mock.calls[0][0].description).toContain('LinkedIn');
    // Two posts really did go out; a hard error would read as "nothing published".
    expect(showMock.mock.calls[0][0].variant).toBe('warning');
  });

  it('re-sends ONLY the failed member on an explicit retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        body: sseStream([
          publishedFrame('row-instagram', 'instagram', 'ig-1'),
          publishedFrame('row-facebook', 'facebook', 'fb-9'),
          failedFrame('row-linkedin', 'LinkedIn rejected the post', 'rate_limited'),
        ]),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        body: sseStream([publishedFrame('row-linkedin', 'linkedin', 'urn:li:share:7301')]),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    // Nothing is retried on its own — the failure sat there until the user asked.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryMember('row-linkedin');
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryBody.items).toHaveLength(1);
    expect(retryBody.items[0].id).toBe('row-linkedin');
    // The two live posts must NOT be republished — that is how one click becomes
    // three live posts.
    expect(retryBody.items.map((item: { id: string }) => item.id)).not.toContain('row-instagram');
    expect(result.current.members.every((member) => member.status === 'published')).toBe(true);
  });

  it('treats an already_published frame as published, with no error toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream([
          publishedFrame('row-instagram', 'instagram', 'ig-1'),
          publishedFrame('row-facebook', 'facebook', 'fb-9'),
          // The backend's publish claim already owns this row: it is live, not broken.
          failedFrame('row-linkedin', 'Draft already published', 'already_published'),
        ]),
      }),
    );

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    const linkedin = result.current.members.find((member) => member.draftId === 'row-linkedin');
    expect(linkedin?.status).toBe('published');
    expect(linkedin?.error).toBeNull();
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0].variant).toBe('success');
  });

  // A publish is not idempotent, and a network error tells us NOTHING about whether the
  // posts went out. usePublishDraft documents the 2026-07-14 incident where an auto-retry
  // on exactly this failure produced three live Instagram posts; across a group that
  // multiplies by the member count.
  it('does NOT retry a network failure on its own', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 7000));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.members.every((member) => member.status === 'failed')).toBe(true);
    expect(showMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it('marks the draft published only when every member is live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream([
          publishedFrame('row-instagram', 'instagram', 'ig-1'),
          publishedFrame('row-facebook', 'facebook', 'fb-9'),
          publishedFrame('row-linkedin', 'linkedin', 'urn:li:share:7301'),
        ]),
      }),
    );

    const { result } = renderHook(() => usePublishGroup());
    await act(async () => {
      await result.current.publishGroup(groupDraft);
    });

    expect(updateDraftMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock.mock.calls[0][0]).toBe('placement-1');
  });
});
