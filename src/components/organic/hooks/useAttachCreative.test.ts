import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { ApiError } from '@/lib/api/errors';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

type RequestOptions = { path: string; method?: string; body?: Record<string, unknown> };
const requestCalls: RequestOptions[] = [];
let requestImpl: () => Promise<unknown> = async () => ({ updated_at: 'T1' });
const request = mock((opts: RequestOptions) => {
  requestCalls.push(opts);
  return requestImpl();
});
const show = mock(() => {});
const drafts = new Map<string, OrganicCalendarDraft>();
const updateDraft = (
  id: string,
  updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
) => {
  const current = drafts.get(id);
  if (current) drafts.set(id, updater(current));
};

mock.module('@/lib/api/http', () => ({ request, http: { request } }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
mock.module('@/lib/organic/store', () => createCalendarStoreStub({ updateDraft }));

const { useAttachCreative } = await import('./useAttachCreative');

const asset = {
  role: 'primary',
  kind: 'image',
  bucket: 'brand-profile-assets',
  storagePath: 'b1/pick.png',
  storageUrl: 'https://storage.test/b1/pick.png',
} as NonNullable<OrganicCalendarDraft['publishingAssets']>[number];

function draft(id: string, backendDraftId: string): OrganicCalendarDraft {
  return {
    id,
    backendDraftId,
    updatedAt: 'T0',
    title: id,
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    publishingAssets: [],
    mediaSuggestion: { mediaStatus: 'pending' },
  };
}

beforeEach(() => {
  requestCalls.length = 0;
  requestImpl = async () => ({ updated_at: 'T1' });
  show.mockClear();
  drafts.clear();
});

describe('useAttachCreative', () => {
  it('saves the pick on every target through the field route, where publish reads it', async () => {
    const targets = [draft('a', 'srv-a'), draft('b', 'srv-b')];
    for (const target of targets) drafts.set(target.id, target);
    const attach = renderHook(() => useAttachCreative()).result.current;

    attach(targets, [asset]);

    await waitFor(() => expect(requestCalls).toHaveLength(2));
    expect(requestCalls.map((call) => call.path)).toEqual([
      '/api/organic/calendar/drafts/srv-a/fields',
      '/api/organic/calendar/drafts/srv-b/fields',
    ]);
    expect(requestCalls[0]?.body).toMatchObject({
      media: {
        publishingAssets: [asset],
        mediaSuggestion: { mediaStatus: 'user_supplied', url: 'b1/pick.png' },
      },
      expected_updated_at: 'T0',
    });
    await waitFor(() => expect(drafts.get('a')?.updatedAt).toBe('T1'));
    expect(drafts.get('b')?.publishingAssets).toEqual([asset]);
  });

  it('puts the old media back and says so when the save is refused', async () => {
    requestImpl = async () => {
      throw new ApiError('gone', 404);
    };
    const target = draft('a', 'srv-a');
    drafts.set(target.id, target);
    const attach = renderHook(() => useAttachCreative()).result.current;

    attach([target], [asset]);
    expect(drafts.get('a')?.publishingAssets).toEqual([asset]);

    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(requestCalls).toHaveLength(1);
    expect(drafts.get('a')?.publishingAssets).toEqual([]);
    expect(drafts.get('a')?.mediaSuggestion).toEqual({ mediaStatus: 'pending' });
  });
});
