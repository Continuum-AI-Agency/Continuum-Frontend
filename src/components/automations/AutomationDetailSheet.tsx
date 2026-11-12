'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeAutomationsCopy } from '@/i18n/automationsCopy';

import { useUiErrorMessage } from '@/i18n/errors';
import { formatAutomationRunTime } from './workspace/runs/runPresentation';

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
import {
  AUTOMATION_EMAIL_STATUS_LABEL as EMAIL_STATUS_LABEL,
  formatAutomationRunDuration as formatDuration,
  AUTOMATION_RUN_STATUS_PILL as RUN_STATUS_PILL,
} from './workspace/runs/runPresentation';

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: AutomationRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const uiLocale = useLocale();
  const getUiErrorMessage = useUiErrorMessage();
  const uiText = useTranslations('automations');
  const status = RUN_STATUS_PILL[run.status];
  const duration = formatDuration(run, uiLocale);
  // The runs list omits report bodies; fetch the full run lazily on expand.
  const { data: runDetail, isLoading: isReportLoading } = useAutomationRun(run.runId, expanded);
  const reportText = runDetail?.output?.text ?? run.output?.text ?? '';

  return (
    <li className="rounded-md border border-border/60">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Pill className="gap-1.5">
            <PillIndicator variant={status.variant} pulse={status.pulse} />
            {localizeAutomationsCopy(status.label, uiText)}
          </Pill>
          <span className="truncate text-xs text-muted-foreground">
            {formatAutomationRunTime(run.enqueuedAt, uiLocale, uiText)}
            {duration ? ` · ${duration}` : ''}
            {run.trigger === 'manual' ? uiText('manual_c79d3fa') : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {localizeAutomationsCopy(EMAIL_STATUS_LABEL[run.emailStatus], uiText)}
          </span>
          {run.status === 'completed' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={onToggle}
            >
              {expanded ? uiText('hide_report_a198131') : uiText('view_report_45e1eb0')}
            </Button>
          )}
        </div>
      </div>
      {run.status === 'failed' && run.errorMessage && (
        <p className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {getUiErrorMessage({ code: run.errorMessage })}
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
            <p className="text-xs text-muted-foreground">
              {uiText('this_run_has_no_report_body_f8e8bb2')}
            </p>
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
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('automations');
  const uiLocale = useLocale();
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
      onSuccess: () => show({ title: uiText('run_started_0bb43be'), variant: 'success' }),
      onError: (error) =>
        show({
          title: uiText('could_not_start_run_6c72533'),
          description: formatUiError(error),
          variant: 'error',
        }),
    });
  };

  const handleDelete = () => {
    if (!detailAutomationId) return;
    deleteMutation.mutate(detailAutomationId, {
      onSuccess: () => {
        show({
          title: uiText('automation_deleted_ca8e1bb'),
          variant: 'success',
        });
        close();
      },
      onError: (error) =>
        show({
          title: uiText('could_not_delete_automation_a110a2f'),
          description: formatUiError(error),
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
                {!automation.enabled && (
                  <Pill className="text-2xs">{uiText('paused_e159b06')}</Pill>
                )}
              </div>
              <SheetDescription>
                {describeSchedule(automation.schedule, uiLocale, uiText)}
              </SheetDescription>
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
                  {runNowMutation.isPending
                    ? uiText('starting_bbe5fc3')
                    : uiText('run_now_0991397')}
                </Button>
                {/* The builder that openEditor targets is this surface's sibling, so an
                    automation belonging to another agent has nowhere to open and would
                    strand the store at builderOpen with no one left to close it. This
                    sheet still renders such an automation while it slides out on the
                    agent mismatch, so the hand-off has to be gated here too. */}
                {automation.agent === agent && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditor(automation.id)}
                  >
                    <SquarePenIcon className="size-3.5" />
                    {uiText('edit_464c4ff')}
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button type="button" size="sm" variant="ghost" className="text-destructive">
                        <Trash2Icon className="size-3.5" />
                        {uiText('delete_e2d0a54')}
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {uiText('delete_this_automation_0f393e0')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {uiText.rich('sentence_11dbe2caa80e', {
                          v0: () => automation.name,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>
                        {uiText('delete_e2d0a54')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {uiText('prompt_5c39123')}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{automation.prompt}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{uiText('next_run_b3c0ab9')}</p>
                  <p>
                    {automation.enabled
                      ? formatInTimezone(
                          new Date(automation.nextRunAt),
                          automation.schedule.timezone,
                          uiLocale,
                        )
                      : uiText('paused_e159b06')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{uiText('recipients_1e8568a')}</p>
                  <p>
                    {uiText.rich('sentence_e8cefc0e5400', {
                      count: recipientCount,
                    })}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="mb-2 text-sm font-medium">{uiText('run_history_addf321')}</h3>
                {!runs || runs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {uiText('no_runs_yet_use_run_now_or_wait_for_the_sched_8467c48')}
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
