'use client';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useTranslations } from 'next-intl';

// What actually happened when you pressed "Run now".
//
// There are THREE outcomes, and the UI used to render all of them as one sentence —
// "Optimizer service not live yet" — which was true in none of them:
//
//   ran         a cycle scored the enrolled ad sets and persisted a run.
//   skipped     the cycle RAN and correctly did nothing (nothing enrolled, or no live Meta
//               data for what is enrolled). This is actionable, and it is NOT an outage.
//   unavailable the request never reached a working service.
//
// The old message was produced by `run.data == null`, which happened on EVERY successful
// cycle because the response contract disagreed with the service's wire shape. So the one
// state the user saw was the one state that was never true.

import { CheckCircle2Icon, CircleSlashIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';

import type { RunCycleOutcome } from '@/components/paid-media/optimizer/useOptimizerData';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'destructive';

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  warning: 'border-warning/40 bg-warning/5 text-warning',
  destructive: 'border-destructive/40 bg-destructive/5 text-destructive',
};

function describe(
  outcome: RunCycleOutcome,
  uiTranslate?: ScaleCopy,
): { tone: Tone; message: string } {
  // One run per portfolio per UTC day: the service returned the run already on screen, so
  // nothing new was scored and no card changed. "Cycle complete" would promise fresh cards.
  if (outcome.status === 'ran' && outcome.alreadyScoredToday) {
    return {
      tone: 'warning',
      message: uiTranslate
        ? uiTranslate('already_scored_today_a_portfolio_gets_one_cyc_f2c7195')
        : "Already scored today — a portfolio gets one cycle per day, and today's is the one on screen, so there was nothing new to score. The next cycle can run after 00:00 UTC.",
    };
  }

  if (outcome.status === 'ran') {
    const { snapshotCount, recommendations, applied, held } = outcome.run;
    if (uiTranslate)
      return {
        tone: 'success',
        message: uiTranslate('runCycleComplete', {
          adsets: snapshotCount,
          recommendations,
          applied,
          held,
          hasApplied: applied > 0 ? 'yes' : 'no',
          hasHeld: held > 0 ? 'yes' : 'no',
        }),
      };
    const parts = [
      `Cycle complete — scored ${snapshotCount} ad ${snapshotCount === 1 ? 'set' : 'sets'}, ` +
        `${recommendations} recommendation${recommendations === 1 ? '' : 's'}.`,
    ];
    if (applied > 0) {
      parts.push(`${applied} budget change${applied === 1 ? '' : 's'} applied.`);
    }
    if (held > 0) {
      parts.push(`${held} held for your approval.`);
    }
    return { tone: 'success', message: parts.join(' ') };
  }

  if (outcome.status === 'skipped') {
    if (uiTranslate)
      return {
        tone: 'warning',
        message: uiTranslate('runCycleSkipped', { reason: outcome.reason }),
      };
    return {
      tone: 'warning',
      message:
        outcome.reason === 'no_adsets'
          ? 'Nothing to score — no ad sets are enrolled in this portfolio yet. Add ad sets, then run again.'
          : 'The cycle ran but found no live Meta data for the enrolled ad sets. Reconnect the ad account, or check that the ad sets are still active and spending.',
    };
  }

  switch (outcome.kind) {
    // Deliberately says nothing about environments or wiring. The user cannot act
    // on our deployment topology, and naming it reads as a broken product rather
    // than a feature that has not switched on for them yet.
    case 'not_configured':
      return {
        tone: 'warning',
        message: uiTranslate
          ? uiTranslate('the_optimizer_isn_t_running_for_this_account__c5d4a70')
          : "The optimizer isn't running for this account yet. Nothing is wrong with your setup — scoring starts automatically once it's switched on.",
      };
    // Deliberately makes NO promise about budgets. The request timed out, which
    // means the cycle may still be completing server-side — on an autopilot
    // portfolio it could still write. "Nothing was changed" is a claim we cannot
    // make here, and the one place a money tool must not guess is this one.
    case 'timeout':
      return {
        tone: 'warning',
        message: uiTranslate
          ? uiTranslate('the_optimizer_didn_t_respond_in_time_the_cycl_0f68446')
          : "The optimizer didn't respond in time. The cycle may still be finishing — check the Logs tab in a minute to see what it did before running again.",
      };
    case 'forbidden':
      return {
        tone: 'warning',
        message: uiTranslate
          ? uiTranslate('that_ad_account_isn_t_connected_to_this_brand_e2ad7a0')
          : "That ad account isn't connected to this brand.",
      };
    case 'malformed':
      return {
        tone: 'destructive',
        message: uiTranslate
          ? uiTranslate('the_optimizer_answered_with_something_this_sc_57e6dfe')
          : "The optimizer answered with something this screen cannot read. The cycle may still have run — we've logged it. Check the Logs tab before running again.",
      };
    default:
      return {
        tone: 'warning',
        message: uiTranslate
          ? uiTranslate('couldn_t_reach_the_optimizer_just_now_your_bu_a4ed1d2')
          : "Couldn't reach the optimizer just now. Your budgets are untouched, and the next scheduled cycle will still run.",
      };
  }
}

const ICON: Record<Tone, typeof CheckCircle2Icon> = {
  success: CheckCircle2Icon,
  warning: CircleSlashIcon,
  destructive: TriangleAlertIcon,
};

export function RunOutcomeNotice({
  outcome,
  isPending,
}: {
  outcome: RunCycleOutcome | undefined;
  isPending: boolean;
}) {
  const uiText = useTranslations('scale');
  if (isPending) {
    return (
      <p
        role="status"
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
        {uiText('running_a_cycle_scoring_the_enrolled_ad_sets_7fcfc66')}
      </p>
    );
  }

  if (!outcome) return null;

  const { tone, message } = describe(outcome, uiText);
  const Icon = ICON[tone];

  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs',
        TONE_CLASS[tone],
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
