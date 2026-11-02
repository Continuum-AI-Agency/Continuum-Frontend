'use client';

// G05 Mix: spend against results by campaign type or agreed line.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function MixLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-mix"
      title="Campaign mix"
    >
      <p className="text-muted-foreground text-xs">Campaign mix</p>
    </ModuleFrame>
  );
}
