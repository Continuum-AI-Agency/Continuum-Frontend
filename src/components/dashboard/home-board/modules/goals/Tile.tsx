'use client';

// H02 Goal: the brand's primary goal against the team's target, a per-day line beside it, and up
// to three secondary goals, month to date. The goal comes from the team's saved profile, else from
// the month's results as the reading says, else from the Brand Book. Money is shown per currency
// and never added across them; the headline is the lead currency and says so.
//
// A target sets the window: the figure is read over its period through yesterday, and paced on the
// period's complete days. A money target in another currency is said, never compared. With no
// target the figure is the month so far, and "Set a goal" opens the expanded module. Where the
// targets route is not deployed the tile is exactly that, with no form: its figure is real and
// nothing is wrong. Never a projection.

import { useLocale, useTranslations } from 'next-intl';
import { lazy, useMemo, useState } from 'react';
import { Sparkline } from '@/components/paid-media/optimizer/components/Sparkline';
import type { ModuleFrameState } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { GoogleReadNotice } from '@/components/paid-media/optimizer/sections/platforms/GoogleReadNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { localizeDashboardCopy } from '@/i18n/dashboardCopy';
import { formatFigure } from '@/lib/home/format';
import { useGoogleRefusal } from '@/lib/home/homeAccounts';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import {
  GoalProgressBar,
  goalPaceLine,
  goalTargetFigure,
  goalTargetNote,
} from './GoalTargetProgress';
import {
  type GoalFigure,
  type GoalSource,
  type GoalTileView,
  goalActiveTarget,
  goalPeriodReadWindow,
  goalTileView,
  goalWindowLabel,
  monthToDateWindow,
} from './goalModel';
import type { GoalTargetStatus } from './goalTargetModel';
import { useGoalProfiles } from './useGoalProfiles';
import { useGoalRead } from './useGoalRead';
import { useGoalTargets } from './useGoalTargets';

const GoalModule = lazy(() => import('./Module'));

type DashboardText = ReturnType<typeof useTranslations<'dashboard'>>;

const SOURCE_LABEL_KEYS = {
  team: 'set_by_your_team_3a1fe54',
  results: 'followed_from_your_results_a3839f4',
  business: 'suggested_by_your_brand_book_1b11250',
} as const satisfies Record<GoalSource, string>;

function amountsText(figure: GoalFigure, uiText: DashboardText): string {
  if (figure.amounts.length === 0) {
    return figure.unreported
      ? uiText('not_counted_by_google_ads_1e76a83')
      : uiText('not_counted_yet_65a3ca0');
  }
  return figure.amounts
    .map((amount) => formatFigure(amount.value, figure.unit, amount.currency))
    .join(' · ');
}

/** The target's period when one sets the window, else 'none' (the month so far): the `period`
 *  argument of the messages that say what the figure covers. */
function figurePeriod(target: GoalTargetStatus): string {
  return target.kind === 'compared' || target.kind === 'mismatch' ? target.target.period : 'none';
}

/** A goal's own name is the team's words; a built-in metric name is said in the UI language. */
function goalLabel(label: string, source: GoalSource, uiText: DashboardText): string {
  return source === 'team' ? label : localizeDashboardCopy(label, uiText);
}

function TargetFooter({
  size,
  target,
  onSetGoal,
}: {
  size: 'l' | 'm' | 's';
  target: GoalTargetStatus;
  onSetGoal: () => void;
}) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const hasTarget =
    target.kind === 'compared' || target.kind === 'mismatch' || target.kind === 'not-running';
  const note = goalTargetNote(target, uiText, uiLocale);
  return (
    <>
      {note ? (
        <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-target-note">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        {target.kind === 'none' || target.kind === 'unavailable' ? (
          <span className="font-medium text-xs">{uiText('no_target_set_yet_354d24a')}</span>
        ) : null}
        <Button className="ml-auto h-7 text-xs" onClick={onSetGoal} size="sm" variant="outline">
          {hasTarget ? uiText('edit_target_1455e66') : uiText('set_a_goal_8e331a7')}
        </Button>
      </div>
      {target.kind === 'unavailable' && size !== 's' ? (
        <p className="text-2xs text-muted-foreground">
          {uiText('targets_and_periods_arrive_with_the_goals_upd_3e92ca5')}
        </p>
      ) : null}
    </>
  );
}

