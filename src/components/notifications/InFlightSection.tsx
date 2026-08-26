'use client';

// The live half of the notification box. Durable notifications below it are a record of
// things that already happened; this is work that is happening now, and it is the only
// place in the app where an organic generation and a Jaina report can be seen together.

import type { OrganicStatusTone } from '@continuum/contracts';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InFlightJob, UseInFlightJobsResult } from './useInFlightJobs';

// The canonical tone set, in this widget's text colours. "Will post" and "already posted"
// stay different colours here for the same reason they differ on the planner card.
const TONE_TEXT: Record<OrganicStatusTone, string> = {
  neutral: 'text-muted-foreground',
  pending: 'text-muted-foreground',
  active: 'text-amber-600 dark:text-amber-400',
  ready: 'text-foreground/80',
  scheduled: 'text-teal-600 dark:text-teal-400',
  live: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-destructive',
};

function StatusIcon({ job }: { job: InFlightJob }) {
  if (job.active) return <Loader2Icon className="size-3.5 animate-spin text-amber-500" />;
  if (job.error) return <AlertCircleIcon className="size-3.5 text-destructive" />;
  if (job.tone === 'live' || job.tone === 'ready')
    return <CheckCircle2Icon className="size-3.5 text-emerald-500" />;
  return <XCircleIcon className="size-3.5 text-muted-foreground" />;
}

function InFlightRow({
  job,
  onCancel,
  onRetry,
  onDownload,
  onNavigate,
}: {
  job: InFlightJob;
  onCancel: (job: InFlightJob) => void;
  onRetry: (job: InFlightJob) => void;
  onDownload: (job: InFlightJob) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/50">
      <StatusIcon job={job} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Both lines clamp, so both carry a title — a clamped string with no way to see
            the rest is how the old ticker came to read "Sketch re…". */}
        <span className="truncate text-xs font-medium text-foreground" title={job.title}>
          {job.title}
        </span>
        <div className="flex items-center gap-1.5">
          {job.badge && (
            <Badge className="h-4 px-1 text-3xs capitalize" variant="secondary">
              {job.badge}
            </Badge>
          )}
          {job.meta && <span className="text-3xs text-muted-foreground/70">{job.meta}</span>}
          <span
            className={cn('truncate text-3xs font-medium', TONE_TEXT[job.tone])}
            title={job.diagnostic ? `${job.stateLine} — ${job.diagnostic}` : job.stateLine}
          >
            {job.stateLine}
          </span>
        </div>
        {job.error && (
          <p className="line-clamp-2 text-3xs text-destructive/80" title={job.error}>
            {job.error}
          </p>
        )}
      </div>

      {job.canCancel && (
        <Button
          aria-label={`Stop ${job.title}`}
          className="size-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onCancel(job)}
          size="sm"
          variant="ghost"
        >
          <XIcon className="size-3" />
        </Button>
      )}

      {job.canRetry && (
        <Button
          className="h-5 shrink-0 gap-1 px-1.5 text-3xs text-muted-foreground"
          onClick={() => onRetry(job)}
          size="sm"
          variant="ghost"
        >
          <RefreshCwIcon className="size-3" />
          Retry
        </Button>
      )}

      {job.canDownload && (
        <Button
          className="h-5 shrink-0 gap-1 px-1.5 text-3xs text-muted-foreground"
          onClick={() => onDownload(job)}
          size="sm"
          variant="ghost"
        >
          <DownloadIcon className="size-3" />
          Open
        </Button>
      )}

      {!job.canDownload && !job.active && job.href && (
        <Button
          className="h-5 shrink-0 px-1.5 text-3xs text-muted-foreground"
          onClick={() => onNavigate(job.href as string)}
          size="sm"
          variant="ghost"
        >
          Open
        </Button>
      )}
    </div>
  );
}

export function InFlightSection({
  feed,
  onNavigate,
}: {
  feed: UseInFlightJobsResult;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { jobs, runningCount, windowStats } = feed;

  if (jobs.length === 0) return null;

  const navigate = (href: string) => {
    onNavigate?.();
    router.push(href);
  };

  return (
    <div className="mb-2 border-b border-border/60 pb-2">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          In flight
        </p>
        <span className="text-3xs tabular-nums text-muted-foreground/80">
          {runningCount > 0 ? `${runningCount} running` : 'All settled'}
        </span>
      </div>

      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {jobs.map((job) => (
          <InFlightRow
            job={job}
            key={job.key}
            onCancel={feed.cancel}
            onDownload={feed.download}
            onNavigate={navigate}
            onRetry={feed.retry}
          />
        ))}
      </div>

      {windowStats && (
        <p className="mt-1 px-1 text-3xs tabular-nums text-muted-foreground/70">
          {windowStats.made} made · {windowStats.completed} completed
          {windowStats.failed > 0 ? ` · ${windowStats.failed} failed` : ''} · last{' '}
          {windowStats.windowMinutes}m
        </p>
      )}
    </div>
  );
}
