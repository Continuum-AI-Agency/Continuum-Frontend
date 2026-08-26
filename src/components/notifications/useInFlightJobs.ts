'use client';

// One live feed for work the user started and then walked away from. Until now an organic
// generation was only visible inside the organic workspace tabs and a Jaina report only on
// /scale, so leaving the page lost sight of the job — which is exactly when a completion
// notice matters. Both sources are already realtime; this only merges them into one row
// grammar the header can render.

import {
  type OrganicGenerationSummary,
  type OrganicGenerationWindowStats,
  type OrganicStatusTone,
  resolveOrganicAgentLabel,
  resolveOrganicLifecycle,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useGenerationJobsRealtime } from '@/components/organic/hooks/useGenerationJobsRealtime';
import { useToast } from '@/components/ui/ToastProvider';
import { type ReportJob, useReportJobsRealtime } from '@/hooks/useReportJobsRealtime';
import { http } from '@/lib/api/http';
import { cancelOrganicJobOptimistically } from '@/lib/organic/agent-cancellation';
import { retryOrganicJobOptimistically } from '@/lib/organic/agent-retry';
import {
  type GenerationSummariesResponse,
  generationSummariesQueryKey,
  useGenerationSummaries,
} from '@/lib/organic/generationSummaries';

export type InFlightSource = 'organic' | 'jaina';

export type InFlightJob = {
  /** Unique across sources — a report job id and a generation job id share no namespace. */
  key: string;
  source: InFlightSource;
  jobId: string;
  /** What the work IS, in the user's words. Never a job id. */
  title: string;
  /** Short identity chip: the platform, or what kind of artefact this is. */
  badge: string | null;
  /** Scheduling context, when the work has any. */
  meta: string | null;
  /** Where the work has got to: "Copywriter · Writing copy · 45%". */
  stateLine: string;
  tone: OrganicStatusTone;
  active: boolean;
  /** Engineer-facing; goes in a title, never in visible copy. */
  diagnostic: string | null;
  error: string | null;
  /** Deep link back to the surface that owns this work. */
  href: string | null;
  canCancel: boolean;
  canRetry: boolean;
  canDownload: boolean;
  sortAt: number;
};

const REPORT_STEP_LABELS: Record<string, string> = {
  validating: 'Validating',
  'writing:executive': 'Writing the executive summary',
  'writing:kpis': 'Writing KPIs',
  'writing:campaigns': 'Writing the campaign breakdown',
  'writing:competitive': 'Writing competitive context',
  'writing:recommendations': 'Writing recommendations',
  assembling: 'Assembling the report',
};

const REPORT_STATE: Record<ReportJob['status'], { label: string; tone: OrganicStatusTone }> = {
  pending: { label: 'Queued', tone: 'pending' },
  running: { label: 'Generating', tone: 'active' },
  done: { label: 'Ready', tone: 'live' },
  failed: { label: 'Failed', tone: 'error' },
};

const capitalize = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

