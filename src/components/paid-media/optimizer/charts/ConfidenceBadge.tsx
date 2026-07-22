'use client';

// Confidence as a labeled three-segment meter (Low │ Med │ High) with the active
// band filled in its semantic color and the numeric score beside it — the redesign
// of the old rounded confidence pill (user's §2.a: keep the calculation, kill the
// pill). Reading left→right as increasing trust, the fill length itself carries the
// signal before the label is even read. The band drives which segments light and
// their color; the score (0–1 composite) is shown as a percentage.

import { cn } from '@/lib/utils';
import { confidenceBand } from '../reportModel';
import { confidenceColor } from './vizTokens';

const SEGMENTS = ['Low', 'Medium', 'High'] as const;
const LABEL_TO_INDEX: Record<string, number> = { Low: 0, Medium: 1, High: 2 };

type ConfidenceBadgeProps = {
  band?: string | null;
  score?: number | null;
  className?: string;
};

export function ConfidenceBadge({ band, score, className }: ConfidenceBadgeProps) {
  const meta = confidenceBand(band);
  const activeIndex = LABEL_TO_INDEX[meta.label] ?? 1;
  const accent = confidenceColor(band);
  const pct = typeof score === 'number' && Number.isFinite(score) ? Math.round(score * 100) : null;

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="img"
      aria-label={`Confidence: ${meta.label}${pct != null ? `, ${pct}%` : ''}`}
    >
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
    </div>
  );
}
