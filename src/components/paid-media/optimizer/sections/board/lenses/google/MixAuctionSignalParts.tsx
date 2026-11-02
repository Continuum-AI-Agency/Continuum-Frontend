'use client';

// The pieces the Google lenses G05 Mix, G06 Auction and G10 Signal are drawn with: the window they
// read, the Optimizer's cards on the account, the one line a lens says when it has nothing to
// draw, and the parts of their charts — a mark that answers hover and keyboard focus, a legend,
// the headline figure of a small lens and the takeaway sentence of a larger one.

import type { AccountCandidate, BoardModuleSize, PlatformCard } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FigureProps } from '../../../../format';
import { useOptimizerPlatformCards } from '../../../../useOptimizerData';
import type { GoogleReadWindow } from '../../../google/googleReads';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import { completeDaysWindow } from '../../../platforms/googleAdsOverviewModel';
import type { GoogleAdsOverviewState } from '../../../platforms/useGoogleAdsOverview';
import type { ModuleFrameState } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';

/** The complete days the engine's account findings read (its Google run window), so a lens's
 *  own split and the findings drawn beside it cover one stretch. The reading's result window is
 *  the Overview's (seven days by default) and too short to split a month of spend. */
export const LENS_WINDOW_DAYS = 30;

/** The lenses' window: LENS_WINDOW_DAYS complete days ending yesterday. */
export function useLensWindow(): GoogleReadWindow {
  const { since, until } = completeDaysWindow(LENS_WINDOW_DAYS);
  return useMemo(() => ({ since, until }), [since, until]);
}

/** The account's pending Google cards: the candidates as the RPC served them (the delivery
 *  status reads those) and their platform cards, parsed once. `unavailable`: the RPC is not
 *  deployed where the board runs; `error`: the read failed or broke the contract. */
export type LensCards =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; candidates: AccountCandidate[]; cards: PlatformCard[] };

export function useLensCards(brandId: string): LensCards {
  const state = useOptimizerPlatformCards(brandId, 'google_ads');
  return useMemo((): LensCards => {
    if (state.status !== 'ready') return { status: state.status };
    return {
      status: 'ready',
      candidates: state.cards,
      cards: state.cards.flatMap((candidate) => platformCardOf(candidate) ?? []),
    };
  }, [state]);
}

export const CARDS_UNREAD = "The Optimizer's findings on this account could not be read.";
export const CARDS_UNAVAILABLE = "The Optimizer's findings are not served for this account yet.";

/** What a lens's frame says it could show: the board's bench grades the board on it. */
export type LensFrameState = ModuleFrameState;

/** A lens that cannot draw: `missing` names what is absent, `error` that a read failed. */
export type LensBlocked = { status: 'missing' | 'error'; line: string };

/** Why a Google lens has nothing to draw while the account's own read did not answer: a
 *  connection, grant or role that is absent is `missing`; a read that failed is `error`. Null
 *  while it loads and once it is ready. */
export function googleReadBlocked(state: GoogleAdsOverviewState): LensBlocked | null {
  switch (state.status) {
    case 'no-connection':
      return { status: 'missing', line: 'Google Ads is not connected for this brand.' };
    case 'no-grant':
      return { status: 'missing', line: 'No Google Ads account is granted to this brand.' };
    case 'no-role':
      return {
        status: 'missing',
        line: 'Reading Google Ads needs the Operator, Admin or Owner role on this brand.',
      };
    case 'no-access':
      return {
        status: 'missing',
        line: `No live Google grant reaches ${state.account.name ?? state.account.account_id}.`,
      };
    case 'error':
      return {
        status: 'error',
        line: state.reconnect
          ? 'Google refused the login: reconnect Google to read this account.'
          : `Google Ads could not be read: ${state.message}`,
      };
    default:
      return null;
  }
}

export const isSmall = (size: BoardModuleSize): boolean => size === 's';

/** The ink of a mark that carries no judgment: a part on its agreed split, an action no finding
 *  flags, the spend beside the results it bought, what a campaign won of its auctions. The
 *  palette's mid tone is the diverging midpoint and nearly vanishes as a bar on a light track, so
 *  it is pulled toward the muted text tone; both switch with the theme. */
export const NEUTRAL_MARK = `color-mix(in oklab, ${BOARD_COLOR.mid} 45%, var(--muted-foreground))`;

