'use client';

import {
  type OrganicGenerationStatus,
  type OrganicGenerationSummary,
  type OrganicGenerationTone,
  type OrganicMediaStage,
  resolveOrganicAgentLabel,
  resolveOrganicGenerationDisplay,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, X, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import {
  type GenerationSummariesResponse,
  generationSummariesQueryKey,
  useGenerationSummaries,
} from '@/lib/organic/generationSummaries';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string | null;
  onViewDraftAction?: (draftId: string) => void;
};

// Active = still on the server's work queue. Ranks active rows to the top.
const STATUS_RANK: Record<OrganicGenerationStatus, number> = {
  running: 0,
  queued: 1,
  completed: 2,
  failed: 3,
  cancelled: 4,
};

const isActive = (status: OrganicGenerationStatus): boolean =>
  status === 'running' || status === 'queued';

// Canonical generation tone -> label text color. Mirrors the card-kit palette so
// the same label reads the same everywhere it appears.
const TONE_TEXT: Record<OrganicGenerationTone, string> = {
  pending: 'text-muted-foreground',
  active: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-destructive',
  neutral: 'text-muted-foreground',
};

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

// Media-enrichment dimension for a COMPLETED row: Stage 1 finished but the
// draft is still being enriched (blueprint/512px sketch/final pixels), so
// "Ready" alone would overstate where the post actually is.
const ENRICHMENT_SUFFIX: Partial<Record<OrganicMediaStage, string>> = {
  text_only: 'Enriching…',
  storyboard_ready: 'Sketch ready',
  realizing: 'Rendering…',
};

// dayId is a YYYY-MM-DD slot (parsed as local midnight for a stable label).
function formatDay(dayId: string | null | undefined): string | null {
  if (!dayId) return null;
  const parsed = new Date(`${dayId}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dayId;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function recencyTs(summary: OrganicGenerationSummary): number {
  const iso = summary.completedAt ?? summary.enqueuedAt;
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Cancel a real durable job by its post_generation_jobs uuid (= summary.jobId).
async function cancelGeneration(jobId: string, brandId: string): Promise<void> {
  try {
    const token = await getBrowserAccessToken();
    await fetch(`${getApiBaseUrl()}/api/organic/agent/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ brandId }),
    });
  } catch {
    // Best-effort: the run also stops on its own deadline if the request fails.
  }
}

function StatusIcon({ status }: { status: OrganicGenerationStatus }) {
  if (isActive(status)) return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
  if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function GenerationRow({
  summary,
  brandId,
  onViewDraftAction,
  onCancel,
}: {
  summary: OrganicGenerationSummary;
  brandId: string | null;
  onViewDraftAction?: (draftId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  const display = resolveOrganicGenerationDisplay({
    status: summary.status,
    stage: summary.stage,
    mediaStage: summary.mediaStage,
  });
  const active = isActive(summary.status);
  // Identity first: the concept title, falling back to the platform name so a row
  // never reads as a bare "Instagram · Working" with no concept.
  const title = summary.title?.trim() || (summary.platform ? capitalize(summary.platform) : 'Post');
  const day = formatDay(summary.dayId);
  // While running, lead the state line with the live agent + percent so the widget
  // mirrors the in-chat card ("Copywriter · Writing copy · 45%"). Terminal rows show
  // just the status label.
  const agentLabel = active ? resolveOrganicAgentLabel(summary.agentName) : null;
  const pctText = active && typeof summary.pct === 'number' ? `${Math.round(summary.pct)}%` : null;
  // A completed row still enriching (text_only / storyboard_ready / realizing)
  // shows the media dimension so "Ready" never overstates the draft's state.
  const enrichmentText =
    summary.status === 'completed' && summary.mediaStage
      ? (ENRICHMENT_SUFFIX[summary.mediaStage] ?? null)
      : null;
  // Failed rows carry the real reason (the backend folds enrichment failures
  // into summary.error too); rendered on its own clamped line, not truncated
  // into the state line — the message is what the user needs to act on.
  const failureMessage = summary.status === 'failed' ? (summary.error?.message ?? null) : null;
  const stateLine = [agentLabel, display.label, pctText, enrichmentText]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5 last:border-b-0">
      <StatusIcon status={summary.status} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-1.5">
          {summary.platform && (
            <Badge variant="secondary" className="h-4 px-1 text-2xs capitalize">
              {summary.platform}
            </Badge>
          )}
          {day && <span className="text-2xs text-muted-foreground/70">{day}</span>}
          <span className={cn('truncate text-2xs font-medium', TONE_TEXT[display.tone])}>
            {stateLine}
          </span>
        </div>
        {failureMessage && (
          <p className="line-clamp-2 text-2xs text-destructive/80" title={failureMessage}>
            {failureMessage}
          </p>
        )}
      </div>

      {active && brandId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onCancel(summary.jobId)}
          aria-label="Abort generation"
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {/* Failed rows open the planner draft too — that's where Retry/Clear live. */}
      {(summary.status === 'completed' || summary.status === 'failed') &&
        summary.draftId &&
        onViewDraftAction && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 shrink-0 px-1.5 text-2xs text-muted-foreground"
            onClick={() => onViewDraftAction(summary.draftId as string)}
          >
            Open
          </Button>
        )}
    </div>
  );
}

export function GenerationsPopover({ brandId, onViewDraftAction }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { summaries, windowStats } = useGenerationSummaries(brandId);

  const handleCancel = useCallback(
    (jobId: string) => {
      if (!brandId) return;
      // Optimistically mark cancelled (the backend suppresses the failure frame on
      // cancel) and drop the running count; Realtime + refetch reconcile the rest.
      queryClient.setQueryData<GenerationSummariesResponse>(
        generationSummariesQueryKey(brandId),
        (prev) =>
          prev
            ? {
                summaries: prev.summaries.map((s) =>
                  s.jobId === jobId ? { ...s, status: 'cancelled' as const } : s,
                ),
                window: { ...prev.window, running: Math.max(0, prev.window.running - 1) },
              }
            : prev,
      );
      void cancelGeneration(jobId, brandId).finally(() => {
        void queryClient.invalidateQueries({ queryKey: generationSummariesQueryKey(brandId) });
      });
    },
    [brandId, queryClient],
  );

  const rows = useMemo(
    () =>
      [...summaries].sort(
        (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || recencyTs(b) - recencyTs(a),
      ),
    [summaries],
  );

  const running = windowStats?.running ?? rows.filter((s) => isActive(s.status)).length;
  const hasActivity =
    rows.length > 0 || (windowStats != null && (windowStats.made > 0 || windowStats.running > 0));

  if (!hasActivity) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          {running > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
          ) : (
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          )}
          {rows.length} {rows.length === 1 ? 'generation' : 'generations'}
          {running > 0 && <span className="text-muted-foreground">· {running} running</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Generations
          </p>
          {windowStats && (
            <p className="mt-0.5 text-2xs tabular-nums text-muted-foreground/80">
              {windowStats.made} made · {windowStats.completed} completed
              {windowStats.failed > 0 ? ` · ${windowStats.failed} failed` : ''} · last{' '}
              {windowStats.windowMinutes}m
            </p>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {rows.length > 0 ? (
            rows.map((summary) => (
              <GenerationRow
                key={summary.jobId}
                summary={summary}
                brandId={brandId}
                onViewDraftAction={onViewDraftAction}
                onCancel={handleCancel}
              />
            ))
          ) : (
            <p className="px-3 py-4 text-center text-2xs text-muted-foreground/70">
              Nothing in flight right now.
            </p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
