'use client';

import type { ApiRenderJob, ApiRenderOutput } from '@continuum/contracts';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import { formatRelativeTime } from '@/components/approvals/formatters';
import { approvalState, DeliveryChain, deliveryReasonText } from '@/components/forge/DeliveryChain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// One render, expanded from its row in Renders: what it looks like per format, its facts, and
// every step from the queue to Meta — each with a state and, where the data has one, a time.
// The row's thumbnail and this preview share a ViewTransition name, so opening morphs one into
// the other; the caller skips the transition under prefers-reduced-motion.

// ViewTransition ships in the React canary Next bundles; stable @types/react lacks it — the same
// cast as OrganicWorkspaceTabs.tsx.
export const ViewTransition =
  (
    React as unknown as {
      ViewTransition?: React.ComponentType<{ name?: string; children: React.ReactNode }>;
    }
  ).ViewTransition ??
  function ViewTransitionFallback({ children }: { name?: string; children: React.ReactNode }) {
    return <>{children}</>;
  };

export const jobTransitionName = (jobId: string) => `forge-job-${jobId}`;

type Tone = 'muted' | 'warning' | 'success' | 'destructive';

/** `unknown` is never a pass: the judge could not run, and the badge says so. */
export function verdictOf(job: ApiRenderJob): { text: string; tone: Tone; title?: string } {
  if (job.judge) {
    return job.judge.state === 'pass'
      ? { text: 'Judged · pass', tone: 'success' }
      : job.judge.state === 'fail'
        ? { text: 'Judged · fail', tone: 'destructive' }
        : {
            text: 'Judge unknown',
            tone: 'warning',
            title: 'The judge could not run on this frame',
          };
  }
  if (!job.fit) return { text: '—', tone: 'muted' };
  if (!job.fit.escalate) return { text: 'Fits', tone: 'success', title: job.fit.why };
  return job.status === 'finished'
    ? { text: 'Judging…', tone: 'warning', title: job.fit.why }
    : { text: 'Needs judge', tone: 'warning', title: job.fit.why };
}

