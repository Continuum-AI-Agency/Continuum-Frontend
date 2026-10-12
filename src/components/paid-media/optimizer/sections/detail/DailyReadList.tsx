'use client';

import type { AdhocSuggestionFigure } from '@continuum/contracts';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import { CalmRule } from '../account/candidateHeadline';
import { KindTag, type KindTone } from '../kindTag';
import type { DailyReadRow } from './dailyReadModel';
import type { HeroCta } from './heroModel';

/** A high-impact row's tier reads at full strength; every other state stays quiet. */
const TIER_TEXT: Record<DailyReadRow['tier'], string> = {
  high: 'font-medium text-foreground',
  medium: 'text-muted-foreground',
  low: 'text-muted-foreground',
};

const MODULE_TONE: Record<DailyReadRow['module'], KindTone> = {
  budget: 'budget',
  pause: 'pause',
  creative: 'creative',
  audience: 'audience',
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
  /** The row opened in place — an asked-for row whose handoff opened an audience proposal
   *  shows that proposal under itself. Null ⇒ nothing is open. */
  expandedRowId?: string | null;
  /** What the open row shows. Absent ⇒ no row can open. */
  renderExpansion?: (row: DailyReadRow) => React.ReactNode;
};

/** The control's label while its row is open: the same button closes what it opened. */
const CLOSE_LABEL = 'Close the proposal';

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
  expandedRowId = null,
  renderExpansion,
}: DailyReadListProps) {
  if (rows.length === 0) return null;
  const asked = rows.filter((row) => row.origin === 'asked').length;
  return (
    <section className="mb-8" data-testid="daily-read">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold text-base text-foreground tracking-tight">
          {asked > 0 ? "Today's read, and what you asked for" : "Today's read, by category"}
        </h3>
        <p className="text-muted-foreground text-xs">
          {source === 'brief' ? 'Jaina, from the latest cycle' : 'Draft read from the latest cycle'}
        </p>
      </header>
      <ul className="mt-3 divide-y divide-border/60 border-border/60 border-y">
        {rows.map((row) => {
          const waiting = isWaiting?.(row) ?? false;
          const busy = busyRowId === row.id;
          const expanded = expandedRowId === row.id && Boolean(renderExpansion);
          return (
            <li
              className={cn(
                'grid gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
                row.isHero && '-mx-3 bg-primary/5 px-3',
                // A ~5s breath while the worker reads. No sheen, no sweep — the row is
                // waiting, not loading a skeleton.
                waiting && 'animate-[pulse_5s_ease-in-out_infinite]',
              )}
              data-row-key={`read:${row.id}`}
              key={row.id}
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <KindTag tone={MODULE_TONE[row.module]}>{row.category}</KindTag>
                  <span className={TIER_TEXT[row.tier]}>{row.tierLabel}</span>
                  {row.isHero ? <span className="text-primary-ink">· On the overview</span> : null}
                  {row.origin === 'asked' ? (
                    <span className="text-muted-foreground">· You asked for this</span>
                  ) : null}
                </div>
                <p className="truncate font-semibold text-foreground text-sm tracking-tight">
                  {row.title}
                </p>
                {row.reason ? (
                  <p
                    className="line-clamp-2 text-muted-foreground text-xs leading-relaxed"
                    title={row.basis}
                  >
                    {row.reason}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs leading-relaxed">{row.basis}</p>
                )}
                {row.detail && row.detail.figures.length > 0 ? (
                  <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                    {row.detail.figures.map((figure) => (
                      <div
                        className="flex items-baseline gap-1.5"
                        key={`${row.id}:${figure.label}`}
                      >
                        <dt className="text-muted-foreground">{figure.label}</dt>
                        <dd className="font-mono font-semibold text-foreground text-xs tabular-nums">
                          {formatFigure(figure, currency)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {row.detail && row.detail.steps.length > 0 ? (
                  <ol className="list-inside list-decimal space-y-0.5 text-muted-foreground text-xs">
                    {row.detail.steps.map((step) => (
                      <li key={`${row.id}:${step}`}>{step}</li>
                    ))}
                  </ol>
                ) : null}
                {failure?.rowId === row.id ? (
                  <p className="text-destructive text-xs" data-testid={`read-failure:${row.id}`}>
                    {failure.message}
                  </p>
                ) : null}
                {row.nextNote ? (
                  <p
                    className="text-muted-foreground text-xs"
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
                <div className="flex items-center gap-1">
                  {onDismiss && row.origin === 'asked' && !waiting ? (
                    <Button
                      className="h-8 px-3 text-xs"
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
                    aria-expanded={renderExpansion ? expanded : undefined}
                    className="h-8 px-4 text-xs"
                    disabled={waiting || busy}
                    onClick={() => onCta(row.cta, row)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {busy ? 'Working…' : expanded ? CLOSE_LABEL : row.cta.label}
                  </Button>
                </div>
              </div>
              {expanded && renderExpansion ? (
                <div
                  className="border-border/60 border-l pl-4 sm:col-span-2"
                  data-testid={`read-expansion:${row.id}`}
                >
                  {renderExpansion(row)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
