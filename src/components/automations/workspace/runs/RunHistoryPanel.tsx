'use client';

// Browsing past runs used to be impossible inside the workspace: `?run=` had to
// be known already, and it only ever arrived from a report email's deep link.
// This is that missing list — the second tab of the right rail.
//
// It adds NO data path. `useAutomationRuns` (which already polls while a run is
// queued or running) backs the list, `useAutomationRun` fetches a report body
// only when a row is expanded, and clicking a row hands the id to the workspace's
// single `useAutomationRunDetail` query. Both hooks arrive through `source` so
// the spec can drive the panel without a process-wide module mock.

import type { AutomationRun } from '@continuum/contracts';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomationRun, useAutomationRuns } from '@/lib/automations/automations';
import { cn } from '@/lib/utils';
import {
  AUTOMATION_EMAIL_STATUS_LABEL,
  AUTOMATION_RUN_STATUS_PILL,
  describeAutomationRun,
  sortAutomationRunsNewestFirst,
} from './runPresentation';

export type RunListQuery = { data?: AutomationRun[]; isLoading: boolean };
export type RunReportQuery = { data?: AutomationRun; isLoading: boolean };

export type RunHistorySource = {
  useRuns: (automationId?: string) => RunListQuery;
  useRunReport: (runId: string | undefined, enabled: boolean) => RunReportQuery;
};

export const liveRunHistorySource: RunHistorySource = {
  useRuns: useAutomationRuns,
  useRunReport: useAutomationRun,
};

function RunHistoryRow({
  run,
  focused,
  expanded,
  onFocus,
  onToggleReport,
  source,
}: {
  run: AutomationRun;
  focused: boolean;
  expanded: boolean;
  onFocus: () => void;
  onToggleReport: () => void;
  source: RunHistorySource;
}) {
  const status = AUTOMATION_RUN_STATUS_PILL[run.status];
  const report = source.useRunReport(run.runId, expanded);
  const reportText = report.data?.output?.text ?? run.output?.text ?? '';

  return (
    <li>
      <div
        className={cn(
          'rounded-md border transition-colors',
          focused ? 'border-primary bg-primary/5' : 'border-border/60',
        )}
      >
        <button
          type="button"
          onClick={onFocus}
          aria-current={focused ? 'true' : undefined}
          aria-label={`Show run ${run.runId} on the canvas`}
          className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex w-full items-center gap-2">
            <Pill className="gap-1.5">
              <PillIndicator variant={status.variant} pulse={status.pulse} />
              {status.label}
            </Pill>
            {focused ? <Badge variant="outline">On canvas</Badge> : null}
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
              {run.runId.slice(0, 8)}
            </span>
          </span>
          <span className="block w-full truncate text-[11px] text-muted-foreground">
            {describeAutomationRun(run)}
          </span>
        </button>

        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {AUTOMATION_EMAIL_STATUS_LABEL[run.emailStatus]}
          </span>
          {run.status === 'completed' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              onClick={onToggleReport}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" aria-hidden="true" />
              ) : (
                <ChevronRight data-icon="inline-start" aria-hidden="true" />
              )}
              {expanded ? 'Hide report' : 'View report'}
            </Button>
          ) : null}
        </div>

        {run.status === 'failed' && run.errorMessage ? (
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-destructive">
            {run.errorMessage}
          </p>
        ) : null}

        {expanded ? (
          <div className="border-t border-border/60 px-3 py-2">
            {report.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-3/4 bg-muted/70" />
                <Skeleton className="h-3 w-full bg-muted/70" />
              </div>
            ) : reportText.trim() ? (
              <SafeMarkdown content={reportText} className="text-xs leading-5 text-foreground" />
            ) : (
              <p className="text-[11px] text-muted-foreground">This run has no report body.</p>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function RunHistoryPanel({
  automationId,
  activeRunId,
  onFocusRun,
  source = liveRunHistorySource,
}: {
  automationId: string;
  activeRunId: string | null;
  onFocusRun: (runId: string) => void;
  source?: RunHistorySource;
}) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { data: runs, isLoading } = source.useRuns(automationId);
  const ordered = sortAutomationRunsNewestFirst(runs ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <History className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-xs font-medium">Run history</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            {isLoading
              ? 'Loading runs…'
              : `${ordered.length} run${ordered.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full bg-muted/70" />
              <Skeleton className="h-14 w-full bg-muted/70" />
            </div>
          ) : ordered.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-md border bg-muted">
                <History className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-sm font-medium">No runs yet</h3>
              <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
                Publish this workflow and use “Run now”, or wait for its schedule. Every run lands
                here with its report.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {ordered.map((run) => (
                <RunHistoryRow
                  key={run.runId}
                  run={run}
                  focused={run.runId === activeRunId}
                  expanded={expandedRunId === run.runId}
                  onFocus={() => onFocusRun(run.runId)}
                  onToggleReport={() =>
                    setExpandedRunId((current) => (current === run.runId ? null : run.runId))
                  }
                  source={source}
                />
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
