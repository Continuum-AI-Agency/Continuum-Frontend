'use client';

// The account read: what the optimizer opens on, before anyone picks a portfolio.
//
// The scroll order IS the argument, and it is not a layout preference:
//
//   1. guards        — only when they fire. A red box that appears every day is a red box
//                      people learn to scroll past, so the zone is absent otherwise. When one
//                      DOES fire, every card it poisons is marked: a guard that cannot say
//                      WHICH figures it invalidates is decoration.
//   2. the sentence  — one line, framing what follows.
//   3. three         — the ones worth doing first, as one strip. Not three cards with three
//                      borders: one surface, hairline dividers, charts on a shared baseline.
//   4. the rest      — behind one control that says what skipping it costs, so skipping is a
//                      decision and not an accident. Three on screen is what a person carries
//                      away; an inventory belongs behind a disclosure.
//   5. could not ask — folded, grouped by what would unblock it. Nine symptoms read as nine
//                      defects; four reasons read as four decisions.
//
// Nothing here is written by a model. Every figure came from a detector, and the RANK used a
// discounted value while the card shows the real money — which is exactly what the class chip
// says out loud.

import type {
  AccountCandidate,
  AccountDetector,
  BlockedCategory,
  InsightState,
  OptimizationObjective,
} from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  ACTION_FAMILY_COPY,
  accountGuards,
  BLOCKED_CATEGORY_COPY,
  blockedByCategory,
  CHART_SHAPE_READING,
  chartShapeFor,
  DETECTOR_ACTION_FAMILY,
  IMPACT_CLASS_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  RESULT_RUNG_READING,
  rankAccountCandidates,
  resultRungFor,
} from '@continuum/contracts';
import { AlertTriangleIcon, ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPerPeriod } from '../../format';
import { AccountChartView } from './AccountChartView';
import { HeadlineComparison, HeadlineFigure, MoneyLine } from './candidateHeadline';
import { doubtedBy } from './guardScope';

/** How many lead the read. Three is what someone carries away from a screen. */
const LEAD_COUNT = 3;

const TIER_VARIANT = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
} as const;

export type AccountReadProps = {
  candidates: AccountCandidate[];
  currency: string | null;
  /** The account's daily spend — the scale the impact tiers are read against. */
  dailySpend: number | null;
  /** Detectors that could not ask, and what they lacked. Shown so silence is never read as health. */
  starved?: Array<{ detector: AccountDetector; missing: string }>;
  /** 'brief' when Jaina wrote today's words, 'fallback' when the read is code-composed. */
  source?: 'brief' | 'fallback';
  /**
   * How much of the catalogue applies to what this account buys.
   *
   * Rendered as ONE line beside the starved list and never inside it. A muted detector is not
   * a gap: `new_vs_returning` on an app-install account has no question to ask, because an
   * install is new by definition. Listing it as a gap would print a permanent non-problem
   * every day until the gap list reads as noise.
   */
  deck?: { applies: number; total: number } | null;
  /** What the worker assumed in order to measure this account. Empty is the normal case. */
  assumptions?: string[];
  /**
   * What this account mostly buys, and — for a custom conversion — the objective it behaves like.
   *
   * Only ever used to say how far the figures below sit from the money. Absent renders no line
   * at all: guessing the rung would be worse than staying quiet about it.
   */
  objective?: OptimizationObjective | null;
  objectiveAnalog?: OptimizationObjective | null;
  /** Promote or demote one insight from its own card. Absent renders no control. */
  onSetState?: (detector: AccountDetector, state: InsightState) => void;
  /** One line over the whole list. Absent on a fallback read, and that is fine. */
  sentence?: string | null;
  onOpenPortfolio?: (portfolioId: string) => void;
};

function ChartWithReading({
  candidate,
  currency,
}: {
  candidate: AccountCandidate;
  currency: string | null;
}) {
  if (!candidate.chart) {
    return <p className="text-2xs text-muted-foreground">No chart for this one yet.</p>;
  }
  return (
    <>
      <AccountChartView chart={candidate.chart} currency={currency} />
      <p className="text-3xs text-muted-foreground">
        {CHART_SHAPE_READING[chartShapeFor(candidate.detector)]}
      </p>
    </>
  );
}

