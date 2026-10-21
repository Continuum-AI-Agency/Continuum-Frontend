import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

// The media write goes through the real field-persistence hook; only the HTTP edge is
// faked, so the CAS token and the body it carries are the ones production would send.
type RequestOptions = { path: string; method?: string; body?: Record<string, unknown> };
const requestCalls: RequestOptions[] = [];
let requestImpl: (opts: RequestOptions) => Promise<unknown> = async () => ({});
const request = mock((opts: RequestOptions) => {
  requestCalls.push(opts);
  return requestImpl(opts);
});

// Intercept store so tests don't need a full Zustand provider.
// The shared stub answers unnamed keys with a no-op. mock.module is process-wide, so a
// bare `mock()` here hands `undefined` to every sibling spec's store selector.
mock.module('@/lib/organic/store', () => createCalendarStoreStub());

// The hook now reports a failed media write instead of swallowing it, so it needs a
// toast. Stubbed rather than wrapped in a provider to keep these tests hook-only.
const toastCalls: Array<{ title?: string; variant?: string }> = [];
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({
    show: (options: { title?: string; variant?: string }) => {
      toastCalls.push(options);
    },
  }),
}));

// shapeUserSuppliedMedia is pure — use the real implementation.
// creativeRefFromAsset is also pure.

// bun runs multiple test files in a single process and hoists mock.module() to
// collection time regardless of call site. OrganicDraftPreview.test.tsx formerly
// mocked this module's path at the top level, which poisoned our module cache.
// Fix: OrganicDraftPreview.test.tsx no longer mocks useDraftMediaPlacement —
// it lets the real hook run against its already-mocked @/lib/organic/store.
//
// Static imports are frozen at collection time in bun 1.x. We use late-bound
// variables loaded via dynamic import in beforeAll so that our own mock.restore()
// + re-register cycle picks up the correct (real) hook module before any test runs.

let useDraftMediaPlacement: (
  draftId: string,
) => ReturnType<typeof import('./useDraftMediaPlacement').useDraftMediaPlacement>;
let useCalendarStore: ReturnType<typeof mock> & {
  defaultImplementation: (s: (x: unknown) => unknown) => unknown;
  getState: () => unknown;
};
let stubGetState: () => unknown;
let previousHttp: Record<string, unknown>;

beforeAll(async () => {
  mock.restore();
  mock.module('@/lib/organic/store', () => createCalendarStoreStub());
  previousHttp = { ...(await import('@/lib/api/http')) };
  mock.module('@/lib/api/http', () => ({ request, http: { request } }));
  const hookMod = await import('./useDraftMediaPlacement');
  const storeMod = await import('@/lib/organic/store');
  useDraftMediaPlacement = hookMod.useDraftMediaPlacement;
  useCalendarStore = storeMod.useCalendarStore as typeof useCalendarStore;
  stubGetState = useCalendarStore.getState;
});

// This file drives the shared stub with mockImplementation. mock.module is process-wide,
// so leaving that implementation in place hands every later spec a store whose selectors
// return this file's fixture instead of their own. Same for getState and the http module.
afterAll(() => {
  useCalendarStore.mockImplementation(useCalendarStore.defaultImplementation);
  useCalendarStore.getState = stubGetState;
  mock.module('@/lib/api/http', () => previousHttp);
});

function makeImageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: 'brands/brand-1/img.jpg',
    fileName: 'img.jpg',
    mimeType: 'image/jpeg',
    source: 'upload',
    status: 'ready',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    signedUrl: 'https://cdn.example.com/img.jpg',
    ...overrides,
  };
}

function makeVideoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return makeImageAsset({
    id: 'asset-video',
    kind: 'video',
    fileName: 'vid.mp4',
    mimeType: 'video/mp4',
    ...overrides,
  });
}

