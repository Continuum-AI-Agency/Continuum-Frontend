import type { FitViewOptions } from '@xyflow/react';

// Every fitView in the studio must clear the overlay chrome pinned over the
// canvas: the composer bar and the Team chat panel sit along the bottom edge, so
// a flat, all-sides padding frames nodes right behind them. Reserve extra bottom
// room (roughly the composer + chat footprint) on every fit so a "Fit view",
// starter-apply, or tour-seed frame never leaves the bottom row of nodes hidden.
export const STUDIO_FIT_VIEW_OPTIONS: FitViewOptions = {
  padding: { top: '32px', right: '32px', bottom: '160px', left: '32px' },
};
