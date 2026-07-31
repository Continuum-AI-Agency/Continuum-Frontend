import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { act, renderHook } from '@testing-library/react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

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
};

beforeAll(async () => {
  mock.restore();
  mock.module('@/lib/organic/store', () => createCalendarStoreStub());
  const hookMod = await import('./useDraftMediaPlacement');
  const storeMod = await import('@/lib/organic/store');
  useDraftMediaPlacement = hookMod.useDraftMediaPlacement;
  useCalendarStore = storeMod.useCalendarStore as typeof useCalendarStore;
});

// This file drives the shared stub with mockImplementation. mock.module is process-wide,
// so leaving that implementation in place hands every later spec a store whose selectors
// return this file's fixture instead of their own.
afterAll(() => {
  useCalendarStore.mockImplementation(useCalendarStore.defaultImplementation);
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

  // invalid kind — video onto carousel slot
  it('place() returns invalid_kind error when placing a video onto a carousel slot', async () => {
    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));
    const video = makeVideoAsset();

    let err: ReturnType<typeof result.current.place> = null;
    await act(async () => {
      err = result.current.place([video], { kind: 'carousel_slide', slideIndex: 0 });
    });

    expect(err).not.toBeNull();
    expect(err?.type).toBe('invalid_kind');
    // updateDraft must NOT have been called.
    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(result.current.error?.type).toBe('invalid_kind');
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

  // replaceSlide — rejects video (carousels are image-only)
  it('replaceSlide() rejects a video asset', async () => {
    storedDraft = {
      id: 'draft-1',
      mediaSuggestion: { mediaStatus: 'user_supplied' },
      publishingAssets: [{ kind: 'image', slideIndex: 0, storagePath: 'a.jpg', storageUrl: 'a' }],
    };

    const { result } = renderHook(() => useDraftMediaPlacement('draft-1'));

    let err: ReturnType<typeof result.current.replaceSlide> = null;
    await act(async () => {
      err = result.current.replaceSlide(0, makeVideoAsset());
    });

    expect(err?.type).toBe('invalid_kind');
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
});
