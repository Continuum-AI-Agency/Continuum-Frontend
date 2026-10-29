'use client';

// Write path for user-supplied media placement on the calendar draft preview.
// Wraps updateDraft from useCalendarStore with optimistic patching, undo, and
// per-slot validation so all surfaces (click-to-place, drag-from-rail, picker
// attach) go through a single path and always emit publishable media shapes.

import type { CreativeRef, MediaAsset } from '@continuum/contracts';
import {
  creativeRefFromAsset,
  deriveOrganicMediaStage,
  findMultiVideoSelectionError,
  matchPublishFormat,
  reconcileFormatWithAssetKinds,
  shapeUserSuppliedMedia,
} from '@continuum/contracts';
import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { isCarouselFormat } from '@/lib/organic/carousel';
import { groupRowsToFill } from '@/lib/organic/groupDraft';
import { useCalendarStore } from '@/lib/organic/store';
import { useDraftFieldPersistence } from './useDraftFieldEditor';

/**
 * Media reaches `content_json` — the field the publisher and the scheduled worker
 * read — through the shared field-edit path, not a hand-rolled fetch.
 *
 * Two failures made an assignment store-only before that. The browser autosave
 * accepts `origin === 'manual'` drafts only, so on an agent draft the user's creative
 * never reached the database and publish fell back to the headless generation. And the
 * hand-rolled PATCH this hook used targeted the generic draft route, whose handler
 * validated `content_json` and then never forwarded it — so even for a manual draft
 * the write was a silent no-op. `mediaStatus: user_supplied` is what stops the next
 * refetch from overwriting the result.
 *
 * Saves are serialized. Every write carries the draft's `updatedAt` as a CAS token, so a
 * second placement sent while the first PATCH is in flight would present a token the
 * first one already consumed and 409. Each save therefore waits for the one before it and
 * reads the draft back from the store at send time — media AND token — which also means a
 * burst of placements collapses into the writes it actually needs.
 */

/** The media fields a failed write has to put back. */
// Format rides along: growing a post into a carousel changes both, and a failed save undoes both.
type MediaSnapshot = Pick<
  OrganicCalendarDraft,
  'mediaSuggestion' | 'publishingAssets' | 'mediaStage' | 'format'
>;

/**
 * The draft with its format restated from its media: kept when the media can publish as it,
 * otherwise the format the media can. The backend applies the same rule to the write; doing it
 * here too keeps the chip honest and stops the manual-draft autosave stamping the old format
 * back into `slot_data.draftSnapshot`, which the publisher reads first. Without it an image
 * placed on a Reel stayed a Reel and was refused at publish for having no video.
 */
function withMediaFormat(draft: OrganicCalendarDraft): OrganicCalendarDraft {
  const kinds = (draft.publishingAssets ?? []).map((asset) => asset.kind);
  if (kinds.length === 0) return draft;
  const current = matchPublishFormat(draft.format);
  const format = reconcileFormatWithAssetKinds(current, kinds);
  return format === current ? draft : { ...draft, format };
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
  // Resolves once every pending media save has settled: true when all of them succeeded.
  // Approve awaits this so it never gates on media the server has not received yet.
  flushMedia: () => Promise<boolean>;
  isSavingMedia: boolean;
};

type PublishingAsset = NonNullable<OrganicCalendarDraft['publishingAssets']>[number];

function isSlideKind(kind: MediaAsset['kind']): kind is 'image' | 'video' {
  return kind === 'image' || kind === 'video';
}

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

// The store keeps a stamped `mediaStage` that `resolveDraftMediaStage` prefers over
// derivation, so a media change has to restamp it or the draft keeps reading 'text_only'.
// Same derivation the backend runs on every persist.
function withDerivedMediaStage(draft: OrganicCalendarDraft): OrganicCalendarDraft {
  return {
    ...draft,
    mediaStage: deriveOrganicMediaStage({
      publishingAssets: draft.publishingAssets,
      creative: {
        mediaSuggestion: {
          mediaStatus: draft.mediaSuggestion?.mediaStatus ?? null,
          storyboard: draft.mediaSuggestion?.storyboard ?? null,
        },
      },
    }),
  };
}

