'use client';

// One-click revert of a single prior optimizer write, on a money/status log row. Opens with a
// dry-run preview (zero Meta writes), then the operator confirms a real revert (dryRun:false →
// optimizer-apply-revert → service → the same ledger-guarded, audited write seam a normal apply
// uses). Observe-mode portfolios hard-refuse on the service; this control surfaces the reason.
//
// Two shapes share one dialog, chosen by the audit row's `scope`:
//   - adset_budget → "Revert" restores the ad set's prior daily budget (current → restored).
//   - adset_status → "Unpause" restarts the ad set's spend by restoring its prior status
//                    (reverting a pause is an unpause). The preview names the status it restores.
// Currency is not threaded from the log page, so budget amounts fall back to the USD symbol
// (the amounts themselves are exact).

import { Loader2Icon, TriangleAlertIcon, Undo2Icon } from 'lucide-react';
import * as React from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../format';
import { useRevertApply } from '../useOptimizerData';

type RevertApplyDialogProps = {
  auditId: string;
  portfolioId: string;
  brandId: string;
  /** The audit row's scope. 'adset_status' switches the dialog to unpause copy; anything
   *  else (or absent) keeps the budget-revert copy. */
  scope?: string | null;
};

/** One would-item in the revert preview — a budget move or an ad-set status restore. */
type RevertWould =
  | { adset_id: string; current: number; proposed: number }
  | { adset_id: string; target_status: string };

function isStatusWould(would: RevertWould): would is { adset_id: string; target_status: string } {
  return 'target_status' in would;
}

function reasonMessage(reason: string | undefined): string {
  switch (reason) {
    case 'observe_mode':
      return 'This portfolio is in Observe mode — Meta writes are blocked. Switch to Recommend in Manage.';
    case 'unsupported_scope':
      return 'Only ad-set budget and pause writes can be reverted.';
    case 'scope_mismatch':
      return 'This write does not belong to this portfolio.';
    case 'no_prior':
      return 'This write has no recorded prior budget to restore.';
    case 'no_prior_status':
      return 'This pause has no recorded prior status, so there is nothing safe to restore.';
    case 'audit_not_found':
      return 'The original write could not be found.';
    case 'campaign_unsupported':
      return 'Campaign-level reverts are not supported yet.';
    case 'account_unreadable':
      return 'Could not read the ad account to build the revert. Try again in a moment.';
    default:
      return 'Revert failed.';
  }
}

export function RevertApplyDialog({
  auditId,
  portfolioId,
  brandId,
  scope,
}: RevertApplyDialogProps) {
  const revert = useRevertApply();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'preview' | 'applying' | 'done' | 'error'>('preview');
  const [resultNote, setResultNote] = React.useState<string | null>(null);

  // Fresh dryRun preview each time the dialog opens.
  const requestPreview = () => {
    setPhase('preview');
    setResultNote(null);
    revert.mutate({ audit_id: auditId, portfolio_id: portfolioId, brandId, dryRun: true });
  };

  const preview = revert.data;
  const would = (preview?.ok && preview.dryRun !== false ? preview.would : []) as RevertWould[];
  // The scope prop sets the copy immediately; the preview's would-shape confirms it once loaded
  // (a status revert previews a target_status, a budget revert a current/proposed pair).
  const isStatus = scope === 'adset_status' || (would[0] != null && isStatusWould(would[0]));
  const canRevert =
    phase === 'preview' && preview?.ok === true && would.length > 0 && !revert.isPending;

  const handleRevert = () => {
    setPhase('applying');
    setResultNote(null);
    revert.mutate(
      { audit_id: auditId, portfolio_id: portfolioId, brandId, dryRun: false },
      {
        onSuccess: (data) => {
          if (!data) {
            setPhase('error');
            setResultNote('Could not parse the revert response.');
            return;
          }
          if (!data.ok) {
            setPhase('error');
            setResultNote(data.error?.trim() || reasonMessage(data.reason));
            return;
          }
          setPhase('done');
          setResultNote(
            `${isStatus ? 'Unpaused' : 'Reverted'} ${data.applied ?? 0}` +
              (data.failed ? ` · ${data.failed} failed` : '') +
              (data.deduped ? ` · ${data.deduped} already done` : ''),
          );
        },
        onError: (err) => {
          setPhase('error');
          setResultNote(err instanceof Error ? err.message : 'Revert failed.');
        },
      },
    );
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) requestPreview();
        else {
          setPhase('preview');
          setResultNote(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 gap-1 px-1.5 text-2xs text-muted-foreground hover:text-foreground"
        >
          <Undo2Icon aria-hidden="true" className="size-3" />
          {isStatus ? 'Unpause' : 'Revert'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isStatus ? 'Unpause — restarts its spend' : 'Revert this budget change'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isStatus
              ? 'Restart this ad set’s spend by restoring the status it had before this pause. This writes a real status change to Meta. Observe mode will refuse the write.'
              : 'Restore this ad set’s daily budget to what it was before this write. This writes a real ad-set budget to Meta. Observe mode will refuse the write.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === 'applying' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            {isStatus
              ? 'Restoring the prior status on Meta…'
              : 'Restoring the prior budget on Meta…'}
          </p>
        ) : phase === 'done' || phase === 'error' ? (
          <p
            className={
              phase === 'error'
                ? 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
                : 'rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success'
            }
          >
            {phase === 'error' ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> : null}
            <span>{resultNote}</span>
          </p>
        ) : (
          <RevertPreviewBody
            isPending={revert.isPending}
            isError={revert.isError}
            preview={preview}
            would={would}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{phase === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {phase !== 'done' ? (
            <Button type="button" className="gap-1.5" disabled={!canRevert} onClick={handleRevert}>
              {phase === 'applying' ? (
                <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              {isStatus ? 'Unpause ad set' : 'Revert budget'}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RevertPreviewBody({
  isPending,
  isError,
  preview,
  would,
}: {
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useRevertApply>['data'];
  would: RevertWould[];
}) {
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        Computing the revert…
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>Couldn&rsquo;t compute the revert preview. Try again in a moment.</InlineError>
    );
  }

  if (!preview.ok) {
    return <InlineError>{reasonMessage(preview.reason)}</InlineError>;
  }

  const move = would[0];
  if (!move) {
    return <p className="text-sm text-muted-foreground">Nothing to revert for this write.</p>;
  }

  // An ad-set status revert (unpause) restores the prior status — there is no budget to show.
  if (isStatusWould(move)) {
    const restoreLabel = move.target_status === 'ACTIVE' ? 'Active' : 'Paused';
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Restored status</p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-mono text-xs">{move.adset_id}</span>
          <span className="shrink-0 font-medium tabular-nums">→ {restoreLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Current → restored daily budget</p>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-mono text-xs">{move.adset_id}</span>
        <span className="shrink-0 tabular-nums">
          {formatCurrency(move.current, null)} <span className="text-muted-foreground">→</span>{' '}
          <span className="font-medium">{formatCurrency(move.proposed, null)}</span>/d
        </span>
      </div>
    </div>
  );
}

function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
