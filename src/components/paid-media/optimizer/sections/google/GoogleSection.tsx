'use client';

// The parts every lane-A Google section shares: a heading with its one-line result always on
// screen and the long body behind the Optimizer's text disclosure (so ten views fit at 375 px),
// a "—" that says why, and the band against the portfolio CPA goal in its state colour.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TEXT_DISCLOSURE } from '../../components/disclosure';
import * as typeScale from '../../typeScale';
import type { Figure, GoalBand } from './campaignExplorerModel';

export function GoogleSection({
  title,
  summary,
  testId,
  open = false,
  showLabel = 'Show',
  children,
}: {
  title: string;
  /** The section's result in one line, readable without opening it. */
  summary: ReactNode;
  testId: string;
  /** Open on first paint: only for a body as short as its summary. */
  open?: boolean;
  showLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1 px-1" data-testid={testId}>
      <h3 className={cn(typeScale.label, 'font-semibold text-muted-foreground')}>{title}</h3>
      <div className="text-foreground text-sm" data-testid={`${testId}-summary`}>
        {summary}
      </div>
      <details className="group" open={open}>
        <summary className={TEXT_DISCLOSURE}>
          <span className="group-open:hidden">{showLabel}</span>
          <span className="hidden group-open:inline">Hide</span>
        </summary>
        <div className="mt-2 space-y-2">{children}</div>
      </details>
    </section>
  );
}

/** "—" with its reason beside it for a screen reader and on hover; the table lists the reasons. */
export function Missing({ reason }: { reason: string }) {
  return (
    <span
      className="text-muted-foreground"
      data-reason={reason}
      data-testid="missing"
      title={reason}
    >
      —<span className="sr-only"> {reason}</span>
    </span>
  );
}

/** A figure, or its dash. */
export function FigureText<T>({
  figure,
  format,
}: {
  figure: Figure<T>;
  format: (value: T) => string;
}) {
  return figure.reason === null ? <>{format(figure.value)}</> : <Missing reason={figure.reason} />;
}

/** Every distinct reason a table's dashes stand for, said once under it. */
export function ReasonNotes({ reasons }: { reasons: readonly (string | null)[] }) {
  const distinct = [...new Set(reasons.filter((reason): reason is string => Boolean(reason)))];
  if (distinct.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-muted-foreground text-xs" data-testid="missing-reasons">
      {distinct.map((reason) => (
        <li key={reason}>— {reason}</li>
      ))}
    </ul>
  );
}

export const reasonOf = <T,>(figure: Figure<T>): string | null => figure.reason;

const BAND_TONE: Record<GoalBand['kind'], string> = {
  on_goal: 'text-success',
  under: 'text-success',
  over: 'text-destructive',
  no_results: 'text-warning',
  no_target: 'text-muted-foreground',
  unpriced: 'text-muted-foreground',
  mixed: 'text-muted-foreground',
};

export function BandText({ band }: { band: GoalBand }) {
  return (
    <span
      className={cn('font-medium text-xs', BAND_TONE[band.kind])}
      data-band={band.kind}
      data-testid="goal-band"
      title={band.reason ?? undefined}
    >
      {band.label}
      {band.reason && band.label !== '—' ? (
        <span className="block font-normal text-muted-foreground">{band.reason}</span>
      ) : null}
      {band.reason && band.label === '—' ? <span className="sr-only"> {band.reason}</span> : null}
    </span>
  );
}

/** A table that scrolls sideways under 375 px instead of clipping its figures. */
export function ScrollTable({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm" data-testid={testId}>
        {children}
      </table>
    </div>
  );
}

export const TH = 'py-1.5 pr-3 text-left font-medium text-muted-foreground text-xs';
export const TH_NUM = 'py-1.5 pl-3 text-right font-medium text-muted-foreground text-xs';
export const TD = 'py-1.5 pr-3 align-top';
export const TD_NUM = 'py-1.5 pl-3 text-right align-top font-mono tabular-nums';
