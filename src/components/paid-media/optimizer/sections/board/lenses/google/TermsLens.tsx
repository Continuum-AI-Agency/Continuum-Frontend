'use client';

// G07 Terms: brand, competitor and wrong-intent spend in the search terms.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function TermsLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-terms"
      title="Search terms"
    >
      <p className="text-muted-foreground text-xs">Search terms</p>
    </ModuleFrame>
  );
}
