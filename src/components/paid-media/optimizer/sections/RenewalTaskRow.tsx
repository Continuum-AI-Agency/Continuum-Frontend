'use client';

// One approved-renewal task row (mark done / dismiss). Opened when a fatigue
// recommendation is approved; the engine never auto-refreshes a creative.

import type { RenewalTask } from '@continuum/contracts';

import { Button } from '@/components/ui/button';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { creativeBriefForRec, recommendationLabel } from '../reportModel';
import { useOptimizerMutations } from '../useOptimizerData';
import { audienceExpansionPrompt } from './recQueueModel';

const TASK_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

type RenewalTaskRowProps = {
  brandId: string;
  task: RenewalTask;
};

export function RenewalTaskRow({ brandId, task }: RenewalTaskRowProps) {
  const { renewal } = useOptimizerMutations(brandId, null);
  const { label, glyph } = recommendationLabel(task.kind);
  const isBusy = renewal.isPending && renewal.variables?.taskId === task.id;
  // On a creative request the seed renders the same brief the maker gets. Absent on the
  // ad-set-level renewals (creative_refresh / audience_expand), which just show their reason.
  const brief = creativeBriefForRec({ kind: task.kind, reason: task.reason, seed: task.seed });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">
          {glyph} {label} ·{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{task.adset_id}</code>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {task.portfolio_name}
          {task.reason ? ` · ${task.reason}` : ''}
        </p>
        {/* A task is only on the board while its signal still fires: opened when it was
            approved, re-asserted by the latest cycle. If a cycle stops raising it, the
            engine closes the task itself. */}
        <p className="mt-0.5 text-2xs text-muted-foreground tabular-nums">
          opened {TASK_DATE.format(new Date(task.created_at))}
          {task.last_asserted_at
            ? ` · still firing as of ${TASK_DATE.format(new Date(task.last_asserted_at))}`
            : ''}
        </p>
        {task.kind === 'audience_expand' ? (
          // The options with sizes live in Jaina's audience tools; hand the ad set and the
          // diagnosis over so the person lands in the three-bucket answer.
          <p className="mt-1.5 text-xs">
            <a
              className="font-medium text-primary underline-offset-2 hover:underline"
              href={jainaPromptHref(
                audienceExpansionPrompt(
                  { adset_id: task.adset_id, reason: task.reason, trigger: task.kind },
                  null,
                ),
              )}
            >
              Explore options with Jaina →
            </a>{' '}
            <span className="text-muted-foreground">
              what it targets now, what the account already owns, and catalogue-verified interests,
              each with an estimated size.
            </span>
          </p>
        ) : null}
        {brief ? (
          <div className="mt-2 space-y-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
            <p className="font-medium text-foreground">{brief.title}</p>
            <p className="leading-relaxed">{brief.brief}</p>
            {brief.groundedOn.length > 0 ? (
              <p>
                <span className="font-medium text-foreground">Grounded on:</span>{' '}
                {brief.groundedOn.join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-3 text-xs"
          disabled={isBusy}
          onClick={() => renewal.mutate({ taskId: task.id, status: 'done' })}
        >
          Mark done
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-xs"
          disabled={isBusy}
          onClick={() => renewal.mutate({ taskId: task.id, status: 'dismissed' })}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
