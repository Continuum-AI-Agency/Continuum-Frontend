'use client';

// "Apply proposed budgets" for a recommend-mode portfolio — the manual, one-time apply
// of a scored run's reallocation. Money safety mirrors the CBO convert: the apply edge
// does the real Meta write, but the FE only ever calls it with dryRun:true (a PREVIEW of
// the current→proposed moves, zero writes). The dialog's "Apply" action is disabled until
// the sandbox-apply bench validates the real write on a Meta test account (un-gated in a
// follow-up PR — no env flag).

import { Loader2Icon, TriangleAlertIcon, WandSparklesIcon } from 'lucide-react';
import type * as React from 'react';

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

  // Fresh dryRun preview each time the dialog opens (the latest run may have changed).
  const requestPreview = () => {
    apply.mutate({ portfolio_id: portfolioId, brandId, accountId, run_id: runId, dryRun: true });
  };

  const preview = apply.data;
  const would = preview?.ok ? preview.would : [];

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          onClick={requestPreview}
        >
          <WandSparklesIcon className="size-3.5" />
          Apply budgets
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply the proposed budgets</AlertDialogTitle>
          <AlertDialogDescription>
            Preview — applying is validated on a Meta test account first. These are the current →
            proposed daily budgets the optimizer would set for this portfolio&rsquo;s ad sets.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ApplyPreviewBody
          isPending={apply.isPending}
          isError={apply.isError}
          preview={preview}
          would={would}
          currency={currency}
        />

        <p className="text-2xs text-muted-foreground">
          Applying is disabled while the real write is validated on a Meta test account.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type="button" disabled aria-disabled="true" className="gap-1.5">
            Apply
          </Button>
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
