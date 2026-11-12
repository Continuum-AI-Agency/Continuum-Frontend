'use client';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// One-click revert of a single prior optimizer write, on a money/status log row. Opens with a
// dry-run preview (zero Meta writes), then the operator confirms a real revert (dryRun:false →
// optimizer-apply-revert → service → the same ledger-guarded, audited write seam a normal apply
// uses). Observe-mode portfolios hard-refuse on the service; this control surfaces the reason.
//
// Two shapes share one dialog, chosen by the audit row's `scope`:
//   - adset_budget → "Revert" restores the ad set's prior daily budget (current → restored).
//   - adset_status → "Unpause" restarts the ad set's spend by restoring its prior status
//                    (reverting a pause is an unpause). The preview names the status it restores.
// The account's currency IS threaded from the log page. It used to be left out, which was
// invisible only because the formatter answered a missing code with "$" — on an account
// whose currency nobody recorded, that dressed the figure in the wrong money.

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
  /** The viewed ad account's currency. Null when the account row carries none — the preview
   *  then shows bare figures rather than dressing pesos as dollars. */
  currency: string | null;
  /** The audit row's scope. 'adset_status' switches the dialog to unpause copy; anything
   *  else (or absent) keeps the budget-revert copy. */
  scope?: string | null;
  /** The trigger's type size. The dense log row keeps `text-xs`; the action cards, whose type
   *  floor is `text-xs`, pass that. Written as whole class names because Tailwind reads source. */
  triggerTextSize?: 'text-xs' | 'text-xs';
};

/** One would-item in the revert preview — a budget move or an ad-set status restore. */
type RevertWould =
  | { adset_id: string; current: number; proposed: number }
  | { adset_id: string; target_status: string };

function isStatusWould(would: RevertWould): would is { adset_id: string; target_status: string } {
  return 'target_status' in would;
}

function reasonMessage(reason: string | undefined, uiTranslate?: ScaleCopy): string {
  switch (reason) {
    case 'observe_mode':
      return uiTranslate
        ? uiTranslate('this_portfolio_is_in_observe_mode_meta_writes_893c9db')
        : 'This portfolio is in Observe mode — Meta writes are blocked. Switch to Recommend in Manage.';
    case 'unsupported_scope':
      return uiTranslate
        ? uiTranslate('only_ad_set_budget_and_pause_writes_can_be_re_469049c')
        : 'Only ad-set budget and pause writes can be reverted.';
    case 'scope_mismatch':
      return uiTranslate
        ? uiTranslate('this_write_does_not_belong_to_this_portfolio_4583b14')
        : 'This write does not belong to this portfolio.';
    case 'no_prior':
      return uiTranslate
        ? uiTranslate('this_write_has_no_recorded_prior_budget_to_re_63ad33e')
        : 'This write has no recorded prior budget to restore.';
    case 'no_prior_status':
      return uiTranslate
        ? uiTranslate('this_pause_has_no_recorded_prior_status_so_th_3b9efcb')
        : 'This pause has no recorded prior status, so there is nothing safe to restore.';
    case 'audit_not_found':
      return uiTranslate
        ? uiTranslate('the_original_write_could_not_be_found_4808acf')
        : 'The original write could not be found.';
    case 'campaign_unsupported':
      return uiTranslate
        ? uiTranslate('campaign_level_reverts_are_not_supported_yet_73ee95b')
        : 'Campaign-level reverts are not supported yet.';
    case 'account_unreadable':
      return uiTranslate
        ? uiTranslate('could_not_read_the_ad_account_to_build_the_re_8c3062b')
        : 'Could not read the ad account to build the revert. Try again in a moment.';
    default:
      return uiTranslate ? uiTranslate('revert_failed_bff68db') : 'Revert failed.';
  }
}

export function RevertApplyDialog({
  auditId,
  portfolioId,
  brandId,
  currency,
  scope,
  triggerTextSize = 'text-xs',
}: RevertApplyDialogProps) {
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
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
            setResultNote(uiText('queueRevertParseFailed'));
            return;
          }
          if (!data.ok) {
            setPhase('error');
            setResultNote(reasonMessage(data.reason, uiText));
            return;
          }
          setPhase('done');
          setResultNote(
            uiText('queueApplyResult', {
              verb: isStatus ? 'unpause' : 'revert',
              applied: data.applied ?? 0,
              failed: data.failed ?? 0,
              deduped: data.deduped ?? 0,
              hasFailed: data.failed ? 'yes' : 'no',
              hasDeduped: data.deduped ? 'yes' : 'no',
              already: 'done',
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
            variant="ghost"
            className={`h-6 shrink-0 gap-1 px-1.5 ${triggerTextSize} text-muted-foreground hover:text-foreground`}
          >
            <Undo2Icon aria-hidden="true" className="size-3" />
            {isStatus ? uiText('unpause_ccf1af7') : uiText('revert_0026c50')}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isStatus
              ? uiText('unpause_restarts_its_spend_08ff3ad')
              : uiText('revert_this_budget_change_2df5d5e')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isStatus
              ? uiText('restart_this_ad_set_s_spend_by_restoring_the__f97596a')
              : uiText('restore_this_ad_set_s_daily_budget_to_what_it_a0d8343')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {phase === 'applying' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            {isStatus
              ? uiText('restoring_the_prior_status_on_meta_5d1402f')
              : uiText('restoring_the_prior_budget_on_meta_26300db')}
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
            currency={currency}
            isPending={revert.isPending}
            isError={revert.isError}
            preview={preview}
            would={would}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>
            {phase === 'done' ? uiText('close_7d9eb7a') : uiText('cancel_19766ed')}
          </AlertDialogCancel>
          {phase !== 'done' ? (
            <Button type="button" className="gap-1.5" disabled={!canRevert} onClick={handleRevert}>
              {phase === 'applying' ? (
                <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              {isStatus ? uiText('unpause_ad_set_335c259') : uiText('revert_budget_dea8d0b')}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RevertPreviewBody({
  currency,
  isPending,
  isError,
  preview,
  would,
}: {
  currency: string | null;
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useRevertApply>['data'];
  would: RevertWould[];
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        {uiText('computing_the_revert_cff726c')}
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>{uiText('couldn_t_compute_the_revert_preview_try_again_e2f46d2')}</InlineError>
    );
  }

  if (!preview.ok) {
    return <InlineError>{reasonMessage(preview.reason, uiText)}</InlineError>;
  }

  const move = would[0];
  if (!move) {
    return (
      <p className="text-sm text-muted-foreground">
        {uiText('nothing_to_revert_for_this_write_e7bfd8c')}
      </p>
    );
  }

  // An ad-set status revert (unpause) restores the prior status — there is no budget to show.
  if (isStatusWould(move)) {
    const restoreLabel = move.target_status === 'ACTIVE' ? uiText('entityActive') : uiText('entityPaused');
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {uiText('restored_status_7804eca')}
        </p>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-mono text-xs">{move.adset_id}</span>
          <span className="shrink-0 font-medium tabular-nums">→ {restoreLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {uiText('current_restored_daily_budget_d3936f6')}
      </p>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-mono text-xs">{move.adset_id}</span>
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
