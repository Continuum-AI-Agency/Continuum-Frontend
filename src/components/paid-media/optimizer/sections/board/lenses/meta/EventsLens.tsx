'use client';

// Meta twin of G10: the event each portfolio optimizes for and what it is worth.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function EventsLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-events"
      title="Optimization events"
    >
      <p className="text-muted-foreground text-xs">Optimization events</p>
    </ModuleFrame>
  );
}
