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

import type { AccountCandidate, AccountDetector, BlockedCategory } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  accountGuards,
  BLOCKED_CATEGORY_COPY,
  blockedCategorySchema,
  CHART_SHAPE_READING,
  chartShapeFor,
  DETECTOR_BLOCKED_ON,
  IMPACT_CLASS_COPY,
  IMPACT_TIER_COPY,
  impactTier,
  rankAccountCandidates,
} from '@continuum/contracts';
import { AlertTriangleIcon, ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { AccountChartView } from './AccountChartView';

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
  /** One line over the whole list. Absent on a fallback read, and that is fine. */
  sentence?: string | null;
  onOpenPortfolio?: (portfolioId: string) => void;
};

/** Detectors a fired guard casts doubt over. Named, or the guard is decoration. */
function affectedBy(guards: AccountCandidate[]): Set<AccountDetector> {
  const affected = new Set<AccountDetector>();
  if (guards.some((guard) => guard.detector === 'measurement_integrity')) {
    // Everything priced off a conversion count is reading the broken instrument.
    for (const detector of [
      'dead_tail',
      'portfolio_reallocation',
      'account_pacing',
      'scale_readiness',
      'decision_window',
    ] as AccountDetector[]) {
      affected.add(detector);
    }
  }
  if (guards.some((guard) => guard.detector === 'target_economics')) {
    for (const detector of ['scale_readiness', 'portfolio_reallocation'] as AccountDetector[]) {
      affected.add(detector);
    }
  }
  return affected;
}

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

function Money({
  candidate,
  currency,
  large,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  large?: boolean;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground">
      <span
        className={cn(
          'font-mono font-semibold tabular-nums text-foreground',
          large ? 'text-xl' : 'text-base',
        )}
      >
        {formatCurrency(candidate.impact_per_day, currency)}
      </span>
      <span className="text-foreground">/day</span>
      <span>· {candidate.result_label}</span>
    </p>
  );
}

/** One of the three that lead. A column of the strip, never a card of its own. */
function LeadColumn({
  candidate,
  currency,
  dailySpend,
  doubted,
  onOpenPortfolio,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  onOpenPortfolio?: (portfolioId: string) => void;
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
      <Money candidate={candidate} currency={currency} large />
      <p className="text-2xs text-muted-foreground">{candidate.impact_basis}</p>
      <CapNote candidate={candidate} />
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
}: {
  candidate: AccountCandidate;
  currency: string | null;
  dailySpend: number | null;
  doubted: boolean;
  onOpenPortfolio?: (portfolioId: string) => void;
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
        <Money candidate={candidate} currency={currency} />
        <CapNote candidate={candidate} />
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
  onOpenPortfolio,
}: AccountReadProps) {
  const [showRest, setShowRest] = useState(false);
  const guards = accountGuards(candidates);
  const ranked = rankAccountCandidates(candidates);
  const doubted = affectedBy(guards);

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
                {formatCurrency(restWorth, currency)}/day between them
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
  const grouped = new Map<BlockedCategory | 'other', typeof starved>();
  for (const row of starved) {
    const key = DETECTOR_BLOCKED_ON[row.detector] ?? 'other';
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const order: Array<BlockedCategory | 'other'> = [...blockedCategorySchema.options, 'other'];

  return (
    <details className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3">
      <summary className="cursor-pointer text-2xs text-muted-foreground">
        {starved.length} checks could not run today
      </summary>
      <div className="mt-2 space-y-2">
        {order
          .filter((key) => grouped.has(key))
          .map((key) => (
            <div key={key}>
              <p className="font-semibold text-3xs text-foreground">
                {key === 'other' ? 'Something else' : BLOCKED_CATEGORY_COPY[key]}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {(grouped.get(key) ?? []).map((row) => (
                  <li className="text-2xs text-muted-foreground" key={row.detector}>
                    <span className="text-foreground">
                      {ACCOUNT_DETECTOR_META[row.detector].label}
                    </span>{' '}
                    — {row.missing}
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
 * One line saying how much of the catalogue this account's objectives can even ask.
 *
 * Deliberately not a list. Naming the muted detectors would invite reading them as missing,
 * and they are not missing — they do not apply. The count is the whole useful fact, and it is
 * what stops a short read from looking like a broken one.
 */
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
