'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';
import { uiDateFormat } from '@/lib/paid-media/uiDateFormat';

// One approved-renewal task row (mark done / dismiss). Opened when a fatigue
// recommendation is approved; the engine never auto-refreshes a creative. A hairline row in
// the Actions tray: kind tag, what to do on which ad set (by name — the task read carries only
// the id, so the name comes from the portfolio's enrolled roster), the why, and its two
// buttons on the right.

import type { RenewalTask } from '@continuum/contracts';

import { Button } from '@/components/ui/button';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { creativeBriefForRec, recommendationLabel } from '../reportModel';
import { useOptimizerEnrolledAdsets, useOptimizerMutations } from '../useOptimizerData';
import { KindTag, kindTone, kindWord } from './kindTag';
import { audienceExpansionPrompt } from './recQueueModel';

type RenewalTaskRowProps = {
  brandId: string;
  task: RenewalTask;
};

export function RenewalTaskRow({ brandId, task }: RenewalTaskRowProps) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const { renewal } = useOptimizerMutations(brandId, null);
  const { label } = recommendationLabel(task.kind, optimizerText);
  const roster = useOptimizerEnrolledAdsets(task.portfolio_id);
  const adsetName =
    roster.data.find((adset) => adset.adset_id === task.adset_id)?.adset_name?.trim() || null;
  const isBusy = renewal.isPending && renewal.variables?.taskId === task.id;
  // On a creative request the seed renders the same brief the maker gets. Absent on the
  // ad-set-level renewals (creative_refresh / audience_expand), which just show their reason.
  const brief = creativeBriefForRec({ kind: task.kind, reason: task.reason, seed: task.seed });

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <KindTag tone={kindTone(task.kind)}>{kindWord(task.kind, uiText)}</KindTag>
          <span className="font-semibold tracking-tight">{label}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold tracking-tight" title={task.adset_id}>
            {adsetName ?? uiText('an_ad_set_in_this_portfolio_5281f0e')}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {task.portfolio_name}
          {task.reason ? ` · ${task.reason}` : ''}
        </p>
        {/* A task is only on the board while its signal still fires: opened when it was
            approved, re-asserted by the latest cycle. If a cycle stops raising it, the
            engine closes the task itself. */}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {uiText.rich('sentence_97839b1789b4', {
            date: uiDateFormat(uiLocale, { month: 'short', day: 'numeric' }).format(
              new Date(task.created_at),
            ),
            hasAssertion: task.last_asserted_at ? 'yes' : 'no',
            asserted: task.last_asserted_at
              ? uiDateFormat(uiLocale, { month: 'short', day: 'numeric' }).format(
                  new Date(task.last_asserted_at),
                )
              : '',
          })}
        </p>
        {task.kind === 'audience_expand' ? (
          // The options with sizes live in Jaina's audience tools; hand the ad set and the
          // diagnosis over so the person lands in the three-bucket answer.
          <p className="mt-1.5 text-xs">
            <a
              className="font-medium text-primary-ink underline-offset-2 hover:underline"
              href={jainaPromptHref(
                audienceExpansionPrompt(
                  { adset_id: task.adset_id, reason: task.reason, trigger: task.kind },
                  null,
                ),
              )}
            >
              {uiText('explore_options_with_jaina_9697761')}
            </a>{' '}
            <span className="text-muted-foreground">
              {uiText('what_it_targets_now_what_the_account_already__26aa3b4')}
            </span>
          </p>
        ) : null}
        {brief ? (
          <div className="mt-2 space-y-1 border-border/60 border-l pl-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{brief.title}</p>
            <p className="leading-relaxed">{brief.brief}</p>
            {brief.groundedOn.length > 0 ? (
              <p>
                <span className="font-medium text-foreground">{uiText('grounded_on_79d5004')}</span>{' '}
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
          {uiText('mark_done_95acc4a')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-xs"
          disabled={isBusy}
          onClick={() => renewal.mutate({ taskId: task.id, status: 'dismissed' })}
        >
          {uiText('dismiss_48845bf')}
        </Button>
      </div>
    </li>
  );
}
