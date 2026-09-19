'use client';

// Confidence as a labeled three-segment meter (Low │ Med │ High) with the active
// band filled in its semantic color and the numeric score beside it — the redesign
// of the old rounded confidence pill (user's §2.a: keep the calculation, kill the
// pill). Reading left→right as increasing trust, the fill length itself carries the
// signal before the label is even read. The band drives which segments light and
// their color; the score (0–1 composite) is shown as a percentage.
//
// Pass `confidence` and the meter also answers WHY. Data confidence is built from the
// two terms the account controls — sample and consistency — so the weaker one is the
// answer, and the hover leads with it; the objective's predictiveness is disclosed as a
// note, never as a term. The engine's actionables follow: what would raise the number.
// Without `confidence` there is nothing to explain and the meter renders exactly as
// before — static, role="img", no interactive affordance promising an empty popover.

import type { RunConfidence } from '@continuum/contracts';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { confidenceBand, explainConfidence } from '../reportModel';
import { confidenceColor } from './vizTokens';

const SEGMENTS = ['Low', 'Medium', 'High'] as const;
const LABEL_TO_INDEX: Record<string, number> = { Low: 0, Medium: 1, High: 2 };

type ConfidenceBadgeProps = {
  band?: string | null;
  score?: number | null;
  /** The full cycle_runs.confidence row. When present, the meter becomes a hover explainer. */
  confidence?: RunConfidence | null;
  className?: string;
};

export function ConfidenceBadge({ band, score, confidence, className }: ConfidenceBadgeProps) {
  const meta = confidenceBand(band);
  const activeIndex = LABEL_TO_INDEX[meta.label] ?? 1;
  const accent = confidenceColor(band);
  const pct = typeof score === 'number' && Number.isFinite(score) ? Math.round(score * 100) : null;
  const label = `Confidence: ${meta.label}${pct != null ? `, ${pct}%` : ''}`;

  const meter = (
    <>
      <span className="flex items-center gap-0.5" data-testid="confidence-meter">
        {SEGMENTS.map((segment, index) => (
          <span
            key={segment}
            data-on={index <= activeIndex ? 'true' : 'false'}
            className="h-1.5 w-4 rounded-full"
            style={{ backgroundColor: index <= activeIndex ? accent : 'var(--muted)' }}
          />
        ))}
      </span>
      <span className="text-2xs text-muted-foreground">
        {meta.label}
        {pct != null ? (
          <span className="ml-1 font-medium text-foreground tabular-nums">{pct}%</span>
        ) : null}
      </span>
    </>
  );

  const explanation = explainConfidence(confidence);
  if (!explanation) {
    return (
      <div
        className={cn('inline-flex items-center gap-2', className)}
        role="img"
        aria-label={label}
      >
        {meter}
      </div>
    );
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label={`${label}. Show what is driving it.`}
            className={cn(
              'inline-flex cursor-help items-center gap-2 rounded underline decoration-dotted decoration-muted-foreground/60 underline-offset-4',
              className,
            )}
          >
            {meter}
          </button>
        }
      />
      <HoverCardContent className="w-72 space-y-2 text-2xs">
        {explanation.limiter ? (
          <p className="text-foreground">
            Held back by{' '}
            <span className="font-semibold uppercase tracking-wide">
              {explanation.limiter.label}
            </span>
          </p>
        ) : null}
        <ul className="space-y-1">
          {explanation.terms.map((term) => (
            <li key={term.key} className="flex items-baseline gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">{term.label}</span>
              <span className="w-9 shrink-0 text-right font-medium text-foreground tabular-nums">
                {term.pct}%
              </span>
              <span className="min-w-0 text-muted-foreground">{term.note}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border/60 pt-1.5 text-muted-foreground">
          Data confidence is the balance of the two
          {explanation.scorePct != null ? `, giving ${explanation.scorePct}%` : ''}.
          {explanation.prior
            ? ` Predictability of this objective: ${explanation.prior.pct}% — ${explanation.prior.note}.`
            : ''}
        </p>
        {explanation.actionables.length > 0 ? (
          <ul className="space-y-1 border-t border-border/60 pt-1.5">
            {explanation.actionables.map((action) => (
              <li className="text-foreground" key={action.code}>
                <span className="font-medium">To raise it:</span> {action.message}
              </li>
            ))}
          </ul>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
