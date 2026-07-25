'use client';

// Write path for user-supplied media placement on the calendar draft preview.
// Wraps updateDraft from useCalendarStore with optimistic patching, undo, and
// per-slot validation so all surfaces (click-to-place, drag-from-rail, picker
// attach) go through a single path and always emit publishable media shapes.

import type { CreativeRef, MediaAsset } from '@continuum/contracts';
import {
  creativeRefFromAsset,
  findMultiVideoSelectionError,
  shapeUserSuppliedMedia,
} from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { useCalendarStore } from '@/lib/organic/store';

/**
 * Writes the draft's media through to `content_json` — the field the publisher and the
 * scheduled worker read.
 *
 * Without this, an assignment lived only in the browser store: the calendar autosave owns
 * manually-authored drafts only (an allowlist that exists to stop duplicate posts), so on an
 * agent draft the user's creative never reached the database, and publish used the headless
 * generation. `mediaStatus: user_supplied` is what stops the next refetch from overwriting it.
 */
async function persistDraftMedia(draft: OrganicCalendarDraft): Promise<void> {
  if (!draft.backendDraftId) return;

  const token = await getBrowserAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  await fetch(`${getApiBaseUrl()}/api/organic/calendar/drafts/${draft.backendDraftId}`, {
    method: 'PATCH',
    headers,
    // A partial placement — the backend merges it onto the existing content_json.
    body: JSON.stringify({
      content_json: {
        publishingAssets: draft.publishingAssets ?? [],
        creative: { mediaSuggestion: draft.mediaSuggestion ?? {} },
      },
    }),
  });
}

export type SlotTarget =
  | { kind: 'single' }
  | { kind: 'carousel_slide'; slideIndex: number }
  | { kind: 'video' };

export type PlacementError =
  | { type: 'invalid_kind'; message: string }
  | { type: 'too_many_videos'; message: string }
  | { type: 'min_slides'; message: string }
  | { type: 'empty_selection'; message: string };

export type UseDraftMediaPlacementResult = {
  // Place one or more library creatives into the given slot target.
  place: (creatives: MediaAsset[], target: SlotTarget) => PlacementError | null;
  // Undo the last place() call; no-op when nothing has been placed this session.
  undo: () => void;
  canUndo: boolean;
  // Reorder carousel slides by swapping indices.
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  // Remove a carousel slide by its 0-based array position (min 1 enforced).
  removeSlide: (position: number) => PlacementError | null;
  // Replace the image at a 0-based array position with a library image, keeping
  // its position in the carousel order.
  replaceSlide: (position: number, asset: MediaAsset) => PlacementError | null;
  // Append a library image as a new carousel slide.
  addSlide: (asset: MediaAsset) => PlacementError | null;
  error: PlacementError | null;
  clearError: () => void;
};

type PublishingAsset = NonNullable<OrganicCalendarDraft['publishingAssets']>[number];

/** Slides the user arranged are the media of record; the flag is what survives a refetch. */
function asUserSupplied(
  draft: OrganicCalendarDraft,
  publishingAssets: OrganicCalendarDraft['publishingAssets'],
): OrganicCalendarDraft {
  return {
    ...draft,
    publishingAssets,
    mediaSuggestion: { ...draft.mediaSuggestion, mediaStatus: 'user_supplied' },
  };
}

function validateKindForTarget(
  creatives: CreativeRef[],
  target: SlotTarget,
): PlacementError | null {
  const videoCount = creatives.filter((c) => c.kind === 'video').length;
  const imageCount = creatives.filter((c) => c.kind === 'image').length;

  if (target.kind === 'carousel_slide' && videoCount > 0) {
    return {
      type: 'invalid_kind',
      message: 'Carousels are image-only in v1. Use the Reel slot for video.',
    };
  }

  // The reel slot holds exactly one video, and `shapeUserSuppliedMedia` keeps only
  // the first — so refuse the selection rather than discard the rest of it.
  const multiVideo = findMultiVideoSelectionError(creatives);
  if (multiVideo) {
    return { type: 'too_many_videos', message: `${multiVideo}.` };
  }

  if (videoCount > 0 && imageCount > 0) {
    return {
      type: 'invalid_kind',
      message: 'Cannot mix image and video in a single post.',
    };
  }

  return null;
}

