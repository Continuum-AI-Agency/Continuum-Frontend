'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// Where the board mounts on a platform tab (Meta, Google): the viewer's layout — the adaptive
// board, by default, or Today's Overview exactly as it renders, with only the switch above it.
// The account is read only while the board shows, so Today costs nothing it did not cost before.
// The switch's pill travels between the board's header and Today's bar (one LayoutGroup), and
// the board comes in with its stagger; under reduced motion both simply appear.

import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { JainaEntry } from '../jainaEntryModel';
import { AdaptiveBoard, BOARD_GRID } from './AdaptiveBoard';
import { BoardLayoutToggle } from './BoardLayoutToggle';
import { boardAskEntries, useBoardLayout } from './boardLayout';
import { ModuleFrameSkeleton } from './ModuleFrame';
import { boardPaletteClass } from './palette';
import { BOARD_SIZE_CLASS, type BoardContext } from './types';
import { useAdAccountReading } from './useAdAccountReading';

export type BoardBase = Omit<BoardContext, 'reading'>;

export type BoardSwitchProps = {
  base: BoardBase;
  /** The tab's own questions for Jaina, asked when the reading has none of its own. */
  asks: readonly JainaEntry[];
  /** Today's layout for this tab, rendered as it is. */
  today: ReactNode;
  /** The tab's portfolios are still being read: the board holds its skeletons. */
  pending?: boolean;
};

export function BoardSwitch({ base, asks, today, pending = false }: BoardSwitchProps) {
  const [layout, setLayout] = useBoardLayout();
  const toggle = <BoardLayoutToggle onChange={setLayout} value={layout} />;
  return (
    <LayoutGroup id="optimizer-overview-layout">
      {layout === 'adaptive' ? (
        <ReadingBoard asks={asks} base={base} pending={pending} toggle={toggle} />
      ) : (
        <>
          <div className="flex justify-end px-1" data-testid="board-today-bar">
            {toggle}
          </div>
          {today}
        </>
      )}
    </LayoutGroup>
  );
}

function ReadingBoard({
  base,
  asks,
  toggle,
  pending,
}: {
  base: BoardBase;
  asks: readonly JainaEntry[];
  toggle: ReactNode;
  pending: boolean;
}) {
  const reduce = useReducedMotion();
  const { reading, isLoading } = useAdAccountReading({
    brandId: base.brandId,
    platform: base.platform,
    adAccountId: base.adAccountId,
    portfolios: base.portfolios,
    currency: base.currency,
  });
  return (
    <motion.div
      animate={{ opacity: 1 }}
      data-layout="adaptive"
      data-testid="overview-board"
      initial={reduce ? false : { opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {reading && !pending ? (
        <AdaptiveBoard
          asks={boardAskEntries(reading.asks, asks)}
          ctx={{ ...base, reading }}
          loading={isLoading}
          toggle={toggle}
        />
      ) : (
        <BoardPlaceholder toggle={toggle} />
      )}
    </motion.div>
  );
}

/** The spine at its sizes while there is no reading yet, so the modules land where they wait. */
const SPINE = [
  { module: 'result', size: 'l' },
  { module: 'decisions', size: 'm' },
  { module: 'portfolios', size: 'w' },
] as const;

function BoardPlaceholder({ toggle }: { toggle: ReactNode }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <section
      aria-busy="true"
      aria-label={betaUiText('beta_c709c9d2ee69')}
      className={cn('space-y-3', boardPaletteClass)}
      data-testid="adaptive-board-root"
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="h-10 min-w-0 flex-[1_1_18rem] animate-pulse rounded-lg border bg-muted/40" />
        {toggle}
      </div>
      <div className={BOARD_GRID} data-loading="true" data-testid="adaptive-board">
        {SPINE.map((slot) => (
          <div className={cn('flex min-w-0', BOARD_SIZE_CLASS[slot.size])} key={slot.module}>
            <ModuleFrameSkeleton size={slot.size} testId={`board-module-${slot.module}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
