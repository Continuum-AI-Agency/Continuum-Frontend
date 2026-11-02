'use client';

// O04 Portfolio lanes: each portfolio against its goal.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../ModuleFrame';
import type { BoardModuleProps } from '../types';

export default function PortfolioLanes({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-portfolios"
      title="Portfolios"
    >
      <p className="text-muted-foreground text-xs">Portfolios</p>
    </ModuleFrame>
  );
}
