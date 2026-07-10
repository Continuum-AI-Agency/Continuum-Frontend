'use client';

// "Apply proposed budgets" for a recommend-mode portfolio — the manual, one-time apply
// of a scored run's reallocation. Opens with a dry-run preview (zero Meta writes), then
// the operator confirms with a real apply (dryRun:false → optimizer-apply-run → service).
// Observe portfolios hard-refuse on the service; this control only mounts in recommend.

import { Loader2Icon, TriangleAlertIcon, WandSparklesIcon } from 'lucide-react';
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
import { useApplyRun } from '../useOptimizerData';

type ApplyReallocationDialogProps = {
  portfolioId: string;
  brandId: string;
  accountId: string;
  runId?: string;
  currency: string | null;
};

export function ApplyReallocationDialog({
  portfolioId,
  brandId,
  accountId,
  runId,
  currency,
}: ApplyReallocationDialogProps) {
  const apply = useApplyRun();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'preview' | 'applying' | 'done' | 'error'>('preview');
  const [resultNote, setResultNote] = React.useState<string | null>(null);

  // Fresh dryRun preview each time the dialog opens (the latest run may have changed).
  const requestPreview = () => {
    setPhase('preview');
    setResultNote(null);
    apply.mutate({ portfolio_id: portfolioId, brandId, accountId, run_id: runId, dryRun: true });
  };

  const preview = apply.data;
  const would = preview?.ok && preview.dryRun !== false ? preview.would : [];
  const canApply =
    phase === 'preview' && preview?.ok === true && would.length > 0 && !apply.isPending;

  const handleApply = () => {
    setPhase('applying');
    setResultNote(null);
    apply.mutate(
      {
        portfolio_id: portfolioId,
        brandId,
        accountId,
        run_id: runId,
        dryRun: false,
      },
      {
        onSuccess: (data) => {
          if (!data) {
            setPhase('error');
            setResultNote('Could not parse the apply response.');
            return;
          }
          if (data.reason === 'observe_mode') {
            setPhase('error');
            setResultNote(
              'This portfolio is in Observe mode — Meta writes are blocked. Switch to Recommend in Manage.',
            );
            return;
          }
          if (data.reason === 'stale_run') {
            setPhase('error');
            setResultNote('A newer cycle landed — reopen to apply the latest proposals.');
            return;
          }
          if (!data.ok) {
            setPhase('error');
            setResultNote(data.error?.trim() || data.reason || 'Apply failed.');
            return;
          }
          setPhase('done');
          setResultNote(
            `Applied ${data.applied ?? 0}` +
              (data.failed ? ` · ${data.failed} failed` : '') +
              (data.deduped ? ` · ${data.deduped} already applied` : ''),
          );
        },
        onError: (err) => {
          setPhase('error');
          setResultNote(err instanceof Error ? err.message : 'Apply failed.');
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
          variant="outline"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
        >
          <WandSparklesIcon className="size-3.5" />
          Apply budgets
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply the proposed budgets</AlertDialogTitle>
          <AlertDialogDescription>
            Review the current → proposed daily budgets, then apply them to Meta. This writes real
            ad-set budgets for this portfolio. Observe mode will refuse the write.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === 'applying' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            Writing budgets to Meta…
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
          <ApplyPreviewBody
            isPending={apply.isPending}
            isError={apply.isError}
            preview={preview}
            would={would}
            currency={currency}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{phase === 'done' ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {phase !== 'done' ? (
            <Button type="button" className="gap-1.5" disabled={!canApply} onClick={handleApply}>
              {phase === 'applying' ? (
                <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              Apply {would.length > 0 ? `${would.length} moves` : ''}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApplyPreviewBody({
  isPending,
  isError,
  preview,
  would,
  currency,
}: {
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useApplyRun>['data'];
  would: { adset_id: string; current: number; proposed: number }[];
  currency: string | null;
}) {
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        Computing the budget moves…
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>Couldn&rsquo;t compute the apply preview. Try again in a moment.</InlineError>
    );
  }

  if (!preview.ok) {
    return (
      <InlineError>
        {preview.reason === 'stale_run'
          ? 'This portfolio has a newer cycle — reopen to see the latest moves.'
          : preview.reason === 'no_cycle'
            ? 'No cycle has scored this portfolio yet — run one first.'
            : preview.reason === 'observe_mode'
              ? 'Observe mode blocks Meta writes. Switch to Recommend in Manage first.'
              : (preview.error?.trim() ?? "Couldn't compute the apply preview.")}
      </InlineError>
    );
  }

  if (would.length === 0) {
    return <p className="text-sm text-muted-foreground">No budget moves in the latest cycle.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Current → proposed daily budget</p>
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
        {would.map((move) => (
          <li
            key={move.adset_id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate font-mono text-xs">{move.adset_id}</span>
            <span className="shrink-0 tabular-nums">
              {formatCurrency(move.current, currency)}{' '}
              <span className="text-muted-foreground">→</span>{' '}
              <span className="font-medium">{formatCurrency(move.proposed, currency)}</span>/d
            </span>
          </li>
        ))}
      </ul>
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
