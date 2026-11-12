'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// What the adaptive board's Google lenses (Search terms, Quality Score, Performance Max) share
// with these views: the brand's Google Ads customer resolved the way the Google tab resolves it,
// a lens read as one of four states, the frame body that renders them at the slot's size, the
// headline figure, the takeaway line and the hover readout every mark carries. The lenses draw
// their own charts; the models stay the views' (searchTermRoots, qualityScoreModel,
// pmaxHealthModel), so a figure reads the same on the board and behind "Show".

import type { BoardModuleSize, PlatformCard } from '@continuum/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { type ReactElement, type ReactNode, useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { cn } from '@/lib/utils';
import { ChartError, ChartSkeleton } from '../../../charts/ChartStates';
import * as typeScale from '../../../typeScale';
import { useOptimizerAdAccounts, useOptimizerPlatformCards } from '../../../useOptimizerData';
import type { ModuleFrameState } from '../../board/ModuleFrame';
import { platformCardOf } from '../../platformCards/platformCardModel';
import { windowRangeLabel } from '../../platforms/googleAdsOverviewModel';
import { accountsOn } from '../../platforms/platformTabsModel';
import { isGoogleNoAccess } from '../../platforms/useGoogleAdsOverview';

/** A lens read: loading, a one-line reason it has nothing to draw, an error, or its data. */
export type LensState<T> =
  | { status: 'loading' }
  | { status: 'missing'; reason: string }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'ready'; data: T };

export const lensLoading = { status: 'loading' } as const;
export const lensMissing = (reason: string) => ({ status: 'missing', reason }) as const;
export const lensReady = <T,>(data: T) => ({ status: 'ready', data }) as const;

/** The first state that is not ready, or every value once all of them are. */
export function lensAll<A, B>(a: LensState<A>, b: LensState<B>): LensState<[A, B]> {
  if (a.status !== 'ready') return a;
  if (b.status !== 'ready') return b;
  return { status: 'ready', data: [a.data, b.data] };
}

export type GoogleCustomer = { customerId: string; currency: string | null };

/**
 * The brand's Google Ads customer: the account the board hands over when it has one, else the
 * first Google Ads account granted to the brand (what useGoogleAdsOverview reads). The Google tab
 * passes no account, so this is how every Google lens finds the customer it reads.
 */
export function useGoogleCustomer(
  brandId: string,
  adAccountId: string | null,
): LensState<GoogleCustomer> {
  const accounts = useOptimizerAdAccounts(brandId);
  const google = accountsOn(accounts.data, 'google_ads');
  if (adAccountId) {
    const wanted = bareAccountId(adAccountId);
    const listed = google.find((account) => bareAccountId(account.account_id) === wanted);
    return lensReady({
      customerId: wanted,
      currency: listed?.currency ?? null,
    });
  }
  if (accounts.isLoading) return lensLoading;
  if (accounts.isError) {
    return {
      status: 'error',
      message: 'Could not read which ad accounts this brand is granted.',
      retry: () => void accounts.refetch(),
    };
  }
  const first = google[0];
  if (!first) return lensMissing('No Google Ads account is granted to this brand.');
  return lensReady({ customerId: first.account_id, currency: first.currency });
}

/** The Optimizer's pending Google cards as a lens state: a lens that reads a card waits for the
 *  list, so a card landing late never redraws the chart under the reader. `null` when the list
 *  could not be read. One object per answer, so a model memoized on it holds between renders. */
export function useGoogleCardsLens(brandId: string): LensState<PlatformCard[] | null> {
  const state = useOptimizerPlatformCards(brandId, 'google_ads');
  return useMemo((): LensState<PlatformCard[] | null> => {
    if (state.status === 'loading') return lensLoading;
    if (state.status !== 'ready') return lensReady(null);
    return lensReady(state.cards.flatMap((candidate) => platformCardOf(candidate) ?? []));
  }, [state]);
}

/** Said when Google refused the login behind a read: asking again changes nothing. */
export const GOOGLE_RELOGIN = 'Google refused the login: reconnect Google to read this account.';
/** Said when no live grant (or the caller's role) reaches the customer. */
export const GOOGLE_NO_ACCESS =
  "No live Google grant reaches this account, or this role can't read Google Ads.";

/**
 * A Google read as a lens state. A refusal (a login Google refused, no access) is a line saying
 * what fixes it, since a retry cannot; any other failure is an error with a retry.
 */
export function googleLensRead<T>(
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isError' | 'refetch'>,
): LensState<T> {
  if (query.isError) {
    const { code } = (query.error ?? {}) as { code?: unknown };
    if (code === 'TOKEN_EXPIRED') return lensMissing(GOOGLE_RELOGIN);
    if (isGoogleNoAccess(query.error)) return lensMissing(GOOGLE_NO_ACCESS);
    return {
      status: 'error',
      message: query.error?.message ?? 'The Google Ads read did not answer.',
      retry: () => void query.refetch(),
    };
  }
  return query.data === undefined ? lensLoading : lensReady(query.data);
}

