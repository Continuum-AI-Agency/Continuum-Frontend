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
// the figure; coverage is one line, not the headline. See `QuietFace`.

import type {
  AccountCandidate,
  AccountDetector,
  ArguingChart,
  OptimizationObjective,
  ResultRung,
} from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  ACTION_FAMILY_COPY,
  accountGuards,
  BLOCKED_CATEGORY_COPY,
  blockedByCategory,
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
import { formatCurrency, formatPercent } from '../../format';
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
  value: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-3"
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
  /** How much of the catalogue can even ask a question here. Absent on an older read. */
  deck?: { applies: number; total: number } | null;
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
  /** The checks that could not run, so a quiet day can say what would change that. */
  starved?: Array<{ detector: AccountDetector; missing: string }>;
  objective?: OptimizationObjective | null;
  objectiveAnalog?: OptimizationObjective | null;
  source?: 'brief' | 'fallback';
  onOpenPortfolio?: (portfolioId: string) => void;
};

export function AccountLeadCard({
  candidates,
  currency,
  dailySpend,
  deck = null,
  delivery = null,
  plannedPerDay = null,
  starved = [],
  objective = null,
  objectiveAnalog = null,
  source = 'fallback',
  onOpenPortfolio,
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
      className="overflow-hidden rounded-lg border border-border/60 bg-card"
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
              <CheckedRow deck={deck} starved={starved} />
              <BlockedRow starved={starved} />
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
        size="card"
        testId="account-lead-figure"
      />
      <HeadlineComparison candidate={candidate} currency={currency} testId="account-lead-sides" />
      <MoneyLine candidate={candidate} currency={currency} testId="account-lead-money" />
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
 * That is process trivia standing where the account's state belongs.
 *
 * Someone told there is nothing to move asks one thing next: so how are we doing. The figure
 * answers it with the account's own delivery — what it is spending a day, which way that
 * moved, and how it sits against the plan — because that is what this screen can actually
 * prove. Cost per result would be the better answer and the stored read does not carry it;
 * inventing one from a second source would put two numbers that disagree on one card.
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
          <span className="font-mono font-semibold text-3xl tabular-nums text-foreground">
            {formatCurrency(perDay, currency)}
          </span>
          <span className="text-foreground">
            {delivered ? `a day, last ${delivered.days} days` : 'a day across this account'}
          </span>
        </p>
      ) : null}
      {delivered?.priorPerDay != null && delivered.deltaPct != null ? (
        <p className="text-3xs text-muted-foreground tabular-nums" data-testid="account-lead-trend">
          {formatCurrency(delivered.priorPerDay, currency)} the {delivered.days} days before ·{' '}
          {formatPercent(delivered.deltaPct, { signed: true })}
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
    <Row label="Pacing" testId="account-lead-pacing" value={`${formatPercent(share)} of plan`}>
      <Sub>{formatCurrency(plannedPerDay, currency)} a day planned.</Sub>
    </Row>
  );
}

function SurenessRow({ candidate, doubted }: { candidate: AccountCandidate; doubted: boolean }) {
  const { word, pct } = sureness(candidate.confidence);
  return (
    <Row label="How sure" testId="account-lead-sure" value={`${word} · ${formatPercent(pct)}`}>
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
 * Coverage, at the size coverage is worth.
 *
 * "Did we look" is a real question and it is answered once, in one line. It is not the
 * headline: a reader who has just been told there is nothing to move is asking how the
 * account is doing, not how many times it was asked. The count survives only where it is
 * load-bearing — when some checks could not ask at all — and the row below names those.
 */
function CheckedRow({
  deck,
  starved,
}: {
  deck: { applies: number; total: number } | null;
  starved: Array<{ detector: AccountDetector; missing: string }>;
}) {
  const ran = deck ? Math.max(0, deck.applies - starved.length) : null;
  const asked =
    deck && ran !== null && starved.length > 0
      ? `${ran} of ${deck.applies} checks asked, and found nothing`
      : 'Every check that applies here ran and found nothing';
  return <Row label="Checked" testId="account-lead-checked" value={asked} />;
}

/**
 * What would change a quiet day.
 *
 * Grouped by the thing that unblocks it, the same way the folded list below groups it: nine
 * symptoms read as nine defects, four reasons read as four decisions.
 */
function BlockedRow({
  starved,
}: {
  starved: Array<{ detector: AccountDetector; missing: string }>;
}) {
  const groups = blockedByCategory(starved.map((row) => row.detector));
  return (
    <Row
      label="Blocked"
      testId="account-lead-blocked"
      value={starved.length > 0 ? `${starved.length} could not run` : 'Nothing is waiting on us'}
    >
      {groups.length > 0 ? (
        <ul className="space-y-0.5">
          {groups.map((group) => (
            <li className="text-2xs text-muted-foreground" key={group.category}>
              {BLOCKED_CATEGORY_COPY[group.category]}
            </li>
          ))}
        </ul>
      ) : (
        <Sub>Every check the catalogue offers this account was able to ask.</Sub>
      )}
    </Row>
  );
}