function snapshotMedia(draft: OrganicCalendarDraft): MediaSnapshot {
  return {
    mediaSuggestion: draft.mediaSuggestion,
    publishingAssets: draft.publishingAssets,
    mediaStage: draft.mediaStage,
    format: draft.format,
  };
}

/** Which media a row holds, by slide; '' for none. A fill is judged on this, not on identity. */
function mediaKey(assets: OrganicCalendarDraft['publishingAssets']): string {
  return (assets ?? [])
    .map((asset) => asset.storagePath || asset.storageUrl || asset.assetId || '')
    .join('|');
}

function findStoreDraft(draftId: string): OrganicCalendarDraft | undefined {
  for (const day of useCalendarStore.getState().days) {
    const slot = day.slots.find((s) => s.id === draftId);
    if (slot) return slot;
  }
  return undefined;
}

// Slides (images and videos) in the order the strip renders them. Unindexed slides (a
// single-media post carries no slideIndex) sort LAST; every op reindexes what it writes back,
// so the persisted order is the order that was shown.
function sortedSlides(draft: OrganicCalendarDraft): PublishingAsset[] {
  return [...(draft.publishingAssets ?? [])].sort(
    (a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999),
  );
}

function validateKindForTarget(
  creatives: CreativeRef[],
  target: SlotTarget,
): PlacementError | null {
  if (creatives.some((creative) => !isSlideKind(creative.kind))) {
    return { type: 'invalid_kind', message: 'Carousel slides must be images or videos.' };
  }
  const videoCount = creatives.filter((c) => c.kind === 'video').length;
  const imageCount = creatives.filter((c) => c.kind === 'image').length;

  // A carousel is the only target that can keep more than one video. Other targets
  // represent a single post/reel and must refuse selections the shaper would truncate.
  const multiVideo = findMultiVideoSelectionError(
    creatives,
    target.kind === 'carousel_slide' ? 'CAROUSEL' : undefined,
  );
  if (multiVideo) {
    return { type: 'too_many_videos', message: `${multiVideo}.` };
  }

  if (target.kind !== 'carousel_slide' && videoCount > 0 && imageCount > 0) {
    return {
      type: 'invalid_kind',
      message: 'Cannot mix image and video in a single post.',
    };
  }

  return null;
}

