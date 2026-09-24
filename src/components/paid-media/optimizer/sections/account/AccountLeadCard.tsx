'use client';

// The account's lead card: one surface, the full width of the Overview, above everything else.
//
// WHAT IT IS FOR. The three-column strip below is a ranked list, and a ranked list answers
// "what else". It does not answer the question someone opens this screen with — "what is the
// one thing worth my attention across this whole account, and can I believe it". Four facts
// make that answerable and no fewer: what fired, what it is worth per day, WHAT THAT FIGURE
// BUYS (a hundred dollars of a lead is not a hundred dollars of revenue), and how sure the
// reading is. The fifth is the only one that matters afterwards: the action it implies.
//
// THE REGISTER IS THE SETTLED ONE. `account-card-html.ts` is the same card compiled for a
// shareable frame, and its three corrections are copied here rather than relitigated:
//
//   * every band is DECLARED, never the remainder of `space-between` — a long sentence may
//     not collapse the thing beside it;
//   * `impact_basis` is prose written for a hover. The card takes the detector's `compares`
//     through `clipLine`, under the same LINE_BUDGET, and leaves the basis to the strip below
//     where there is room to read it;
//   * ONE element moves, briefly, once every five seconds, and then rests. Nothing sweeps and
//     nothing shines. Under `prefers-reduced-motion` nothing moves at all.
//
// It reads the CATALOGUE, not three familiar detectors: the label and the comparison come
// from `ACCOUNT_DETECTOR_META`, the money class from the candidate, the rung from the
// objective ladder, the action from the family map. Any of the twenty-five leads correctly.
//
// AND ON THE DAY NOTHING FIRED — the common case on a healthy account — the card answers the
// question a person actually has next: so how are we doing. The account's own delivery holds
// the figure, and the right band reads it four ways: against the plan, against the week
// before, the day that strayed furthest, and what the money is split across. Nothing on the
// card counts our own checks. It used to — "22 of 25 checks asked", "3 could not run" — and
// that is the product reporting on itself where the account's state belongs. See `QuietFace`.

import type {
  AccountCandidate,
  ArguingChart,
  OptimizationObjective,
  ResultRung,
} from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  ACTION_FAMILY_COPY,
  accountGuards,
  clipLine,
  DETECTOR_ACTION_FAMILY,
  IMPACT_CLASS_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  rankAccountCandidates,
  resultRungFor,
} from '@continuum/contracts';
import { AlertTriangleIcon } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type FigureWindow, figureProps, formatCurrency, formatPercent } from '../../format';
import { AccountChartView } from './AccountChartView';
import { CalmRule, HeadlineComparison, HeadlineFigure, MoneyLine } from './candidateHeadline';
import { doubtedBy, scopeOf } from './guardScope';

const enterVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const TIER_VARIANT = { high: 'destructive', medium: 'warning', low: 'muted' } as const;

/**
 * The rung, in one clause instead of one paragraph.
 *
 * `RESULT_RUNG_READING` is the full sentence and the account read prints it once, under the
 * header. Repeating it here would be the same paragraph twice on one screen; the card needs
 * only the half that changes how the figure above it is read.
 */
const RUNG_BUYS: Record<ResultRung, string> = {
  money: 'What this account buys carries revenue.',
  person: 'What this account buys is a person, not revenue.',
  intent: 'What this account buys is intent, not revenue.',
  attention: 'What this account buys is attention, not revenue.',
};

/** What a stored state means for the one action this card implies. Null is not 'recommend'. */
const STATE_COPY: Record<string, string> = {
  autopilot: 'It acts on its own, inside your guardrails.',
  recommend: 'It will recommend; the move waits on you.',
  off: 'Switched off — it will not act on this.',
};

function sureness(confidence: number): { word: string; pct: number } {
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  if (pct >= 75) return { word: 'Strong', pct };
  if (pct >= 50) return { word: 'Fair', pct };
  return { word: 'Thin', pct };
}

