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

import type { HomeGoalPeriod } from '@continuum/contracts';
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
  TARGETS_LATER,
} from './goalModel';
import type { GoalTargetStatus } from './goalTargetModel';
import { useGoalProfiles } from './useGoalProfiles';
import { useGoalRead } from './useGoalRead';
import { useGoalTargets } from './useGoalTargets';

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

const PERIOD_WORDS: Record<HomeGoalPeriod, string> = {
  week: 'this week',
  month: 'this month',
  quarter: 'this quarter',
  custom: 'this period',
};

/** What the figure covers, in words: the target's period when one sets the window. */
function figureWords(target: GoalTargetStatus): string | null {
  return target.kind === 'compared' || target.kind === 'mismatch'
    ? PERIOD_WORDS[target.target.period]
    : null;
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
  const hasTarget =
    target.kind === 'compared' || target.kind === 'mismatch' || target.kind === 'not-running';
  const note = goalTargetNote(target);
  return (
    <>
      {note ? (
        <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-target-note">
          {note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        {target.kind === 'none' || target.kind === 'unavailable' ? (
          <span className="font-medium text-xs">No target set yet</span>
        ) : null}
        <Button className="ml-auto h-7 text-xs" onClick={onSetGoal} size="sm" variant="outline">
          {hasTarget ? 'Edit target' : 'Set a goal'}
        </Button>
      </div>
      {target.kind === 'unavailable' && size !== 's' ? (
        <p className="text-2xs text-muted-foreground">{TARGETS_LATER}</p>
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
  const { primary, headline, others, secondaries, target } = view;
  const label = primary.objective.label;
  const compared = target.kind === 'compared' ? target : null;
  const words = figureWords(target);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="truncate text-2xs text-muted-foreground uppercase tracking-wide">
        {label} · {words ?? 'month to date'}
      </p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span
            className="min-w-0 truncate font-semibold text-3xl tabular-nums tracking-tight"
            data-currency={headline.currency ?? ''}
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
              of {goalTargetFigure(compared.target)}
            </span>
          ) : null}
        </div>
        {headline.series.length > 1 ? (
          <Sparkline
            className="shrink-0"
            height={32}
            label={`${label}, per day ${words ?? 'this month'}`}
            values={headline.series}
            width={size === 's' ? 72 : 120}
          />
        ) : null}
      </div>
      {compared ? (
        <>
          <GoalProgressBar label={label} status={compared} />
          <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-pace">
            {goalPaceLine(compared)}
          </p>
        </>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {goalWindowLabel(view.figureWindow)} · {SOURCE_LABELS[view.source]}
      </p>
      {others.length > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="home-tile-goals-currencies">
          {compared
            ? `In ${headline.currency}, the target's currency. Also `
            : `In ${headline.currency ?? 'an unknown currency'}, the currency most of the spending ad accounts use. Also `}
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
              <span className="truncate text-muted-foreground">
                {figure.objective.label}
                {words ? ' · month to date' : ''}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{amountsText(figure)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <TargetFooter onSetGoal={onSetGoal} size={size} target={target} />
    </div>
  );
}

export default function GoalsTile({ ctx, tile }: HomeTileProps) {
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
      ? `${view.primary.objective.label} ${figureWords(view.target) ?? 'this month'}: ${formatFigure(view.headline.value, view.primary.unit, view.headline.currency)}`
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
      expandedDescription="The goals the Home measures and the target for the main one."
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
            Couldn’t read these results — the ad platform didn’t answer.{' '}
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
