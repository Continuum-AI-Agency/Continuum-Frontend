'use client';

import {
  type ApiRenderJob,
  type ApiRenderOutput,
  isBucketOnlyRenderFile,
} from '@continuum/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

/**
 * What the checks said about this render — automatically, with nobody asked to press anything.
 *
 * Two instruments, in order. The placement check ran at preflight, in closed form, over the
 * assets that were actually pinned; if it answered cleanly for every slot, that is the end of
 * it and nothing else was spent. If it could not answer, or answered badly, the finished frame
 * went to the judge on its own and this is what came back.
 *
 * `unknown` from the judge is shown as unknown. It means the judge could not RUN — no
 * credential, no reachable fleet — and rendering that as a pass is the one inversion that turns
 * an unchecked frame into a checked one.
 */
function CheckSummary({ job }: { job: ApiRenderJob }) {
  if (job.status !== 'finished') return null;
  const findings = job.judge?.verdict?.findings ?? [];

  if (job.judge) {
    if (job.judge.state === 'unknown') {
      return (
        <Badge variant="muted" className="mt-1">
          Not checked · {job.judge.why ?? 'the judge could not run'}
        </Badge>
      );
    }
    if (job.judge.state === 'pass' && findings.length === 0) {
      return (
        <Badge variant="success" className="mt-1">
          Checked · nothing found
        </Badge>
      );
    }
    return (
      <Alert className="mt-1 border-warning/40">
        <AlertTitle className="text-2xs">
          {findings.length} finding{findings.length === 1 ? '' : 's'} on the rendered frame
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-1">
          {job.judge.escalatedBecause ? (
            <span className="text-2xs text-muted-foreground">{job.judge.escalatedBecause}</span>
          ) : null}
          <span className="flex flex-wrap gap-1">
            {findings.map((finding, index) => (
              <Badge
                // Findings have no id of their own; kind + hint + position is what distinguishes
                // two on one frame.
                key={`${finding.kind}-${finding.layerHint}-${index}`}
                variant={finding.severity === 'high' ? 'destructive' : 'warning'}
              >
                {finding.kind.replace(/_/g, ' ')}
                {finding.layerHint ? ` · ${finding.layerHint}` : ''}
              </Badge>
            ))}
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  // No verdict and none coming: every slot was measured and landed. The cheapest good outcome.
  if (job.fit && !job.fit.escalate) {
    return (
      <Badge variant="success" className="mt-1">
        Placement checked · {job.fit.why}
      </Badge>
    );
  }
  if (job.fit?.escalate) {
    return (
      <Badge variant="muted" className="mt-1">
        Checking the frame…
      </Badge>
    );
  }
  return null;
}

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
      <CheckSummary job={job} />
      {job.outputs.map((output) => (
        <div key={output.id} className="mt-1 space-y-1">
          {/* A master (MOV/MXF) is a download: browsers cannot play ProRes or MXF inline. */}
          {isBucketOnlyRenderFile(output.fileName) ? null : output.kind === 'video' ? (
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
                {isBucketOnlyRenderFile(output.fileName)
                  ? 'In the render bucket'
                  : output.assetId
                    ? 'Saved to Library'
                    : 'Saving to Library…'}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