/**
 * What this card will actually do, and whether that is less than someone asked for.
 *
 * `null` means nobody has been asked — a read composed before approvals existed. It renders
 * nothing rather than claiming 'recommend', because "we did not look" and "it recommends" are
 * different facts.
 *
 * The lowered case is the one that earns the pixels: without it, someone sets a detector to
 * autopilot, watches nothing happen, and concludes the switch is broken.
 */
function StateNote({ candidate }: { candidate: AccountCandidate }) {
  if (!candidate.state) return null;
  const family = ACTION_FAMILY_COPY[DETECTOR_ACTION_FAMILY[candidate.detector]].label;
  if (candidate.state_lowered) {
    return (
      <p className="text-3xs text-amber-600 dark:text-amber-400" data-testid="state-lowered">
        Set to act on its own, but “{family}” does not allow it yet — it will recommend instead.
      </p>
    );
  }
  if (candidate.state === 'autopilot') {
    return (
      <p className="text-3xs text-muted-foreground">Acts on its own, inside your guardrails.</p>
    );
  }
  return null;
}

/**
 * Whether adopting a detector from its card actually enforces anything.
 *
 * It does not, today. `onSetState` writes the family-ceiling and insight-approval tables, and
 * the only reader of those tables is the Backend's account-strategy poller, which uses them to
 * LABEL candidates in the next read. No apply path consults them: not `applyBudgets`, not the
 * autopilot sweeper (keyed on `portfolio.autopilot_scopes`), not the swap publisher. Pressing
 * "Always do this" therefore changed a word on a future report and nothing else, under a
 * control that told the person the detector now acts on its own. A disabled button or a
 * "coming soon" label would still leave them believing they had adopted it, so the control is
 * absent instead.
 *
 * Flip this to `true` when an apply path reads the adopted state — concretely, when the
 * autopilot sweeper resolves a detector's insight approval instead of reading
 * `portfolio.autopilot_scopes` alone. Everything below is left in place so that is the only
 * change this file needs.
 */
const ADOPTING_A_DETECTOR_IS_ENFORCED = false;

/**
 * "Always do this" — promoting one insight from the card itself.
 *
 * This is where autopilot gets adopted, once adoption means something. The settings grid is
 * where it gets configured AFTERWARDS; nobody opens a settings screen to decide they trust a
 * recommendation. The moment that happens is three weeks into watching the same card be right,
 * looking at it.
 *
 * Absent for the measurement family, which approves nothing, and absent when nobody has
 * resolved a state — offering a control whose effect we cannot predict is worse than offering
 * none.
 */
function AlwaysDoThis({
  candidate,
  onSetState,
}: {
  candidate: AccountCandidate;
  onSetState?: (detector: AccountDetector, state: InsightState) => void;
}) {
  if (!ADOPTING_A_DETECTOR_IS_ENFORCED) return null;
  if (!onSetState || !candidate.state) return null;
  if (DETECTOR_ACTION_FAMILY[candidate.detector] === 'measurement') return null;
  const on = candidate.state === 'autopilot';
  return (
    <Button
      className="text-3xs"
      data-testid="always-do-this"
      onClick={() => onSetState(candidate.detector, on ? 'recommend' : 'autopilot')}
      size="sm"
      type="button"
      variant="ghost"
    >
      {on ? 'Stop doing this on its own' : 'Always do this'}
    </Button>
  );
}

/** Why the figure is smaller than the gap the chart draws. Silence reads as weakness. */
function CapNote({ candidate }: { candidate: AccountCandidate }) {
  if (!candidate.capped_by) return null;
  return (
    <p className="text-3xs text-muted-foreground">
      {candidate.capped_by === 'velocity'
        ? 'Capped by this objective’s per-cycle limit, not by the gap.'
        : 'Capped by your guardrail, not by the gap.'}
    </p>
  );
}

