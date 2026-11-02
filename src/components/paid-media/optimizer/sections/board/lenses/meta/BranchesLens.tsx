'use client';

// Meta twin of G05: each branch (campaign) by share of spend against share of results.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function BranchesLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-branches"
      title="Branches"
    >
      <p className="text-muted-foreground text-xs">Branches</p>
    </ModuleFrame>
  );
}
