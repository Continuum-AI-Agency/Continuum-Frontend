'use client';
import { useTranslations } from 'next-intl';

import { useUiErrorMessage } from '@/i18n/errors';

// Shared hook for opt-in Step-3 media realization: dispatches reel/video drafts
// to /reels/generate (editable Canvas composition path) and image/carousel drafts to /media/realize
// (headless Nano-Banana path). Both streams update the calendar store in-place so
// the calendar/list/preview surfaces reflect live progress without a refetch.

import {
  DEFAULT_MEDIA_REALIZE_BATCH_MAX,
  mediaExpandResponseSchema,
  mediaRealizeFrameSchema,
  preparePlannerCompositionResponseSchema,
  type ReelPreflightErrorCode,
  type ReelVideoBatchFrame,
  reelVideoBatchFrameSchema,
} from '@continuum/contracts';
import * as React from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { createClientRenderJob } from '@/lib/api/clientRenderJobs.client';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { openClientRenderInbox } from '@/lib/client-render/ClientRenderProvider';
import { markRenderStartedHere } from '@/lib/client-render/ownedRuns';
import { useCalendarStore } from '@/lib/organic/store';
import { parseNdjson } from '@/lib/streaming/parseNdjson';
import { patchUnlessUserSupplied } from './attachWinsGuard';
import { formatMediaReadyToast } from './mediaToastCopy';

export type MediaGenerationDraftTarget = {
  feId: string;
  backendDraftId: string;
  format: string;
  previewRevision: string;
  /** Re-paint the draft's copy into this Forge template instead of generating pixels. */
  templateKey?: string;
};

export type DraftExpandTarget = {
  feId: string;
  backendDraftId: string;
};

export type StitchPlannerDraftTarget = {
  feId: string;
  backendDraftId: string;
  durationSec: number;
};

export type UseGenerateDraftMediaResult = {
  generateDraftMedia: (brandId: string, drafts: MediaGenerationDraftTarget[]) => Promise<void>;
  isGenerating: boolean;
  /** Stage-2 "Enrich": enqueue a durable expand_draft (blueprint sketch) per draft. */
  expandDrafts: (brandId: string, drafts: DraftExpandTarget[]) => Promise<void>;
  isExpanding: boolean;
  /** Opens the shared render inbox where this prepared reel can be claimed. */
  stitchDraftReel: (brandId: string, draft: StitchPlannerDraftTarget) => Promise<void>;
  stitchingDraftIds: ReadonlySet<string>;
};

const REEL_FORMATS = new Set(['reel', 'video']);

function isReelFormat(format: string): boolean {
  return REEL_FORMATS.has(format.toLowerCase());
}

const REEL_STAGE_LABELS: Record<string, string> = {
  planning: 'Planning scenes…',
  generating_scenes: 'Generating clips…',
  stitching: 'Preparing composition…',
  persisting: 'Saving composition…',
};

// Structured reel preflight codes → user-actionable copy. Anything unmapped
// passes through verbatim.
const REEL_ERROR_MESSAGES: Record<string, string> = {
  reel_scenes_missing_enrich_first:
    'This reel has no storyboard yet — run Enrich first to sketch its scenes.',
  preview_approval_required: 'Preview this draft before generating its final media.',
  preview_changed: 'This preview changed. Review the latest version, then generate again.',
};

const REEL_ERROR_KEYS = {
  reel_scenes_missing_enrich_first: 'reelStoryboardMissing',
  preview_approval_required: 'reelPreviewRequired',
  preview_changed: 'reelPreviewChanged',
} as const satisfies Record<ReelPreflightErrorCode, string>;

export function friendlyReelError(
  error: string,
  translate?: ReturnType<typeof useTranslations<'organic'>>,
): string {
  if (translate)
    return translate(
      Object.hasOwn(REEL_ERROR_KEYS, error)
        ? REEL_ERROR_KEYS[error as keyof typeof REEL_ERROR_KEYS]
        : 'streamGenerationFailed',
    );
  return REEL_ERROR_MESSAGES[error] ?? error;
}

// Veo scene rendering holds the stream for minutes, so the backend heartbeats
// reel_progress frames carrying human-ready copy plus elapsed/ETA telemetry.
// Surfacing it keeps the generation widget honest instead of parking on one
// stage label that never moves.
export function reelProgressLabel(
  frame: Extract<ReelVideoBatchFrame, { type: 'reel_progress' }>,
  translate?: ReturnType<typeof useTranslations<'organic'>>,
): string {
  if (translate)
    return translate('reelProgress', {
      stage: frame.stage,
      hasElapsed: typeof frame.elapsedSec === 'number' ? 'yes' : 'no',
      elapsed: frame.elapsedSec ?? 0,
      hasEta: typeof frame.etaSec === 'number' ? 'yes' : 'no',
      eta: frame.etaSec ?? 0,
    });
  if (frame.message) return frame.message;
  const stageLabel = REEL_STAGE_LABELS[frame.stage] ?? 'Working…';
  const telemetry: string[] = [];
  if (typeof frame.elapsedSec === 'number') telemetry.push(`${frame.elapsedSec}s elapsed`);
  if (typeof frame.etaSec === 'number') telemetry.push(`~${frame.etaSec}s remaining`);
  return telemetry.length > 0 ? `${stageLabel} — ${telemetry.join(', ')}` : stageLabel;
}

