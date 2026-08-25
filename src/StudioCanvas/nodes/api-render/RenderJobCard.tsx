'use client';

import type { ApiRenderJob, ApiRenderOutput } from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * The real render lifecycle, in the server's own words. There is deliberately no
 * percentage: no percent, stage or ETA exists anywhere on this path — not in the job DTO,
 * not in the `ad_render_jobs` CHECK constraint, and not in the fleet's status response.
 * A bar would be a number this system cannot produce.
 */
const STEPS = ['submitting', 'queued', 'rendering', 'finished'] as const;

const elapsed = (job: ApiRenderJob): string => {
  const started = Date.parse(job.createdAt);
  const ended = Date.parse(job.updatedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return '';
  const seconds = Math.max(0, Math.round((ended - started) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const deliveryLabel = (job: ApiRenderJob): string | null => {
  const receipt = job.delivery[0];
  if (!receipt) return null;
  if (receipt.status === 'published') return `Published · Meta ad ${receipt.adId ?? 'created'}`;
  if (receipt.status === 'error' || receipt.status === 'dropped') {
    return `Delivery ${receipt.status} · ${receipt.reason ?? 'See render log'}`;
  }
  return 'Delivery pending';
};

function StatusSteps({ job }: { job: ApiRenderJob }) {
  if (job.status === 'failed') {
    return (
      <span className="text-2xs text-destructive">Failed · {job.error ?? 'See render log'}</span>
    );
  }
  const reached = STEPS.indexOf(job.status as (typeof STEPS)[number]);
  return (
    <span className="flex flex-wrap items-center gap-1 text-2xs" data-testid="render-steps">
      {STEPS.map((step, index) => (
        <span
          key={step}
          data-state={index < reached ? 'done' : index === reached ? 'current' : 'pending'}
          className={
            index === reached
              ? 'font-medium text-foreground'
              : index < reached
                ? 'text-muted-foreground line-through'
                : 'text-muted-foreground/60'
          }
        >
          {step}
        </span>
      ))}
      <span className="text-muted-foreground">· {elapsed(job)}</span>
    </span>
  );
}

/**
 * One job, with EVERY output — not just the first. A template can emit several assets and
 * showing one of them silently hid the rest.
 *
 * The `src` always comes from the live job DTO and is never persisted. The backend swaps
 * an output's URL for a signed Library one as soon as the ingest lands
 * (`preferLibraryOutputUrls`), so a plain re-read is what upgrades the preview from the
 * fleet's expiring link to the durable copy — no client-side signing, and no saved URL to
 * go stale. `loading="lazy"` / `preload="none"` keep the bytes unfetched until a preview is
 * actually on screen, which matters on a canvas holding several finished renders.
 *
 * "Use as reference" is offered ONLY on an image output that already has both its Library
 * ids. The node it creates is version-pinned, and an output whose ingest has not landed
 * has nothing to pin to — a button that sometimes produced an unusable node would be
 * worse than no button. Videos are left alone: nothing downstream consumes one yet.
 */
export function RenderJobCard({
  job,
  onRefresh,
  onUseAsReference,
}: {
  job: ApiRenderJob;
  onRefresh: () => void;
  onUseAsReference?: (output: ApiRenderOutput) => void;
}) {
  const delivery = deliveryLabel(job);
  return (
    <div className="rounded border border-border/60 p-2 text-2xs">
      <button
        type="button"
        className="nodrag block w-full text-left hover:text-brand-primary"
        onClick={onRefresh}
      >
        <span className="flex items-center gap-1">
          <span className="truncate font-medium">{job.templateName}</span>
          {job.test ? (
            <Badge variant="warning" className="shrink-0">
              Test · watermarked
            </Badge>
          ) : null}
        </span>
        <StatusSteps job={job} />
        {delivery ? <span className="block truncate text-muted-foreground">{delivery}</span> : null}
      </button>
      {job.outputs.map((output) => (
        <div key={output.id} className="mt-1 space-y-1">
          {output.kind === 'video' ? (
            // biome-ignore lint/a11y/useMediaCaption: a rendered ad has no caption track
            <video
              className="nodrag w-full rounded border border-border/60"
              src={output.url}
              controls
              preload="none"
            />
          ) : (
            <img
              className="nodrag w-full rounded border border-border/60"
              src={output.url}
              alt={`${job.templateName} render ${output.fileName}`}
              loading="lazy"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <a
              className="nodrag truncate text-brand-primary underline-offset-2 hover:underline"
              href={output.url}
              target="_blank"
              rel="noreferrer"
            >
              Open {output.fileName}
            </a>
            <span className="flex shrink-0 items-center gap-2">
              {onUseAsReference && output.kind === 'image' && output.assetId && output.versionId ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="nodrag"
                  onClick={() => onUseAsReference(output)}
                >
                  Use as reference
                </Button>
              ) : null}
              <span className="text-muted-foreground">
                {output.assetId ? 'Saved to Library' : 'Saving to Library…'}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
