'use client';

// Meta twin of G06: CPM against cost per result, one point per campaign.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function HeadroomLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-headroom"
      title="Delivery headroom"
    >
      <p className="text-muted-foreground text-xs">Delivery headroom</p>
    </ModuleFrame>
  );
}
