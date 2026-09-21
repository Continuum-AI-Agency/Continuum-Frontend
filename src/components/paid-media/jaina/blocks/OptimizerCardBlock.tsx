'use client';

// An optimizer card cited inside a Jaina answer.
//
// The part on the wire carries an id and has no field a figure could travel in, so everything
// numeric on screen here was resolved from a STORED read — never from live data, and never
// from the model. What Jaina chose is which comparison to show; the figures are the
// detector's.
//
// Three sizes, and the rule for each is about how much of the answer rests on the card:
//
//   chip   the figure belongs inside a sentence. Inline, monospaced, with the provenance dot.
//   card   the whole answer rests on one comparison. LANDSCAPE, not the square the account
//          grid uses — a square in a chat column wastes half the width and pushes the next
//          sentence off the screen.
//   strip  the answer is "here are the three things". Three, never four.
//
// AND THE CASE THAT MATTERS MOST: a candidate the stored read no longer contains still
// renders, with the note saying it cleared. A citation that silently vanishes takes the
// answer's evidence with it and leaves prose that now looks invented — which is worse than
// the citation being stale, because the reader cannot tell it happened.

import type { AccountCandidate, JainaOptimizerCard } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  CHART_SHAPE_READING,
  CITATION_CLEARED_NOTE,
  CITATION_NOT_SERVED_NOTE,
  chartShapeFor,
  citationIsWellFormed,
  IMPACT_CLASS_COPY,
  isGuardDetector,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { AccountChartView } from '@/components/paid-media/optimizer/sections/account/AccountChartView';
import { cn } from '@/lib/utils';

export type OptimizerCardBlockProps = {
  card: JainaOptimizerCard;
  /** Resolves against the STORED read the citation names. Null when it is no longer there. */
  resolve: (candidateId: string) => AccountCandidate | null;
  /** Whether the read being served is the one cited. Decides WHICH absence is reported. */
  servingCitedRead?: boolean;
  currency: string | null;
  /** The day the cited read was taken. Shown on every size — a citation without a date lies. */
  readDate: string | null;
  onOpenRead?: (readId: string) => void;
};

function Provenance({ detector }: { detector: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        isGuardDetector(detector as never) ? 'bg-destructive' : 'bg-primary',
      )}
      data-detector={detector}
    />
  );
}

/** A figure inside a sentence. Tapping it opens the card it came from. */
function Chip({
  candidate,
  currency,
  onOpenRead,
  readId,
}: {
  candidate: AccountCandidate;
  currency: string | null;
  onOpenRead?: (readId: string) => void;
  readId: string;
}) {
  const label = `${ACCOUNT_DETECTOR_META[candidate.detector].label}, from the cited read`;
  return (
    <button
      aria-label={label}
      className="inline-flex items-baseline gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline font-mono text-foreground text-sm tabular-nums"
      data-testid="optimizer-chip"
      onClick={() => onOpenRead?.(readId)}
      type="button"
    >
      <Provenance detector={candidate.detector} />
      {formatCurrency(candidate.impact_per_day, currency)}
      <span className="text-2xs text-muted-foreground">/day</span>
    </button>
  );
}

function Body({ candidate, currency }: { candidate: AccountCandidate; currency: string | null }) {
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-semibold text-foreground text-sm">{meta.label}</p>
      <p className="text-muted-foreground text-xs">{meta.compares}</p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-2xs text-muted-foreground">
        <span className="font-mono font-semibold text-base text-foreground tabular-nums">
          {formatCurrency(candidate.impact_per_day, currency)}
        </span>
        <span className="text-foreground">/day</span>
        <span>· {candidate.result_label}</span>
      </p>
      {candidate.capped_by ? (
        <p className="text-3xs text-muted-foreground">
          {candidate.capped_by === 'velocity'
            ? 'Capped by this objective’s per-cycle limit, not by the gap.'
            : 'Capped by a guardrail, not by the gap.'}
        </p>
      ) : (
        <p className="text-3xs text-muted-foreground">
          {IMPACT_CLASS_COPY[candidate.impact_class]}
        </p>
      )}
    </div>
  );
}

