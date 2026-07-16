import type { ViralityComponent, ViralityScore } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { VIRALITY_GRADE_STYLES } from './ViralityScoreBadge';

// The full virality breakdown — the thing Opus hides. Overall 0-100 + grade band,
// a component-by-component read (raw 1-5 shown as a 5-step bar), and the
// "grounded on this brand's winning hooks" provenance line. Purely presentational.

const COMPONENT_LABELS: Record<ViralityComponent, string> = {
  hook_strength: 'Hook strength',
  curiosity_gap: 'Curiosity gap',
  specificity: 'Specificity',
  emotional_trigger: 'Emotional trigger',
  clarity: 'Clarity',
  trend_fit: 'Trend fit',
  brand_archetype_match: 'Brand-archetype match',
};

const GRADE_ZONES = [
  { key: 'weak', widthPct: 35, className: 'bg-muted-foreground/40' },
  { key: 'okay', widthPct: 25, className: 'bg-amber-500/60' },
  { key: 'strong', widthPct: 25, className: 'bg-orange-500/70' },
  { key: 'viral', widthPct: 15, className: 'bg-rose-500/80' },
] as const;

function ComponentBar({ raw }: { raw: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={cn(
            'h-1.5 w-3 rounded-full',
            step <= Math.round(raw) ? 'bg-foreground/70' : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}

export function ViralityScoreCard({
  score,
  className,
}: {
  score: ViralityScore;
  className?: string;
}) {
  if (score.status !== 'scored' || score.overall === null || score.grade === null) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        Virality score pending — the model couldn’t grade this hook. Try again.
      </div>
    );
  }

  const { overall, grade, components, grounding, confidence } = score;
  const grounded = grounding?.source === 'brand_grounded';

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Virality score
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            VIRALITY_GRADE_STYLES[grade],
          )}
        >
          {grade}
        </span>
      </div>

      <div className="mt-1 flex items-end gap-1 tabular-nums">
        <span className="text-3xl font-semibold leading-none text-foreground">{overall}</span>
        <span className="pb-0.5 text-sm text-muted-foreground">/100</span>
      </div>

      <div className="relative mt-3 h-2 overflow-hidden rounded-full" aria-hidden>
        <div className="flex h-full">
          {GRADE_ZONES.map((zone) => (
            <span
              key={zone.key}
              className={zone.className}
              style={{ width: `${zone.widthPct}%` }}
            />
          ))}
        </div>
        <span
          className="absolute top-[-3px] h-[14px] w-0.5 -translate-x-1/2 bg-foreground"
          style={{ left: `${overall}%` }}
        />
      </div>

      <dl className="mt-4 space-y-2.5">
        {components.map((component) => (
          <div key={component.component} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <dt className="truncate text-sm text-foreground" title={component.rationale}>
              {COMPONENT_LABELS[component.component]}
            </dt>
            <dd>
              <ComponentBar raw={component.raw} />
            </dd>
          </div>
        ))}
      </dl>

      {grounding?.predictedHookRate != null ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Predicted{' '}
          <span className="font-medium text-foreground">~{grounding.predictedHookRate}</span> hook
          rate for your audience
          {grounding.brandTopHookRate != null
            ? ` — your best posts hit ~${Math.round(grounding.brandTopHookRate)}`
            : ''}
          .
        </p>
      ) : null}

      <p
        className={cn(
          'text-xs text-muted-foreground',
          grounding?.predictedHookRate != null ? 'mt-1' : 'mt-3 border-t border-border pt-3',
        )}
      >
        {grounded
          ? `Grounded on ${grounding?.evidenceCount ?? 0} winning hook ${
              (grounding?.evidenceCount ?? 0) === 1 ? 'family' : 'families'
            } for your brand${
              grounding?.archetype ? ` · reads as “${grounding.archetype.replace(/_/g, ' ')}”` : ''
            }.`
          : 'Scored on the general rubric — no brand history yet, so this isn’t calibrated to your audience.'}
        {confidence !== null ? ` · ${Math.round(confidence * 100)}% confidence` : ''}
      </p>
    </div>
  );
}
