'use client';

// Detail Sheet for one automation: overview, run history with live polling,
// expandable report body (markdown), and Run now / Edit / Delete actions.
// Mounted once per chat surface; only responds when the automation belongs to
// the surface's agent.

import type { AgentTarget, AutomationRun } from '@continuum/contracts';
import { PlayIcon, SquarePenIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import {
  useAutomation,
  useAutomationRun,
  useAutomationRuns,
  useDeleteAutomation,
  useRunAutomationNow,
} from '@/lib/automations/automations';
import { describeSchedule, formatInTimezone } from '@/lib/automations/schedule';
import { useAutomationSheetStore } from '@/lib/automations/sheet-store';

const RUN_STATUS_PILL: Record<
  AutomationRun['status'],
  { label: string; variant: 'success' | 'error' | 'warning' | 'info'; pulse?: boolean }
> = {
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  running: { label: 'Running', variant: 'info', pulse: true },
  queued: { label: 'Queued', variant: 'warning' },
};

const EMAIL_STATUS_LABEL: Record<AutomationRun['emailStatus'], string> = {
  sent: 'Emailed',
  sending: 'Emailing…',
  pending: 'Email pending',
  failed: 'Email failed',
  skipped: 'Email skipped',
};

function formatDuration(run: AutomationRun): string | null {
  if (!run.startedAt || !run.completedAt) return null;
  const seconds = Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: AutomationRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = RUN_STATUS_PILL[run.status];
  const duration = formatDuration(run);
  // The runs list omits report bodies; fetch the full run lazily on expand.
  const { data: runDetail, isLoading: isReportLoading } = useAutomationRun(run.runId, expanded);
  const reportText = runDetail?.output?.text ?? run.output?.text ?? '';

  return (
    <li className="rounded-md border border-border/60">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Pill className="gap-1.5">
            <PillIndicator variant={status.variant} pulse={status.pulse} />
            {status.label}
          </Pill>
          <span className="truncate text-xs text-muted-foreground">
            {new Date(run.enqueuedAt).toLocaleString()}
            {duration ? ` · ${duration}` : ''}
            {run.trigger === 'manual' ? ' · manual' : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {EMAIL_STATUS_LABEL[run.emailStatus]}
          </span>
          {run.status === 'completed' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={onToggle}
            >
              {expanded ? 'Hide report' : 'View report'}
            </Button>
          )}
        </div>
      </div>
      {run.status === 'failed' && run.errorMessage && (
        <p className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {run.errorMessage}
        </p>
      )}
      {expanded && (
        <div className="border-t border-border/60 px-4 py-3">
          {isReportLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4 bg-muted/70" />
              <Skeleton className="h-4 w-full bg-muted/70" />
              <Skeleton className="h-4 w-2/3 bg-muted/70" />
            </div>
          ) : reportText.trim() ? (
            <SafeMarkdown content={reportText} className="text-sm leading-6 text-foreground" />
          ) : (
            <p className="text-xs text-muted-foreground">This run has no report body.</p>
          )}
        </div>
      )}
    </li>
  );
}

type AutomationDetailSheetProps = {
  agent: AgentTarget;
  brandId: string | null;
};

export function AutomationDetailSheet({ agent, brandId }: AutomationDetailSheetProps) {
  const { show } = useToast();
  const detailAutomationId = useAutomationSheetStore((state) => state.detailAutomationId);
  const detailRunId = useAutomationSheetStore((state) => state.detailRunId);
  const close = useAutomationSheetStore((state) => state.close);
  const openEditor = useAutomationSheetStore((state) => state.openEditor);

  const { data: automation, isLoading } = useAutomation(detailAutomationId ?? undefined);
  const { data: runs } = useAutomationRuns(detailAutomationId ?? undefined);
  const runNowMutation = useRunAutomationNow(brandId ?? undefined);
  const deleteMutation = useDeleteAutomation(brandId ?? undefined);

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const expandedId = expandedRunId ?? detailRunId;

  const open = Boolean(detailAutomationId) && (isLoading || automation?.agent === agent);
  const recipientCount = useMemo(
    () =>
      automation
        ? automation.recipients.memberUserIds.length + automation.recipients.externalEmails.length
        : 0,
    [automation],
  );

  const handleRunNow = () => {
    if (!detailAutomationId) return;
    runNowMutation.mutate(detailAutomationId, {
      onSuccess: () => show({ title: 'Run started', variant: 'success' }),
      onError: (error) =>
        show({
          title: 'Could not start run',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'error',
        }),
    });
  };

  const handleDelete = () => {
    if (!detailAutomationId) return;
    deleteMutation.mutate(detailAutomationId, {
      onSuccess: () => {
        show({ title: 'Automation deleted', variant: 'success' });
        close();
      },
      onError: (error) =>
        show({
          title: 'Could not delete automation',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'error',
        }),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {isLoading || !automation ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3 bg-muted/70" />
            <Skeleton className="h-4 w-1/2 bg-muted/70" />
            <Skeleton className="h-24 w-full bg-muted/70" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate">{automation.name}</SheetTitle>
                {!automation.enabled && <Pill className="text-[10px]">Paused</Pill>}
              </div>
              <SheetDescription>{describeSchedule(automation.schedule)}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunNow}
                  disabled={runNowMutation.isPending}
                >
                  <PlayIcon className="size-3.5" />
                  {runNowMutation.isPending ? 'Starting…' : 'Run now'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditor(automation.id)}
                >
                  <SquarePenIcon className="size-3.5" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive">
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this automation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        “{automation.name}” and its run history will be permanently removed. Future
                        scheduled emails stop immediately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{automation.prompt}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Next run</p>
                  <p>
                    {automation.enabled
                      ? formatInTimezone(
                          new Date(automation.nextRunAt),
                          automation.schedule.timezone,
                        )
                      : 'Paused'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recipients</p>
                  <p>
                    {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="mb-2 text-sm font-medium">Run history</h3>
                {!runs || runs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No runs yet — use “Run now” or wait for the schedule.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {runs.map((run) => (
                      <RunRow
                        key={run.runId}
                        run={run}
                        expanded={expandedId === run.runId}
                        onToggle={() =>
                          setExpandedRunId((current) => (current === run.runId ? null : run.runId))
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
