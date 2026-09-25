'use client';

import type { AdhocSuggestionFigure } from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { CalmRule } from '../account/candidateHeadline';
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
  onCta: (cta: HeroCta, row: DailyReadRow) => void;
  currency?: string | null;
  /** Rows a person asked for can be put away again. Absent ⇒ no dismiss affordance. */
  onDismiss?: (row: DailyReadRow) => void;
  /** The row whose control is mid-write, so it reads as busy instead of unresponsive. */
  busyRowId?: string | null;
  /** True while the row is still with the worker: the CTA is inert and the row breathes. */
  isWaiting?: (row: DailyReadRow) => boolean;
  /** Why the last build on a row did not happen, printed on that row. A refusal nobody can
   *  see is the dead end this list exists to close, wearing a different hat. */
  failure?: { rowId: string; message: string } | null;
};

function formatFigure(figure: AdhocSuggestionFigure, currency: string | null): string {
  switch (figure.unit) {
    case 'currency':
      return formatCurrency(figure.value, currency);
    case 'percent':
      return `${(figure.value * 100).toFixed(2)}%`;
    case 'multiple':
      return `${figure.value.toFixed(2)}×`;
    case 'days':
      return `${Math.round(figure.value)}d`;
    default:
      return Number.isInteger(figure.value) ? String(figure.value) : figure.value.toFixed(1);
  }
}

/** Jaina's daily read as a list: one row per category, impact in words, a way in — and, in
 *  the same list, the suggestions a person asked for. One inbox, one CTA handler; an asked
 *  row whose plan names a queue row focuses that row exactly as a brief row does.
 *
 *  A row whose control BUILDS something says what that will be and that nothing goes live,
 *  beside the button rather than after the press, and carries the shared `CalmRule` on its
 *  ~5s rhythm while the build is in flight — the one thing on this surface allowed to move.
 *  Every other state is still. */
export function DailyReadList({
  rows,
  source,
  onCta,
  currency = null,
  onDismiss,
  busyRowId = null,
  isWaiting,
  failure = null,
}: DailyReadListProps) {
  if (rows.length === 0) return null;
  const asked = rows.filter((row) => row.origin === 'asked').length;
  return (
    <section
      className="mb-5 rounded-xl border border-border/60 bg-card/60"
      data-testid="daily-read"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-border/60 border-b px-5 py-4">
        <h3 className="font-semibold text-foreground text-xl tracking-tight">
          {asked > 0 ? "Today's read, and what you asked for" : "Today's read, by category"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {source === 'brief' ? 'Jaina, from the latest cycle' : 'Draft read from the latest cycle'}
        </p>
      </header>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => {
          const waiting = isWaiting?.(row) ?? false;
          const busy = busyRowId === row.id;
          return (
            <li
              className={cn(
                'grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
                row.isHero && 'bg-primary/5',
                // A ~5s breath while the worker reads. No sheen, no sweep — the row is
                // waiting, not loading a skeleton.
                waiting && 'animate-[pulse_5s_ease-in-out_infinite]',
              )}
              data-row-key={`read:${row.id}`}
              key={row.id}
            >
              <div className="min-w-0 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="px-2.5 py-0.5 text-xs" variant={MODULE_VARIANT[row.module]}>
                    {row.category}
                  </Badge>
                  <Badge className="px-2.5 py-0.5 text-xs" variant={TIER_VARIANT[row.tier]}>
                    {row.tierLabel}
                  </Badge>
                  {row.isHero ? (
                    <span className="text-primary text-xs">On the overview</span>
                  ) : null}
                  {row.origin === 'asked' ? (
                    <span className="text-muted-foreground text-xs">You asked for this</span>
                  ) : null}
                </div>
                <p className="truncate font-semibold text-foreground text-lg tracking-tight">{row.title}</p>
                {row.reason ? (
                  <p className="line-clamp-2 text-base text-muted-foreground leading-relaxed" title={row.basis}>
                    {row.reason}
                  </p>
                ) : (
                  <p className="text-base text-muted-foreground leading-relaxed">{row.basis}</p>
                )}
                {row.detail && row.detail.figures.length > 0 ? (
                  <dl className="flex flex-wrap gap-2">
                    {row.detail.figures.map((figure) => (
                      <div
                        className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5"
                        key={`${row.id}:${figure.label}`}
                      >
                        <dt className="text-muted-foreground text-xs">{figure.label}</dt>
                        <dd className="font-semibold text-foreground text-lg tabular-nums">
                          {formatFigure(figure, currency)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {row.detail && row.detail.steps.length > 0 ? (
                  <ol className="list-inside list-decimal space-y-1.5 text-muted-foreground text-sm">
                    {row.detail.steps.map((step) => (
                      <li key={`${row.id}:${step}`}>{step}</li>
                    ))}
                  </ol>
                ) : null}
                {failure?.rowId === row.id ? (
                  <p className="text-destructive text-sm" data-testid={`read-failure:${row.id}`}>
                    {failure.message}
                  </p>
                ) : null}
                {row.nextNote ? (
                  <p
                    className="text-secondary text-sm opacity-80"
                    data-testid={`read-next-note:${row.id}`}
                  >
                    {row.nextNote}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 justify-self-start sm:items-end sm:justify-self-end">
                {busy && row.cta.kind === 'build' ? (
                  <CalmRule play testId="read-build-rule" />
                ) : null}
                <div className="flex items-center gap-2">
                  {onDismiss && row.origin === 'asked' && !waiting ? (
                    <Button
                      className="h-10 px-4 text-sm"
                      disabled={busy}
                      onClick={() => onDismiss(row)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Dismiss
                    </Button>
                  ) : null}
                  <Button
                    className="h-10 px-4 text-sm"
                    disabled={waiting || busy}
                    onClick={() => onCta(row.cta, row)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {busy ? 'Working…' : row.cta.label}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
