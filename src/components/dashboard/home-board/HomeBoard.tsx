'use client';

// The adaptive Home (H01): how Continuum works the brand (the mode and its reason), the Ask bar,
// then the board's five to seven tiles, each at its size, on a 1 / 2 / 4 column grid. The order is
// the board's (goal impact × urgency × confidence) unless the person sorts by urgency or module;
// a pinned tile stays first. A tile still downloading holds its own footprint; one that throws is
// drawn as its frame saying so, and the rest of the Home stands.
//
// Motion: the tiles come in with a short stagger and slide to their new place when the order
// changes (a shared layout, FLIP). Both are off under reduced motion.

import { arrangeHomeTiles, type HomeBoardSort, type HomeTileId } from '@continuum/contracts';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ModuleFrameSkeleton } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { boardPaletteClass } from '@/components/paid-media/optimizer/sections/board/palette';
import { BOARD_SIZE_CLASS } from '@/components/paid-media/optimizer/sections/board/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { HomeBoardChromeContext } from './HomeBoardChrome';
import { HomeTileBoundary } from './HomeTileBoundary';
import { HOME_TILES } from './registry';
import type { HomeBoardContext } from './types';
import { usePinnedTiles } from './usePinnedTiles';

const AskBar = lazy(() => import('./modules/ask/AskBar'));
const StoryButton = lazy(() => import('./modules/story/StoryButton'));

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const GRID: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.05 } } };
const SLOT: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const HOME_BOARD_GRID =
  'grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4';

const SORTS: { id: HomeBoardSort; label: string }[] = [
  { id: 'impact', label: 'Goal impact' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'module', label: 'Module' },
];

export function HomeBoard({ ctx }: { ctx: HomeBoardContext }) {
  const reduce = useReducedMotion();
  const [sort, setSort] = useState<HomeBoardSort>('impact');
  const { pins, togglePin } = usePinnedTiles(ctx.userId, ctx.brandId);
  const pinned = useMemo(() => new Set<HomeTileId>(pins), [pins]);
  const tiles = useMemo(
    () => arrangeHomeTiles(ctx.board.tiles, sort, pinned),
    [ctx.board.tiles, sort, pinned],
  );
  const chrome = useMemo(
    () => ({ isPinned: (id: HomeTileId) => pinned.has(id), togglePin }),
    [pinned, togglePin],
  );

  return (
    <section
      aria-label="Home"
      className={cn('space-y-3 px-[var(--card-pad)] py-4', boardPaletteClass)}
      data-testid="home-board-root"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs"
              data-testid="home-board-mode"
            >
              {ctx.reading.modeLabel}
            </span>
            <span className="text-muted-foreground text-xs">{ctx.reading.modeReason}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Suspense fallback={null}>
            <StoryButton ctx={ctx} />
          </Suspense>
          <Tabs onValueChange={(value) => setSort(value as HomeBoardSort)} value={sort}>
            <TabsList aria-label="Order tiles by">
              {SORTS.map((option) => (
                <TabsTrigger className="text-xs" key={option.id} value={option.id}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>
      <Suspense fallback={null}>
        <AskBar ctx={ctx} />
      </Suspense>
      <HomeBoardChromeContext.Provider value={chrome}>
        <motion.div
          animate="shown"
          className={HOME_BOARD_GRID}
          data-board-order={tiles.map((tile) => tile.id).join(',')}
          data-mode={ctx.board.mode}
          data-testid="home-board"
          initial={reduce ? false : 'hidden'}
          variants={GRID}
        >
          {tiles.map((tile, index) => {
            const Tile = HOME_TILES[tile.id];
            const testId = `home-tile-${tile.id}`;
            return (
              <motion.div
                className={cn('flex min-w-0', BOARD_SIZE_CLASS[tile.size])}
                data-board-index={index}
                data-board-slot={tile.id}
                key={tile.id}
                layout={reduce ? false : 'position'}
                layoutId={reduce ? undefined : `home-slot-${tile.id}`}
                variants={SLOT}
              >
                <HomeTileBoundary tile={tile}>
                  <Suspense fallback={<ModuleFrameSkeleton size={tile.size} testId={testId} />}>
                    <Tile ctx={ctx} tile={tile} />
                  </Suspense>
                </HomeTileBoundary>
              </motion.div>
            );
          })}
        </motion.div>
      </HomeBoardChromeContext.Provider>
      <p className="px-1 text-muted-foreground text-xs">
        Order = impact on the goal × urgency × confidence. A pinned tile stays at the top.
      </p>
    </section>
  );
}