export function useDraftMediaPlacement(draftId: string): UseDraftMediaPlacementResult {
  const updateDraft = useCalendarStore((s) => s.updateDraft);
  const { persistDraftFields } = useDraftFieldPersistence();
  const { show } = useToast();
  const [undoSnapshot, setUndoSnapshot] = React.useState<Partial<OrganicCalendarDraft> | null>(
    null,
  );
  const [error, setError] = React.useState<PlacementError | null>(null);

  // The tail of the save queue; `pending` counts saves not yet settled. A batch is the run
  // of saves between two idle moments — flushMedia reports on the current one.
  const queueRef = React.useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingRef = React.useRef(0);
  // The media the server last confirmed. A failure restores THIS, not the failed op's own
  // "before": by then later ops may have built on media the server never accepted.
  const confirmedRef = React.useRef<MediaSnapshot | null>(null);
  const [isSavingMedia, setIsSavingMedia] = React.useState(false);

  // Group rows that had no media take this draft's, and keep following it while they still hold
  // exactly what they were given — slides are placed one save at a time.
  const filledMediaRef = React.useRef(new Map<string, string>());
  const fillEmptyGroupMedia = React.useCallback(
    async (source: OrganicCalendarDraft): Promise<void> => {
      const publishingAssets = source.publishingAssets ?? [];
      if (publishingAssets.length === 0) return;
      const filled = filledMediaRef.current;
      const rows = groupRowsToFill(
        useCalendarStore.getState().days,
        draftId,
        (row) => mediaKey(row.publishingAssets),
        filled,
      );
      await Promise.all(
        rows.map(async (row) => {
          const mediaSuggestion = source.mediaSuggestion ?? undefined;
          const saved = await persistDraftFields(row, { media: { publishingAssets, mediaSuggestion } });
          if (!saved.ok) return;
          filled.set(row.id, mediaKey(publishingAssets));
          updateDraft(row.id, (current) =>
            withDerivedMediaStage(
              withMediaFormat({
                ...current,
                publishingAssets,
                mediaSuggestion: source.mediaSuggestion,
                updatedAt: saved.updatedAt ?? current.updatedAt,
              }),
            ),
          );
        }),
      );
    },
    [draftId, updateDraft, persistDraftFields],
  );

  const saveLatestMedia = React.useCallback(
    async (fallback: OrganicCalendarDraft): Promise<boolean> => {
      const latest = findStoreDraft(draftId) ?? fallback;
      const confirmed = confirmedRef.current;
      if (
        confirmed &&
        latest.publishingAssets === confirmed.publishingAssets &&
        latest.mediaSuggestion === confirmed.mediaSuggestion &&
        latest.format === confirmed.format
      ) {
        return true;
      }

      // One PATCH: a second one for the format would race this one's CAS token.
      const formatChanged = confirmed !== null && latest.format !== confirmed.format;
      const result = await persistDraftFields(latest, {
        media: {
          publishingAssets: latest.publishingAssets ?? [],
          mediaSuggestion: latest.mediaSuggestion ?? undefined,
        },
        ...(formatChanged ? { format: latest.format } : {}),
      });

      if (result.ok) {
        confirmedRef.current = snapshotMedia(latest);
        const { updatedAt } = result;
        if (updatedAt) updateDraft(draftId, (current) => ({ ...current, updatedAt }));
        // Inside the save, so flushMedia() — which approve and publish await — covers it.
        await fillEmptyGroupMedia(latest);
        return true;
      }

      if (confirmed) updateDraft(draftId, (current) => ({ ...current, ...confirmed }));
      show({
        title: 'Media not saved',
        description: result.stale
          ? 'This post changed elsewhere. Reopen it and try again.'
          : result.message,
        variant: 'error',
      });
      return false;
    },
    [draftId, updateDraft, persistDraftFields, show, fillEmptyGroupMedia],
  );

  /**
   * Runs a store mutation and queues the write of the resulting media to content_json.
   * Every placement op goes through here, so an assignment can never be store-only again.
   *
   * A failed write restores the last server-confirmed media and tells the user; saves
   * still queued behind it in the same batch are not sent, since the rollback already
   * put the server's media back on screen.
   */
  const applyMedia = React.useCallback(
    (mutate: (current: OrganicCalendarDraft) => OrganicCalendarDraft) => {
      // A holder rather than plain `let`s: control-flow analysis does not track
      // assignments made inside a callback, so a captured `let` reads as its
      // initializer type afterwards.
      const captured: {
        next: OrganicCalendarDraft | null;
        previous: MediaSnapshot | null;
      } = { next: null, previous: null };

      updateDraft(draftId, (current) => {
        const mutated = mutate(current);
        // A validation no-op returns the draft untouched — nothing to write through.
        if (mutated === current) return current;
        const next = withDerivedMediaStage(withMediaFormat(mutated));
        captured.previous = snapshotMedia(current);
        captured.next = next;
        return next;
      });

      const next: OrganicCalendarDraft | null = captured.next;
      if (!next) return;

      if (pendingRef.current === 0) {
        queueRef.current = Promise.resolve(true);
        confirmedRef.current = captured.previous;
      }
      pendingRef.current += 1;
      setIsSavingMedia(true);

      queueRef.current = queueRef.current.then(async (batchOk) => {
        const ok = batchOk ? await saveLatestMedia(next) : false;
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setIsSavingMedia(false);
        return ok;
      });
    },
    [draftId, updateDraft, saveLatestMedia],
  );

  const flushMedia = React.useCallback(
    (): Promise<boolean> => (pendingRef.current === 0 ? Promise.resolve(true) : queueRef.current),
    [],
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

      let placementError: PlacementError | null = null;
      applyMedia((current) => {
        if (target.kind === 'carousel_slide') {
          const slides = [...(current.publishingAssets ?? [])].sort(
            (a, b) => (a.slideIndex ?? Number.MAX_SAFE_INTEGER) - (b.slideIndex ?? Number.MAX_SAFE_INTEGER),
          );
          if (target.slideIndex < 0 || target.slideIndex >= slides.length) {
            placementError = { type: 'empty_selection', message: 'That slide no longer exists.' };
            return current;
          }

          setUndoSnapshot({
            mediaSuggestion: current.mediaSuggestion,
            publishingAssets: current.publishingAssets,
            format: current.format,
          });

          const currentRefs: CreativeRef[] = slides.map((asset) => ({
            assetId: asset.assetId ?? `${asset.bucket ?? 'media-library'}/${asset.storagePath}`,
            bucket: asset.bucket ?? 'media-library',
            storagePath: asset.storagePath,
            kind: asset.kind,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
            signedUrl: asset.storageUrl,
          }));
          // Replace the targeted slide only; additional selected media follows it in
          // selection order, while every untouched slide remains in its prior order.
          currentRefs.splice(target.slideIndex, 1, ...refs);
          const shaped = shapeUserSuppliedMedia(currentRefs, { format: 'CAROUSEL' });
          return {
            ...current,
            publishingAssets: shaped.publishingAssets,
            mediaSuggestion: { ...current.mediaSuggestion, ...shaped.mediaSuggestionPatch },
            format: shaped.contentPatch.format,
          };
        }

        // Snapshot for undo BEFORE patching.
        setUndoSnapshot({
          mediaSuggestion: current.mediaSuggestion,
          publishingAssets: current.publishingAssets,
          format: current.format,
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

      if (placementError) {
        setError(placementError);
        return placementError;
      }

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
      format: snapshot.format ?? current.format,
    }));
  }, [undoSnapshot, applyMedia]);

  const reorderSlides = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      applyMedia((current) => {
        const slides = sortedSlides(current);

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

        return asUserSupplied(current, reindexed);
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
        const slides = sortedSlides(current);

        if (slides.length <= 1) {
          slideErr = { type: 'min_slides', message: 'A carousel needs at least one slide.' };
          return current;
        }

        if (position < 0 || position >= slides.length) return current;

        const remaining = slides
          .filter((_, i) => i !== position)
          .map((a, i) => ({ ...a, slideIndex: i }));

        return asUserSupplied(current, remaining);
      });

      if (slideErr) setError(slideErr);
      return slideErr;
    },
    [applyMedia],
  );

  // Replace the media at `position` (same slideIndex-sorted order as removeSlide)
  // with a library image or video, preserving its place in the carousel.
  const replaceSlide = React.useCallback(
    (position: number, asset: MediaAsset): PlacementError | null => {
      const kind = asset.kind;
      if (!isSlideKind(kind)) {
        const err: PlacementError = {
          type: 'invalid_kind',
          message: 'Carousel slides must be images or videos.',
        };
        setError(err);
        return err;
      }

      let slideErr: PlacementError | null = null;
      applyMedia((current) => {
        const slides = sortedSlides(current);

        if (position < 0 || position >= slides.length) {
          slideErr = { type: 'empty_selection', message: 'That slide no longer exists.' };
          return current;
        }

        const replaced: PublishingAsset[] = slides.map((existing, i) =>
          i === position
            ? {
                role: existing.role ?? 'primary',
                kind,
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

        return asUserSupplied(current, replaced);
      });

      if (slideErr) setError(slideErr);
      return slideErr;
    },
    [applyMedia],
  );

  const addSlide = React.useCallback(
    (asset: MediaAsset): PlacementError | null => {
      const kind = asset.kind;
      if (!isSlideKind(kind)) {
        const err: PlacementError = {
          type: 'invalid_kind',
          message: 'Carousel slides must be images or videos.',
        };
        setError(err);
        return err;
      }

      applyMedia((current) => {
        const slides = sortedSlides(current);

        const newSlide: PublishingAsset = {
          role: 'primary',
          kind,
          slideIndex: slides.length,
          assetId: asset.id,
          bucket: asset.bucket,
          storagePath: asset.storagePath,
          storageUrl: asset.signedUrl ?? '',
          mimeType: asset.mimeType,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        };

        // Reindex the existing slides too: a single-image post's one image has no
        // slideIndex, and left unindexed it would sort after the slide appended here.
        const reindexed = slides.map((a, i) => ({ ...a, slideIndex: i }));
        const grown = asUserSupplied(current, [...reindexed, newSlide]);
        // A post publishes one image: a second slide only goes out once it is a carousel.
        return current.format && !isCarouselFormat(current.format)
          ? { ...grown, format: 'Carousel' }
          : grown;
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
    flushMedia,
    isSavingMedia,
  };
}