/** dayId is a YYYY-MM-DD slot; parsed as local midnight so the label does not shift a day west. */
function formatDay(dayId: string | null | undefined): string | null {
  if (!dayId) return null;
  const parsed = new Date(`${dayId}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dayId;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timestamp(iso: string | null | undefined): number {
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fromGeneration(summary: OrganicGenerationSummary): InFlightJob {
  const display = resolveOrganicLifecycle({
    status: summary.status,
    stage: summary.stage,
    mediaStage: summary.mediaStage,
  });
  const active = summary.status === 'running' || summary.status === 'queued';
  // While running, lead with WHO is working so the row reads the same as the in-chat card.
  const stateLine = [
    active ? resolveOrganicAgentLabel(summary.agentName) : null,
    display.label,
    active && typeof summary.pct === 'number' ? `${Math.round(summary.pct)}%` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    key: `organic:${summary.jobId}`,
    source: 'organic',
    jobId: summary.jobId,
    // Identity first: the concept title, so a row never reads as a bare "Instagram · Working".
    title: summary.title?.trim() || (summary.platform ? capitalize(summary.platform) : 'Post'),
    badge: summary.platform ?? null,
    meta: formatDay(summary.dayId),
    stateLine,
    tone: display.tone,
    active,
    diagnostic: display.diagnostic,
    error: summary.status === 'failed' ? (summary.error?.message ?? null) : null,
    href: summary.draftId ? `/organic?tab=planner&draftId=${summary.draftId}` : null,
    canCancel: active,
    canRetry: summary.status === 'failed',
    canDownload: false,
    sortAt: timestamp(summary.completedAt ?? summary.enqueuedAt),
  };
}

function fromReportJob(job: ReportJob): InFlightJob {
  const state = REPORT_STATE[job.status];
  const step = job.step_name ? REPORT_STEP_LABELS[job.step_name] : null;
  return {
    key: `jaina:${job.job_id}`,
    source: 'jaina',
    jobId: job.job_id,
    title: 'Performance report',
    badge: 'Jaina',
    meta: null,
    stateLine: job.status === 'running' && step ? step : state.label,
    tone: state.tone,
    active: job.status === 'pending' || job.status === 'running',
    diagnostic: null,
    error: job.status === 'failed' ? (job.error_message ?? 'Report generation failed.') : null,
    href: '/scale?tab=jaina',
    canCancel: false,
    canRetry: false,
    canDownload: job.status === 'done',
    sortAt: timestamp(job.updated_at ?? job.created_at),
  };
}

// Active work ranks above finished work; within a rank, most recent first.
const rank = (job: InFlightJob): number => (job.active ? 0 : job.error ? 1 : 2);

export type UseInFlightJobsResult = {
  jobs: InFlightJob[];
  runningCount: number;
  windowStats: OrganicGenerationWindowStats | null;
  cancel: (job: InFlightJob) => void;
  retry: (job: InFlightJob) => void;
  download: (job: InFlightJob) => void;
};

export function useInFlightJobs(brandId: string | null): UseInFlightJobsResult {
  const queryClient = useQueryClient();
  const { show } = useToast();

  useGenerationJobsRealtime(brandId);
  const { summaries, windowStats } = useGenerationSummaries(brandId);
  const { jobs: reportJobs } = useReportJobsRealtime(brandId ?? '');

  const jobs = useMemo(
    () =>
      [...summaries.map(fromGeneration), ...reportJobs.map(fromReportJob)].sort(
        (a, b) => rank(a) - rank(b) || b.sortAt - a.sortAt,
      ),
    [summaries, reportJobs],
  );

  const runningCount = useMemo(() => jobs.filter((job) => job.active).length, [jobs]);

  /** Patch one generation row in the React Query cache; returns the undo. */
  const patchGeneration = useCallback(
    (jobId: string, status: OrganicGenerationSummary['status'], runningDelta: number) => {
      const key = generationSummariesQueryKey(brandId);
      const previous = queryClient.getQueryData<GenerationSummariesResponse>(key);
      queryClient.setQueryData<GenerationSummariesResponse>(key, (prev) =>
        prev
          ? {
              summaries: prev.summaries.map((s) => (s.jobId === jobId ? { ...s, status } : s)),
              window: {
                ...prev.window,
                running: Math.max(0, prev.window.running + runningDelta),
              },
            }
          : prev,
      );
      return () => queryClient.setQueryData(key, previous);
    },
    [brandId, queryClient],
  );

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: generationSummariesQueryKey(brandId) });
  }, [brandId, queryClient]);

  const cancel = useCallback(
    (job: InFlightJob) => {
      if (!brandId || job.source !== 'organic') return;
      // The row stays and reads "Cancelled" rather than vanishing: work the user stopped is
      // still work they did, and a row that disappears reads like a bug.
      let revert: () => void = () => {};
      void cancelOrganicJobOptimistically({
        job: { jobId: job.jobId, brandId },
        remove: (jobId) => {
          revert = patchGeneration(jobId, 'cancelled', -1);
        },
        restore: () => revert(),
        confirm: () => {},
        notifyFailure: (message) =>
          show({ title: 'Could not stop that generation', description: message, variant: 'error' }),
      }).finally(settle);
    },
    [brandId, patchGeneration, settle, show],
  );

  const retry = useCallback(
    (job: InFlightJob) => {
      if (!brandId || job.source !== 'organic') return;
      let revert: () => void = () => {};
      void retryOrganicJobOptimistically({
        job: { jobId: job.jobId, brandId },
        patch: () => {
          revert = patchGeneration(job.jobId, 'queued', 1);
        },
        revert: () => revert(),
        notifyFailure: (message) =>
          show({
            title: 'Could not retry that generation',
            description: message,
            variant: 'error',
          }),
      }).finally(settle);
    },
    [brandId, patchGeneration, settle, show],
  );

  const download = useCallback(
    (job: InFlightJob) => {
      if (job.source !== 'jaina') return;
      void (async () => {
        try {
          const data = await http.request<{ signed_url: string }>({
            path: `/api/agents/jaina/report-artifacts/jobs/${encodeURIComponent(job.jobId)}/file-url`,
            method: 'GET',
          });
          window.open(data.signed_url, '_blank', 'noopener,noreferrer');
        } catch (error) {
          show({
            title: 'Could not open that report',
            description: error instanceof Error ? error.message : 'The download link expired.',
            variant: 'error',
          });
        }
      })();
    },
    [show],
  );

  return { jobs, runningCount, windowStats, cancel, retry, download };
}