export function useDraftMediaPlacement(draftId: string): UseDraftMediaPlacementResult {
  const updateDraft = useCalendarStore((s) => s.updateDraft);
  const [undoSnapshot, setUndoSnapshot] = React.useState<Partial<OrganicCalendarDraft> | null>(
    null,
  );
  const [error, setError] = React.useState<PlacementError | null>(null);

  /**
   * Runs a store mutation and writes the resulting media through to content_json. Every
   * placement op goes through here, so an assignment can never be store-only again.
   */
  const applyMedia = React.useCallback(
    (mutate: (current: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      let next: OrganicCalendarDraft | null = null;
      let changed = false;
      updateDraft(draftId, (current) => {
        next = mutate(current);
        changed = next !== current;
        return next;
      });
      // A validation no-op returns the draft untouched — nothing to write through.
      if (changed && next) void persistDraftMedia(next);
    },
    [draftId, updateDraft],
  );

  const place = React.useCallback(
    (assets: MediaAsset[], target: SlotTarget): PlacementError | null => {
      if (assets.length === 0) {
        const err: PlacementError = {
          type: 'empty_selection',
          message: 'Select at least one creative.',
        };
        setError(err);
        return err;
      }

      const refs = assets.map(creativeRefFromAsset);
      const kindError = validateKindForTarget(refs, target);
      if (kindError) {
        setError(kindError);
        return kindError;
      }

      setError(null);

      applyMedia((current) => {
        // Snapshot for undo BEFORE patching.
        setUndoSnapshot({
          mediaSuggestion: current.mediaSuggestion,
          publishingAssets: current.publishingAssets,
        });

        const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia(refs);

        return {
          ...current,
          publishingAssets,
          mediaSuggestion: {
            ...current.mediaSuggestion,
            ...mediaSuggestionPatch,
          },
        };
      });

      return null;
    },
    [applyMedia],
  );

  const undo = React.useCallback(() => {
    if (!undoSnapshot) return;
    const snapshot = undoSnapshot;
    setUndoSnapshot(null);
    applyMedia((current) => ({
      ...current,
      mediaSuggestion: snapshot.mediaSuggestion ?? current.mediaSuggestion,
      publishingAssets: snapshot.publishingAssets ?? current.publishingAssets,
    }));
  }, [undoSnapshot, applyMedia]);

  const reorderSlides = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      applyMedia((current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === 'image')
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));

        if (fromIndex < 0 || fromIndex >= slides.length) return current;
        if (toIndex < 0 || toIndex >= slides.length) return current;
        if (fromIndex === toIndex) return current;

        const reordered = [...slides];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);

        const reindexed: PublishingAsset[] = reordered.map((a, i) => ({
          ...a,
          slideIndex: i,
        }));

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== 'image');
        return asUserSupplied(current, [...nonSlides, ...reindexed]);
      });
    },
    [applyMedia],
  );

  // `position` is the 0-based index into the slideIndex-sorted slide list (the same
  // order the strip renders), NOT the asset's raw slideIndex field — the two only
  // coincide for a contiguous 0..n carousel, so the strip passes its render index.
  const removeSlide = React.useCallback(
    (position: number): PlacementError | null => {
      let slideErr: PlacementError | null = null;

      applyMedia((current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === 'image')
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));

        if (slides.length <= 1) {
          slideErr = { type: 'min_slides', message: 'A carousel needs at least one image.' };
          return current;
        }

        if (position < 0 || position >= slides.length) return current;

        const remaining = slides
          .filter((_, i) => i !== position)
          .map((a, i) => ({ ...a, slideIndex: i }));

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== 'image');
        return asUserSupplied(current, [...nonSlides, ...remaining]);
      });

      if (slideErr) setError(slideErr);
      return slideErr;
    },
    [applyMedia],
  );

  // Replace the image at `position` (same slideIndex-sorted order as removeSlide)
  // with a library image, preserving its place in the carousel.
  const replaceSlide = React.useCallback(
    (position: number, asset: MediaAsset): PlacementError | null => {
      if (asset.kind === 'video') {
        const err: PlacementError = {
          type: 'invalid_kind',
          message: 'Carousels are image-only in v1.',
        };
        setError(err);
        return err;
      }

      let slideErr: PlacementError | null = null;
      applyMedia((current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === 'image')
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));

        if (position < 0 || position >= slides.length) {
          slideErr = { type: 'empty_selection', message: 'That slide no longer exists.' };
          return current;
        }

        const replaced: PublishingAsset[] = slides.map((existing, i) =>
          i === position
            ? {
                role: existing.role ?? 'primary',
                kind: 'image',
                slideIndex: i,
                assetId: asset.id,
                bucket: asset.bucket,
                storagePath: asset.storagePath,
                storageUrl: asset.signedUrl ?? '',
                mimeType: asset.mimeType,
                width: asset.width ?? undefined,
                height: asset.height ?? undefined,
              }
            : { ...existing, slideIndex: i },
        );

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== 'image');
        return asUserSupplied(current, [...nonSlides, ...replaced]);
      });

      if (slideErr) setError(slideErr);
      return slideErr;
    },
    [applyMedia],
  );

  const addSlide = React.useCallback(
    (asset: MediaAsset): PlacementError | null => {
      if (asset.kind === 'video') {
        const err: PlacementError = {
          type: 'invalid_kind',
          message: 'Carousels are image-only in v1.',
        };
        setError(err);
        return err;
      }

      applyMedia((current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === 'image')
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));

        const newSlide: PublishingAsset = {
          role: 'primary',
          kind: 'image',
          slideIndex: slides.length,
          assetId: asset.id,
          bucket: asset.bucket,
          storagePath: asset.storagePath,
          storageUrl: asset.signedUrl ?? '',
          mimeType: asset.mimeType,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        };

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== 'image');
        return asUserSupplied(current, [...nonSlides, ...slides, newSlide]);
      });

      return null;
    },
    [applyMedia],
  );

  const clearError = React.useCallback(() => setError(null), []);

  return {
    place,
    undo,
    canUndo: undoSnapshot !== null,
    reorderSlides,
    removeSlide,
    replaceSlide,
    addSlide,
    error,
    clearError,
  };
}
