'use client';

// Shared hook for opt-in Step-3 media realization: dispatches reel/video drafts
// to /reels/generate (FE-stitch path) and image/carousel drafts to /media/realize
// (headless Nano-Banana path). Both streams update the calendar store in-place so
// the calendar/list/preview surfaces reflect live progress without a refetch.

import {
  DEFAULT_MEDIA_REALIZE_BATCH_MAX,
  mediaExpandResponseSchema,
  mediaRealizeFrameSchema,
  reelVideoBatchFrameSchema,
} from '@continuum/contracts';
import * as React from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { stitchAndFinalizeReel } from '@/lib/organic/reelClientStitch';
import { useCalendarStore } from '@/lib/organic/store';
import { parseNdjson } from '@/lib/streaming/parseNdjson';
import { checkSpliceSupport } from '@/StudioCanvas/utils/splice/webcodecsSupport';
import { patchUnlessUserSupplied } from './attachWinsGuard';

export type MediaGenerationDraftTarget = {
  feId: string;
  backendDraftId: string;
  format: string;
  previewRevision: string;
};

export type DraftExpandTarget = {
  feId: string;
  backendDraftId: string;
};

export type UseGenerateDraftMediaResult = {
  generateDraftMedia: (brandId: string, drafts: MediaGenerationDraftTarget[]) => Promise<void>;
  isGenerating: boolean;
  /** Stage-2 "Enrich": enqueue a durable expand_draft (blueprint sketch) per draft. */
  expandDrafts: (brandId: string, drafts: DraftExpandTarget[]) => Promise<void>;
  isExpanding: boolean;
};

const REEL_FORMATS = new Set(['reel', 'video']);

function isReelFormat(format: string): boolean {
  return REEL_FORMATS.has(format.toLowerCase());
}

const REEL_STAGE_LABELS: Record<string, string> = {
  planning: 'Planning scenes…',
  generating_scenes: 'Generating clips…',
  stitching: 'Stitching reel…',
  persisting: 'Saving video…',
};

// Structured reel preflight codes → user-actionable copy. Anything unmapped
// passes through verbatim.
const REEL_ERROR_MESSAGES: Record<string, string> = {
  reel_scenes_missing_enrich_first:
    'This reel has no storyboard yet — run Enrich first to sketch its scenes.',
  preview_approval_required: 'Preview this draft before generating its final media.',
  preview_changed: 'This preview changed. Review the latest version, then generate again.',
};

export function friendlyReelError(error: string): string {
  return REEL_ERROR_MESSAGES[error] ?? error;
}

// Synthesizes a stable generation-registry job id for an editor-triggered
// realize. The realize stream has no backend job id, but the GenerationsPopover
// only needs a stable key per draft to project live status/progress.
function realizeJobId(feId: string): string {
  return `realize:${feId}`;
}

