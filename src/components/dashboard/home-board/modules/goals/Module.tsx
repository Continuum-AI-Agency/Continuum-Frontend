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
import { GoalTargetForm } from './GoalTargetForm';
import { GoalRing, goalPaceLine, goalTargetNote } from './GoalTargetProgress';
import { type GoalLoad, type GoalWindow, goalWindowLabel, TARGETS_LATER } from './goalModel';
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

const accountsIn = (count: number, currency: string | null) =>
  `${count} ad account${count === 1 ? '' : 's'} in ${currency ?? 'an unknown currency'}`;

/** What a goal with no figure says, by why the month has none. */
function noFigureNote(accounts: HomeAdAccount[], load: GoalLoad, monthWindow: GoalWindow | null) {
  if (accounts.length === 0) return 'Connect an ad account to measure this goal.';
  if (!monthWindow) return 'The month started today; the first figure lands tomorrow.';
  if (load.status === 'loading') return 'Reading the month so far…';
  if (load.status === 'error') return 'This month’s read didn’t answer.';
  return 'Not counted this month yet.';
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
  const { load } = targets;
  const noteClass = 'rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs';
  if (load.status === 'idle' || load.status === 'loading') return null;
  if (load.status === 'unavailable') {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        No target set yet. {TARGETS_LATER} Until then each goal shows its month to date.
      </p>
    );
  }
  if (load.status === 'unreadable') {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        {goalTargetNote({ kind: 'unreadable' })}
      </p>
    );
  }
  if (!atBrandScope) {
    return (
      <p className={noteClass} data-testid="home-goals-target-note">
        Targets are set for the whole brand. Choose All ad accounts to set or change one.
      </p>
    );
  }
  if (!primary) return null;
  const existing = goalTargetFor(load.targets, primary);
  const compared = targetStatus?.kind === 'compared' ? targetStatus : null;
  const note = targetStatus ? goalTargetNote(targetStatus) : null;
  const currencies = [
    ...new Set(accounts.flatMap((account) => (account.currency ? [account.currency] : []))),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {compared ? (
        <div className="flex flex-col gap-2">
          <GoalRing status={compared} />
          <p className="text-center text-muted-foreground text-xs">{goalPaceLine(compared)}</p>
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
    ? 'Goals suggested from your Brand Book until results come in'
    : resolved.source === 'inferred'
      ? 'Goals suggested from your results'
      : resolved.fromScope === scope
        ? 'Goals set by your team'
        : 'Using the brand goals';
  const note = noFigureNote(accounts, load, monthWindow);
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
            {monthWindow ? `Month to date · ${goalWindowLabel(monthWindow)}` : 'Month to date'}
          </span>
          <span className="text-2xs text-muted-foreground">
            {sourceNote}
            {scopeHasOwnRow ? (
              <>
                {' · '}
                <button
                  className="underline-offset-2 hover:underline"
                  onClick={() => profiles.reset(scope)}
                  type="button"
                >
                  {scope === HOME_PROFILE_BRAND_SCOPE ? 'Use suggested goals' : 'Use brand goals'}
                </button>
              </>
            ) : null}
          </span>
        </div>
        {accounts.length > 1 ? (
          <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span className="sr-only">Ad accounts in view</span>
            <select
              className="h-7 max-w-full rounded-md border border-border bg-background px-2 text-foreground text-xs"
              onChange={(event) => setScope(event.target.value)}
              value={scope}
            >
              <option value={HOME_PROFILE_BRAND_SCOPE}>All ad accounts</option>
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
              {accountsIn(group.totals.accountCount, group.currency)}
            </span>
          ) : null}
          <ObjectiveStrip
            currency={group.currency}
            editable={index === 0}
            figures={resolved.objectives.map((goal) => objectiveFigure(goal, group.totals))}
            objectives={resolved.objectives}
            onChange={(next) => profiles.save(scope, next)}
            unavailableNote={note}
          />
        </div>
      ))}
    </div>
  );
}
