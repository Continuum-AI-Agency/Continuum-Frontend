'use client';

// O03 Decisions: the cards waiting, with visual evidence and the button the mode allows.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../ModuleFrame';
import type { BoardModuleProps } from '../types';

export default function DecisionsStack({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-decisions"
      title="Decisions"
    >
      <p className="text-muted-foreground text-xs">Decisions</p>
    </ModuleFrame>
  );
}
