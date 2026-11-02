'use client';

// The pieces the four Meta views share: their frame (with the Meta chip), the one-line states
// a view shows when its read is not in, the headline figure a small view leads with, the
// takeaway line, the legend swatches, a hover tooltip for chart marks and the container width
// a hand-drawn chart lays itself out in.
//
// Colors come from the board palette only: below / mid / above for a cost against its goal and
// the categorical slots for the portfolios. Text never takes a series color.

import type { AdAccountBoardSlot, BoardModuleSize } from '@continuum/contracts';
import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react';
import * as typeScale from '@/components/paid-media/optimizer/typeScale';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PlatformChip } from '../../../platforms/PlatformChip';
import { ModuleFrame, type ModuleFrameState } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import type { CostTone } from './metaLensModel';
import type { MetaReadState } from './metaReads';

/** Every Meta view reads the last 30 days; each says so, because the result module beside it
 *  reads 7 and two windows on one board must never read as one. */
const META_WINDOW_LABEL = 'Last 30 days';

/** What a view's frame tells the board (and its bench): still reading, the data is absent, a
 *  read failed, or the figures are in. */
export function frameStateOf(
  read: MetaReadState<unknown>['status'],
  hasData: boolean,
): ModuleFrameState {
  if (read === 'loading') return 'loading';
  if (read === 'error') return 'error';
  if (read === 'no-account' || !hasData) return 'missing';
  return 'ready';
}

export function MetaFrame({
  title,
  slot,
  testId,
  state,
  children,
}: {
  title: string;
  slot: AdAccountBoardSlot;
  testId: string;
  state: ModuleFrameState;
  children: ReactNode;
}) {
  return (
    <ModuleFrame
      action={<PlatformChip platform="meta" />}
      reason={slot.reason}
      size={slot.size}
      state={state}
      testId={testId}
      title={title}
    >
      {children}
    </ModuleFrame>
  );
}

/** The window line a view opens with, and whatever it adds about its rows. */
export function WindowLine({ detail, testId }: { detail?: string; testId: string }) {
  return (
    <p className="text-muted-foreground text-xs" data-testid={`${testId}-window`}>
      {META_WINDOW_LABEL}
      {detail ? ` · ${detail}` : ''}
    </p>
  );
}

/** One short line saying what is missing. */
export function LensNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="text-muted-foreground text-xs leading-snug" data-testid={testId}>
      {children}
    </p>
  );
}

const SKELETON_HEIGHT: Record<BoardModuleSize, string> = {
  s: 'h-20',
  m: 'h-40',
  l: 'h-64',
  w: 'h-40',
};

/** What a view shows while a read that is not ready answers: a body-sized skeleton, the line
 *  that says there is no Meta account to read, or the failure with a way to ask again. */
export function ReadNote({
  state,
  size,
  what,
  testId,
}: {
  state: Exclude<MetaReadState<unknown>, { status: 'ready' }>;
  size: BoardModuleSize;
  /** "campaigns", "ad sets": what the read was for. */
  what: string;
  testId: string;
}) {
  if (state.status === 'loading') {
    return (
      <Skeleton
        aria-label={`Reading ${what}`}
        className={cn('w-full', SKELETON_HEIGHT[size])}
        data-testid={`${testId}-loading`}
      />
    );
  }
  if (state.status === 'no-account') {
    return (
      <LensNote testId={`${testId}-empty`}>Select a Meta ad account to read its {what}.</LensNote>
    );
  }
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs"
      data-testid={`${testId}-error`}
    >
      The {what} could not be read.
      <Button onClick={state.retry} size="xs" variant="outline">
        Retry
      </Button>
    </p>
  );
}

/** The one figure a small view leads with, and what it is. */
export function Headline({
  figure,
  caption,
  figureAttrs,
  testId,
}: {
  figure: string;
  caption: string;
  figureAttrs?: Record<string, string>;
  testId: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5" data-testid={testId}>
      <p className={cn(typeScale.figureTile, 'truncate')} {...figureAttrs}>
        {figure}
      </p>
      <p className="text-muted-foreground text-xs leading-snug">{caption}</p>
    </div>
  );
}

/** The sentence built from the figures, in the account's language. */
export function Takeaway({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="text-pretty text-foreground text-sm leading-snug" data-testid={testId}>
      {text}
    </p>
  );
}

export function toneColor(tone: CostTone): string {
  return BOARD_COLOR[tone];
}

/** Within this lean a cost reads as on its goal (5% either side). */
const ON_GOAL_LEAN = Math.log2(1.05);