function ReadyBody({
  view,
  size,
  onSetGoal,
}: {
  view: Extract<GoalTileView, { state: 'ready' }>;
  size: 'l' | 'm' | 's';
  onSetGoal: () => void;
}) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const { primary, headline, others, secondaries, target } = view;
  const label = goalLabel(primary.objective.label, view.source, uiText);
  const compared = target.kind === 'compared' ? target : null;
  const period = figurePeriod(target);
  const othersText = new Intl.ListFormat(uiLocale, { type: 'conjunction' }).format(
    others.map((amount) => formatFigure(amount.value, primary.unit, amount.currency)),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="truncate text-2xs text-muted-foreground uppercase tracking-wide">
        {uiText('goal_period_select_week_this_week_month_this__df88b16', { goal: label, period })}
      </p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span
            className="min-w-0 truncate font-semibold text-3xl tabular-nums tracking-tight"
            data-currency={headline.currency ?? ''}
            data-goal-metric={primary.objective.metric}
            data-target={compared ? String(compared.target.target) : undefined}
            data-testid="home-tile-goals-headline"
            data-value={String(headline.value)}
          >
            {formatFigure(headline.value, primary.unit, headline.currency)}
          </span>
          {compared ? (
            <span
              className="text-muted-foreground text-sm tabular-nums"
              data-testid="home-tile-goals-target"
            >
              {uiText('of_target_de39515', { target: goalTargetFigure(compared.target) })}
            </span>
          ) : null}
        </div>
        {headline.series.length > 1 ? (
          <Sparkline
            className="shrink-0"
            height={32}
            label={uiText('goal_per_day_period_select_week_this_week_mon_5e2a2ec', {
              goal: label,
              period,
            })}
            values={headline.series}
            width={size === 's' ? 72 : 120}
          />
        ) : null}
      </div>
      {compared ? (
        <>
          <GoalProgressBar label={label} status={compared} />
          <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-pace">
            {goalPaceLine(compared, uiText)}
          </p>
        </>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {goalWindowLabel(view.figureWindow)} · {uiText(SOURCE_LABEL_KEYS[view.source])}
      </p>
      {others.length > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-currencies">
          {compared
            ? uiText('in_currency_the_target_s_currency_also_others_12eb59e', {
                currency: headline.currency ?? '',
                others: othersText,
              })
            : headline.currency
              ? uiText('in_currency_the_currency_most_of_the_spending_693dbd4', {
                  currency: headline.currency,
                  others: othersText,
                })
              : uiText('in_an_unknown_currency_the_currency_most_of_t_2569674', {
                  others: othersText,
                })}
        </p>
      ) : null}
      {view.unanswered > 0 ? (
        <p className="text-muted-foreground text-xs">
          {uiText('count_plural_one_ad_account_didn_t_answer_and_7f9907b', {
            count: view.unanswered,
          })}
        </p>
      ) : null}
      {size !== 's' && secondaries.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t pt-2" data-testid="home-tile-goals-secondaries">
          {secondaries.map((figure) => (
            <li
              className="flex min-w-0 items-baseline justify-between gap-3 text-xs"
              data-goal-metric={figure.objective.metric}
              key={figure.objective.id}
            >
              <span className="truncate text-muted-foreground">
                {goalLabel(figure.objective.label, view.source, uiText)}
                {period === 'none' ? '' : ` · ${uiText('month_to_date_aff3da6')}`}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{amountsText(figure, uiText)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <TargetFooter onSetGoal={onSetGoal} size={size} target={target} />
    </div>
  );
}

export default function GoalsTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  // The day is fixed when the tile mounts: yesterday moves at midnight, the board does not.
  const [now] = useState(() => new Date());
  const monthWindow = useMemo(() => monthToDateWindow(now), [now]);
  const [attempt, setAttempt] = useState(0);
  const profiles = useGoalProfiles(ctx.brandId, ctx.profileRows);
  const targets = useGoalTargets(ctx.brandId, ctx.adAccounts.length > 0);
  const load = useGoalRead(ctx.brandId, ctx.adAccounts, monthWindow, attempt);
  const suggested = ctx.reading.goal.suggested;
  const active = useMemo(
    () => goalActiveTarget({ targets: targets.load, load, rows: profiles.rows, suggested, now }),
    [targets.load, load, profiles.rows, suggested, now],
  );
  const periodLoad = useGoalRead(
    ctx.brandId,
    ctx.adAccounts,
    goalPeriodReadWindow(active, monthWindow),
    attempt,
  );
  // Google refused every read (a role, a grant, a refused login): the Google tab's words, not
  // "didn't answer" — the edge did answer, and Retry cannot change any of the three.
  const failed = load.status === 'error' ? load : periodLoad.status === 'error' ? periodLoad : null;
  const refusal = useGoogleRefusal(
    ctx.brandId,
    failed ? { status: 'error', failures: failed.failures } : { status: 'loading' },
  );
  const view = useMemo(
    () =>
      goalTileView({
        accounts: ctx.adAccounts,
        window: monthWindow,
        load,
        rows: profiles.rows,
        suggested,
        targets: targets.load,
        active,
        periodLoad,
      }),
    [ctx.adAccounts, monthWindow, load, profiles.rows, suggested, targets.load, active, periodLoad],
  );
  // "Set a goal" opens the same sheet as the frame's own "Open".
  const [moduleOpen, setModuleOpen] = useState(false);
  const openModule = () => setModuleOpen(true);

  const state: ModuleFrameState =
    view.state === 'error' && refusal?.status === 'loading' ? 'loading' : view.state;
  const badge =
    view.state === 'ready'
      ? uiText('goal_period_select_week_this_week_month_this__ffc61b0', {
          goal: goalLabel(view.primary.objective.label, view.source, uiText),
          period: figurePeriod(view.target),
          figure: formatFigure(view.headline.value, view.primary.unit, view.headline.currency),
        })
      : null;

  return (
    <HomeTileFrame
      badge={badge}
      onOpenChange={setModuleOpen}
      open={moduleOpen}
      expanded={
        <GoalModule
          accounts={ctx.adAccounts}
          brandId={ctx.brandId}
          load={load}
          monthWindow={monthWindow}
          profiles={profiles}
          suggested={suggested}
          targets={targets}
          targetStatus={view.state === 'ready' ? view.target : null}
        />
      }
      expandedDescription={uiText('the_goals_the_home_measures_and_the_target_fo_9088af8')}
      state={state}
      tile={tile}
    >
      <div className="min-w-0">
        {state === 'loading' ? (
          <Skeleton className="h-24 w-full bg-muted/70" />
        ) : view.state === 'ready' ? (
          <ReadyBody onSetGoal={openModule} size={tile.size} view={view} />
        ) : view.state === 'missing' ? (
          <div className="flex min-w-0 flex-col gap-2">
            {view.reason === 'no-account' ? (
              <div className="min-w-0" data-testid="home-tile-goals-inferred">
                <p className="font-semibold text-lg tracking-tight">{ctx.reading.goal.label}</p>
                <p className="text-muted-foreground text-xs">{ctx.reading.goal.detail}</p>
              </div>
            ) : null}
            <TileMissing>{view.sentence}</TileMissing>
          </div>
        ) : refusal && refusal.status !== 'loading' ? (
          <GoogleReadNotice state={refusal} />
        ) : (
          <p className="text-destructive-ink text-xs" role="alert">
            {uiText('couldn_t_read_these_results_the_ad_platform_d_2ec1824')}{' '}
            <Button
              className="h-5 px-1 text-xs"
              onClick={() => setAttempt((count) => count + 1)}
              size="sm"
              type="button"
              variant="link"
            >
              {uiText('retry_942087c')}
            </Button>
          </p>
        )}
      </div>
    </HomeTileFrame>
  );
}