function Chart({ candidate, currency }: { candidate: AccountCandidate; currency: string | null }) {
  if (!candidate.chart) {
    return <p className="text-2xs text-muted-foreground">No chart for this one.</p>;
  }
  return (
    <div className="min-w-0 space-y-1">
      <AccountChartView chart={candidate.chart} currency={currency} />
      <p className="text-3xs text-muted-foreground">
        {CHART_SHAPE_READING[chartShapeFor(candidate.detector)]}
      </p>
    </div>
  );
}

/**
 * What a reader sees where a citation used to be. Never nothing — and never the wrong reason.
 *
 * "This one cleared" says the finding was FIXED. That is only true when the read being served
 * IS the one cited and the candidate has left it. When the cited read is simply not the one
 * on hand — the commonest case, since only today's is kept and transcripts persist — saying
 * it cleared is a claim about the account, not an absence of data.
 */
function Cleared({
  candidateId,
  servingCitedRead,
}: {
  candidateId: string;
  servingCitedRead?: boolean;
}) {
  return (
    <p className="text-2xs text-muted-foreground" data-testid="optimizer-cleared">
      <span className="font-mono">{candidateId.split(':')[0]}</span> —{' '}
      {servingCitedRead ? CITATION_CLEARED_NOTE : CITATION_NOT_SERVED_NOTE}
    </p>
  );
}

export function OptimizerCardBlock({
  card,
  resolve,
  servingCitedRead,
  currency,
  readDate,
  onOpenRead,
}: OptimizerCardBlockProps) {
  const resolved = card.candidate_ids.map((id) => ({ id, candidate: resolve(id) }));

  // A malformed citation — a strip carrying one id, a card carrying two — is a bug upstream,
  // and rendering a half-strip would hide it. Say so instead.
  if (!citationIsWellFormed(card)) {
    return (
      <p className="text-2xs text-muted-foreground" data-testid="optimizer-malformed">
        A citation arrived that does not match its size.
      </p>
    );
  }

  if (card.size === 'chip') {
    const first = resolved[0];
    if (!first?.candidate) return <Cleared candidateId={first?.id ?? ''} servingCitedRead={servingCitedRead} />;
    return (
      <Chip
        candidate={first.candidate}
        currency={currency}
        onOpenRead={onOpenRead}
        readId={card.read_id}
      />
    );
  }

  const foot = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border/60 border-t bg-muted/30 px-4 py-2 text-3xs text-muted-foreground">
      <span>{readDate ? `read of ${readDate}` : 'from a stored read'}</span>
      {onOpenRead ? (
        <button
          className="underline underline-offset-2"
          onClick={() => onOpenRead(card.read_id)}
          type="button"
        >
          open in the account read
        </button>
      ) : null}
    </div>
  );

  if (card.size === 'strip') {
    return (
      <figure
        className="my-3 overflow-hidden rounded-lg border border-border/60"
        data-testid="optimizer-strip"
      >
        <div className="grid sm:grid-cols-3">
          {resolved.map(({ id, candidate }) => (
            <div
              className="min-w-0 space-y-2 border-border/60 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              key={id}
            >
              {candidate ? (
                <>
                  <Body candidate={candidate} currency={currency} />
                  {/* A fixed band so three different shapes share one baseline. */}
                  <div className="flex min-h-[74px] flex-col justify-end">
                    <Chart candidate={candidate} currency={currency} />
                  </div>
                </>
              ) : (
                <Cleared candidateId={id} servingCitedRead={servingCitedRead} />
              )}
            </div>
          ))}
        </div>
        {foot}
      </figure>
    );
  }

  const only = resolved[0];
  return (
    <figure
      className="my-3 overflow-hidden rounded-lg border border-border/60"
      data-testid="optimizer-card"
    >
      {only?.candidate ? (
        <div className="grid items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_190px]">
          <Body candidate={only.candidate} currency={currency} />
          <Chart candidate={only.candidate} currency={currency} />
        </div>
      ) : (
        <div className="p-4">
          <Cleared candidateId={only?.id ?? ''} servingCitedRead={servingCitedRead} />
        </div>
      )}
      {foot}
    </figure>
  );
}
