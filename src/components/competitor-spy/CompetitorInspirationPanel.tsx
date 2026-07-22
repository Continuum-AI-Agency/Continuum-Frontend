'use client';

import { InspirationBrowser } from '@/components/competitors/InspirationBrowser';

// Competitor inspiration inside the Library: organic Instagram posts and paid ad
// creatives, sorted by source, synced on demand (server-side IG unwrap + cache),
// and saved/frozen to boards. The shared InspirationBrowser carries the source
// toggle, health-aware competitor rail, Sync, and Save wiring.
export function CompetitorInspirationPanel({ brandId }: { brandId: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="min-w-0">
        <h1 className="text-base font-semibold">Inspiration</h1>
        <p className="text-xs text-muted-foreground">
          Competitor organic posts and paid ad creatives, indexed for ideas.
        </p>
      </div>
      <InspirationBrowser brandId={brandId} defaultSource="all" showRail showSync />
    </div>
  );
}
