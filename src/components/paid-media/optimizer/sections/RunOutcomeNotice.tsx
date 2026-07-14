'use client';

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

function describe(outcome: RunCycleOutcome): { tone: Tone; message: string } {
  if (outcome.status === 'ran') {
    const { snapshotCount, recommendations, applied, held } = outcome.run;
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
    return {
      tone: 'warning',
      message:
        outcome.reason === 'no_adsets'
          ? 'Nothing to score — no ad sets are enrolled in this portfolio yet. Add ad sets, then run again.'
          : 'The cycle ran but found no live Meta data for the enrolled ad sets. Reconnect the ad account, or check that the ad sets are still active and spending.',
    };
  }

  switch (outcome.kind) {
    case 'not_configured':
      return {
        tone: 'warning',
        message:
          "The optimizer service isn't wired up for this environment yet — scheduled cycles will populate this once it is.",
      };
    case 'timeout':
      return {
        tone: 'warning',
        message:
          "The optimizer service didn't respond in time. The cycle may still be running — check back in a minute.",
      };
    case 'forbidden':
      return { tone: 'warning', message: "That ad account isn't connected to this brand." };
    case 'malformed':
      return {
        tone: 'destructive',
        message:
          'The optimizer returned an unexpected response. The cycle may still have run — this is a bug and has been logged.',
      };
    default:
      return {
        tone: 'warning',
        message: "Couldn't reach the optimizer service. Scheduled cycles will still run.",
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
  if (isPending) {
    return (
      <p
        role="status"
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
        Running a cycle — scoring the enrolled ad sets.
      </p>
    );
  }

  if (!outcome) return null;

  const { tone, message } = describe(outcome);
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
