'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

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
import { resolveAdsetName } from '../adsetName';
import { AdSetIdLabel } from '../charts/AdSetIdLabel';
import { formatCurrency } from '../format';
import { useApplyRun, useOptimizerEnrolledAdsets } from '../useOptimizerData';

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
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
  const apply = useApplyRun();
  const enrolled = useOptimizerEnrolledAdsets(portfolioId);
  const nameById = React.useMemo(
    () => new Map(enrolled.data.map((adset) => [adset.adset_id, adset.adset_name ?? ''])),
    [enrolled.data],
  );
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'preview' | 'applying' | 'done' | 'error'>('preview');
  const [resultNote, setResultNote] = React.useState<string | null>(null);

  // Fresh dryRun preview each time the dialog opens (the latest run may have changed).
  const requestPreview = () => {
    setPhase('preview');
    setResultNote(null);
    apply.mutate({
      portfolio_id: portfolioId,
      brandId,
      accountId,
      run_id: runId,
      dryRun: true,
    });
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
            setResultNote(uiText('queueApplyParseFailed'));
            return;
          }
          if (data.reason === 'observe_mode') {
            setPhase('error');
            setResultNote(uiText('this_portfolio_is_in_observe_mode_meta_writes_893c9db'));
            return;
          }
          if (data.reason === 'stale_run') {
            setPhase('error');
            setResultNote(uiText('queueNewCycle'));
            return;
          }
          if (!data.ok) {
            setPhase('error');
            setResultNote(uiText('queueApplyFailed'));
            return;
          }
          setPhase('done');
          setResultNote(
            uiText('queueApplyResult', {
              verb: 'apply',
              applied: data.applied ?? 0,
              failed: data.failed ?? 0,
              deduped: data.deduped ?? 0,
              hasFailed: data.failed ? 'yes' : 'no',
              hasDeduped: data.deduped ? 'yes' : 'no',
              already: 'applied',
            }),
          );
        },
        onError: (err) => {
          setPhase('error');
          setResultNote(formatUiError(err));
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
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          >
            <WandSparklesIcon className="size-3.5" />
            {uiText('apply_budgets_5dcf3c1')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{uiText('apply_the_proposed_budgets_fda6863')}</AlertDialogTitle>
          <AlertDialogDescription>
            {uiText('review_the_current_proposed_daily_budgets_the_a5f8824')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === 'applying' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            {uiText('writing_budgets_to_meta_1938e4f')}
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
            currency={currency}
            isError={apply.isError}
            isPending={apply.isPending}
            nameById={nameById}
            preview={preview}
            would={would}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>
            {phase === 'done' ? uiText('close_7d9eb7a') : uiText('cancel_19766ed')}
          </AlertDialogCancel>
          {phase !== 'done' ? (
            <Button type="button" className="gap-1.5" disabled={!canApply} onClick={handleApply}>
              {uiText.rich('sentence_c3a808da5d6d', {
                icon: () =>
                  phase === 'applying' ? (
                    <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : null,
                count: would.length,
              })}
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
  nameById,
}: {
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useApplyRun>['data'];
  would: { adset_id: string; current: number; proposed: number }[];
  currency: string | null;
  nameById: Map<string, string>;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        {uiText('computing_the_budget_moves_3203b0b')}
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>{uiText('couldn_t_compute_the_apply_preview_try_again__7e8279d')}</InlineError>
    );
  }

  if (!preview.ok) {
    return (
      <InlineError>
        {preview.reason === 'stale_run'
          ? uiText('this_portfolio_has_a_newer_cycle_reopen_to_se_5396b46')
          : preview.reason === 'no_cycle'
            ? uiText('no_cycle_has_scored_this_portfolio_yet_run_on_4d385be')
            : preview.reason === 'observe_mode'
              ? uiText('observe_mode_blocks_meta_writes_switch_to_rec_bb552d5')
              : (preview.error?.trim() ?? uiText('couldn_t_compute_the_apply_preview_ab0a557'))}
      </InlineError>
    );
  }

  if (would.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {uiText('no_budget_moves_in_the_latest_cycle_bbfa4c7')}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {uiText('current_proposed_daily_budget_b9ad740')}
      </p>
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
        {would.map((move) => (
          <li
            key={move.adset_id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <AdSetIdLabel
              className="min-w-0 flex-1 text-xs"
              id={move.adset_id}
              name={resolveAdsetName({ adset_id: move.adset_id }, nameById) ?? undefined}
            />
            <span className="shrink-0 tabular-nums">
              {uiText.rich('sentence_2af30ac04d46', {
                v0: formatCurrency(move.current, currency, uiLocale),
                v1: () => <span className="text-muted-foreground">→</span>,
                v2: () => (
                  <span className="font-medium">
                    {formatCurrency(move.proposed, currency, uiLocale)}
                  </span>
                ),
              })}
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
