'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DailyReadRow } from './dailyReadModel';
import type { HeroCta } from './heroModel';

const TIER_VARIANT: Record<DailyReadRow['tier'], 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
};

const MODULE_VARIANT: Record<DailyReadRow['module'], 'violet' | 'teal' | 'success' | 'warning'> = {
  budget: 'violet',
  pause: 'warning',
  creative: 'teal',
  audience: 'success',
};

type DailyReadListProps = {
  rows: DailyReadRow[];
  /** 'brief' when Jaina wrote today's read; 'fallback' when composed from the report. */
  source: 'brief' | 'fallback';
  onCta: (cta: HeroCta) => void;
};

/** Jaina's daily read as a list: one row per category, impact in words, a way in. */
export function DailyReadList({ rows, source, onCta }: DailyReadListProps) {
  if (rows.length === 0) return null;
  return (
    <section
      className="mb-3 rounded-lg border border-border/60 bg-card/60"
      data-testid="daily-read"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-border/60 border-b px-3 py-2">
        <h3 className="font-semibold text-foreground text-sm">Today's read, by category</h3>
        <p className="text-3xs text-muted-foreground">
          {source === 'brief' ? 'Jaina, from the latest cycle' : 'Draft read from the latest cycle'}
        </p>
      </header>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li
            className={cn(
              'grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
              row.isHero && 'bg-primary/5',
            )}
            data-row-key={`read:${row.id}`}
            key={row.id}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge className="text-3xs" variant={MODULE_VARIANT[row.module]}>
                  {row.category}
                </Badge>
                <Badge className="text-3xs" variant={TIER_VARIANT[row.tier]}>
                  {row.tierLabel}
                </Badge>
                {row.isHero ? <span className="text-3xs text-primary">On the overview</span> : null}
              </div>
              <p className="truncate font-medium text-foreground text-xs">{row.title}</p>
              {row.reason ? (
                <p className="line-clamp-2 text-2xs text-muted-foreground" title={row.basis}>
                  {row.reason}
                </p>
              ) : (
                <p className="text-2xs text-muted-foreground">{row.basis}</p>
              )}
            </div>
            <Button
              className="h-7 justify-self-start text-2xs sm:justify-self-end"
              onClick={() => onCta(row.cta)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {row.cta.label}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
