'use client';

// The Goal tile opened: the target for the main goal, and the goals the Home measures, month to
// date, for the whole brand or one ad account, where the team edits them (rename, measure something
// else, make one the main goal, add or remove one). It reads nothing of its own: the tile's
// month-to-date read already holds every ad account apart, so a scope is a subset of it. Goals are
// saved for the scope on screen through the Home's existing actions. Targets are set at brand scope,
// the one the tile measures, and only once their route answers: until then this says they are on
// the way, and offers nothing that could not be saved.

import {
  HOME_PROFILE_BRAND_SCOPE,
  type HomeObjective,
  resolveHomeObjectives,
} from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import {
  type CurrencyGroup,
  objectiveFigure,
  resultTotalsAcross,
  sumOverviews,
  totalsByCurrency,
} from '@/lib/home/homeOverviewModel';
import { withDistinctAccountLabels } from '@/lib/integrations/distinctAccountLabels';
import { useHomeDraft } from '../../HomePresentationContext';
import { GoalTargetForm } from './GoalTargetForm';
import { GoalRing, goalPaceLine, goalTargetNote } from './GoalTargetProgress';
import { type GoalLoad, type GoalWindow, goalWindowLabel } from './goalModel';
import { type GoalTargetStatus, goalTargetFor } from './goalTargetModel';
import { ObjectiveStrip } from './ObjectiveStrip';
import type { GoalProfiles } from './useGoalProfiles';
import type { GoalTargetsApi } from './useGoalTargets';

export type GoalModuleProps = {
  brandId: string;
  accounts: HomeAdAccount[];
  load: GoalLoad;
  monthWindow: GoalWindow | null;
  profiles: GoalProfiles;
  suggested: HomeObjective[];
  targets: GoalTargetsApi;
  /** The tile's reading of the primary goal against its target; null with no figure to hold. */
  targetStatus: GoalTargetStatus | null;
};

const PLATFORM_LABELS: Record<HomeAdAccount['platform'], string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
};

type DashboardText = ReturnType<typeof useTranslations<'dashboard'>>;

const accountsIn = (count: number, currency: string | null, uiText: DashboardText) =>
  currency
    ? uiText('count_plural_one_ad_account_in_currency_other_472a365', {
        count,
        currency,
      })
    : uiText('count_plural_one_ad_account_in_an_unknown_cur_6bee0d3', { count });

/** What a goal with no figure says, by why the month has none. */
function noFigureNote(
  accounts: HomeAdAccount[],
  load: GoalLoad,
  monthWindow: GoalWindow | null,
  uiText: DashboardText,
) {
  if (accounts.length === 0) return uiText('connect_an_ad_account_to_measure_this_goal_76ad633');
  if (!monthWindow) return uiText('the_month_started_today_the_first_figure_land_4c56ff9');
  if (load.status === 'loading') return uiText('reading_the_month_so_far_0748856');
  if (load.status === 'error') return uiText('this_month_s_read_didn_t_answer_4f7b10a');
  return uiText('not_counted_this_month_yet_32d4a1a');
}

function TargetSection({
  brandId,
  accounts,
  targets,
  targetStatus,
  primary,
  defaultCurrency,
  atBrandScope,
}: Pick<GoalModuleProps, 'brandId' | 'accounts' | 'targets' | 'targetStatus'> & {
  primary: HomeObjective | null;
  defaultCurrency: string | null;
  atBrandScope: boolean;
}) {
  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  const { load } = targets;
  const noteClass = 'rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs';
  if (load.status === 'idle' || load.status === 'loading') return null;
  if (load.status === 'unavailable') {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        {uiText('no_target_set_yet_targets_and_periods_arrive__47832bf')}
      </p>
    );
  }
  if (load.status === 'unreadable') {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        {goalTargetNote({ kind: 'unreadable' }, uiText, uiLocale)}
      </p>
    );
  }
  if (!atBrandScope) {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        {uiText('targets_are_set_for_the_whole_brand_choose_al_46190a2')}
      </p>
    );
  }
  if (!primary) return null;
  const existing = goalTargetFor(load.targets, primary);
  const compared = targetStatus?.kind === 'compared' ? targetStatus : null;
  const note = targetStatus ? goalTargetNote(targetStatus, uiText, uiLocale) : null;
  const currencies = [
    ...new Set(accounts.flatMap((account) => (account.currency ? [account.currency] : []))),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {compared ? (
        <div className="flex flex-col gap-2">
          <GoalRing status={compared} />
          <p className="text-center text-muted-foreground text-xs">
            {goalPaceLine(compared, uiText)}
          </p>
        </div>
      ) : null}
      {note ? <p className={noteClass}>{note}</p> : null}
      <GoalTargetForm
        brandId={brandId}
        currencies={currencies}
        defaultCurrency={defaultCurrency}
        existing={existing}
        key={`${primary.id}|${primary.metric}`}
        objective={primary}
        targets={targets}
      />
    </div>
  );
}

