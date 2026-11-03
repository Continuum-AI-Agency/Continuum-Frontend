'use client';

// A card's evidence as thin bars: the label, the bar on its track, the figure. The bar takes
// the board's cost-against-goal colour; the label and the figure stay in the text tokens. The
// bars grow from zero once, in a short stagger, and simply sit there under reduced motion.

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { BOARD_COLOR } from '../../palette';
import type { EvidenceBar } from './evidenceBarsModel';

/** A bar that holds something stays visible, however small its share. */
const MIN_VISIBLE_PCT = 1.5;

function widthPct(fill: number): number {
  return fill > 0 ? Math.max(MIN_VISIBLE_PCT, fill * 100) : 0;
}

export function EvidenceBars({ bars }: { bars: readonly EvidenceBar[] }) {
  const reduce = useReducedMotion();
  if (bars.length === 0) return null;
  return (
    // One grid for every row, so the tracks start and end at the same x whatever each label and
    // figure measure. The label column takes what its longest label needs, up to 40%.
    <ul
      className="grid grid-cols-[fit-content(40%)_minmax(2.5rem,1fr)_auto] items-center gap-x-2 gap-y-1 text-xs leading-tight"
      data-testid="decision-bars"
    >
      {bars.map((bar, index) => (
        <li
          className="col-span-3 grid grid-cols-subgrid items-center"
          data-testid="decision-bar"
          data-tone={bar.tone}
          key={`${bar.label}·${bar.value}`}
        >
          <span className="min-w-0 truncate text-muted-foreground" title={bar.label}>
            {bar.label}
          </span>
          <span aria-hidden="true" className="relative h-2 rounded-full bg-muted-foreground/[0.07]">
            {/* The mid tone is the palette's neutral, close to the track's own grey: an edge keeps
                an unjudged bar readable against it in both themes. */}
            <motion.span
              animate={{ scaleX: 1 }}
              className={cn(
                'absolute inset-y-0 left-0 origin-left rounded-full',
                bar.tone === 'mid' && 'ring-1 ring-foreground/25 ring-inset',
              )}
              initial={reduce ? false : { scaleX: 0 }}
              style={{ width: `${widthPct(bar.fill)}%`, backgroundColor: BOARD_COLOR[bar.tone] }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.6, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }
              }
            />
            {bar.tick != null ? (
              <span
                className="-top-0.5 -translate-x-1/2 absolute h-3 w-0.5 rounded-full bg-foreground/70"
                data-testid="decision-bar-tick"
                style={{ left: `${bar.tick * 100}%` }}
              />
            ) : null}
          </span>
          <span className="text-right font-medium text-foreground tabular-nums">{bar.value}</span>
        </li>
      ))}
    </ul>
  );
}
