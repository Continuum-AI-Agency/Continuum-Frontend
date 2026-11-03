'use client';

// H02 Goal: the brand's primary goal month to date (the 1st through yesterday), a per-day line
// beside it, and up to three secondary goals. The goal comes from the team's saved profile, else
// from the month's results as the reading says, else from the Brand Book. Money is shown per
// currency and never added across them; the headline is the lead currency and says so.
//
// There is no target and no period yet: the team will set both in the UI once the goals update
// lands. Until then the tile shows the real month-to-date figure with "No target set yet", and
// "Set a goal" opens the expanded module, where the goal and its scope are edited — never a ring,
// a pace or a projection against a target that does not exist.

import { lazy, useMemo, useState } from 'react';
import { Sparkline } from '@/components/paid-media/optimizer/components/Sparkline';
import type { ModuleFrameState } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { GoogleReadNotice } from '@/components/paid-media/optimizer/sections/platforms/GoogleReadNotice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFigure } from '@/lib/home/format';
import { useGoogleRefusal } from '@/lib/home/homeAccounts';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import {
  type GoalFigure,
  type GoalSource,
  type GoalTileView,
  goalTileView,
  goalWindowLabel,
  monthToDateWindow,
  TARGETS_LATER,
} from './goalModel';
import { useGoalMonthToDate } from './useGoalMonthToDate';
import { useGoalProfiles } from './useGoalProfiles';

const GoalModule = lazy(() => import('./Module'));

const SOURCE_LABELS: Record<GoalSource, string> = {
  team: 'Set by your team',
  results: 'Followed from your results',
  business: 'Suggested by your Brand Book',
};

function amountsText(figure: GoalFigure): string {
  if (figure.amounts.length === 0) {
    return figure.unreported ? 'Not counted by Google Ads' : 'Not counted yet';
  }
  return figure.amounts
    .map((amount) => formatFigure(amount.value, figure.unit, amount.currency))
    .join(' · ');
}

function ReadyBody({
  view,
  windowLabel,
  size,
  onSetGoal,
}: {
  view: Extract<GoalTileView, { state: 'ready' }>;
  windowLabel: string;
  size: 'l' | 'm' | 's';
  onSetGoal: () => void;
}) {
  const { primary, headline, others, secondaries } = view;
  const label = primary.objective.label;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="truncate text-2xs text-muted-foreground uppercase tracking-wide">
        {label} · month to date
      </p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <span
          className="min-w-0 truncate font-semibold text-3xl tabular-nums tracking-tight"
          data-currency={headline.currency ?? ''}
          data-testid="home-tile-goals-headline"
          data-value={String(headline.value)}
        >
          {formatFigure(headline.value, primary.unit, headline.currency)}
        </span>
        {headline.series.length > 1 ? (
          <Sparkline
            className="shrink-0"
            height={32}
            label={`${label}, per day this month`}
            values={headline.series}
            width={size === 's' ? 72 : 120}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {windowLabel} · {SOURCE_LABELS[view.source]}
      </p>
      {others.length > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-currencies">
          In {headline.currency ?? 'an unknown currency'}, the currency most of the spending ad
          accounts use. Also{' '}
          {others
            .map((amount) => formatFigure(amount.value, primary.unit, amount.currency))
            .join(' and ')}
          , never added together.
        </p>
      ) : null}
      {view.unanswered > 0 ? (
        <p className="text-muted-foreground text-xs">
          {view.unanswered === 1
            ? '1 ad account didn’t answer and is not in these figures.'
            : `${view.unanswered} ad accounts didn’t answer and are not in these figures.`}
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
              <span className="truncate text-muted-foreground">{figure.objective.label}</span>
              <span className="shrink-0 font-mono tabular-nums">{amountsText(figure)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span className="font-medium text-xs">No target set yet</span>
        <Button className="h-7 text-xs" onClick={onSetGoal} size="sm" variant="outline">
          Set a goal
        </Button>
      </div>
      {size !== 's' ? <p className="text-2xs text-muted-foreground">{TARGETS_LATER}</p> : null}
    </div>
  );
}

export default function GoalsTile({ ctx, tile }: HomeTileProps) {
  // The window is fixed when the tile mounts: yesterday moves at midnight, the board does not.
  const [monthWindow] = useState(() => monthToDateWindow());
  const [attempt, setAttempt] = useState(0);
  const profiles = useGoalProfiles(ctx.brandId, ctx.profileRows);
  const load = useGoalMonthToDate(ctx.brandId, ctx.adAccounts, monthWindow, attempt);
  // Google refused every read (a role, a grant, a refused login): the Google tab's words, not
  // "didn't answer" — the edge did answer, and Retry cannot change any of the three.
  const refusal = useGoogleRefusal(
    ctx.brandId,
    load.status === 'error' ? { status: 'error', failures: load.failures } : { status: 'loading' },
  );
  const view = useMemo(
    () =>
      goalTileView({
        accounts: ctx.adAccounts,
        window: monthWindow,
        load,
        rows: profiles.rows,
        suggested: ctx.reading.goal.suggested,
      }),
    [ctx.adAccounts, monthWindow, load, profiles.rows, ctx.reading.goal.suggested],
  );
  // "Set a goal" opens the same sheet as the frame's own "Open".
  const [moduleOpen, setModuleOpen] = useState(false);
  const openModule = () => setModuleOpen(true);

  const state: ModuleFrameState =
    view.state === 'error' && refusal?.status === 'loading' ? 'loading' : view.state;
  const badge =
    view.state === 'ready'
      ? `${view.primary.objective.label} this month: ${formatFigure(view.headline.value, view.primary.unit, view.headline.currency)}`
      : null;

  return (
    <HomeTileFrame
      badge={badge}
      onOpenChange={setModuleOpen}
      open={moduleOpen}
      expanded={
        <GoalModule
          accounts={ctx.adAccounts}
          load={load}
          profiles={profiles}
          suggested={ctx.reading.goal.suggested}
          monthWindow={monthWindow}
        />
      }
      expandedDescription="The goals the Home measures, month to date, for the brand or one ad account."
      state={state}
      tile={tile}
    >
      <div className="min-w-0">
        {state === 'loading' ? (
          <Skeleton className="h-24 w-full bg-muted/70" />
        ) : view.state === 'ready' ? (
          <ReadyBody
            onSetGoal={openModule}
            size={tile.size}
            view={view}
            windowLabel={monthWindow ? goalWindowLabel(monthWindow) : ''}
          />
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
            Couldn’t read this month’s results — the ad platform didn’t answer.{' '}
            <Button
              className="h-5 px-1 text-xs"
              onClick={() => setAttempt((count) => count + 1)}
              size="sm"
              type="button"
              variant="link"
            >
              Retry
            </Button>
          </p>
        )}
      </div>
    </HomeTileFrame>
  );
}