/** How far from square an output is — 0 for a square, growing either way. Unknown sizes sort last. */
export const squareness = (output: Pick<ApiRenderOutput, 'width' | 'height' | 'fileName'>) => {
  if (output.width && output.height) return Math.abs(Math.log(output.width / output.height));
  const ratio = /(\d+)[_x](\d+)/.exec(output.fileName);
  return ratio ? Math.abs(Math.log(Number(ratio[1]) / Number(ratio[2]))) : Number.POSITIVE_INFINITY;
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** `1080×1920` → `9:16`; falls back to the size in the file name, then the kind. */
export function ratioLabel(output: ApiRenderOutput): string {
  const size =
    output.width && output.height
      ? [output.width, output.height]
      : (/(\d+)[_x](\d+)/.exec(output.fileName)?.slice(1).map(Number) ?? null);
  if (!size?.[0] || !size[1]) return output.kind;
  const divisor = gcd(size[0], size[1]);
  return `${size[0] / divisor}:${size[1] / divisor}`;
}

type StepState = 'done' | 'active' | 'error' | 'pending' | 'skipped';
type Step = { label: string; state: StepState; detail?: string; at?: string | null };

const inFlight = (job: ApiRenderJob) => job.status !== 'finished' && job.status !== 'failed';

/** Queued → Rendering → Checks → Library → Slack → Meta approval → Published. */
export function jobSteps(job: ApiRenderJob): Step[] {
  const finished = job.status === 'finished';
  const failed = job.status === 'failed';
  const verdict = verdictOf(job);
  const saved = job.outputs.filter((output) => output.assetId).length;
  const slack = job.slackDelivery;
  const approval = approvalState(job);
  const receipt = job.delivery[0];

  const checks: Step = job.judge
    ? {
        label: 'Checks',
        state:
          job.judge.state === 'pass' ? 'done' : job.judge.state === 'fail' ? 'error' : 'skipped',
        detail: verdict.title ?? verdict.text,
      }
    : job.fit && !job.fit.escalate
      ? { label: 'Checks', state: 'done', detail: 'Fits' }
      : job.fit
        ? { label: 'Checks', state: finished ? 'active' : 'pending', detail: verdict.text }
        : {
            label: 'Checks',
            state: finished || failed ? 'skipped' : 'pending',
            detail: 'No placement check',
          };

  return [
    { label: 'Queued', state: 'done', at: job.createdAt },
    {
      label: 'Rendering',
      state: finished
        ? 'done'
        : failed
          ? 'error'
          : job.status === 'rendering'
            ? 'active'
            : 'pending',
      ...(failed && job.error ? { detail: job.error } : {}),
      ...(finished || failed ? { at: job.updatedAt } : {}),
    },
    checks,
    saved
      ? { label: 'Library', state: 'done', detail: `${saved} file${saved === 1 ? '' : 's'} saved` }
      : { label: 'Library', state: finished ? 'active' : failed ? 'skipped' : 'pending' },
    !slack
      ? { label: 'Slack', state: 'skipped', detail: 'No channel chosen' }
      : {
          label: 'Slack',
          state:
            slack.status === 'posted'
              ? 'done'
              : slack.status === 'error'
                ? 'error'
                : slack.status === 'skipped'
                  ? 'skipped'
                  : finished
                    ? 'active'
                    : 'pending',
          detail: slack.reason
            ? `#${slack.channelName} · ${slack.reason}`
            : `#${slack.channelName}`,
          at: slack.postedAt,
        },
    !approval
      ? { label: 'Meta approval', state: 'skipped', detail: 'Library only' }
      : {
          label: 'Meta approval',
          state:
            approval.tone === 'destructive'
              ? 'error'
              : approval.tone === 'success'
                ? 'done'
                : job.approval
                  ? 'active'
                  : 'pending',
          detail: approval.text,
          at: job.approval?.decidedAt,
        },
    !job.deliveryTarget
      ? { label: 'Published', state: 'skipped', detail: 'Library only' }
      : receipt?.status === 'published' || job.approval?.status === 'published'
        ? { label: 'Published', state: 'done', at: receipt?.publishedAt }
        : receipt?.status === 'error'
          ? { label: 'Published', state: 'error', detail: deliveryReasonText(receipt.reason) ?? undefined }
          : receipt?.status === 'dropped' || job.approval?.status === 'rejected'
            ? { label: 'Published', state: 'skipped', detail: deliveryReasonText(receipt?.reason) ?? 'Not approved' }
            : receipt?.reason === 'delivery_bridge_unconfigured'
              ? { label: 'Published', state: 'skipped', detail: deliveryReasonText(receipt.reason) ?? undefined }
              : { label: 'Published', state: 'pending' },
  ];
}

const STEP_DOT: Record<StepState, string> = {
  done: 'bg-emerald-500',
  active: 'bg-amber-500 animate-pulse motion-reduce:animate-none',
  error: 'bg-destructive',
  pending: 'border border-border bg-background',
  skipped: 'bg-muted-foreground/30',
};

function duration(job: ApiRenderJob): string {
  if (inFlight(job)) return '—';
  const seconds = Math.max(
    0,
    Math.round((Date.parse(job.updatedAt) - Date.parse(job.createdAt)) / 1000),
  );
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function RenderJobDetail({
  job,
  templateName,
  setName,
  onBack,
  onRefresh,
}: {
  job: ApiRenderJob;
  templateName: string;
  setName: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const outputs = [...job.outputs].sort((a, b) => squareness(a) - squareness(b));
  const [outputId, setOutputId] = useState<string | null>(null);
  const output = outputs.find((item) => item.id === outputId) ?? outputs[0] ?? null;
  const verdict = verdictOf(job);
  const name = job.label ?? job.labelPath.at(-1) ?? templateName;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden /> All renders
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {job.labelPath.length > 1 ? `${job.labelPath.slice(0, -1).join(' / ')} · ` : ''}
            {templateName}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <div className="space-y-2">
          <ViewTransition name={jobTransitionName(job.id)}>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
              {output?.kind === 'video' ? (
                // biome-ignore lint/a11y/useMediaCaption: renders carry no caption track.
                <video
                  key={output.id}
                  src={output.url}
                  controls
                  playsInline
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : output ? (
                <img
                  src={output.url}
                  alt={`${name} · ${ratioLabel(output)}`}
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <p className="p-6 text-xs text-muted-foreground">
                  {job.status === 'failed' ? 'This render failed.' : 'No file yet.'}
                </p>
              )}
            </div>
          </ViewTransition>
          {outputs.length > 1 ? (
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">Format</legend>
              {outputs.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="xs"
                  variant={item.id === output?.id ? 'default' : 'outline'}
                  aria-pressed={item.id === output?.id}
                  onClick={() => setOutputId(item.id)}
                >
                  {ratioLabel(item)}
                </Button>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-3 text-xs">
            {output ? (
              <a
                href={output.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden /> Open file
              </a>
            ) : null}
            {job.slackDelivery?.permalink ? (
              <a
                href={job.slackDelivery.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden /> Slack post
              </a>
            ) : null}
          </div>
          {job.error ? <p className="text-xs text-destructive">{job.error}</p> : null}
        </div>

        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{job.status}</dd>
            <dt className="text-muted-foreground">Requested</dt>
            <dd title={job.createdAt}>{formatRelativeTime(job.createdAt)}</dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="tabular-nums">{duration(job)}</dd>
            <dt className="text-muted-foreground">Set</dt>
            <dd>{setName}</dd>
            <dt className="text-muted-foreground">Formats</dt>
            <dd>{outputs.length ? outputs.map(ratioLabel).join(', ') : '—'}</dd>
            <dt className="text-muted-foreground">Check</dt>
            <dd>
              <Badge variant={verdict.tone} title={verdict.title}>
                {verdict.text}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>
              <DeliveryChain job={job} />
            </dd>
          </dl>

          <ol aria-label="Steps" className="space-y-2 text-xs">
            {jobSteps(job).map((step) => (
              <li key={step.label} data-state={step.state} className="flex gap-2">
                <span className={cn('mt-1 size-2 shrink-0 rounded-full', STEP_DOT[step.state])} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={step.state === 'skipped' ? 'text-muted-foreground' : 'font-medium'}
                    >
                      {step.label}
                    </span>
                    <span className="text-2xs text-muted-foreground">{step.state}</span>
                    {step.at ? (
                      <span className="text-2xs text-muted-foreground" title={step.at}>
                        {formatRelativeTime(step.at)}
                      </span>
                    ) : null}
                  </p>
                  {step.detail ? (
                    <p className="break-words text-muted-foreground">{step.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