describe('useDraftMediaPlacement', () => {
  let capturedUpdater: ((draft: unknown) => unknown) | null = null;
  let storedDraft: Record<string, unknown>;

  const mockUpdateDraft = mock((_draftId: string, updater: (draft: unknown) => unknown) => {
    capturedUpdater = updater;
    storedDraft = updater(storedDraft) as Record<string, unknown>;
  });

  beforeEach(() => {
    capturedUpdater = null;
    toastCalls.length = 0;
    requestCalls.length = 0;
    requestImpl = async () => ({});
    request.mockClear();
    // The save reads the draft back from the store at send time, as production does.
    useCalendarStore.getState = () => ({ days: [{ id: 'day-1', slots: [storedDraft] }] });
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'pending' },
      publishingAssets: [],
    };
    useCalendarStore.mockImplementation(
      (selector: (state: { updateDraft: typeof mockUpdateDraft }) => unknown) =>
        selector({ updateDraft: mockUpdateDraft }),
    );
    mockUpdateDraft.mockClear();
  });

  // place() — single image
  it('place() patches mediaSuggestion and publishingAssets for a single image', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const asset = makeImageAsset();

    await act(async () => {
      result.current.place([asset], { kind: 'single' });
    });

    expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string };
      publishingAssets: Array<{ kind: string; storagePath: string }>;
    };
    expect(draft.mediaSuggestion.mediaStatus).toBe('user_supplied');
    expect(draft.mediaSuggestion.kind).toBe('image');
    expect(draft.publishingAssets).toHaveLength(1);
    expect(draft.publishingAssets[0].kind).toBe('image');
    expect(draft.publishingAssets[0].storagePath).toBe('brands/brand-1/img.jpg');
  });

  // place() — video
  it('place() patches reel shape for a video asset', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const asset = makeVideoAsset();

    await act(async () => {
      result.current.place([asset], { kind: 'video' });
    });

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string; reel: { url: string } };
      publishingAssets: Array<{ kind: string }>;
    };
    expect(draft.mediaSuggestion.mediaStatus).toBe('user_supplied');
    expect(draft.mediaSuggestion.kind).toBe('reel');
    expect(draft.mediaSuggestion.reel.url).toBe('brands/brand-1/img.jpg');
    expect(draft.publishingAssets[0].kind).toBe('video');
  });

  // place() — multiple images → carousel
  it('place() shapes a carousel for multiple images', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const a1 = makeImageAsset({ id: 'a1', storagePath: 'p1.jpg' });
    const a2 = makeImageAsset({ id: 'a2', storagePath: 'p2.jpg' });

    await act(async () => {
      result.current.place([a1, a2], { kind: 'single' });
    });

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string };
      publishingAssets: Array<{ slideIndex: number }>;
    };
    expect(draft.mediaSuggestion.kind).toBe('carousel');
    expect(draft.mediaSuggestion.mediaStatus).toBe('user_supplied');
    expect(draft.publishingAssets).toHaveLength(2);
    expect(draft.publishingAssets[0].slideIndex).toBe(0);
    expect(draft.publishingAssets[1].slideIndex).toBe(1);
  });

  // undo()
  it('undo() restores the prior state after place()', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'pending' },
      publishingAssets: [],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const asset = makeImageAsset();

    // Place first.
    await act(async () => {
      result.current.place([asset], { kind: 'single' });
    });

    expect(result.current.canUndo).toBe(true);

    // Then undo.
    await act(async () => {
      result.current.undo();
    });

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string };
      publishingAssets: unknown[];
    };
    expect(draft.mediaSuggestion.mediaStatus).toBe('pending');
    expect(draft.publishingAssets).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  // Carousel slides carry their actual media kind.
  it('place() preserves mixed media when replacing one carousel slide with a video', async () => {
    storedDraft = {
      id: 'draft-1',
      format: 'CAROUSEL',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, assetId: 'i1', bucket: 'media-library', storagePath: 'i1.jpg', storageUrl: 'https://cdn/i1.jpg' },
        { kind: 'image', slideIndex: 1, assetId: 'i2', bucket: 'media-library', storagePath: 'i2.jpg', storageUrl: 'https://cdn/i2.jpg' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const video = makeVideoAsset();

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([video], { kind: 'carousel_slide', slideIndex: 0 });
    });

    expect(err).toBeNull();
    const assets = (storedDraft as { publishingAssets: Array<{ kind: string; slideIndex: number }> })
      .publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex);
    expect(assets.map((asset) => asset.kind)).toEqual(['video', 'image']);
    expect(mockUpdateDraft).toHaveBeenCalledTimes(1);
  });

  it('place() replaces one carousel position without dropping the other mixed slides', async () => {
    storedDraft = {
      id: 'draft-1',
      format: 'CAROUSEL',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        ...[1, 2, 3, 4, 5].map((n) => ({
          kind: 'image',
          slideIndex: n - 1,
          assetId: `i${n}`,
          bucket: 'media-library',
          storagePath: `i${n}.jpg`,
          storageUrl: `https://cdn/i${n}.jpg`,
        })),
        ...[1, 2].map((n) => ({
          kind: 'video',
          slideIndex: n + 4,
          assetId: `v${n}`,
          bucket: 'media-library',
          storagePath: `v${n}.mp4`,
          storageUrl: `https://cdn/v${n}.mp4`,
          mimeType: 'video/mp4',
        })),
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const replacement = makeVideoAsset({
      id: 'replacement',
      storagePath: 'replacement.mp4',
      signedUrl: 'https://cdn/replacement.mp4',
    });

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([replacement], { kind: 'carousel_slide', slideIndex: 5 });
    });

    expect(err).toBeNull();
    const draft = storedDraft as {
      format: string;
      publishingAssets: Array<{ assetId?: string; kind: string; slideIndex: number }>;
    };
    expect(draft.format).toBe('CAROUSEL');
    expect(draft.publishingAssets).toHaveLength(7);
    expect(draft.publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex).map((a) => a.assetId)).toEqual([
      'i1', 'i2', 'i3', 'i4', 'i5', 'replacement', 'v2',
    ]);
  });

  // empty selection
  it('place() returns empty_selection error when given an empty array', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([], { kind: 'single' });
    });

    expect(err?.type).toBe('empty_selection');
    expect(mockUpdateDraft).not.toHaveBeenCalled();
  });

  // reorderSlides
  it('reorderSlides() reindexes publishingAssets correctly', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'b' },
        { kind: 'image', slideIndex: 2, storagePath: 'c.jpg', storageUrl: 'c' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.reorderSlides(0, 2);
    });

    const draft = storedDraft as {
      publishingAssets: Array<{ slideIndex: number; storagePath: string }>;
    };
    const sorted = [...draft.publishingAssets].sort((a, b) => a.slideIndex - b.slideIndex);
    // a.jpg was at 0, moved to 2 — so order becomes b, c, a.
    expect(sorted[0].storagePath).toBe('b.jpg');
    expect(sorted[1].storagePath).toBe('c.jpg');
    expect(sorted[2].storagePath).toBe('a.jpg');
  });

  it('reorderSlides() reorders images and videos together by slide position', async () => {
    storedDraft = {
      id: 'draft-1',
      format: 'CAROUSEL',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'video', slideIndex: 1, storagePath: 'b.mp4', storageUrl: 'b' },
        { kind: 'image', slideIndex: 2, storagePath: 'c.jpg', storageUrl: 'c' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => result.current.reorderSlides(0, 2));

    const sorted = (storedDraft as { publishingAssets: Array<{ slideIndex: number; storagePath: string }> })
      .publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex);
    expect(sorted.map((asset) => asset.storagePath)).toEqual(['b.mp4', 'c.jpg', 'a.jpg']);
    expect(sorted.map((asset) => asset.slideIndex)).toEqual([0, 1, 2]);
  });

  // removeSlide — min 1 guard
  it('removeSlide() returns min_slides error when only one slide remains', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'only.jpg', storageUrl: 'u' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.removeSlide> = null;
    await act(async () => {
      err = result.current.removeSlide(0);
    });

    expect(err?.type).toBe('min_slides');
    // storedDraft must be unchanged (the updater returned `current`).
    const draft = storedDraft as { publishingAssets: unknown[] };
    expect(draft.publishingAssets).toHaveLength(1);
  });

  // removeSlide — by array position (the carousel strip passes its render index)
  it('removeSlide(position) removes the slide at that array position and reindexes', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'b' },
        { kind: 'image', slideIndex: 2, storagePath: 'c.jpg', storageUrl: 'c' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.removeSlide(1); // middle slide (b.jpg)
    });

    const draft = storedDraft as {
      publishingAssets: Array<{ slideIndex: number; storagePath: string }>;
    };
    const sorted = [...draft.publishingAssets].sort((a, b) => a.slideIndex - b.slideIndex);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].storagePath).toBe('a.jpg');
    expect(sorted[1].storagePath).toBe('c.jpg');
    expect(sorted[0].slideIndex).toBe(0);
    expect(sorted[1].slideIndex).toBe(1);
  });

  it('removeSlide() removes and reindexes a video slide in a mixed carousel', async () => {
    storedDraft = {
      id: 'draft-1',
      format: 'CAROUSEL',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'video', slideIndex: 1, storagePath: 'b.mp4', storageUrl: 'b' },
        { kind: 'image', slideIndex: 2, storagePath: 'c.jpg', storageUrl: 'c' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => result.current.removeSlide(1));

    const sorted = (storedDraft as { publishingAssets: Array<{ slideIndex: number; storagePath: string }> })
      .publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex);
    expect(sorted.map((asset) => asset.storagePath)).toEqual(['a.jpg', 'c.jpg']);
    expect(sorted.map((asset) => asset.slideIndex)).toEqual([0, 1]);
  });

  // replaceSlide — swaps one slide in place, preserving order
  it('replaceSlide(position, asset) swaps one slide and preserves the rest', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a', role: 'primary' },
        { kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'b', role: 'primary' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const replacement = makeImageAsset({
      id: 'new',
      storagePath: 'new.jpg',
      signedUrl: 'https://cdn/new.jpg',
    });

    await act(async () => {
      result.current.replaceSlide(1, replacement);
    });

    const draft = storedDraft as {
      publishingAssets: Array<{ slideIndex: number; storagePath: string }>;
    };
    const sorted = [...draft.publishingAssets].sort((a, b) => a.slideIndex - b.slideIndex);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].storagePath).toBe('a.jpg'); // untouched
    expect(sorted[1].storagePath).toBe('new.jpg'); // replaced in place
    expect(sorted[1].slideIndex).toBe(1);
  });

  // replaceSlide — supports video while preserving other slides.
  it('replaceSlide() replaces one image with a video and keeps the rest', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied' },
      format: 'CAROUSEL',
      publishingAssets: [
        { kind: 'image', slideIndex: 0, assetId: 'i1', storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'image', slideIndex: 1, assetId: 'i2', storagePath: 'b.jpg', storageUrl: 'b' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.replaceSlide> = null;
    await act(async () => {
      err = result.current.replaceSlide(0, makeVideoAsset());
    });

    expect(err).toBeNull();
    const assets = (storedDraft as { publishingAssets: Array<{ kind: string; slideIndex: number }> })
      .publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex);
    expect(assets.map((asset) => asset.kind)).toEqual(['video', 'image']);
    expect(assets).toHaveLength(2);
  });

  it('addSlide() appends a video after existing carousel media', async () => {
    storedDraft = {
      id: 'draft-1',
      format: 'CAROUSEL',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
        { kind: 'video', slideIndex: 1, storagePath: 'b.mp4', storageUrl: 'b' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => result.current.addSlide(makeVideoAsset({ id: 'v3', storagePath: 'c.mp4' })));

    const sorted = (storedDraft as { publishingAssets: Array<{ kind: string; slideIndex: number; storagePath: string }> })
      .publishingAssets.sort((a, b) => a.slideIndex - b.slideIndex);
    expect(sorted.map((asset) => [asset.kind, asset.storagePath])).toEqual([
      ['image', 'a.jpg'],
      ['video', 'b.mp4'],
      ['video', 'c.mp4'],
    ]);
  });

  // A post has one video slot, so a 2-video selection must be refused — not shaped
  // into a patch that keeps the first and silently discards the rest.
  it('place() refuses two videos instead of dropping one', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([makeVideoAsset(), makeVideoAsset({ id: 'asset-video-2' })], {
        kind: 'video',
      });
    });

    expect(err?.type).toBe('too_many_videos');
    expect(err?.message).toBe('Only one video per post.');
    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(result.current.error?.type).toBe('too_many_videos');
  });

  it('place() refuses a mixed image+video selection on the video slot', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([makeVideoAsset(), makeImageAsset()], { kind: 'video' });
    });

    expect(err?.type).toBe('invalid_kind');
    expect(mockUpdateDraft).not.toHaveBeenCalled();
  });

  it('place() carries the library poster into the reel so the preview can paint it', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.place([makeVideoAsset({ thumbnailUrl: 'https://cdn/vid-poster.jpg' })], {
        kind: 'video',
      });
    });

    const draft = storedDraft as {
      mediaSuggestion: { reel: { thumbnailUrl: string | null }; assetUrl: string | null };
    };
    expect(draft.mediaSuggestion.reel.thumbnailUrl).toBe('https://cdn/vid-poster.jpg');
  });

  // The absent-vs-null landmine: the patch is spread over the existing suggestion,
  // so a video attach that merely omits assetUrl leaves the old image showing.
  it('place() nulls a prior generation image when a video is attached', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: {
        mediaStatus: 'ready',
        kind: 'image',
        url: 'organic/old.png',
        assetUrl: 'https://cdn/old.png',
        signedUrl: 'https://cdn/old.png',
      },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'old.png', storageUrl: 'https://cdn/old.png' },
      ],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => {
      result.current.place([makeVideoAsset()], { kind: 'video' });
    });

    const draft = storedDraft as {
      mediaSuggestion: {
        url: string | null;
        assetUrl: string | null;
        signedUrl: string | null;
        reel: { url: string };
      };
      publishingAssets: Array<{ kind: string }>;
    };
    expect(draft.mediaSuggestion.url).toBeNull();
    expect(draft.mediaSuggestion.assetUrl).toBeNull();
    expect(draft.mediaSuggestion.signedUrl).toBeNull();
    expect(draft.mediaSuggestion.reel.url).toBe('brands/brand-1/img.jpg');
    expect(draft.publishingAssets).toEqual([expect.objectContaining({ kind: 'video' })]);
  });

  // "Me siguió mandando mi imagen como reel": an image placed on a Reel draft left the
  // draft a Reel, so the publish refused it for having no video. The chip and the
  // autosaved snapshot both read this local format, so it has to follow the media.
  it('place() of an image on a Reel draft restates the format as a post', async () => {
    storedDraft = { ...storedDraft, format: 'Reel' };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => {
      result.current.place([makeImageAsset()], { kind: 'single' });
    });

    expect((storedDraft as { format: string }).format).toBe('POST');
  });

  it('place() keeps a Story a Story — one image is a valid story', async () => {
    storedDraft = { ...storedDraft, format: 'Story' };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => {
      result.current.place([makeImageAsset()], { kind: 'single' });
    });

    expect((storedDraft as { format: string }).format).toBe('Story');
  });

  it('undo() restores the format the attach replaced', async () => {
    storedDraft = { ...storedDraft, format: 'Reel' };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    await act(async () => {
      result.current.place([makeImageAsset()], { kind: 'single' });
    });
    await act(async () => {
      result.current.undo();
    });

    expect((storedDraft as { format: string }).format).toBe('Reel');
  });
  describe('media save ordering', () => {
    const T0 = '2030-08-01T00:00:00.000Z';
    const T1 = '2030-08-01T00:00:01.000Z';
    const T2 = '2030-08-01T00:00:02.000Z';

    beforeEach(() => {
      storedDraft = {
        id: 'draft-1',
        backendDraftId: 'srv-1',
        updatedAt: T0,
        mediaStage: 'text_only',
        mediaSuggestion: { mediaStatus: 'pending' },
        publishingAssets: [],
      };
    });

    function sentMedia(call: RequestOptions) {
      return call.body?.media as { publishingAssets: Array<{ storagePath: string }> };
    }

    // Two placements fired back to back used to race: the second PATCH carried the
    // updatedAt the first one had already consumed, and the CAS token 409'd it.
    it('serializes saves: the second waits for the first and sends the fresh updatedAt', async () => {
      let releaseFirst: (value: unknown) => void = () => undefined;
      requestImpl = () =>
        requestCalls.length === 1
          ? new Promise((resolve) => {
              releaseFirst = resolve;
            })
          : Promise.resolve({ updated_at: T2 });

      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
      await act(async () => {
        result.current.place([makeImageAsset()], { kind: 'single' });
      });

      expect(requestCalls).toHaveLength(1);
      expect(requestCalls[0].body?.expected_updated_at).toBe(T0);
      expect(result.current.isSavingMedia).toBe(true);

      await act(async () => {
        result.current.addSlide(makeImageAsset({ id: 'a2', storagePath: 'p2.jpg' }));
      });
      // Still one request: the second save is queued behind the first.
      expect(requestCalls).toHaveLength(1);

      let flushed: boolean | null = null;
      await act(async () => {
        const flush = result.current.flushMedia();
        releaseFirst({ updated_at: T1 });
        flushed = await flush;
      });

      expect(flushed).toBe(true);
      expect(requestCalls).toHaveLength(2);
      expect(requestCalls[1].body?.expected_updated_at).toBe(T1);
      expect(sentMedia(requestCalls[1]).publishingAssets.map((a) => a.storagePath)).toEqual([
        'brands/brand-1/img.jpg',
        'p2.jpg',
      ]);
      expect(result.current.isSavingMedia).toBe(false);
      expect((storedDraft as { updatedAt: string }).updatedAt).toBe(T2);
    });

    it('writes the server updatedAt and a refreshed mediaStage into the store', async () => {
      requestImpl = async () => ({ updated_at: T1 });
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

      await act(async () => {
        result.current.place([makeImageAsset()], { kind: 'single' });
        await result.current.flushMedia();
      });

      const draft = storedDraft as { updatedAt: string; mediaStage: string };
      expect(draft.updatedAt).toBe(T1);
      // A stored 'text_only' outranks derivation, so leaving it would keep the
      // "generate media" affordances up on a draft that now has media.
      expect(draft.mediaStage).toBe('realized');
    });

    it('flushMedia resolves false, restores the media and toasts when the save fails', async () => {
      requestImpl = async () => {
        throw new ApiError('stale', 409);
      };
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

      let flushed: boolean | null = null;
      await act(async () => {
        result.current.place([makeImageAsset()], { kind: 'single' });
        flushed = await result.current.flushMedia();
      });

      expect(flushed).toBe(false);
      const draft = storedDraft as {
        publishingAssets: unknown[];
        mediaStage: string;
        mediaSuggestion: { mediaStatus: string };
      };
      expect(draft.publishingAssets).toEqual([]);
      expect(draft.mediaSuggestion.mediaStatus).toBe('pending');
      expect(draft.mediaStage).toBe('text_only');
      expect(toastCalls).toEqual([expect.objectContaining({ title: 'Media not saved' })]);
      expect(result.current.isSavingMedia).toBe(false);
    });

    it('does not send a queued save once an earlier one in the batch failed', async () => {
      let rejectFirst: (error: unknown) => void = () => undefined;
      requestImpl = () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        });
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

      await act(async () => {
        result.current.place([makeImageAsset()], { kind: 'single' });
      });
      await act(async () => {
        result.current.addSlide(makeImageAsset({ id: 'a2', storagePath: 'p2.jpg' }));
      });

      let flushed: boolean | null = null;
      await act(async () => {
        const flush = result.current.flushMedia();
        rejectFirst(new ApiError('stale', 409));
        flushed = await flush;
      });

      expect(flushed).toBe(false);
      // The rollback put the server's media back on screen; re-sending would only 409 again.
      expect(requestCalls).toHaveLength(1);
      expect((storedDraft as { publishingAssets: unknown[] }).publishingAssets).toEqual([]);
    });

    // A platform ticked before the media was placed copied an empty row; it blocked the group's
    // publish. A row with media of its own keeps it.
    it('gives an empty group row the media and leaves a row with its own alone', async () => {
      const member = (platform: string, publishingAssets: unknown[]) => ({
        backendDraftId: `srv-${platform}`,
        platform,
        status: 'draft',
        accountId: null,
        draft: {
          id: `draft-1::${platform}`,
          backendDraftId: `srv-${platform}`,
          updatedAt: `T-${platform}`,
          status: 'draft',
          mediaSuggestion: { mediaStatus: 'pending' },
          publishingAssets,
        },
      });
      storedDraft = {
        ...storedDraft,
        groupMembers: [
          { backendDraftId: 'srv-1', platform: 'instagram', status: 'draft', accountId: null },
          member('facebook', []),
          member('linkedin', [{ kind: 'image', role: 'primary', storagePath: 'own.jpg' }]),
        ],
      };
      // The real store reaches a member row through its card.
      useCalendarStore.mockImplementation((selector: (state: unknown) => unknown) =>
        selector({
          updateDraft: (draftId: string, updater: (draft: unknown) => unknown) => {
            const card = storedDraft as { id: string; groupMembers: Array<{ draft?: { id: string } }> };
            storedDraft =
              card.id === draftId
                ? (updater(card) as Record<string, unknown>)
                : {
                    ...card,
                    groupMembers: card.groupMembers.map((entry) =>
                      entry.draft?.id === draftId ? { ...entry, draft: updater(entry.draft) } : entry,
                    ),
                  };
          },
        }),
      );
      requestImpl = async () => ({ updated_at: T1 });
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

      await act(async () => {
        result.current.place([makeImageAsset()], { kind: 'single' });
        await result.current.flushMedia();
      });

      expect(requestCalls.map((call) => call.path)).toEqual([
        '/api/organic/calendar/drafts/srv-1/fields',
        '/api/organic/calendar/drafts/srv-facebook/fields',
      ]);
      expect(requestCalls[1].body?.expected_updated_at).toBe('T-facebook');
      expect(sentMedia(requestCalls[1]).publishingAssets.map((a) => a.storagePath)).toEqual([
        'brands/brand-1/img.jpg',
      ]);
      const facebook = (
        storedDraft as { groupMembers: Array<{ platform: string; draft?: Record<string, unknown> }> }
      ).groupMembers.find((entry) => entry.platform === 'facebook')?.draft;
      expect(facebook?.mediaStage).toBe('realized');
    });

    it('flushMedia resolves true at once when nothing is pending', async () => {
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
      expect(await result.current.flushMedia()).toBe(true);
      expect(result.current.isSavingMedia).toBe(false);
    });
  });

  // A single-image post carries no slideIndex. Appending used to give the new image
  // slideIndex 1 while the original stayed unindexed — sorted as 999, i.e. LAST.
  it('addSlide() grows a one-image post into a carousel with the original first', async () => {
    for (const slideIndex of [undefined, null, 0]) {
      storedDraft = {
        id: 'draft-1',
        mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'image' },
        publishingAssets: [
          { role: 'primary', kind: 'image', slideIndex, storagePath: 'first.jpg', storageUrl: 'u' },
        ],
      };
      const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

      await act(async () => {
        result.current.addSlide(makeImageAsset({ id: 'a2', storagePath: 'second.jpg' }));
      });

      const draft = storedDraft as {
        publishingAssets: Array<{ slideIndex: number | null; storagePath: string }>;
      };
      expect(draft.publishingAssets.map((a) => [a.storagePath, a.slideIndex])).toEqual([
        ['first.jpg', 0],
        ['second.jpg', 1],
      ]);
    }
  });

  // Gating #3: appending to a one-image Post used to leave it a Post, so the plan sent the
  // first image and dropped the rest.
  it('addSlide() makes a one-image post a carousel in the same save as its media', async () => {
    storedDraft = {
      id: 'draft-1',
      backendDraftId: 'srv-1',
      updatedAt: '2030-01-01T00:00:00.000Z',
      format: 'Post',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'image' },
      publishingAssets: [
        { role: 'primary', kind: 'image', storagePath: 'first.jpg', storageUrl: 'u' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.addSlide(makeImageAsset({ id: 'a2', storagePath: 'second.jpg' }));
      await result.current.flushMedia();
    });

    expect(storedDraft.format).toBe('Carousel');
    expect(requestCalls).toHaveLength(1);
    expect(requestCalls[0]?.body).toMatchObject({
      format: 'Carousel',
      media: { publishingAssets: [{ storagePath: 'first.jpg' }, { storagePath: 'second.jpg' }] },
    });
  });

  it('addSlide() leaves a carousel format alone and sends no format', async () => {
    storedDraft = {
      id: 'draft-1',
      backendDraftId: 'srv-1',
      updatedAt: '2030-01-01T00:00:00.000Z',
      format: 'Carousel',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'image' },
      publishingAssets: [
        { role: 'primary', kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'u' },
        { role: 'primary', kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'u' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.addSlide(makeImageAsset({ id: 'a3', storagePath: 'c.jpg' }));
      await result.current.flushMedia();
    });

    expect(storedDraft.format).toBe('Carousel');
    expect(requestCalls[0]?.body).not.toHaveProperty('format');
  });

  it('a failed save undoes the carousel switch with the media', async () => {
    requestImpl = async () => {
      throw new Error('down');
    };
    storedDraft = {
      id: 'draft-1',
      backendDraftId: 'srv-1',
      updatedAt: '2030-01-01T00:00:00.000Z',
      format: 'Post',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'image' },
      publishingAssets: [
        { role: 'primary', kind: 'image', storagePath: 'first.jpg', storageUrl: 'u' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.addSlide(makeImageAsset({ id: 'a2', storagePath: 'second.jpg' }));
      await result.current.flushMedia();
    });

    expect(storedDraft.format).toBe('Post');
    expect((storedDraft.publishingAssets as unknown[]).length).toBe(1);
  });

  it('gives unindexed slides explicit indexes after the last indexed slide', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: null, storagePath: 'z.jpg', storageUrl: 'z' },
        { kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'b' },
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    await act(async () => {
      result.current.addSlide(makeImageAsset({ id: 'n', storagePath: 'n.jpg' }));
    });

    const draft = storedDraft as {
      publishingAssets: Array<{ slideIndex: number; storagePath: string }>;
    };
    expect(draft.publishingAssets.map((a) => [a.storagePath, a.slideIndex])).toEqual([
      ['a.jpg', 0],
      ['b.jpg', 1],
      ['z.jpg', 2],
      ['n.jpg', 3],
    ]);
  });

  // storagePath/bucket is the durable identity; storageUrl is a transient signature the
  // backend re-mints. No slide op may treat an empty one as "no slide".
  it('never drops a slide whose storageUrl is empty', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied', kind: 'carousel' },
      publishingAssets: [
        { kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: '' },
        { kind: 'image', slideIndex: 1, storagePath: 'b.jpg', storageUrl: 'b' },
        { kind: 'image', slideIndex: 2, storagePath: 'c.jpg', storageUrl: 'c' },
      ],
    };
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const unsigned = { signedUrl: undefined, bucket: 'media-library' };
    const paths = () =>
      (
        storedDraft as { publishingAssets: Array<{ storagePath: string; slideIndex: number }> }
      ).publishingAssets
        .slice()
        .sort((x, y) => x.slideIndex - y.slideIndex)
        .map((a) => a.storagePath);

    await act(async () => {
      result.current.reorderSlides(0, 2);
    });
    expect(paths()).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);

    await act(async () => {
      result.current.removeSlide(0);
    });
    expect(paths()).toEqual(['c.jpg', 'a.jpg']);

    await act(async () => {
      result.current.replaceSlide(0, makeImageAsset({ storagePath: 'r.jpg', ...unsigned }));
    });
    expect(paths()).toEqual(['r.jpg', 'a.jpg']);

    await act(async () => {
      result.current.addSlide(makeImageAsset({ id: 'n', storagePath: 'n.jpg', ...unsigned }));
    });
    expect(paths()).toEqual(['r.jpg', 'a.jpg', 'n.jpg']);

    const assets = (
      storedDraft as {
        publishingAssets: Array<{ storagePath: string; bucket?: string; storageUrl: string }>;
      }
    ).publishingAssets;
    expect(assets.find((a) => a.storagePath === 'n.jpg')).toMatchObject({
      bucket: 'media-library',
      storageUrl: '',
    });
  });
});
