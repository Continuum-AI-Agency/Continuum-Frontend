'use client';

// G06 Auction: impressions lost to budget and to rank, or the days without ads.
// Placeholder that holds the slot until the module is built.
import { ModuleFrame } from '../../ModuleFrame';
import type { BoardModuleProps } from '../../types';

export default function AuctionLens({ slot }: BoardModuleProps) {
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId="board-module-auction"
      title="Impression share"
    >
      <p className="text-muted-foreground text-xs">Impression share</p>
    </ModuleFrame>
  );
}