export function useGenerateDraftMedia(): UseGenerateDraftMediaResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const upsertGeneration = useCalendarStore((state) => state.upsertGeneration);
  const { show } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isExpanding, setIsExpanding] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const generateDraftMedia = React.useCallback(
    async (brandId: string, drafts: MediaGenerationDraftTarget[]) => {
      if (!brandId || drafts.length === 0) return;

      const reelTargets = drafts.filter((d) => isReelFormat(d.format));
      const imageTargets = drafts
        .filter((d) => !isReelFormat(d.format))
        .slice(0, DEFAULT_MEDIA_REALIZE_BATCH_MAX);

      if (reelTargets.length === 0 && imageTargets.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);

      // Surface every editor-triggered realize in the shell-wide
      // GenerationsPopover so closing the editor never hides in-flight work.
      for (const target of [...reelTargets, ...imageTargets]) {
        upsertGeneration({
          jobId: realizeJobId(target.feId),
          draftId: target.feId,
          status: 'running',
          stage: 'Generating media…',
        });
      }

      try {
        const token = await getBrowserAccessToken();
        const authHeaders: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        // Run reel generation + image/carousel realization in parallel.
        await Promise.all([
          reelTargets.length > 0
            ? realizeReels(
                brandId,
                reelTargets,
                updateDraft,
                upsertGeneration,
                show,
                controller,
                authHeaders,
              )
            : Promise.resolve(),
          imageTargets.length > 0
            ? realizeImages(
                brandId,
                imageTargets,
                updateDraft,
                upsertGeneration,
                show,
                controller,
                authHeaders,
              )
            : Promise.resolve(),
        ]);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // The batch fetch was aborted (editor unmounted / a newer run started).
          // Mark only still-in-flight entries cancelled so they don't hang on
          // "running" forever in the GenerationsPopover.
          const gens = useCalendarStore.getState().generations;
          for (const target of [...reelTargets, ...imageTargets]) {
            const key = realizeJobId(target.feId);
            const current = gens[key]?.status;
            if (current === 'running' || current === 'queued') {
              upsertGeneration({ jobId: key, draftId: target.feId, status: 'cancelled' });
            }
          }
          return;
        }
        show({
          title: 'Media generation failed',
          description: error instanceof Error ? error.message : 'Unexpected error.',
          variant: 'error',
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [updateDraft, upsertGeneration, show],
  );

  // Stage-2 "Enrich": plain JSON enqueue (no stream). The durable expand_draft
  // jobs sketch the blueprint in the background; the enriched rows arrive over
  // the calendar's Realtime subscription, which bumps the refetch nonce — the
  // same convergence path the per-draft enrichment ladder uses.
  const expandDrafts = React.useCallback(
    async (brandId: string, drafts: DraftExpandTarget[]) => {
      if (!brandId || drafts.length === 0) return;
      setIsExpanding(true);
      try {
        const token = await getBrowserAccessToken();
        const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/media/expand`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ brandId, draftIds: drafts.map((d) => d.backendDraftId) }),
        });
        if (!response.ok) {
          throw new Error(`Could not start enrichment (${response.status}).`);
        }
        const { jobs } = mediaExpandResponseSchema.parse(await response.json());

        const feIdByBackendId = new Map(drafts.map((d) => [d.backendDraftId, d.feId]));
        let enqueued = 0;
        let skipped = 0;
        for (const job of jobs) {
          const feId = feIdByBackendId.get(job.draftId);
          if (!job.jobId) {
            skipped++;
            continue;
          }
          enqueued++;
          if (feId) {
            // Optimistic: mirror the enrichment ladder's in-flight state; the row's
            // real transition (storyboard_ready) lands over Realtime.
            patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
              ...draft,
              status: 'streaming',
              generationError: undefined,
              generationStage: 'Sketching blueprint…',
            }));
          }
        }

        if (enqueued > 0) {
          show({
            title: 'Enriching drafts',
            description: `${enqueued} draft${enqueued === 1 ? '' : 's'} queued for a blueprint sketch${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
            variant: 'success',
          });
        } else {
          show({
            title: 'Nothing to enrich',
            description: 'The selected drafts already have media (or need copy first).',
            variant: 'error',
          });
        }
      } catch (error) {
        show({
          title: 'Enrichment failed',
          description: error instanceof Error ? error.message : 'Unexpected error.',
          variant: 'error',
        });
      } finally {
        setIsExpanding(false);
      }
    },
    [show, updateDraft],
  );

  return { generateDraftMedia, isGenerating, expandDrafts, isExpanding };
}

type UpsertGeneration = ReturnType<typeof useCalendarStore.getState>['upsertGeneration'];

