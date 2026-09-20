import { Fragment } from 'react';
import { type Judgement, JUDGEMENT_LABEL, JUDGEMENT_TEXT } from '@/components/paid-media/jaina/reading';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { cn } from '@/lib/utils';

export type MetricStripItem = {
  label: string;
  value: string;
  deltaPct?: number;
  /** True when a FALLING value is the good outcome. Decides the delta's colour, not its arrow. */
  goodWhenDown?: boolean;
  /**
   * What something judged this figure to be. Colours the VALUE — separately from the delta,
   * because a metric can sit at a healthy level while moving the wrong way, and one colour
   * for both loses exactly that.
   */
  judgement?: Judgement;
  tone?: 'default' | 'muted' | 'danger';
  // Overrides the value's text color (e.g. a hook-rate health gradient) while
  // keeping the shared label/value/delta layout.
  valueColor?: string;
};

// A quiet one-line KPI strip — headline metrics rendered as a dense inline row
// (label, value, delta) instead of a stack of stat cards. The app-wide
// replacement for big-number metric grids. Self-removes when empty.
export function MetricStrip({ items, live = false }: { items: MetricStripItem[]; live?: boolean }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {live ? (
        <span className="size-1.5 shrink-0 rounded-full bg-success live-pulse" aria-hidden="true" />
      ) : null}
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-border">
              ·
            </span>
          ) : null}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              {item.label}
            </span>
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                item.judgement
                  ? JUDGEMENT_TEXT[item.judgement]
                  : item.tone === 'muted'
                    ? 'text-muted-foreground'
                    : item.tone === 'danger'
                      ? 'text-destructive'
                      : 'text-foreground',
              )}
              style={item.valueColor ? { color: item.valueColor } : undefined}
              title={item.judgement ? `${item.label}: ${JUDGEMENT_LABEL[item.judgement]}` : undefined}
            >
              {item.value}
            </span>
            {typeof item.deltaPct === 'number' ? (
              <DeltaBadge goodWhenDown={item.goodWhenDown ?? false} value={item.deltaPct} />
            ) : null}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
