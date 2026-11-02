'use client';

// The adaptive board (O01): the reading's modules in its order, each at its size, on a
// 1 / 2 / 4 column grid. A module that is still downloading holds its own footprint.
import { Suspense } from 'react';
import { ModuleFrameSkeleton } from './ModuleFrame';
import { BOARD_MODULES } from './registry';
import type { BoardContext } from './types';

export function AdaptiveBoard({ ctx }: { ctx: BoardContext }) {
  return (
    <div
      className="grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
      data-mode={ctx.reading.mode}
      data-platform={ctx.platform}
      data-testid="adaptive-board"
    >
      {ctx.reading.board.map((slot) => {
        const Module = BOARD_MODULES[slot.module];
        const testId = `board-module-${slot.module}`;
        return (
          <Suspense
            fallback={<ModuleFrameSkeleton size={slot.size} testId={testId} />}
            key={slot.module}
          >
            <Module ctx={ctx} slot={slot} />
          </Suspense>
        );
      })}
    </div>
  );
}
