'use client';

// What the Google views share: a read as one of three states, the gate that renders them, and a
// Cell printed as its text or lane A's "—" with its reason (GoogleSection's Missing and
// ReasonNotes, re-exported so every Google table dashes alike).

import type { PlatformCard } from '@continuum/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { ChartError, ChartSkeleton } from '../../../charts/ChartStates';
import { useOptimizerPlatformCards } from '../../../useOptimizerData';
import { platformCardOf } from '../../platformCards/platformCardModel';
import { Missing, ReasonNotes } from '../GoogleSection';
import type { Cell } from './cell';

export { ReasonNotes };

/** The Optimizer's pending Google cards (G03 budget, G05 search terms, …): what the views point
 *  to for any change. Empty until the read answers, and when it cannot. */
export function usePendingGoogleCards(brandId: string): PlatformCard[] {
  const state = useOptimizerPlatformCards(brandId, 'google_ads');
  return useMemo(
    () =>
      state.status === 'ready'
        ? state.cards.flatMap((candidate) => platformCardOf(candidate) ?? [])
        : [],
    [state],
  );
}

export type ViewRead<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'ready'; data: T };

export function viewRead<T>(
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isError' | 'refetch'>,
): ViewRead<T> {
  if (query.isError) {
    return {
      status: 'error',
      message: query.error?.message ?? 'The read did not answer.',
      retry: () => void query.refetch(),
    };
  }
  return query.data === undefined ? { status: 'loading' } : { status: 'ready', data: query.data };
}

/** Renders its children once the read is in; a skeleton before, the error with a retry after. */
export function ReadGate<T>({
  read,
  children,
}: {
  read: ViewRead<T>;
  children: (data: T) => ReactNode;
}) {
  if (read.status === 'loading') return <ChartSkeleton className="h-24" />;
  if (read.status === 'error') return <ChartError message={read.message} onRetry={read.retry} />;
  return <>{children(read.data)}</>;
}

/** A figure in a table cell: its text, or "—" with why it is missing. */
export function CellText({ cell }: { cell: Cell }) {
  return cell.reason ? <Missing reason={cell.reason} /> : cell.text;
}

/** The line under a view's title: window, source and scope (presentation standard §3). */
export function ScopeLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs" data-testid="google-view-scope">
      {children}
    </p>
  );
}
