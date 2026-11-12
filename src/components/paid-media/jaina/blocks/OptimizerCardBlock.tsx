'use client';
import { useLocale, useTranslations } from 'next-intl';
import {
  accountDetectorComparison,
  accountDetectorLabel,
} from '@/lib/paid-media/accountPresentation';

// An optimizer card cited inside a Jaina answer.
//
// The part on the wire carries an id and has no field a figure could travel in, so everything
// numeric on screen here was resolved from a STORED read — never from live data, and never
// from the model. What Jaina chose is which comparison to show; the figures are the
// detector's.
//
// Two sizes, and the rule for each is about how much of the answer rests on the card:
//
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
  CITATION_UNREACHABLE_NOTE,
  chartShapeFor,
  citationIsWellFormed,
  IMPACT_CLASS_COPY,
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
  /** How far the read got. Three absences, three sentences. */
  status?: 'loading' | 'unavailable' | 'ready';
  currency: string | null;
  /** The day the cited read was taken. Shown on every size — a citation without a date lies. */
  readDate: string | null;
  onOpenRead?: (readId: string) => void;
};

function Body({ candidate, currency }: { candidate: AccountCandidate; currency: string | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const meta = ACCOUNT_DETECTOR_META[candidate.detector];
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-semibold text-foreground text-sm">
        {accountDetectorLabel(candidate.detector, uiText)}
      </p>
      <p className="text-muted-foreground text-xs">
        {accountDetectorComparison(candidate.detector, uiText)}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-base text-foreground tabular-nums">
          {formatCurrency(candidate.impact_per_day, currency, uiLocale)}
        </span>
        <span className="text-foreground">{uiText('day_ea30d1c')}</span>
        <span>· {candidate.result_label}</span>
      </p>
      {candidate.capped_by ? (
        <p className="text-xs text-muted-foreground">
          {candidate.capped_by === 'velocity'
            ? uiText('capped_by_this_objective_s_per_cycle_limit_no_2528d9e')
            : uiText('capped_by_a_guardrail_not_by_the_gap_3d66e50')}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{IMPACT_CLASS_COPY[candidate.impact_class]}</p>
      )}
    </div>
  );
}

function Chart({ candidate, currency }: { candidate: AccountCandidate; currency: string | null }) {
  const uiText = useTranslations('scale');
  if (!candidate.chart) {
    return (
      <p className="text-xs text-muted-foreground">{uiText('no_chart_for_this_one_8f1f13c')}</p>
    );
  }
  return (
    <div className="min-w-0 space-y-1">
      <AccountChartView chart={candidate.chart} currency={currency} />
      <p className="text-xs text-muted-foreground">
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
  status = 'ready',
}: {
  candidateId: string;
  servingCitedRead?: boolean;
  status?: 'loading' | 'unavailable' | 'ready';
}) {
  const uiText = useTranslations('scale');
  // While the read is still in flight nothing is known yet, and the one thing that must NOT
  // happen is a sentence about the finding. The detector's name holds the space.
  if (status === 'loading') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="optimizer-pending">
        {uiText.rich('sentence_f2145a2ef891', {
          v0: () => <span className="font-mono">{candidateId.split(':')[0]}</span>,
        })}
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground" data-testid="optimizer-cleared">
      <span className="font-mono">{candidateId.split(':')[0]}</span> —{' '}
      {status === 'unavailable'
        ? CITATION_UNREACHABLE_NOTE
        : servingCitedRead
          ? CITATION_CLEARED_NOTE
          : CITATION_NOT_SERVED_NOTE}
    </p>
  );
}

export function OptimizerCardBlock({
  card,
  resolve,
  servingCitedRead,
  status,
  currency,
  readDate,
  onOpenRead,
}: OptimizerCardBlockProps) {
  const uiText = useTranslations('scale');
  const resolved = card.candidate_ids.map((id) => ({
    id,
    candidate: resolve(id),
  }));

  // A malformed citation — a strip carrying one id, a card carrying two — is a bug upstream,
  // and rendering a half-strip would hide it. Say so instead.
  if (!citationIsWellFormed(card)) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="optimizer-malformed">
        {uiText('a_citation_arrived_that_does_not_match_its_si_5732dad')}
      </p>
    );
  }

  // The provenance line closes the module as plain muted text: no rule above it, no band.
  const foot = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-xs text-muted-foreground">
      <span>
        {readDate
          ? uiText('template_0fe8a6dba380', { v0: readDate })
          : uiText('from_a_stored_read_2b18595')}
      </span>
      {onOpenRead ? (
        <button
          className="underline underline-offset-2"
          onClick={() => onOpenRead(card.read_id)}
          type="button"
        >
          {uiText('open_in_the_account_read_6d542f1')}
        </button>
      ) : null}
    </div>
  );

  if (card.size === 'strip') {
    return (
      <figure className="my-3" data-testid="optimizer-strip">
        {/* Three findings, three borderless modules side by side; the gap separates them. */}
        <div className="grid gap-3 sm:grid-cols-3">
          {resolved.map(({ id, candidate }) => (
            <div className="min-w-0 space-y-2 rounded-xl bg-muted/40 p-4" key={id}>
              {candidate ? (
                <>
                  <Body candidate={candidate} currency={currency} />
                  {/* A fixed band so three different shapes share one baseline. */}
                  <div className="flex min-h-[74px] flex-col justify-end">
                    <Chart candidate={candidate} currency={currency} />
                  </div>
                </>
              ) : (
                <Cleared candidateId={id} servingCitedRead={servingCitedRead} status={status} />
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
    <figure className="my-3" data-testid="optimizer-card">
      {only?.candidate ? (
        <div className="grid items-center gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-[minmax(0,1fr)_190px]">
          <Body candidate={only.candidate} currency={currency} />
          <Chart candidate={only.candidate} currency={currency} />
        </div>
      ) : (
        <div className="rounded-xl bg-muted/40 p-4">
          <Cleared
            candidateId={only?.id ?? ''}
            servingCitedRead={servingCitedRead}
            status={status}
          />
        </div>
      )}
      {foot}
    </figure>
  );
}