// Synthesizes a stable generation-registry job id for an editor-triggered
// realize. The realize stream has no backend job id, but the in-flight feed
// only needs a stable key per draft to project live status/progress.
function realizeJobId(feId: string): string {
  return `realize:${feId}`;
}

export function useGenerateDraftMedia(): UseGenerateDraftMediaResult {
  const uiText = useTranslations('organic');
  const formatUiError = useUiErrorMessage();
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const upsertGeneration = useCalendarStore((state) => state.upsertGeneration);
  const { show } = useToast();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isExpanding, setIsExpanding] = React.useState(false);
  const stitchingDraftIds = React.useMemo<ReadonlySet<string>>(() => new Set(), []);
  const abortRef = React.useRef<AbortController | null>(null);

  // Do not abort when the Planner view unmounts. The request owns only module-level
  // Zustand updates + the shell toast, so it can safely finish while the user moves
  // to AI Studio or another section. A newer batch still supersedes it explicitly.

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
      // in-flight feed so closing the editor never hides running work.
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
                uiText,
                formatUiError,
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
                uiText,
                formatUiError,
              )
            : Promise.resolve(),
        ]);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // The batch fetch was aborted (editor unmounted / a newer run started).
          // Mark only still-in-flight entries cancelled so they don't hang on
          // "running" forever in the in-flight feed.
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
          title: uiText('media_generation_failed_62d2e37'),
          description: formatUiError(error),
          variant: 'error',
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [updateDraft, upsertGeneration, show, uiText, formatUiError],
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
            title: uiText('enriching_drafts_50c0faf'),
            description: uiText('blueprintQueued', { count: enqueued, skipped }),
            variant: 'success',
          });
        } else {
          show({
            title: uiText('nothing_to_enrich_c800976'),
            description: uiText('the_selected_drafts_already_have_media_or_nee_5484471'),
            variant: 'error',
          });
        }
      } catch (error) {
        show({
          title: uiText('enrichment_failed_8396f34'),
          description: formatUiError(error),
          variant: 'error',
        });
      } finally {
        setIsExpanding(false);
      }
    },
    [show, updateDraft, uiText, formatUiError],
  );

  const stitchDraftReel = React.useCallback(
    async (brandId: string, target: StitchPlannerDraftTarget) => {
      if (!brandId || !target.backendDraftId) return;
      openClientRenderInbox();
      show({
        title: uiText('reel_ready_to_render_f66a974'),
        description: uiText('claim_it_from_the_shared_render_queue_to_use__c397223'),
        variant: 'success',
      });
    },
    [show, uiText],
  );

  return {
    generateDraftMedia,
    isGenerating,
    expandDrafts,
    isExpanding,
    stitchDraftReel,
    stitchingDraftIds,
  };
}

type UpsertGeneration = ReturnType<typeof useCalendarStore.getState>['upsertGeneration'];