/** A node fill that leans toward below or above with the cost (lean −1…1): a tint of the series
 *  color over the card, 18% to 55%, so foreground text stays legible on it in both themes. A
 *  cost on its goal, or with nothing to compare, is the neutral. */
export function leanFill(lean: number): string {
  if (Math.abs(lean) < ON_GOAL_LEAN) return BOARD_COLOR.mid;
  const color = lean < 0 ? BOARD_COLOR.below : BOARD_COLOR.above;
  return `color-mix(in oklab, ${color} ${Math.round(18 + Math.abs(lean) * 37)}%, var(--card))`;
}

/** The three categorical slots, for the portfolios laid over a chart. */
export const PORTFOLIO_SLOT_COLORS = [BOARD_COLOR.search, BOARD_COLOR.pmax, BOARD_COLOR.video];

/** A tint of a slot color over the card, light enough for foreground text. */
export function slotFill(slot: number): string {
  return `color-mix(in oklab, ${PORTFOLIO_SLOT_COLORS[slot] ?? BOARD_COLOR.mid} 45%, var(--card))`;
}

/** The hatch a lost node is drawn with. */
export const HATCH_STYLE = {
  backgroundColor: 'transparent',
  backgroundImage:
    'repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted-foreground) 28%, transparent) 0 2px, transparent 2px 6px)',
};

export function LegendRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {children}
    </div>
  );
}

export function LegendItem({
  label,
  color,
  variant = 'solid',
}: {
  label: ReactNode;
  color?: string;
  variant?: 'solid' | 'outline' | 'dot' | 'dashed' | 'hatch' | 'ring' | 'ramp';
}) {
  let swatch: ReactNode;
  switch (variant) {
    case 'dot':
      swatch = <span className="size-2.5 rounded-full" style={{ background: color }} />;
      break;
    case 'outline':
      swatch = (
        <span
          className="size-2.5 rounded-[3px]"
          style={{
            boxShadow:
              'inset 0 0 0 1.5px color-mix(in srgb, var(--muted-foreground) 70%, transparent)',
          }}
        />
      );
      break;
    case 'ring':
      swatch = <span className="size-2.5 rounded-full border border-foreground" />;
      break;
    case 'dashed':
      swatch = <span className="h-0 w-4 border-foreground/60 border-t-[1.5px] border-dashed" />;
      break;
    case 'hatch':
      swatch = (
        <span
          className="size-2.5 rounded-[3px] border border-muted-foreground/50 border-dashed"
          style={HATCH_STYLE}
        />
      );
      break;
    case 'ramp':
      swatch = (
        <span
          className="h-2 w-16 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${leanFill(-1)}, ${BOARD_COLOR.mid}, ${leanFill(1)})`,
          }}
        />
      );
      break;
    default:
      swatch = <span className="size-2.5 rounded-[3px]" style={{ background: color }} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex shrink-0 items-center">
        {swatch}
      </span>
      {label}
    </span>
  );
}

export type ChartTipState = { x: number; y: number; width: number; content: ReactNode } | null;

/** A tooltip for chart marks, positioned inside `host` above the mark under the pointer (or
 *  with the keyboard focus). */
export function useChartTip(host: RefObject<HTMLElement | null>) {
  const [tip, setTip] = useState<ChartTipState>(null);
  const show = useCallback(
    (event: PointerEvent<Element> | FocusEvent<Element>, content: ReactNode) => {
      const box = host.current?.getBoundingClientRect();
      const mark = event.currentTarget.getBoundingClientRect();
      if (!box) return;
      setTip({
        x: mark.left + mark.width / 2 - box.left,
        y: mark.top - box.top,
        width: box.width,
        content,
      });
    },
    [host],
  );
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function ChartTip({ tip }: { tip: ChartTipState }) {
  if (!tip) return null;
  const edge = tip.width > 0 ? tip.x / tip.width : 0.5;
  const shift = edge < 0.25 ? '-12px' : edge > 0.75 ? 'calc(-100% + 12px)' : '-50%';
  return (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-[15rem] rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-sm"
      role="tooltip"
      style={{ left: tip.x, top: tip.y, transform: `translate(${shift}, calc(-100% - 6px))` }}
    >
      {tip.content}
    </div>
  );
}

/** The rendered width of `ref`, kept current with a ResizeObserver; `fallback` until it is
 *  measured (and wherever ResizeObserver does not exist). */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.round(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** The entrance every mark shares. */
export const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