/**
 * What a row leads with: the detector's own figure, then the money it is worth.
 *
 * The rank is unaffected — `rankAccountCandidates` still orders on `rankedValue`, which is
 * money. Only what the reader sees first changes, and that is the point: the ORDER stays one
 * comparable scale while each row finally says what it actually found.
 */
function Lead({
  candidate,
  currency,
  size,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  size: 'row' | 'column';
}) {
  return (
    <div className="space-y-0.5">
      <HeadlineFigure candidate={candidate} currency={currency} size={size} />
      <HeadlineComparison candidate={candidate} currency={currency} />
      <MoneyLine candidate={candidate} currency={currency} />
    </div>
  );
}

/** One of the three that lead. A column of the strip, never a card of its own. */
function LeadColumn({
  candidate,
  currency,
  dailySpend,
  doubted,
  onOpenPortfolio,
  onSetState,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  onOpenPortfolio?: (portfolioId: string) => void;
  onSetState?: (detector: AccountDetector, state: InsightState) => void;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  return (
    <div
      className="flex min-w-0 flex-col gap-2 border-border/60 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
      data-detector={candidate.detector}
      data-testid="account-lead"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="text-3xs" variant={TIER_VARIANT[tier]}>
          {IMPACT_TIER_COPY[tier]}
        </Badge>
        {/* The class stays on the LEAD cards, not only on the rest. It is what says the
         *  ranking discounted this figure — on the three cards someone actually acts on,
         *  that is the most important thing on the card after the money itself. */}
        <Badge className="text-3xs" variant="muted">
          {IMPACT_CLASS_COPY[candidate.impact_class]}
        </Badge>
        {doubted ? (
          <span className="text-3xs text-amber-600 dark:text-amber-400">affected by the guard</span>
        ) : null}
      </div>
      <h3 className="font-semibold text-foreground text-sm">{meta.label}</h3>
      {/* A fixed band so three different shapes share one baseline and read as one row. */}
      <div className="flex min-h-[86px] flex-col justify-end gap-1">
        <ChartWithReading candidate={candidate} currency={currency} />
      </div>
      <Lead candidate={candidate} currency={currency} size="column" />
      <p className="text-2xs text-muted-foreground">{candidate.impact_basis}</p>
      <CapNote candidate={candidate} />
      <StateNote candidate={candidate} />
      <AlwaysDoThis candidate={candidate} onSetState={onSetState} />
      {target && onOpenPortfolio ? (
        <Button
          className="mt-auto"
          onClick={() => onOpenPortfolio(target)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Open the portfolio
        </Button>
      ) : null}
    </div>
  );
}

/** One of the rest. A row, because the rest is a ranked list and rank is carried by order. */
function RestRow({
  candidate,
  currency,
  dailySpend,
  doubted,
  onOpenPortfolio,
  onSetState,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  onOpenPortfolio?: (portfolioId: string) => void;
  onSetState?: (detector: AccountDetector, state: InsightState) => void;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  return (
    <div
      className="grid items-center gap-4 border-border/60 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_170px]"
      data-detector={candidate.detector}
      data-testid="account-rest-row"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="text-3xs" variant={TIER_VARIANT[tier]}>
            {IMPACT_TIER_COPY[tier]}
          </Badge>
          <Badge className="text-3xs" variant="muted">
            {IMPACT_CLASS_COPY[candidate.impact_class]}
          </Badge>
          {doubted ? (
            <span className="text-3xs text-amber-600 dark:text-amber-400">
              affected by the guard
            </span>
          ) : null}
        </div>
        <h3 className="font-semibold text-foreground text-sm">{meta.label}</h3>
        <p className="text-2xs text-muted-foreground">{candidate.impact_basis}</p>
        <Lead candidate={candidate} currency={currency} size="row" />
        <CapNote candidate={candidate} />
        <StateNote candidate={candidate} />
        <AlwaysDoThis candidate={candidate} onSetState={onSetState} />
        {target && onOpenPortfolio ? (
          <Button
            className="mt-1"
            onClick={() => onOpenPortfolio(target)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Open the portfolio
          </Button>
        ) : null}
      </div>
      <div className="min-w-0 space-y-1">
        <ChartWithReading candidate={candidate} currency={currency} />
      </div>
    </div>
  );
}

export function AccountRead({
  candidates,
  currency,
  dailySpend,
  starved = [],
  source = 'fallback',
  sentence = null,
  deck = null,
  assumptions = [],
  objective = null,
  objectiveAnalog = null,
  onSetState,
  onOpenPortfolio,
}: AccountReadProps) {
  const [showRest, setShowRest] = useState(false);
  const guards = accountGuards(candidates);
  const ranked = rankAccountCandidates(candidates);
  const doubted = doubtedBy(guards);

  const lead = ranked.slice(0, LEAD_COUNT);
  const rest = ranked.slice(LEAD_COUNT);
  const restWorth = rest.reduce((sum, candidate) => sum + candidate.impact_per_day, 0);

  if (guards.length === 0 && ranked.length === 0) {
    return (
      <section
        className="rounded-lg border border-border/60 border-dashed bg-muted/10 p-5"
        data-testid="account-read"
      >
        <h2 className="font-semibold text-foreground text-sm">Nothing to move today</h2>
        <p className="mt-1 text-muted-foreground text-xs">
          Every check ran and none of them found money worth moving across this account.
        </p>
        {starved.length > 0 ? <Starved starved={starved} /> : null}
        <AssumptionNote assumptions={assumptions} />
        <DeckNote deck={deck} />
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="account-read">
      {/* 1 — guards, absent unless one fires */}
      {guards.map((guard) => (
        <div
          className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
          data-guard={guard.detector}
          key={guard.id}
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold text-foreground text-sm">
              {ACCOUNT_DETECTOR_META[guard.detector].label}
            </h3>
            <p className="text-muted-foreground text-xs">{guard.impact_basis}</p>
            <p className="text-3xs text-muted-foreground">
              Read this before the list below: it decides whether the rest of these figures mean
              anything.
            </p>
          </div>
        </div>
      ))}

      {ranked.length > 0 ? (
        <>
          {/* 2 — the sentence */}
          <header className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
            <h2 className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground text-sm">
              <SparklesIcon className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0">
                {sentence ?? 'Across the account, most worth doing first'}
              </span>
            </h2>
            <p className="text-3xs text-muted-foreground">
              {source === 'brief' ? 'Jaina, from today’s run' : 'Draft read from today’s run'}
            </p>
          </header>
          <RungNote analog={objectiveAnalog} objective={objective} />

          {/* 3 — the three, as one surface */}
          <div className="grid overflow-hidden rounded-lg border border-border/60 bg-card sm:grid-cols-3">
            {lead.map((candidate) => (
              <LeadColumn
                candidate={candidate}
                currency={currency}
                dailySpend={dailySpend}
                doubted={doubted.has(candidate.detector)}
                key={candidate.id}
                onOpenPortfolio={onOpenPortfolio}
                onSetState={onSetState}
              />
            ))}
          </div>

          {/* 4 — the rest, behind one control that says what skipping it costs */}
          {rest.length > 0 ? (
            <div>
              <Button
                aria-expanded={showRest}
                className="w-full justify-center gap-1.5 text-2xs"
                onClick={() => setShowRest((open) => !open)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <ChevronDownIcon
                  className={cn('size-3.5 transition-transform', showRest && 'rotate-180')}
                />
                {showRest ? 'Hide the rest' : `${rest.length} more`} ·{' '}
                {formatPerPeriod(restWorth, currency)} between them
              </Button>
              {showRest ? (
                <div className="mt-2 overflow-hidden rounded-lg border border-border/60 bg-card">
                  {rest.map((candidate) => (
                    <RestRow
                      candidate={candidate}
                      currency={currency}
                      dailySpend={dailySpend}
                      doubted={doubted.has(candidate.detector)}
                      key={candidate.id}
                      onOpenPortfolio={onOpenPortfolio}
                      onSetState={onSetState}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* 5 — what could not be asked, grouped by what would unblock it */}
      {starved.length > 0 ? <Starved starved={starved} /> : null}
      <AssumptionNote assumptions={assumptions} />
      <DeckNote deck={deck} />
    </section>
  );
}

/**
 * What could not be asked, grouped by the thing that would unblock it.
 *
 * Nine separate one-line notes read as nine defects. The same nine grouped by their blocker read
 * as four decisions, and several detectors share one — which is the useful shape, because it is
 * the shape of the work.
 */
function Starved({ starved }: { starved: Array<{ detector: AccountDetector; missing: string }> }) {
  const missingFor = new Map(starved.map((row) => [row.detector, row.missing]));
  const groups: Array<{ key: BlockedCategory | 'other'; detectors: AccountDetector[] }> =
    blockedByCategory(starved.map((row) => row.detector)).map((group) => ({
      key: group.category,
      detectors: group.detectors,
    }));
  // A blocked detector that names no category cannot happen — the catalogue test pins both
  // directions — but a read written by an older worker can still name one, and dropping the row
  // silently would turn a gap in coverage into a clean screen.
  const placed = new Set(groups.flatMap((group) => group.detectors));
  const uncategorised = starved
    .map((row) => row.detector)
    .filter((detector) => !placed.has(detector));
  if (uncategorised.length > 0) groups.push({ key: 'other', detectors: uncategorised });

  return (
    <details
      className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3"
      data-testid="account-starved"
    >
      <summary className="cursor-pointer text-2xs text-muted-foreground">
        {starved.length} checks could not run today
      </summary>
      <div className="mt-2 space-y-2">
        {groups.map(({ key, detectors }) => (
          <div key={key}>
            <p className="font-semibold text-3xs text-foreground">
              {key === 'other' ? 'Something else' : BLOCKED_CATEGORY_COPY[key]}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {detectors.map((detector) => (
                <li className="text-2xs text-muted-foreground" key={detector}>
                  <span className="text-foreground">{ACCOUNT_DETECTOR_META[detector].label}</span> —{' '}
                  {missingFor.get(detector)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * How far the figures above sit from the money, in one line.
 *
 * Every card states a money-per-day figure, and "$102/day" means money this account can stop
 * wasting when it buys purchases and money moved toward views when it buys attention. Nothing
 * else on the card separates those two: the figure, the class chip and the result label read
 * identically. The sentence itself lives in the catalogue beside the ladder, so the card and any
 * other surface cannot describe the same rung differently.
 */
function RungNote({
  objective,
  analog,
}: {
  objective: OptimizationObjective | null;
  analog: OptimizationObjective | null;
}) {
  if (!objective) return null;
  return (
    <p className="text-3xs text-muted-foreground" data-testid="account-rung-note">
      {RESULT_RUNG_READING[resultRungFor(objective, analog)]}
    </p>
  );
}

/**
 * One line saying how much of the catalogue this account's objectives can even ask.
 *
 * Deliberately not a list. Naming the muted detectors would invite reading them as missing,
 * and they are not missing — they do not apply. The count is the whole useful fact, and it is
 * what stops a short read from looking like a broken one.
 */
/**
 * What the worker had to assume in order to measure this account at all.
 *
 * A custom conversion has no calibration of its own, so it is read as the closest objective
 * we DID backtest — and every figure on this screen inherits that choice. An assumption the
 * product makes silently is one nobody can correct, which is the whole reason it is printed
 * rather than left in the prompt where only the model sees it.
 */
function AssumptionNote({ assumptions }: { assumptions: string[] }) {
  if (assumptions.length === 0) return null;
  return (
    <div className="text-3xs text-muted-foreground" data-testid="account-assumptions">
      {assumptions.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function DeckNote({ deck }: { deck?: { applies: number; total: number } | null }) {
  if (!deck || deck.total <= 0) return null;
  const full = deck.applies >= deck.total;
  return (
    <p className="text-3xs text-muted-foreground" data-testid="account-deck-note">
      {full
        ? `All ${deck.total} checks apply to what this account buys.`
        : `${deck.applies} of ${deck.total} checks apply to what this account buys — the rest have no question to ask here.`}
    </p>
  );
}