export default function GoalModule({
  brandId,
  accounts,
  load,
  monthWindow,
  profiles,
  suggested,
  targets,
  targetStatus,
}: GoalModuleProps) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  const [scope, setScope] = useState<string>(HOME_PROFILE_BRAND_SCOPE);
  const reads = load.status === 'ready' ? load.reads : [];
  const scopedReads =
    scope === HOME_PROFILE_BRAND_SCOPE
      ? reads
      : reads.filter(({ account }) => account.id === scope);
  const groups = totalsByCurrency(
    scopedReads.map(({ account, overview }) => ({
      currency: account.currency ?? overview.currency ?? null,
      overview,
    })),
  );
  const spending = groups.filter((group) => group.spending > 0);
  // One strip per currency its accounts spent in; with no read yet, one strip with no figures.
  const strips: CurrencyGroup[] =
    spending.length > 0
      ? spending
      : groups.length > 0
        ? groups.slice(0, 1)
        : [{ currency: null, totals: sumOverviews([]), spending: 0 }];
  const resolved = resolveHomeObjectives({
    scope,
    rows: profiles.rows,
    totals: resultTotalsAcross(groups),
    suggested,
  });
  const scopeHasOwnRow = profiles.rows.some((row) => row.scope === scope);
  const mixedPlatforms = new Set(accounts.map((account) => account.platform)).size > 1;
  const sourceNote = resolved.fromSuggestion
    ? uiText('goals_suggested_from_your_brand_book_until_re_acab84b')
    : resolved.source === 'inferred'
      ? uiText('goals_suggested_from_your_results_84c3f3a')
      : resolved.fromScope === scope
        ? uiText('goals_set_by_your_team_4004661')
        : uiText('using_the_brand_goals_bcf921f');
  const note = noFigureNote(accounts, load, monthWindow, uiText);
  const atBrandScope = scope === HOME_PROFILE_BRAND_SCOPE;
  const [firstObjective] = resolved.objectives;
  const primary =
    resolved.objectives.find((goal) => goal.role === 'primary') ?? firstObjective ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="home-goals-module">
      <TargetSection
        accounts={accounts}
        atBrandScope={atBrandScope}
        brandId={brandId}
        defaultCurrency={strips[0]?.currency ?? accounts[0]?.currency ?? null}
        primary={primary}
        targets={targets}
        targetStatus={targetStatus}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground text-xs">
            {monthWindow
              ? uiText('month_to_date_dates_5a85f65', { dates: goalWindowLabel(monthWindow) })
              : uiText('month_to_date_baa1edb')}
          </span>
          <span className="text-2xs text-muted-foreground">
            {sourceNote}
            {scopeHasOwnRow ? (
              <>
                {' · '}
                <button
                  className="underline-offset-2 hover:underline"
                  disabled={draft}
                  onClick={() => {
                    if (!draft) void profiles.reset(scope);
                  }}
                  type="button"
                >
                  {scope === HOME_PROFILE_BRAND_SCOPE
                    ? uiText('use_suggested_goals_7b23cf4')
                    : uiText('use_brand_goals_2f71cf7')}
                </button>
              </>
            ) : null}
          </span>
        </div>
        {accounts.length > 1 ? (
          <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span className="sr-only">{uiText('ad_accounts_in_view_267e2b2')}</span>
            <select
              className="h-7 max-w-full rounded-md border border-border bg-background px-2 text-foreground text-xs"
              onChange={(event) => setScope(event.target.value)}
              value={scope}
            >
              <option value={HOME_PROFILE_BRAND_SCOPE}>{uiText('all_ad_accounts_7ddf3cc')}</option>
              {withDistinctAccountLabels(
                accounts.map((account) => ({
                  id: account.id,
                  label: mixedPlatforms
                    ? `${account.name} · ${PLATFORM_LABELS[account.platform]}`
                    : account.name,
                })),
              ).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {strips.map((group, index) => (
        <div
          className="flex flex-col gap-1.5"
          data-home-currency={group.currency ?? ''}
          key={group.currency ?? 'unknown'}
        >
          {strips.length > 1 ? (
            <span className="font-medium text-2xs text-muted-foreground uppercase tracking-wide">
              {accountsIn(group.totals.accountCount, group.currency, uiText)}
            </span>
          ) : null}
          <ObjectiveStrip
            currency={group.currency}
            editable={index === 0 && !draft}
            inferredLabels={resolved.fromSuggestion || resolved.source === 'inferred'}
            figures={resolved.objectives.map((goal) => objectiveFigure(goal, group.totals))}
            objectives={resolved.objectives}
            onChange={(next) => {
              if (!draft) void profiles.save(scope, next);
            }}
            unavailableNote={note}
          />
        </div>
      ))}
    </div>
  );
}