// Reel generation: reuses the /reels/generate endpoint + FE stitch path.
async function realizeReels(
  brandId: string,
  targets: MediaGenerationDraftTarget[],
  updateDraft: ReturnType<typeof useCalendarStore.getState>['updateDraft'],
  upsertGeneration: UpsertGeneration,
  show: ReturnType<typeof useToast>['show'],
  controller: AbortController,
  authHeaders: Record<string, string>,
): Promise<void> {
  const support = await checkSpliceSupport();
  if (!support.ok) {
    show({
      title: "Can't render reels here",
      description: `${support.reason}. Try Chrome or Edge on desktop.`,
      variant: 'error',
    });
    return;
  }

  const feIdByBackendId = new Map(targets.map((t) => [t.backendDraftId, t.feId]));
  const feIdFor = (backendDraftId: string): string | null =>
    feIdByBackendId.get(backendDraftId) ?? null;

  const setStage = (backendDraftId: string, stage: string | undefined) => {
    const feId = feIdFor(backendDraftId);
    if (!feId) return;
    patchUnlessUserSupplied(updateDraft, feId, (draft) => ({ ...draft, generationStage: stage }));
    upsertGeneration({ jobId: realizeJobId(feId), draftId: feId, status: 'running', stage });
  };

  const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/reels/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      brandId,
      approvals: targets.map(({ backendDraftId, previewRevision }) => ({
        draftId: backendDraftId,
        previewRevision,
      })),
    }),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const message =
      response.status === 400
        ? 'Too many reels selected for one batch.'
        : 'Could not start reel generation.';
    for (const target of targets) {
      upsertGeneration({
        jobId: realizeJobId(target.feId),
        draftId: target.feId,
        status: 'failed',
        error: message,
      });
    }
    show({ title: 'Reel generation failed', description: message, variant: 'error' });
    return;
  }

  for await (const raw of parseNdjson(response.body)) {
    const parsed = reelVideoBatchFrameSchema.safeParse(raw);
    if (!parsed.success) continue;
    const frame = parsed.data;

    switch (frame.type) {
      case 'reel_started': {
        setStage(frame.draftId, REEL_STAGE_LABELS.planning);
        const feId = feIdFor(frame.draftId);
        if (feId && frame.jobId) {
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'running',
            backendJobId: frame.jobId,
          });
        }
        break;
      }
      case 'reel_progress':
        setStage(frame.draftId, REEL_STAGE_LABELS[frame.stage] ?? 'Working…');
        break;
      case 'reel_clips_ready': {
        const feId = feIdFor(frame.draftId);
        if (!feId) break;
        try {
          const linked = await stitchAndFinalizeReel({
            brandId,
            draftId: frame.draftId,
            clips: frame.clips,
            durationSec: frame.durationSec,
            signal: controller.signal,
            onStage: (label) => setStage(frame.draftId, label),
          });
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: undefined,
            mediaSuggestion: {
              ...draft.mediaSuggestion,
              mediaStatus: 'ready',
              reel: {
                ...draft.mediaSuggestion?.reel,
                generated: true,
                url: linked.path,
                bucket: linked.bucket,
                signedUrl: linked.signedUrl,
                durationSec: linked.durationSec,
                error: null,
              },
            },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'completed',
            stage: undefined,
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') break;
          const message = err instanceof Error ? err.message : 'Reel stitching failed.';
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: message,
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'failed',
            error: message,
          });
        }
        break;
      }
      case 'reel_ready': {
        const feId = feIdFor(frame.draftId);
        if (feId) {
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: undefined,
            mediaSuggestion: {
              ...draft.mediaSuggestion,
              mediaStatus: 'ready',
              reel: {
                ...draft.mediaSuggestion?.reel,
                generated: true,
                url: frame.mp4Path,
                bucket: frame.mp4Bucket,
                signedUrl: frame.mp4Url,
                durationSec: frame.durationSec,
                error: null,
              },
            },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'completed',
            stage: undefined,
          });
        }
        break;
      }
      case 'reel_failed': {
        const feId = feIdFor(frame.draftId);
        if (feId) {
          const message = friendlyReelError(frame.error);
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: message,
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'failed',
            error: message,
          });
        }
        break;
      }
      case 'batch_completed': {
        if (frame.ready > 0) {
          show({
            title: 'Reels generated',
            description: `${frame.ready} reel${frame.ready === 1 ? '' : 's'} ready${frame.failed > 0 ? `, ${frame.failed} failed` : ''}.`,
            variant: frame.failed > 0 ? 'error' : 'success',
          });
        } else if (frame.failed > 0) {
          show({
            title: 'Reel generation failed',
            description: `${frame.failed} reel${frame.failed === 1 ? '' : 's'} failed.`,
            variant: 'error',
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

// Image/carousel realization: POST /media/realize, stream mediaRealizeFrameSchema.
async function realizeImages(
  brandId: string,
  targets: MediaGenerationDraftTarget[],
  updateDraft: ReturnType<typeof useCalendarStore.getState>['updateDraft'],
  upsertGeneration: UpsertGeneration,
  show: ReturnType<typeof useToast>['show'],
  controller: AbortController,
  authHeaders: Record<string, string>,
): Promise<void> {
  // Mark all as generating optimistically.
  for (const target of targets) {
    patchUnlessUserSupplied(updateDraft, target.feId, (draft) => ({
      ...draft,
      generationStage: 'Generating media…',
      mediaSuggestion: { ...draft.mediaSuggestion, mediaStatus: 'generating' },
    }));
  }

  const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/media/realize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      brandId,
      approvals: targets.map(({ backendDraftId, previewRevision }) => ({
        draftId: backendDraftId,
        previewRevision,
      })),
    }),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const message =
      response.status === 400
        ? 'Too many drafts selected for one batch.'
        : 'Could not start media generation.';
    // Revert optimistic generating state.
    for (const target of targets) {
      patchUnlessUserSupplied(updateDraft, target.feId, (draft) => ({
        ...draft,
        generationStage: undefined,
        mediaSuggestion: { ...draft.mediaSuggestion, mediaStatus: 'pending' },
      }));
      upsertGeneration({
        jobId: realizeJobId(target.feId),
        draftId: target.feId,
        status: 'failed',
        error: message,
      });
    }
    show({ title: 'Media generation failed', description: message, variant: 'error' });
    return;
  }

  const feIdByBackendId = new Map(targets.map((t) => [t.backendDraftId, t.feId]));

  let ready = 0;
  let failed = 0;

  for await (const raw of parseNdjson(response.body)) {
    const parsed = mediaRealizeFrameSchema.safeParse(raw);
    if (!parsed.success) continue;
    const frame = parsed.data;

    switch (frame.type) {
      case 'realize_started': {
        const feId = feIdByBackendId.get(frame.draftId);
        if (feId) {
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: 'Generating media…',
            mediaSuggestion: { ...draft.mediaSuggestion, mediaStatus: 'generating' },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'running',
            stage: 'Generating media…',
            ...(frame.jobId ? { backendJobId: frame.jobId } : {}),
          });
        }
        break;
      }
      case 'realize_progress': {
        const feId = feIdByBackendId.get(frame.draftId);
        if (feId) {
          const stage = frame.message ?? 'Generating…';
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: stage,
          }));
          upsertGeneration({ jobId: realizeJobId(feId), draftId: feId, status: 'running', stage });
        }
        break;
      }
      case 'realize_ready': {
        const feId = feIdByBackendId.get(frame.draftId);
        ready++;
        if (feId) {
          // Mount the persisted, render-ready assets the server returned so the
          // card shows the generated creative immediately — no refetch/reload.
          // publishingAssets is the shape every card resolver reads (incl. the
          // carousel-only detail-preview strip); assetUrl mirrors the primary.
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: undefined,
            ...(frame.publishingAssets ? { publishingAssets: frame.publishingAssets } : {}),
            mediaSuggestion: {
              ...draft.mediaSuggestion,
              mediaStatus: 'ready',
              ...(frame.assetUrl ? { assetUrl: frame.assetUrl, signedUrl: frame.assetUrl } : {}),
            },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'completed',
            stage: undefined,
            ...(frame.assetUrl ? { previewUrl: frame.assetUrl } : {}),
          });
        }
        break;
      }
      case 'realize_failed': {
        const feId = feIdByBackendId.get(frame.draftId);
        const message = friendlyReelError(frame.error);
        failed++;
        if (feId) {
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: message,
            mediaSuggestion: { ...draft.mediaSuggestion, mediaStatus: 'pending' },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'failed',
            error: message,
          });
        }
        break;
      }
      case 'realize_batch_completed': {
        if (frame.ready > 0) {
          show({
            title: 'Media generated',
            description: `${frame.ready} draft${frame.ready === 1 ? '' : 's'} have media ready${frame.failed > 0 ? `, ${frame.failed} failed` : ''}.`,
            variant: frame.failed > 0 ? 'error' : 'success',
          });
          // Convergence safety net: realize_ready already mounted the assets for
          // an instant render; a refetch pulls the durable re-signed draft so the
          // calendar stays correct even if a frame was missed.
          useCalendarStore.getState().requestCalendarRefetch();
        } else if (frame.failed > 0) {
          show({
            title: 'Media generation failed',
            description: `${frame.failed} draft${frame.failed === 1 ? '' : 's'} failed.`,
            variant: 'error',
          });
        }
        break;
      }
      default:
        break;
    }
  }

  // Fallback summary if the endpoint didn't send a batch_completed frame.
  if (ready > 0 && failed === 0) {
    // already toasted above via realize_batch_completed; skip double-toast
  }
}