/** What the module frame tells the board's bench: the lens state, whether a ready read had
 *  anything to draw, and whether a second read the drawing waits on is still in flight. */
export function frameStateOf(
  state: LensState<unknown>,
  drawable: boolean,
  pending = false,
): ModuleFrameState {
  if (state.status !== 'ready') return state.status;
  if (!drawable) return 'missing';
  return pending ? 'loading' : 'ready';
}

/** Said where a lens reads a card and the card list could not be read. */
export const CARDS_UNREAD = "the Optimizer's cards couldn't be read";

const SKELETON_HEIGHT: Record<BoardModuleSize, string> = {
  s: 'h-20',
  m: 'h-40',
  l: 'h-64',
  w: 'h-40',
};

/** A lens body by its state: a skeleton of the chart's own height while it loads, the error
 *  with a retry, the one line that says what is missing, or the drawing. */
export function LensBody<T>({
  state,
  size,
  testId,
  children,
}: {
  state: LensState<T>;
  size: BoardModuleSize;
  testId: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <ChartSkeleton className={SKELETON_HEIGHT[size]} />;
  if (state.status === 'error') {
    return <ChartError message={state.message} onRetry={state.retry} />;
  }
  if (state.status === 'missing') {
    return (
      <p className="text-muted-foreground text-xs" data-testid={`${testId}-missing`}>
        {state.reason}
      </p>
    );
  }
  return <>{children(state.data)}</>;
}

/** The lens's one headline figure: the number, then what it is. */
export function LensFigure({
  value,
  caption,
  testId,
}: {
  value: string;
  caption: ReactNode;
  testId: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5" data-testid={testId}>
      <p className={cn(typeScale.figureTile, 'truncate text-foreground')}>{value}</p>
      <p className="text-muted-foreground text-xs leading-snug">{caption}</p>
    </div>
  );
}

/** The sentence the figures add up to, in the account's language. */
export function LensTakeaway({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p className="text-foreground text-sm leading-snug" data-testid={testId}>
      {children}
    </p>
  );
}

/** A note under a chart: a missing figure's reason, or the window and source. */
export function LensNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="text-muted-foreground text-xs leading-snug" data-testid={testId}>
      {children}
    </p>
  );
}

/** A legend key: the series' mark beside its name (text never takes the series color). */
export function LegendKey({
  color,
  hatched = false,
  children,
}: {
  color: string;
  hatched?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-[3px]', hatched && HATCH)}
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** The texture that marks "spend with no intent to buy" beside its gray. */
export const HATCH =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--foreground)_22%,transparent)_0_2px,transparent_2px_6px)]';

/**
 * A mark a reader can interrogate: a real button, so the same readout opens on hover and on
 * keyboard focus. The readout leads with the value and follows with what it is.
 */
export function MarkTip({
  mark,
  value,
  label,
}: {
  mark: ReactElement;
  value: string;
  label: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={mark} />
      <TooltipContent className="flex-col items-start gap-0.5 text-left">
        <span className="font-semibold text-sm tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The window every Google lens reads: Google's last 30 complete days, the window of the
 *  google_signals read and of the Optimizer's account cards (V2, V4, V5, E4, P3) whose figures
 *  put the lens on the board, so the lens and the card it answers say the same number. */
export const LENS_WINDOW_DAYS = 30;

/**
 * The window a lens reads, in its header at every size: the board's result reads another window
 * (the Overview's 7 days), and two windows on one board must never read as one. The read's own
 * range once it answered, the window it asked for before.
 */
export function LensWindow({
  range,
  testId,
}: {
  range: { since: string; until: string } | null;
  testId: string;
}) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <span
      className="whitespace-nowrap text-muted-foreground text-xs"
      data-testid={`${testId}-window`}
      title={range ? windowRangeLabel(range.since, range.until) : undefined}
    >
      {betaUiText('beta_eb970eb0951c')} {range ? daysIn(range) : LENS_WINDOW_DAYS}{' '}
      {betaUiText('beta_ab51004e9d71')}
    </span>
  );
}

/** The days a read's range covers, both ends included. */
export function daysIn(range: { since: string; until: string }): number {
  const ms = Date.parse(`${range.until}T00:00:00Z`) - Date.parse(`${range.since}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) + 1 : 0;
}

/** A 0–1 share as a whole percent; a share above zero that rounds to none reads "<1%". */
export const pct = (share: number): string =>
  share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`;

/** How big a slot draws: s is the tile, the rest draw the full chart. */
export const isTile = (size: BoardModuleSize): boolean => size === 's';
