'use client';

// The Library implementation of TimelineEditorAdapter.
//
// Where the canvas adapter reads its document out of a React Flow node and its
// media bin out of incoming edges, this one reads a row of media.timeline_drafts
// and a bin the user assembles from the Library. A render lands back in the
// Library — promoted onto the source asset as a new version, or registered as a
// new asset — and stamps the draft 'rendered'.
//
// A draft row is created lazily: opening the editor on an asset that has never
// been cut seeds an in-memory timeline and writes nothing. The first edit is
// what persists.

import type { MediaAsset, TimelineDraftStatus } from '@continuum/contracts';
import { getTimelineDraftResponseSchema } from '@continuum/contracts';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveFileAsNewVersion } from '@/lib/library/quickLook';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import type {
  TimelineDocument,
  TimelineEditorAdapter,
  TimelineRenderSink,
  TimelineRenderSinkKind,
} from '@/StudioCanvas/nodes/timeline/adapter';
import { LibraryBinActions } from './LibraryMediaPickerDialog';
import {
  createLibraryTimelineResolver,
  type LibraryTimelineResolver,
} from './resolveLibraryTimelineSources';
import {
  draftPoolToSources,
  fromDraftDocument,
  type LibraryPoolSource,
  seedTimelineDocumentFromAsset,
  toDraftDocument,
} from './timelineDraftMapping';

const AUTOSAVE_DEBOUNCE_MS = 800;
const DRAFTS_ENDPOINT = '/api/library/timeline-drafts';

const RENDER_SINKS: TimelineRenderSink[] = [
  {
    kind: 'library-version',
    label: 'Save as new version',
    description: 'Promotes the cut onto this asset; the original stays in its version history.',
  },
  {
    kind: 'library-new-asset',
    label: 'Save as new asset',
    description: 'Registers the cut as a separate asset and leaves this one untouched.',
  },
];

export type DraftSaveScheduler = {
  schedule(): void;
  flush(): Promise<void>;
  cancel(): void;
  /** Resolves once any in-flight save has settled. Does NOT start a new one. */
  settled(): Promise<void>;
};

// Debounced autosave. Every keystroke-scale edit (a drag, a trim handle) calls
// schedule(); only the last one in the window writes. `flush` exists because
// closing the dialog must not race the timer — a cut the user made a moment
// before closing has to be on the server before the editor unmounts.
//
// Timers are injected so the debounce can be tested without wall-clock waits.
export function createDraftSaveScheduler(options: {
  delayMs: number;
  save: () => Promise<void>;
  setTimeoutImpl?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutImpl?: (handle: ReturnType<typeof setTimeout>) => void;
}): DraftSaveScheduler {
  const { delayMs, save } = options;
  const setTimer = options.setTimeoutImpl ?? setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? clearTimeout;

  let handle: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  // Saves are serialized: two overlapping PUTs of the same draft could land out
  // of order and resurrect an older document.
  let inFlight: Promise<void> = Promise.resolve();

  const runSave = (): Promise<void> => {
    pending = false;
    const next = inFlight.then(() => save());
    inFlight = next.catch(() => undefined);
    return next;
  };

  const clearPendingTimer = () => {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
  };

  return {
    schedule() {
      pending = true;
      clearPendingTimer();
      handle = setTimer(() => {
        handle = null;
        void runSave().catch(() => undefined);
      }, delayMs);
    },
    cancel() {
      clearPendingTimer();
      pending = false;
    },
    async settled() {
      await inFlight;
    },
    async flush() {
      clearPendingTimer();
      if (pending) {
        await runSave().catch(() => undefined);
        return;
      }
      await inFlight;
    },
  };
}

// `clip.mp4` -> `clip-edit.mp4`. The rendered bytes are always MP4/AVC.
export function renderedFileName(sourceFileName: string): string {
  const base = sourceFileName.replace(/\.[^./\\]+$/, '') || 'video';
  return `${base}-edit.mp4`;
}

export interface UseLibraryTimelineAdapterOptions {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
}

export interface UseLibraryTimelineAdapterResult {
  adapter: TimelineEditorAdapter;
  loading: boolean;
  error: string | null;
  hasDraft: boolean;
  discardDraft: () => Promise<void>;
}

