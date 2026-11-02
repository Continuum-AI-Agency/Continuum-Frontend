'use client';

// G09 PMax: Performance Max against its goal, its asset groups and channels.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function PmaxLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-pmax"
      title="Performance Max"
    >
      <p className="text-muted-foreground text-xs">Performance Max</p>
    </ModuleFrame>
  );
}
