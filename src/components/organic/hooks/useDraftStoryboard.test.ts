import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

// The HTTP client is the seam: the single-draft GET and the sign POST both go through it,
// so the test sees exactly which round trips the chat card costs.
const requestMock = mock((args: { path: string; method?: string; body?: unknown }) => {
  if (args.path.startsWith('/api/organic/calendar/drafts/')) return Promise.resolve(draftRow);
  const body = args.body as { path: string };
  return Promise.resolve({
    signedUrl: `https://fresh/${body.path}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const storeState: {
  days: { slots: OrganicCalendarDraft[] }[];
  backlogDrafts: OrganicCalendarDraft[];
} = { days: [], backlogDrafts: [] };
mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub(
    Object.defineProperties(
      { accountContext: { accountIds: {}, accountOptions: {}, brandId: 'brand-store' } },
      {
        days: { get: () => storeState.days, enumerable: true },
        backlogDrafts: { get: () => storeState.backlogDrafts, enumerable: true },
      },
    ),
  ),
);

const {
  draftRealizedMedia,
  draftStoryboardUrls,
  rankCardMedia,
  resetDraftFetches,
  selectDraftById,
  STORE_GRACE_MS,
  useDraftChatMedia,
} = await import('./useDraftStoryboard');
const { resetSignedUrlCache } = await import('@/lib/organic/hyperframeSign');

const slot = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: 'x', mediaCount: 0, ...over }) as unknown as OrganicCalendarDraft;

// A finished reel as the single-draft route returns it: raw row, signatures long lapsed.
const draftRow = {
  id: 'row-9',
  brand_id: 'brand-9',
  status: 'draft',
  scheduled_date: null,
  platform_account_id: null,
  slot_data: {},
  content_json: {
    content: { titleTopic: 'Launch reel' },
    creative: {
      mediaSuggestion: {
        mediaStatus: 'ready',
        storyboard: [
          { role: 'primary', bucket: 'b', storagePath: 'sb/1.png', storageUrl: 'https://old/sb' },
        ],
      },
    },
    publishingAssets: [
      {
        role: 'primary',
        kind: 'video',
        bucket: 'b',
        storagePath: 'reel/1.mp4',
        storageUrl: 'https://old/reel',
      },
    ],
  },
};

// Module mocks are process-wide in bun: hand the next spec the real modules back.
afterAll(() => mock.restore());

describe('selectDraftById', () => {
  const draft = slot({
    id: 'fe-1',
    backendDraftId: 'be-1',
    groupMembers: [
      { backendDraftId: 'be-1', platform: 'instagram', status: 'draft', clientKey: 'k' },
      { backendDraftId: 'be-2', platform: 'facebook', status: 'draft', clientKey: 'k' },
    ],
  } as Partial<OrganicCalendarDraft>);

  it('matches the FE id, the backend id, and a collapsed fan-out sibling', () => {
    const days = [{ slots: [draft] }];
    expect(selectDraftById(days, [], 'fe-1')).toBe(draft);
    expect(selectDraftById(days, [], 'be-1')).toBe(draft);
    expect(selectDraftById(days, [], 'be-2')).toBe(draft);
    expect(selectDraftById([], [draft], 'be-1')).toBe(draft);
    expect(selectDraftById(days, [], 'missing')).toBeUndefined();
    expect(selectDraftById(days, [], null)).toBeUndefined();
  });
});

describe('draftStoryboardUrls', () => {
  const draft = slot({
    mediaSuggestion: {
      storyboard: [
        { role: 'primary', bucket: 'b', storagePath: 'p1', storageUrl: 'https://signed/a' },
        {
          role: 'slide_2',
          bucket: 'b',
          storagePath: 'p2',
          storageUrl: 'data:image/png;base64,AAAA',
        },
      ],
    },
  });

  it('returns signed storyboard URLs and drops base64', () => {
    expect(draftStoryboardUrls(draft)).toEqual(['https://signed/a']);
  });

  it('prefers a URL minted this session over the one the draft carried', () => {
    expect(draftStoryboardUrls(draft, { p1: 'https://fresh/p1', p2: 'https://fresh/p2' })).toEqual([
      'https://fresh/p1',
      'https://fresh/p2',
    ]);
  });
});

describe('draftRealizedMedia', () => {
  it('keeps finished reels as video with their poster, in slide order', () => {
    const draft = slot({
      title: 'Launch',
      mediaSuggestion: {
        mediaStatus: 'ready',
        reel: { thumbnailUrl: 'https://signed/poster.jpg' },
      },
      publishingAssets: [
        {
          role: 'slide_2',
          kind: 'image',
          slideIndex: 2,
          storagePath: 'p2',
          storageUrl: 'https://signed/2',
        },
        {
          role: 'primary',
          kind: 'video',
          slideIndex: 1,
          storagePath: 'p1',
          storageUrl: 'https://signed/1',
        },
        { role: 'slide_3', kind: 'image', slideIndex: 3, storagePath: 'p3', storageUrl: 'data:x' },
      ],
    });
    expect(draftRealizedMedia(draft, 'd')).toEqual([
      {
        id: 'd:0',
        url: 'https://signed/1',
        kind: 'video',
        thumbnailUrl: 'https://signed/poster.jpg',
        name: 'Launch',
      },
      { id: 'd:1', url: 'https://signed/2', kind: 'image', name: 'Launch' },
    ]);
  });

  it('falls back to the generated reel, then the primary URL typed by the draft format', () => {
    const reel = slot({
      mediaSuggestion: {
        mediaStatus: 'ready',
        reel: { generated: true, signedUrl: 'https://signed/r' },
      },
    });
    expect(draftRealizedMedia(reel, 'd').map((m) => m.kind)).toEqual(['video']);

    const single = slot({
      format: 'Reel',
      mediaSuggestion: { mediaStatus: 'user_supplied', signedUrl: 'https://signed/own' },
    });
    expect(draftRealizedMedia(single, 'd')).toEqual([
      { id: 'd:0', url: 'https://signed/own', kind: 'video' },
    ]);
  });

  it('re-signs a single-image draft by its own pair, and never renders a bare path', () => {
    const single = slot({
      mediaSuggestion: {
        mediaStatus: 'ready',
        bucket: 'b',
        url: 'img/1.png',
        signedUrl: 'https://expired/1',
        assetUrl: 'img/1.png',
      },
    });
    expect(
      draftRealizedMedia(single, 'd', { 'img/1.png': 'https://fresh/img/1.png' })[0]?.url,
    ).toBe('https://fresh/img/1.png');
    const pathOnly = slot({
      mediaSuggestion: {
        mediaStatus: 'ready',
        bucket: 'b',
        url: 'img/1.png',
        assetUrl: 'img/1.png',
      },
    });
    expect(draftRealizedMedia(pathOnly, 'd')).toEqual([]);
  });

  it('is empty until the media is final', () => {
    const draft = slot({
      mediaSuggestion: { mediaStatus: 'generating', signedUrl: 'https://signed/x' },
      publishingAssets: [
        { role: 'primary', kind: 'image', storagePath: 'p', storageUrl: 'https://signed/p' },
      ],
    });
    expect(draftRealizedMedia(draft, 'd')).toEqual([]);
    expect(draftRealizedMedia(undefined, 'd')).toEqual([]);
  });
});

describe('rankCardMedia', () => {
  const realized = [{ id: 'r', url: 'https://signed/final.mp4', kind: 'video' as const }];
  const base = {
    idPrefix: 'p',
    realized: [],
    preview: ['https://live/1'],
    previewStale: false,
    storyboard: ['https://sb/1'],
  };

  it('final media beats everything', () => {
    expect(rankCardMedia({ ...base, realized }).source).toBe('realized');
  });

  it('a live preview beats the durable storyboard', () => {
    expect(rankCardMedia(base).media.map((m) => m.url)).toEqual(['https://live/1']);
  });

  it('a preview replayed from history never outranks the re-signed storyboard', () => {
    const ranked = rankCardMedia({ ...base, previewStale: true });
    expect(ranked.source).toBe('storyboard');
    expect(ranked.media.map((m) => m.url)).toEqual(['https://sb/1']);
  });

  it('a stale preview is still the last resort, so recovery has a tile to fail on', () => {
    expect(rankCardMedia({ ...base, previewStale: true, storyboard: [] }).source).toBe('stale');
  });

  it('names every preview tile', () => {
    expect(rankCardMedia({ ...base, format: 'Carousel' }).media[0]?.name).toBe(
      'Carousel preview 1 of 1',
    );
  });
});

describe('useDraftChatMedia', () => {
  beforeEach(() => {
    requestMock.mockClear();
    resetSignedUrlCache();
    resetDraftFetches();
    storeState.days = [];
    storeState.backlogDrafts = [];
  });
  afterEach(() => cleanup());

  const callsTo = (prefix: string) =>
    requestMock.mock.calls.filter(([args]) => args.path.startsWith(prefix)).length;

  it('answers from the calendar store with zero round trips', async () => {
    storeState.days = [
      {
        slots: [
          slot({
            backendDraftId: 'be-1',
            mediaSuggestion: {
              storyboard: [
                { role: 'primary', bucket: 'b', storagePath: 'p', storageUrl: 'https://signed/sb' },
              ],
            },
          }),
        ],
      },
    ];
    const { result } = renderHook(() => useDraftChatMedia('be-1'));
    expect(result.current.storyboard).toEqual(['https://signed/sb']);
    await new Promise((resolve) => setTimeout(resolve, STORE_GRACE_MS + 200));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('fetches a draft the store lacks by id, re-signs it, and shows its reel', async () => {
    const { result } = renderHook(() => useDraftChatMedia('row-9'));
    expect(result.current.realized).toEqual([]);

    await waitFor(() => expect(result.current.realized[0]?.url).toBe('https://fresh/reel/1.mp4'), {
      timeout: STORE_GRACE_MS + 2_000,
    });
    expect(result.current.realized[0]?.kind).toBe('video');
    expect(result.current.storyboard).toEqual(['https://fresh/sb/1.png']);
    expect(callsTo('/api/organic/calendar/drafts/row-9')).toBe(1);
    // Signed with the row's own brand, not whichever brand the planner has open.
    const signBodies = requestMock.mock.calls
      .map(([args]) => args.body as { brandId?: string } | undefined)
      .filter(Boolean);
    expect(signBodies.every((body) => body?.brandId === 'brand-9')).toBe(true);
  });

  it('every card showing the same missing draft shares one GET', async () => {
    const cards = [1, 2, 3].map(() => renderHook(() => useDraftChatMedia('row-9')));
    await waitFor(
      () => expect(cards.every(({ result }) => result.current.realized.length > 0)).toBe(true),
      { timeout: STORE_GRACE_MS + 2_000 },
    );
    expect(callsTo('/api/organic/calendar/drafts/row-9')).toBe(1);
  });

  it('is pending while the draft is looked up, and shows no URL the row carried unsigned', async () => {
    // Every URL any render would have mounted, not just the last one.
    const shown = new Set<string>();
    const { result } = renderHook(() => {
      const media = useDraftChatMedia('row-9');
      for (const url of [...media.storyboard, ...media.realized.map((m) => m.url)]) shown.add(url);
      return media;
    });
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false), {
      timeout: STORE_GRACE_MS + 2_000,
    });
    expect(shown.size).toBeGreaterThan(0);
    expect([...shown].filter((url) => url.startsWith('https://old/'))).toEqual([]);
  });

  it('a failed tile re-signs a store draft whose signature lapsed', async () => {
    storeState.days = [
      {
        slots: [
          slot({
            backendDraftId: 'be-1',
            mediaSuggestion: {
              storyboard: [
                {
                  role: 'primary',
                  bucket: 'b',
                  storagePath: 'sb/2.png',
                  storageUrl: 'https://expired/sb',
                },
              ],
            },
          }),
        ],
      },
    ];
    const failedPreview = { images: ['https://live/1'] };
    const { result, rerender } = renderHook(({ preview }) => useDraftChatMedia('be-1', preview), {
      initialProps: { preview: failedPreview },
    });
    expect(result.current.previewSuspect).toBe(false);

    act(() => result.current.recover());
    await waitFor(() => expect(result.current.storyboard).toEqual(['https://fresh/sb/2.png']));
    expect(result.current.previewSuspect).toBe(true);
    expect(callsTo('/api/organic/calendar/drafts/')).toBe(0);

    // The next live frame is a new preview: one failure does not demote it for good.
    rerender({ preview: { images: ['https://live/2'] } });
    expect(result.current.previewSuspect).toBe(false);
  });
});