export function useLibraryTimelineAdapter({
  brandId,
  asset,
  onAssetChanged,
}: UseLibraryTimelineAdapterOptions): UseLibraryTimelineAdapterResult {
  const [document, setDocumentState] = useState<TimelineDocument>(() => ({ items: [] }));
  const [pool, setPoolState] = useState<LibraryPoolSource[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The render path must never composite a stale props closure, and the autosave
  // body must serialize what is on screen right now — both read the refs.
  const documentRef = useRef<TimelineDocument>(document);
  const poolRef = useRef<LibraryPoolSource[]>(pool);
  const assetRef = useRef<MediaAsset>(asset);
  assetRef.current = asset;
  // Built at the start of a render (resolveSources) and reused by resolveOverlays
  // in the same pass, so both halves of the timeline share one blob cache.
  const renderResolverRef = useRef<LibraryTimelineResolver | null>(null);

  const applyDocument = useCallback((next: TimelineDocument) => {
    documentRef.current = next;
    setDocumentState(next);
  }, []);

  const applyPool = useCallback((next: LibraryPoolSource[]) => {
    poolRef.current = next;
    setPoolState(next);
  }, []);

  const persist = useCallback(
    async (overrides?: { status?: TimelineDraftStatus; renderedAssetId?: string }) => {
      const response = await fetch(DRAFTS_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          assetId: assetRef.current.id,
          document: toDraftDocument({
            sourceAssetId: assetRef.current.id,
            pool: poolRef.current,
            document: documentRef.current,
          }),
          ...(overrides?.status ? { status: overrides.status } : {}),
          ...(overrides?.renderedAssetId ? { renderedAssetId: overrides.renderedAssetId } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`Saving the draft failed (${response.status})`);
      }
      setHasDraft(true);
    },
    [brandId],
  );

  const scheduler = useMemo(
    () =>
      createDraftSaveScheduler({
        delayMs: AUTOSAVE_DEBOUNCE_MS,
        save: () =>
          persist().catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : 'Saving the draft failed');
          }),
      }),
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ brandId, assetId: asset.id });
    fetch(`${DRAFTS_ENDPOINT}?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load the draft (${response.status})`);
        return getTimelineDraftResponseSchema.parse(await response.json());
      })
      .then((body) => {
        if (cancelled) return;
        if (body.draft) {
          applyDocument(fromDraftDocument(body.draft.document));
          applyPool(draftPoolToSources(body.draft.document.pool, body.poolMedia));
          setHasDraft(true);
          return;
        }
        const seed = seedTimelineDocumentFromAsset(assetRef.current);
        applyDocument(seed.document);
        applyPool(seed.pool);
        setHasDraft(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // No seeding on a failed load: an autosave over a draft we could not read
        // would overwrite a cut the user still has.
        setError(err instanceof Error ? err.message : 'Could not load the draft');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, asset.id, applyDocument, applyPool]);

  // An edit made a moment before the component goes away still has to land.
  useEffect(() => {
    return () => {
      void scheduler.flush();
    };
  }, [scheduler]);

  // `invalidatesRender` is a canvas concern (the workflow break-point gate). The
  // Library has no downstream graph to invalidate, so every edit is just an edit.
  const patchDocument = useCallback(
    (updater: (current: TimelineDocument) => TimelineDocument) => {
      applyDocument(updater(documentRef.current));
      scheduler.schedule();
    },
    [applyDocument, scheduler],
  );

  const addPoolSources = useCallback(
    (sources: LibraryPoolSource[]) => {
      const existing = new Set(poolRef.current.map((source) => source.nodeId));
      const added = sources.filter((source) => {
        if (existing.has(source.nodeId)) return false;
        existing.add(source.nodeId);
        return true;
      });
      if (added.length === 0) return;
      applyPool([...poolRef.current, ...added]);
      scheduler.schedule();
    },
    [applyPool, scheduler],
  );

  // Removing a bin member also removes its placements: a clip whose source left
  // the bin is an unrenderable timeline, and the resolver would fail the export
  // rather than quietly shorten it.
  const removePoolSource = useCallback(
    (sourceId: string) => {
      applyPool(poolRef.current.filter((source) => source.nodeId !== sourceId));
      const current = documentRef.current;
      applyDocument({
        ...current,
        items: current.items
          .filter((item) => item.sourceNodeId !== sourceId)
          .map((item, index) => ({ ...item, order: index })),
        overlayTracks: current.overlayTracks?.map((track) => ({
          ...track,
          items: track.items.filter((item) => item.sourceNodeId !== sourceId),
        })),
      });
      scheduler.schedule();
    },
    [applyDocument, applyPool, scheduler],
  );

  const discardDraft = useCallback(async () => {
    // Cancelling only stops the pending timer. A PUT that already left would
    // land after the DELETE and resurrect the row, so settle it first.
    scheduler.cancel();
    await scheduler.settled();
    const query = new URLSearchParams({ brandId, assetId: assetRef.current.id });
    const response = await fetch(`${DRAFTS_ENDPOINT}?${query.toString()}`, { method: 'DELETE' });
    if (!response.ok) {
      toast.error(`Discarding the draft failed (${response.status})`);
      return;
    }
    const seed = seedTimelineDocumentFromAsset(assetRef.current);
    applyDocument(seed.document);
    applyPool(seed.pool);
    setHasDraft(false);
    toast.success('Draft discarded');
  }, [brandId, applyDocument, applyPool, scheduler]);

  const completeRender = useCallback(
    async (blob: Blob, sink: TimelineRenderSinkKind) => {
      const target = assetRef.current;
      const file = new File([blob], renderedFileName(target.fileName), { type: 'video/mp4' });

      let renderedAssetId: string;
      if (sink === 'library-version') {
        const versionNumber = await saveFileAsNewVersion({
          brandId,
          assetId: target.id,
          file,
          note: 'Video editor cut',
        });
        renderedAssetId = target.id;
        toast.success(`Saved as v${versionNumber}`);
      } else if (sink === 'library-new-asset') {
        const uploaded = await uploadMediaAsset({ file, brandId });
        renderedAssetId = uploaded.assetId;
        toast.success('Saved as a new Library asset');
      } else {
        throw new Error(`The Library cannot render into the "${sink}" sink`);
      }

      // The bytes are already safe in the Library; a failed stamp is bookkeeping,
      // never a failed render. Let any autosave already in flight settle first,
      // or it would land after the stamp and revert the draft to 'active'.
      scheduler.cancel();
      await scheduler.settled();
      await persist({ status: 'rendered', renderedAssetId }).catch((err: unknown) => {
        console.warn('[library/timeline] could not stamp the draft as rendered', err);
      });

      onAssetChanged?.();
    },
    [brandId, onAssetChanged, persist, scheduler],
  );

  const binAction = useMemo(
    () =>
      createElement(LibraryBinActions, {
        brandId,
        excludeAssetIds: pool.map((source) => source.nodeId),
        onAdd: addPoolSources,
        hasDraft,
        onDiscard: () => void discardDraft(),
      }),
    [brandId, pool, addPoolSources, hasDraft, discardDraft],
  );

  const adapter = useMemo<TimelineEditorAdapter>(
    () => ({
      scope: 'library',
      brandId,
      header: {
        title: 'Video editor',
        description: `Cut ${asset.title ?? asset.fileName} and save it back to the Library.`,
      },
      document,
      getDocument: () => documentRef.current,
      patchDocument,
      pool,
      addPoolSources,
      removePoolSource,
      binAction,
      // One resolver for the whole render: the base track and the overlay tracks
      // must share its blob cache, or a source used on both is signed and
      // downloaded twice — a second full copy of a video, in the browser.
      resolveSources: (items) => {
        renderResolverRef.current = createLibraryTimelineResolver({
          brandId,
          pool: poolRef.current,
        });
        return renderResolverRef.current.resolveSources(items);
      },
      resolveOverlays: (tracks) => {
        const resolver =
          renderResolverRef.current ??
          createLibraryTimelineResolver({ brandId, pool: poolRef.current });
        return resolver.resolveOverlays(tracks);
      },
      renderSinks: RENDER_SINKS,
      completeRender,
      // The Library has no second surface mirroring the render, unlike the canvas
      // node card.
      reportRenderProgress: () => undefined,
      reportRenderState: () => undefined,
      onEditorOpenChange: (open) => {
        if (!open) void scheduler.flush();
      },
    }),
    [
      brandId,
      asset.title,
      asset.fileName,
      document,
      pool,
      patchDocument,
      addPoolSources,
      removePoolSource,
      binAction,
      completeRender,
      scheduler,
    ],
  );

  return { adapter, loading, error, hasDraft, discardDraft };
}