/** What a lens shows while its figures load: its body's footprint, so nothing moves when they
 *  land. */
export function LensLoading({ size, testId }: { size: BoardModuleSize; testId: string }) {
  return (
    <Skeleton
      className={cn('w-full rounded-lg', size === 's' ? 'h-20' : size === 'm' ? 'h-36' : 'h-60')}
      data-testid={`${testId}-loading`}
    />
  );
}

/** The one line a lens says when it has nothing to draw. */
export function LensEmpty({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-snug" data-testid={testId} role="status">
      {children}
    </p>
  );
}

/** The sentence a larger lens closes with, built from its figures, in the account's language. */
export function LensTakeaway({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p className="text-foreground text-sm leading-snug" data-testid={testId} lang="es">
      {children}
    </p>
  );
}

/** The one figure a small lens leads with, and what it is. */
export function LensHeadline({
  value,
  label,
  figure,
  testId,
}: {
  value: string;
  label: string;
  figure?: FigureProps;
  testId: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5" data-testid={testId}>
      <p className="font-semibold text-2xl leading-tight tracking-tight" {...figure}>
        {value}
      </p>
      <p className="text-muted-foreground text-xs leading-snug">{label}</p>
    </div>
  );
}

/** The window a lens covers, beside its title, so two windows on one board never read as one. */
export function LensWindowTag({ days, testId }: { days: number; testId: string }) {
  return (
    <span className="whitespace-nowrap text-muted-foreground text-xs" data-testid={testId}>
      Last {days} days
    </span>
  );
}

/** The line under a lens's chart that names its window and its source. */
export function LensScope({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

export type LegendItem = {
  label: string;
  color: string;
  /** swatch: a filled mark; tick: a dashed rule (a goal or an agreed share); outline: a dashed
   *  box (a day without ads). */
  mark?: 'swatch' | 'tick' | 'outline';
};

export function Legend({ items, testId }: { items: readonly LegendItem[]; testId: string }) {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs"
      data-testid={testId}
    >
      {items.map((item) => (
        <li className="inline-flex items-center gap-1.5" key={item.label}>
          {item.mark === 'tick' ? (
            <span
              aria-hidden="true"
              className="h-3 border-l-[1.5px] border-dashed"
              style={{ borderColor: item.color }}
            />
          ) : item.mark === 'outline' ? (
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px] border border-dashed"
              style={{ borderColor: item.color }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: item.color }}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * A data mark that answers hover and keyboard focus with its figure: the value first, then what
 * it is. The button is the hit target and the fill inside it is the mark, so a thin bar can be
 * pointed at; the fill grows in from its baseline once, and under reduced motion it is simply
 * there.
 */
export function TipMark({
  value,
  label,
  color,
  className,
  fillClassName,
  style,
  grow = 'x',
  delay = 0,
  testId,
  onActive,
  children,
}: {
  /** The figure the mark draws, as the tooltip says it first. */
  value: string;
  /** What the figure is ("Search · share of spend"). */
  label: string;
  /** The fill; none for a mark that is only its own text (a calendar day). */
  color?: string;
  className?: string;
  fillClassName?: string;
  style?: CSSProperties;
  grow?: 'x' | 'y' | 'none';
  delay?: number;
  testId?: string;
  /** Called with true while the mark is hovered or focused, and false when it is left. */
  onActive?: (active: boolean) => void;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const initial = reduce || grow === 'none' ? false : grow === 'x' ? { scaleX: 0 } : { scaleY: 0 };
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${label}: ${value}`}
        className={cn(
          'relative block min-w-0 cursor-default rounded-[4px] p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        data-testid={testId}
        // A chart's readout answers at once, as the app's TooltipProvider does by default.
        delay={0}
        onBlur={() => onActive?.(false)}
        onFocus={() => onActive?.(true)}
        onPointerEnter={() => onActive?.(true)}
        onPointerLeave={() => onActive?.(false)}
        style={style}
      >
        {color ? (
          <motion.span
            animate={{ scaleX: 1, scaleY: 1 }}
            aria-hidden="true"
            className={cn('absolute inset-0 block rounded-[inherit]', fillClassName)}
            initial={initial}
            style={{ background: color, transformOrigin: grow === 'y' ? '50% 100%' : '0% 50%' }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay }}
          />
        ) : null}
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}