/**
 * Why the confidence reads the way it does, without inventing a provenance.
 *
 * `seedConfidence` multiplies the detector's own read of its sample by how well this
 * objective's signal was measured to predict. The card names those two and nothing else — an
 * explanation that guesses at a third term is worse than the number alone.
 */
function surenessBasis(candidate: AccountCandidate): string {
  const figures = Object.keys(candidate.evidence).length;
  return clipLine(
    figures > 0
      ? `${figures} figures compared · how well this objective predicts`
      : 'this check’s own sample · how well this objective predicts',
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-3xs uppercase tracking-[0.16em] text-muted-foreground">{children}</p>;
}

/**
 * One labelled row of the right band.
 *
 * A fixed label column is what makes three unrelated facts read as one block rather than three
 * paragraphs — the complaint the compiled frame already answered with declared bands.
 */
function Row({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: React.ReactNode;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-3"
      data-testid={testId}
    >
      <p className="text-3xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground text-xs">{value}</p>
        {children}
      </div>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs text-muted-foreground">{children}</p>;
}

function Warn({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="text-3xs text-amber-600 dark:text-amber-400" data-testid={testId}>
      {children}
    </p>
  );
}

export type AccountLeadCardProps = {
  /** Every candidate of today's read, guards included — the card sorts them itself. */
  candidates: AccountCandidate[];
  currency: string | null;
  /** The account's daily spend, the scale the impact tier is read against. */
  dailySpend: number | null;
  /**
   * What the account actually delivered, one point per day, oldest first.
   *
   * The screen's own spend series, handed down rather than fetched again: a quiet card that
   * asked for its own data would be a second read of the same rows, free to disagree with
   * the stream drawn below it. Absent — an account with no snapshot history — is a real
   * case, and the card falls back to the scale the read measured itself at.
   */
  delivery?: DeliveryPoint[] | null;
  /** The daily budgets these portfolios plan — the line the delivery is read against. */
  plannedPerDay?: number | null;
  /**
   * What the account's money is split across, largest first.
   *
   * The same split the spend-by-objective legend draws, handed down so the card and the
   * legend cannot name a different leader. Spent when there is history, planned when there
   * is not, and the card says which.
   */
  mix?: AccountMix | null;
  objective?: OptimizationObjective | null;
  objectiveAnalog?: OptimizationObjective | null;
  source?: 'brief' | 'fallback';
  onOpenPortfolio?: (portfolioId: string) => void;
  /** Lets the Overview seat the card inside a larger surface without a second border. */
  className?: string;
};

export function AccountLeadCard({
  candidates,
  currency,
  dailySpend,
  delivery = null,
  plannedPerDay = null,
  mix = null,
  objective = null,
  objectiveAnalog = null,
  source = 'fallback',
  onOpenPortfolio,
  className,
}: AccountLeadCardProps) {
  const reduce = useReducedMotion();
  const play = !reduce;
  const guards = accountGuards(candidates);
  const ranked = rankAccountCandidates(candidates);
  const lead = ranked[0] ?? null;
  const mode: 'lead' | 'guard' | 'quiet' = lead ? 'lead' : guards.length > 0 ? 'guard' : 'quiet';
  // Read ONCE and handed to both bands: the face's figure and the pacing share are the same
  // fact, and two readings of one series are two figures free to drift apart.
  const delivered = mode === 'quiet' ? readDelivery(delivery) : null;
  const spendPerDay = delivered ? delivered.perDay : dailySpend;
  const provenance = source === 'brief' ? 'Jaina, from today’s run' : 'Draft read from today’s run';

  return (
    <motion.section
      animate={reduce ? undefined : 'shown'}
      className={cn('overflow-hidden rounded-lg border border-border/60 bg-card', className)}
      data-mode={mode}
      data-testid="account-lead-card"
      initial={reduce ? undefined : 'hidden'}
      variants={enterVariants}
    >
      {mode === 'lead' && guards.length > 0 && lead ? (
        <GuardStrip guards={guards} lead={lead} />
      ) : null}

      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {mode === 'lead' && lead ? (
          <>
            <LeadFace candidate={lead} currency={currency} dailySpend={dailySpend} play={play} />
            <div className="divide-y divide-border/60">
              <Row
                label="Buys"
                testId="account-lead-buys"
                value={IMPACT_CLASS_COPY[lead.impact_class]}
              >
                {objective ? (
                  <Sub>{RUNG_BUYS[resultRungFor(objective, objectiveAnalog)]}</Sub>
                ) : null}
              </Row>
              <SurenessRow candidate={lead} doubted={doubtedBy(guards).has(lead.detector)} />
              <ActionRow candidate={lead} onOpenPortfolio={onOpenPortfolio} />
            </div>
          </>
        ) : null}

        {mode === 'guard' && guards[0] ? (
          <>
            <GuardFace guard={guards[0]} play={play} />
            <div className="divide-y divide-border/60">
              <AffectsRow guard={guards[0]} />
              <Row label="Do" testId="account-lead-do" value={ACTION_FAMILY_COPY.measurement.label}>
                <Sub>{ACTION_FAMILY_COPY.measurement.body}</Sub>
              </Row>
            </div>
          </>
        ) : null}

        {mode === 'quiet' ? (
          <>
            <QuietFace
              currency={currency}
              dailySpend={dailySpend}
              delivered={delivered}
              plannedPerDay={plannedPerDay}
              play={play}
            />
            <div className="divide-y divide-border/60">
              <PacingRow currency={currency} perDay={spendPerDay} plannedPerDay={plannedPerDay} />
              <TrendRow currency={currency} delivered={delivered} />
              <PeakDayRow currency={currency} delivered={delivered} />
              <MixRow mix={mix} />
            </div>
          </>
        ) : null}
      </div>

      <p
        className="border-border/60 border-t px-4 py-2 text-3xs uppercase tracking-[0.13em] text-muted-foreground"
        data-testid="account-lead-foot"
      >
        {mode === 'lead' && lead ? `Trigger · ${lead.detector}` : null}
        {mode === 'guard' && guards[0] ? `Guard · ${guards[0].detector}` : null}
        {mode === 'quiet' ? 'Across the account' : null}
        {` · ${provenance}`}
      </p>
    </motion.section>
  );
}

/** The guard, as a strip over a lead that still stands. A guard qualifies a figure; it does
 *  not replace it, and saying which of the two is happening is the whole point of the strip. */
function GuardStrip({ guards, lead }: { guards: AccountCandidate[]; lead: AccountCandidate }) {
  const hit = doubtedBy(guards).has(lead.detector);
  return (
    <div
      className="flex items-start gap-2 border-border/60 border-b bg-amber-500/10 px-4 py-2"
      data-lead-guard={guards.map((guard) => guard.detector).join(' ')}
      data-testid="account-lead-guard"
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 text-2xs text-foreground">
        <span className="font-semibold">
          {guards.map((guard) => ACCOUNT_DETECTOR_META[guard.detector].label).join(' · ')}
        </span>{' '}
        {hit
          ? '— the figure beside this reads against it. Settle the guard first.'
          : '— it does not bear on the figure beside this.'}
      </p>
    </div>
  );
}

function Face({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[9rem] min-w-0 flex-col gap-2 border-border/60 border-b p-4 md:border-r md:border-b-0 md:p-5">
      {children}
    </div>
  );
}

function LeadFace({
  candidate,
  currency,
  dailySpend,
  play,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  play: boolean;
}) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  const tier = impactTier(candidate.impact_per_day, dailySpend);
  return (
    <Face>
      <div className="flex flex-wrap items-center gap-2">
        <Kicker>Across the account</Kicker>
        <Badge className="text-3xs" variant={TIER_VARIANT[tier]}>
          {IMPACT_TIER_COPY[tier]}
        </Badge>
      </div>
      <h2 className="font-semibold text-base text-foreground">{meta.label}</h2>
      {/* The detector's OWN figure leads; the money it is worth follows as the one line every
       *  card on this screen shares. A card whose headline is money says it once, large, and
       *  its support line carries the month rather than the same day twice. */}
      <HeadlineFigure
        candidate={candidate}
        currency={currency}
        figureKey="account-lead"
        size="card"
        testId="account-lead-figure"
      />
      <HeadlineComparison
        candidate={candidate}
        currency={currency}
        figureKey="account-lead"
        testId="account-lead-sides"
      />
      <MoneyLine
        candidate={candidate}
        currency={currency}
        figureKey="account-lead"
        testId="account-lead-money"
      />
      <CalmRule play={play} testId="account-lead-rule" />
      <p className="text-2xs text-muted-foreground">{clipLine(meta.compares)}</p>
      {candidate.capped_by ? (
        <p className="text-3xs text-muted-foreground" data-testid="account-lead-cap">
          {candidate.capped_by === 'velocity'
            ? 'Capped by this objective’s per-cycle limit, not by the gap.'
            : 'Capped by your guardrail, not by the gap.'}
        </p>
      ) : null}
    </Face>
  );
}

function GuardFace({ guard, play }: { guard: AccountCandidate; play: boolean }) {
  const meta = ACCOUNT_DETECTOR_META[guard.detector];
  return (
    <Face>
      <Kicker>Before anything else</Kicker>
      <h2 className="font-semibold text-base text-foreground">{meta.label}</h2>
      <CalmRule play={play} testId="account-lead-rule" />
      <p className="text-2xs text-muted-foreground">{clipLine(guard.impact_basis)}</p>
      <p className="text-3xs text-muted-foreground">
        Nothing else cleared today, and a list ordered by money would point precisely at the wrong
        number until this is settled.
      </p>
    </Face>
  );
}

/** One day of what the account actually delivered. Oldest first. */
export type DeliveryPoint = { date: string; spend: number };

/** Half of a fortnight: the window a person compares to "the week before" without counting. */
const DELIVERY_WINDOW_DAYS = 7;

/** The window a delivery reading covers, in the figure-provenance vocabulary. */
function deliveryWindow(reading: DeliveryReading | null): FigureWindow {
  if (!reading) return 'none';
  return reading.days === 3
    ? 'd3'
    : reading.days === 7
      ? 'd7'
      : reading.days === 14
        ? 'd14'
        : 'none';
}

export type DeliveryReading = {
  /** Spend per day across the recent window. */
  perDay: number;
  /** The same figure over the window before it, when the series carries two of them. */
  priorPerDay: number | null;
  /** Which way it moved, in whole percent. Null when there is nothing to move from. */
  deltaPct: number | null;
  /** How many days each half covers, so the card can name the window it is quoting. */
  days: number;
  points: DeliveryPoint[];
};

/**
 * What the account actually delivered, and which way it is going.
 *
 * Two halves of the same series rather than a fitted trend: a reader checks "this week
 * against last week" in their head, and a slope they cannot reproduce is a figure they
 * cannot argue with. A series that spent nothing at all returns null — zero-filled days are
 * how a window with no rows in it looks, and "$0 a day" said as a measurement would be
 * claiming we measured.
 */
export function readDelivery(points: DeliveryPoint[] | undefined | null): DeliveryReading | null {
  const clean = (points ?? []).filter((point) => Number.isFinite(point.spend));
  if (clean.length === 0) return null;
  if (clean.reduce((sum, point) => sum + point.spend, 0) <= 0) return null;

  const days = Math.min(DELIVERY_WINDOW_DAYS, Math.ceil(clean.length / 2));
  const mean = (rows: DeliveryPoint[]) =>
    rows.reduce((sum, point) => sum + point.spend, 0) / rows.length;
  const perDay = mean(clean.slice(-days));
  const priorPerDay = clean.length >= days * 2 ? mean(clean.slice(-days * 2, -days)) : null;
  return {
    perDay,
    priorPerDay,
    deltaPct:
      priorPerDay != null && priorPerDay > 0
        ? Math.round(((perDay - priorPerDay) / priorPerDay) * 100)
        : null,
    days,
    points: clean,
  };
}

/**
 * The delivery, drawn against the plan.
 *
 * `rates` is one of the two shapes the catalogue calls ARGUING — the return type says so, so
 * a later edit cannot quietly turn this into a picture of the sentence beside it. What it
 * adds to the three figures is the only thing they cannot carry: whether the account has
 * been steady, ramping or has fallen off a cliff inside the window. A constant `b` renders
 * as the labelled rule the series is read against rather than as a second series, which is
 * exactly what a daily plan is; with no plan to draw, the series stands alone.
 */
export function deliveryChart(
  reading: DeliveryReading | null,
  plannedPerDay: number | null,
): ArguingChart | null {
  if (!reading || reading.points.length < 2) return null;
  const plan = plannedPerDay != null && plannedPerDay > 0 ? plannedPerDay : null;
  return {
    shape: 'rates',
    unit: 'currency',
    points: reading.points.map((point) => ({ t: point.date, a: point.spend, b: plan })),
    a_label: 'Spent a day',
    b_label: 'Planned',
    projected_from: null,
    gap_per_day: null,
  };
}

/**
 * A quiet day is a reading, not an empty screen.
 *
 * It used to print the DECK here — a large "18 checks asked, of 20 that apply here" — so on
 * the day there was nothing to report, which is most days on a healthy account, the largest
 * number on the optimizer's front page was how many times the product had checked itself.
 * That is process trivia standing where the account's state belongs, and the band beside the
 * face carried two more rows of it until it was taken out for the same reason.
 *
 * Someone told there is nothing to move asks one thing next: so how are we doing. The figure
 * answers it with the account's own delivery — what it is spending a day — and the rows
 * beside it read that figure against the plan, against the week before, and across what it
 * buys, because that is what this screen can actually prove. Cost per result would be the
 * better answer and the stored read does not carry it; inventing one from a second source
 * would put two numbers that disagree on one card.
 *
 * The figure and the picture come from ONE series, so they cannot contradict each other. A
 * read written before the series existed falls back to the scale the read measured itself
 * at, and says which of the two it is quoting.
 */
function QuietFace({
  currency,
  dailySpend,
  delivered,
  plannedPerDay,
  play,
}: {
  currency: string | null;
  dailySpend: number | null;
  delivered: DeliveryReading | null;
  plannedPerDay: number | null;
  play: boolean;
}) {
  const chart = deliveryChart(delivered, plannedPerDay);
  const perDay = delivered ? delivered.perDay : dailySpend;
  return (
    <Face>
      <Kicker>Across the account</Kicker>
      <h2 className="font-semibold text-base text-foreground">Nothing worth moving today</h2>
      {perDay != null ? (
        <p
          className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground"
          data-reading={delivered ? 'window' : 'scale'}
          data-testid="account-lead-figure"
        >
          <span
            className="font-mono font-semibold text-3xl tabular-nums text-foreground"
            {...figureProps('account-lead.figure', perDay, currency, deliveryWindow(delivered))}
          >
            {formatCurrency(perDay, currency)}
          </span>
          <span className="text-foreground">
            {delivered ? `a day, last ${delivered.days} days` : 'a day across this account'}
          </span>
        </p>
      ) : null}
      <CalmRule play={play} testId="account-lead-rule" />
      {chart ? (
        <div data-testid="account-lead-delivery">
          <AccountChartView chart={chart} currency={currency} />
        </div>
      ) : null}
    </Face>
  );
}

/**
 * What the account is delivering against what it is planned to.
 *
 * The one comparison a quiet day is actually deciding something about: an account at a fifth
 * of its plan has news, and it is not news any of the twenty-five detectors raise. Printed as
 * the share and the plan itself, with no verdict attached — whether under-delivery is good
 * or bad is the reader's call, and a tone here would be this card making it for them.
 */
function PacingRow({
  currency,
  perDay,
  plannedPerDay,
}: {
  currency: string | null;
  perDay: number | null;
  plannedPerDay: number | null;
}) {
  if (perDay == null || plannedPerDay == null || plannedPerDay <= 0) return null;
  const share = Math.round((perDay / plannedPerDay) * 100);
  return (
    <Row
      label="Pacing"
      testId="account-lead-pacing"
      value={
        <>
          <span {...figureProps('account-lead.pacing', share, null, 'none', 'percent')}>
            {formatPercent(share)}
          </span>{' '}
          of plan
        </>
      }
    >
      <Sub>
        <span {...figureProps('account-lead.planned', plannedPerDay, currency)}>
          {formatCurrency(plannedPerDay, currency)}
        </span>{' '}
        a day planned.
      </Sub>
    </Row>
  );
}

function SurenessRow({ candidate, doubted }: { candidate: AccountCandidate; doubted: boolean }) {
  const { word, pct } = sureness(candidate.confidence);
  return (
    <Row
      label="How sure"
      testId="account-lead-sure"
      value={
        <>
          {word} ·{' '}
          <span {...figureProps('account-lead.sure', pct, null, 'none', 'percent')}>
            {formatPercent(pct)}
          </span>
        </>
      }
    >
      <div
        aria-hidden="true"
        className="h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
      </div>
      <Sub>{surenessBasis(candidate)}</Sub>
      {doubted ? (
        <Warn testId="account-lead-doubted">
          The guard above casts doubt on the figures this reads.
        </Warn>
      ) : null}
    </Row>
  );
}

/** The one action the figure implies, and whether it will actually happen. */
function ActionRow({
  candidate,
  onOpenPortfolio,
}: {
  candidate: AccountCandidate;
  onOpenPortfolio?: (portfolioId: string) => void;
}) {
  const family = DETECTOR_ACTION_FAMILY[candidate.detector];
  const target = candidate.cta.kind === 'portfolio' ? candidate.cta.target_id : null;
  return (
    <Row label="Do" testId="account-lead-do" value={ACTION_FAMILY_COPY[family].label}>
      {candidate.state ? <Sub>{STATE_COPY[candidate.state]}</Sub> : null}
      {candidate.state_lowered ? (
        <Warn testId="account-lead-lowered">
          Set to act on its own, but “{ACTION_FAMILY_COPY[family].label}” does not allow it yet.
        </Warn>
      ) : null}
      {target && onOpenPortfolio ? (
        <Button
          className="mt-1"
          data-testid="account-lead-cta"
          onClick={() => onOpenPortfolio(target)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Open the portfolio
        </Button>
      ) : null}
    </Row>
  );
}

function AffectsRow({ guard }: { guard: AccountCandidate }) {
  const scope = scopeOf(guard);
  return (
    <Row
      label="Affects"
      testId="account-lead-affects"
      value={
        scope.length > 0 ? `${scope.length} checks read against it` : 'It stands on its own reading'
      }
    >
      {scope.length > 0 ? (
        <Sub>{scope.map((detector) => ACCOUNT_DETECTOR_META[detector].label).join(' · ')}</Sub>
      ) : null}
    </Row>
  );
}

/**
 * Which way the account moved, against the window before it.
 *
 * Whole percent and both figures: a direction without the two numbers it came from is a
 * verdict, and the reader cannot check a verdict. Absent when the series is too short to have
 * a "before" — a direction claimed from one window would be claiming we measured twice.
 */
function TrendRow({
  currency,
  delivered,
}: {
  currency: string | null;
  delivered: DeliveryReading | null;
}) {
  if (!delivered || delivered.priorPerDay == null || delivered.deltaPct == null) return null;
  const window = deliveryWindow(delivered);
  const value =
    delivered.deltaPct === 0 ? (
      `Level with the ${delivered.days} days before`
    ) : (
      <>
        <span
          {...figureProps('account-lead.trend', delivered.deltaPct, null, window, 'percent-signed')}
        >
          {formatPercent(delivered.deltaPct, { signed: true })}
        </span>{' '}
        on the {delivered.days} days before
      </>
    );
  return (
    <Row label="Trend" testId="account-lead-trend" value={value}>
      <Sub>
        <span {...figureProps('account-lead.trend.prior', delivered.priorPerDay, currency, window)}>
          {formatCurrency(delivered.priorPerDay, currency)}
        </span>{' '}
        a day then ·{' '}
        <span {...figureProps('account-lead.trend.now', delivered.perDay, currency, window)}>
          {formatCurrency(delivered.perDay, currency)}
        </span>{' '}
        a day now.
      </Sub>
    </Row>
  );
}

/** The day in the series that sat furthest from its average, and how far. */
export type PeakDay = {
  date: string;
  spend: number;
  /** Against the average of the whole series, in whole percent. Signed. */
  deltaPct: number;
  meanPerDay: number;
  /** How many days the average was taken over, so the row can name it. */
  days: number;
};

/**
 * The day that strayed furthest from the account's own average.
 *
 * Deviation is read against the mean of the WHOLE series, not the recent window: a reader
 * asking "which day was odd" is asking against everything they can see on the chart beside
 * it. A series too short to have an average that means anything — fewer than three days — has
 * no outlier to name, and a series that spent nothing has no average to stray from.
 */
export function peakDay(reading: DeliveryReading | null): PeakDay | null {
  if (!reading || reading.points.length < 3) return null;
  const meanPerDay =
    reading.points.reduce((sum, point) => sum + point.spend, 0) / reading.points.length;
  if (meanPerDay <= 0) return null;
  const peak = reading.points.reduce((best, point) =>
    Math.abs(point.spend - meanPerDay) > Math.abs(best.spend - meanPerDay) ? point : best,
  );
  return {
    date: peak.date,
    spend: peak.spend,
    deltaPct: Math.round(((peak.spend - meanPerDay) / meanPerDay) * 100),
    meanPerDay,
    days: reading.points.length,
  };
}

const DAY_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function PeakDayRow({
  currency,
  delivered,
}: {
  currency: string | null;
  delivered: DeliveryReading | null;
}) {
  const peak = peakDay(delivered);
  if (!peak) return null;
  return (
    <Row
      label="Biggest swing"
      testId="account-lead-peak"
      value={
        <>
          {DAY_FMT.format(new Date(`${peak.date}T00:00:00Z`))} ·{' '}
          <span {...figureProps('account-lead.peak', peak.spend, currency, 'd1')}>
            {formatCurrency(peak.spend, currency)}
          </span>
        </>
      }
    >
      <Sub>
        <span
          {...figureProps('account-lead.peak.delta', peak.deltaPct, null, 'none', 'percent-signed')}
        >
          {formatPercent(peak.deltaPct, { signed: true })}
        </span>{' '}
        against the {peak.days}-day average of{' '}
        <span {...figureProps('account-lead.peak.mean', peak.meanPerDay, currency)}>
          {formatCurrency(peak.meanPerDay, currency)}
        </span>{' '}
        a day.
      </Sub>
    </Row>
  );
}

/** One objective's share of the account's money, in whole percent. */
export type MixSlice = { label: string; share: number };

/**
 * What the account's money is split across.
 *
 * `spent` is the split of what actually went out over the window; `planned` is the split of
 * the daily budgets, which is all there is before the first snapshot lands. The card names
 * which, because 60% of a plan and 60% of a fortnight's spend are different claims.
 */
export type AccountMix = { slices: MixSlice[] } & (
  | { basis: 'spent'; days: number }
  | { basis: 'planned' }
);

function MixRow({ mix }: { mix: AccountMix | null }) {
  const top = mix?.slices[0];
  if (!mix || !top) return null;
  const rest = mix.slices.slice(1);
  const basis = mix.basis === 'spent' ? `of spend, last ${mix.days} days` : 'of the daily plan';
  return (
    <Row
      label="Mix"
      testId="account-lead-mix"
      value={
        <>
          {top.label} ·{' '}
          <span {...figureProps('account-lead.mix', top.share, null, 'none', 'percent')}>
            {formatPercent(top.share)}
          </span>
        </>
      }
    >
      <Sub>
        {rest.map((slice, index) => (
          <span key={slice.label}>
            {slice.label}{' '}
            <span
              {...figureProps(
                `account-lead.mix.${index + 1}`,
                slice.share,
                null,
                'none',
                'percent',
              )}
            >
              {formatPercent(slice.share)}
            </span>
            {' · '}
          </span>
        ))}
        {basis}
      </Sub>
    </Row>
  );
}