// Reel generation stops at durable scene clips. The composition API seeds the
// reserved Planner Canvas room and the shared render inbox owns the hardware step.
async function realizeReels(
  brandId: string,
  targets: MediaGenerationDraftTarget[],
  updateDraft: ReturnType<typeof useCalendarStore.getState>['updateDraft'],
  upsertGeneration: UpsertGeneration,
  show: ReturnType<typeof useToast>['show'],
  controller: AbortController,
  authHeaders: Record<string, string>,
  uiText: ReturnType<typeof useTranslations<'organic'>>,
  formatUiError: (error: unknown) => string,
): Promise<void> {
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
    const message = response.status === 400 ? uiText('reelTooMany') : uiText('reelStartFailed');
    for (const target of targets) {
      upsertGeneration({
        jobId: realizeJobId(target.feId),
        draftId: target.feId,
        status: 'failed',
        error: message,
      });
    }
    show({
      title: uiText('reel_generation_failed_590614a'),
      description: message,
      variant: 'error',
    });
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
      case 'reel_queued': {
        const feId = feIdFor(frame.draftId);
        if (!feId) break;
        setStage(frame.draftId, 'Generating UGC clips in the background…');
        upsertGeneration({
          jobId: realizeJobId(feId),
          draftId: feId,
          status: 'queued',
          backendJobId: frame.jobId,
          stage: 'Generating UGC clips in the background…',
        });
        show({
          title: uiText('ugc_generation_queued_e8a1715'),
          description: uiText('the_locked_character_clips_will_generate_in_t_d443b79'),
          variant: 'success',
        });
        break;
      }
      case 'reel_progress':
        setStage(frame.draftId, reelProgressLabel(frame, uiText));
        break;
      case 'reel_clips_ready': {
        const feId = feIdFor(frame.draftId);
        if (!feId) break;
        try {
          setStage(frame.draftId, 'Preparing composition…');
          const preparedResponse = await fetch('/api/organic/ai-studio/compositions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, draftId: frame.draftId }),
            signal: controller.signal,
          });
          if (!preparedResponse.ok) {
            const payload = (await preparedResponse.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(payload?.error ?? 'Could not prepare the Canvas composition.');
          }
          const prepared = preparePlannerCompositionResponseSchema.parse(
            await preparedResponse.json(),
          );
          await createClientRenderJob({
            brandId,
            sourceId: frame.draftId,
            sourceRevision: prepared.composition.sourceFingerprint,
            title: `Planner reel: ${frame.draftId.slice(0, 8)}`,
            inputs: prepared.clips.map((clip) => ({
              position: clip.index,
              kind: 'video',
              sourceId: `${clip.bucket}:${clip.storagePath}`,
              label: `Scene ${clip.index + 1}`,
              sourceRevision: prepared.composition.sourceFingerprint,
              storage: { bucket: clip.bucket, path: clip.storagePath },
              role: clip.role,
              durationSeconds: clip.durationSec,
              ...(clip.mimeType ? { mimeType: clip.mimeType } : {}),
            })),
            executionSpec: {
              kind: 'planner_reel',
              draftId: frame.draftId,
              durationSeconds: frame.durationSec,
              origin: {
                label: 'Planner reel',
                viewHref: prepared.composition.openHref,
              },
            },
          });
          // This tab asked for the reel, so it may render it without an inbox click.
          // Keyed by the job's sourceId, which every planner_reel enqueue sets to the
          // draft id — four of these sat `ready` from July waiting for a click nobody
          // knew to make (Airtable #296).
          markRenderStartedHere(frame.draftId);
          patchUnlessUserSupplied(updateDraft, feId, (draft) => ({
            ...draft,
            generationStage: undefined,
            generationError: undefined,
            mediaSuggestion: {
              ...draft.mediaSuggestion,
              mediaStatus: 'pending',
              reel: {
                ...draft.mediaSuggestion?.reel,
                generated: false,
                durationSec: frame.durationSec,
                scenes: frame.clips.map((clip) => ({
                  ...clip,
                  error: null,
                })),
                composition: prepared.composition,
                error: null,
              },
            },
          }));
          upsertGeneration({
            jobId: realizeJobId(feId),
            draftId: feId,
            status: 'completed',
            stage: 'Ready to edit',
            previewUrl: frame.clips[0]?.signedClipUrl,
          });
          show({
            title: uiText('reel_ready_to_render_f66a974'),
            description: uiText('the_editable_composition_is_saved_claim_it_fr_b61923d'),
            variant: 'success',
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') break;
          const message = formatUiError(err);
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
          const message = friendlyReelError(frame.error, uiText);
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
            title: uiText('reel_clips_generated_346660d'),
            description: uiText('reelCompositionsPrepared', {
              count: frame.ready,
              failed: frame.failed,
            }),
            variant: frame.failed > 0 ? 'error' : 'success',
          });
        } else if (frame.failed > 0) {
          show({
            title: uiText('reel_generation_failed_590614a'),
            description: uiText('reelsFailed', { count: frame.failed }),
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
  uiText: ReturnType<typeof useTranslations<'organic'>>,
  formatUiError: (error: unknown) => string,
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
      approvals: targets.map(({ backendDraftId, previewRevision, templateKey }) => ({
        draftId: backendDraftId,
        previewRevision,
        ...(templateKey ? { templateKey } : {}),
      })),
    }),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const message = response.status === 400 ? uiText('mediaTooMany') : uiText('mediaStartFailed');
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
    show({
      title: uiText('media_generation_failed_62d2e37'),
      description: message,
      variant: 'error',
    });
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
        const message = friendlyReelError(frame.error, uiText);
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
            ...formatMediaReadyToast(frame.ready, frame.failed, uiText),
            variant: frame.failed > 0 ? 'error' : 'success',
          });
          // Convergence safety net: realize_ready already mounted the assets for
          // an instant render; a refetch pulls the durable re-signed draft so the
          // calendar stays correct even if a frame was missed.
          useCalendarStore.getState().requestCalendarRefetch();
        } else if (frame.failed > 0) {
          show({
            ...formatMediaReadyToast(frame.ready, frame.failed, uiText),
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
