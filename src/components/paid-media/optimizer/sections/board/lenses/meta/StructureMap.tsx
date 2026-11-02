'use client';

// M15 Structure: campaign, ad set and ad, with the portfolios on top.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function StructureMap({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-structure"
      title="Account structure"
    >
      <p className="text-muted-foreground text-xs">Account structure</p>
    </ModuleFrame>
  );
}
