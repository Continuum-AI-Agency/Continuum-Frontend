'use client';

// The adaptive board (O01, rBoard in docs/optimizer-redesign/adaptive-15/app.js): how Continuum
// works the account (the mode and its reason) and the result that counts, the questions for
// Jaina that follow from the reading, then the reading's modules in its order, each at its size,
// on a 1 / 2 / 4 column grid. A module that is still downloading holds its own footprint; one that
// throws is drawn as its frame saying so, and the rest of the board stands.
//
// Motion: the slots come in with a short stagger, and a slot the reading moves slides to its new
// place (a shared layout, FLIP). Both are off under reduced motion.

import { CircleAlertIcon } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { type ReactNode, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { JainaEntryChips } from '../JainaEntryChips';
import type { JainaEntry } from '../jainaEntryModel';
import { BoardHeader } from './BoardHeader';
import { ModuleBoundary } from './ModuleBoundary';
import { ModuleFrameSkeleton } from './ModuleFrame';
import { boardPaletteClass } from './palette';
import { BOARD_MODULE_TITLES, BOARD_MODULES } from './registry';
import { BOARD_SIZE_CLASS, type BoardContext } from './types';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const GRID: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.05 } },
};

const SLOT: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** The board's grid, shared by the board and its placeholder so both hold the same footprint. */
export const BOARD_GRID =
  'grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4';

export type AdaptiveBoardProps = {
  ctx: BoardContext;
  /** The reading is still being gathered: every slot holds its frame's skeleton. */
  loading?: boolean;
  /** The layout switch, drawn in the header. */
  toggle?: ReactNode;
  /** The questions for Jaina (boardAskEntries). */
  asks?: JainaEntry[];
};

export function AdaptiveBoard({ ctx, loading = false, toggle, asks = [] }: AdaptiveBoardProps) {
  const reduce = useReducedMotion();
  const { reading } = ctx;
  const notices = reading.notices ?? [];
  return (
    <section
      aria-label="Adaptive overview"
      className={cn('space-y-3', boardPaletteClass)}
      data-testid="adaptive-board-root"
    >
      <BoardHeader reading={reading} toggle={toggle} />
      {notices.length > 0 ? (
        <ul className="space-y-1 px-1" data-testid="board-notices">
          {notices.map((notice) => (
            <li
              className="flex items-start gap-1.5 text-muted-foreground text-xs"
              key={`${notice.module}:${notice.reason}`}
            >
              <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span>{notice.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {asks.length > 0 ? (
        <div className="rounded-lg bg-primary/5 px-3 py-2" data-testid="board-asks">
          <JainaEntryChips entries={asks} frame={false} label="Ask Jaina" platform={ctx.platform} />
        </div>
      ) : null}
      <motion.div
        animate="shown"
        className={BOARD_GRID}
        data-board-order={reading.board.map((slot) => slot.module).join(',')}
        data-loading={loading ? 'true' : undefined}
        data-mode={reading.mode}
        data-platform={ctx.platform}
        data-testid="adaptive-board"
        initial={reduce ? false : 'hidden'}
        variants={GRID}
      >
        {reading.board.map((slot, index) => {
          const Module = BOARD_MODULES[slot.module];
          const testId = `board-module-${slot.module}`;
          return (
            <motion.div
              className={cn('flex min-w-0', BOARD_SIZE_CLASS[slot.size])}
              data-board-index={index}
              data-board-slot={slot.module}
              key={slot.module}
              layout={reduce ? false : 'position'}
              layoutId={reduce ? undefined : `board-slot-${slot.module}`}
              variants={SLOT}
            >
              {loading ? (
                <ModuleFrameSkeleton size={slot.size} testId={testId} />
              ) : (
                <ModuleBoundary slot={slot} title={BOARD_MODULE_TITLES[slot.module]}>
                  <Suspense fallback={<ModuleFrameSkeleton size={slot.size} testId={testId} />}>
                    <Module ctx={ctx} slot={slot} />
                  </Suspense>
                </ModuleBoundary>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
