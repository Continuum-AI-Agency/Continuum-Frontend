'use client';

import type { ClientRenderJob, JainaPaidCreativeRenderPayload } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import type { ChatMedia } from '@/components/chat/media/media';
import { useUiErrorMessage } from '@/i18n/errors';
import { getClientRenderJob } from '@/lib/api/clientRenderJobs.client';
import type { CreativeArtifact } from '@/lib/jaina/schemas';
import { fetchPaidScaffoldTreeRows } from '@/lib/paid-media/scaffold-tree-client';

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'superseded']);
const REFRESH_MS = 3_000;

export function PaidCreativeRenderStatus({
  render,
  onCreativeReady,
}: {
  render: JainaPaidCreativeRenderPayload;
  onCreativeReady?: (creative: CreativeArtifact) => void;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  const [job, setJob] = useState<ClientRenderJob | null>(null);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const [signError, setSignError] = useState<
    { cause: unknown } | { code: 'attachment_review' } | null
  >(null);
  const [media, setMedia] = useState<ChatMedia[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const result = await getClientRenderJob(
          render.render_job_id,
          render.brand_id,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setJob(result.job);
        setError(null);
        if (!TERMINAL_STATES.has(result.job.state)) timer = setTimeout(read, REFRESH_MS);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError({ cause });
        timer = setTimeout(read, REFRESH_MS);
      }
    };
    void read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [render.brand_id, render.render_job_id]);

  useEffect(() => {
    if (job?.state !== 'completed' || job.resultAssetRefs.length === 0) return;
    let cancelled = false;
    setSignError(null);
    void Promise.all(
      job.resultAssetRefs.map(async (ref): Promise<ChatMedia | null> => {
        const response = await fetch('/api/library/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: render.brand_id,
            assetId: ref.asset_id,
            versionId: ref.version_id,
          }),
        });
        if (!response.ok) throw new Error('Rendered media is temporarily unavailable');
        const body = (await response.json()) as { signedUrl?: string };
        if (!body.signedUrl) throw new Error('Rendered media is temporarily unavailable');
        return {
          id: ref.asset_id,
          url: body.signedUrl,
          kind: 'video',
          name: 'Rendered reel',
        };
      }),
    )
      .then((items) => {
        if (cancelled) return;
        const visible = items.filter((item): item is ChatMedia => item !== null);
        setMedia(visible);
        const first = visible[0];
        if (!first || !onCreativeReady || (!render.canvas_target && !render.scaffold_target))
          return;
        void (async () => {
          if (render.scaffold_target) {
            // Completion reconciliation may still be committing when the render job first reads completed.
            let attached = false;
            for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
              const read = await fetchPaidScaffoldTreeRows({
                scaffoldVersionId: render.scaffold_target.scaffold_version_id,
              });
              if (
                read.rows.some(
                  (row) =>
                    row.pathKey === render.scaffold_target!.path_key &&
                    row.creativeAssetId === first.id,
                )
              ) {
                attached = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (!attached) {
              if (!cancelled) setSignError({ code: 'attachment_review' });
              return;
            }
          }
          if (!cancelled)
            onCreativeReady({
              id: first.id,
              asset_id: first.id,
              type: 'creative',
              url: first.url,
              format: 'video',
              scaffold_target: render.scaffold_target,
              canvas_target: render.canvas_target,
              ...(render.scaffold_target ? { attachment_status: 'attached' as const } : {}),
            });
        })().catch((cause: unknown) => {
          if (!cancelled) setSignError({ cause });
        });
      })
      .catch((cause) => {
        if (!cancelled) {
          setSignError({ cause });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job, render.brand_id, render.canvas_target, render.scaffold_target, onCreativeReady]);

  const state = job?.state;
  const active = state === 'claimed' || state === 'rendering' || state === 'saving';
  const progress = Math.round(Math.max(0, Math.min(1, job?.progress ?? 0)) * 100);
  const phase = active ? job?.phase?.trim().slice(0, 120) : null;
  const endedError =
    state === 'failed' || state === 'cancelled' || state === 'superseded'
      ? job?.errorMessage
        ? formatUiError(new Error(job.errorMessage))
        : null
      : null;

  return (
    <section
      aria-label={uiText('paid_creative_render_status_7f6dcb4')}
      className="space-y-2 rounded-lg border p-3"
    >
      <div role="status" aria-live="polite" aria-busy={active} className="text-sm">
        <span className="font-medium">
          {uiText('jainaRenderState', { state: state ?? 'queued' })}
        </span>
        {phase ? <span className="text-muted-foreground"> · {phase}</span> : null}
        {active ? (
          <span className="text-muted-foreground">
            {' '}
            ·{' '}
            {new Intl.NumberFormat(uiLocale, {
              style: 'percent',
              maximumFractionDigits: 0,
            }).format(progress / 100)}
          </span>
        ) : null}
      </div>
      {active ? (
        <div
          role="progressbar"
          aria-label={uiText('render_progress_7d1d013')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {endedError || error || signError ? (
        <p role="alert" className="text-xs text-destructive">
          {endedError ||
            (error ? formatUiError(error.cause) : null) ||
            (signError
              ? 'code' in signError
                ? uiText('creativeScaffoldAttachmentReview')
                : formatUiError(signError.cause)
              : null)}
        </p>
      ) : null}
      {media.length > 0 ? (
        <ChatMediaCarousel items={media} className="aspect-video max-w-sm" fallbackSeed="Reel" />
      ) : null}
    </section>
  );
}
