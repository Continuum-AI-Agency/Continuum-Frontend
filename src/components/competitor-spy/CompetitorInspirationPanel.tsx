'use client';

import { useTranslations } from 'next-intl';

import { InspirationBrowser } from '@/components/competitors/InspirationBrowser';

// Competitor inspiration inside the Library: organic Instagram posts and paid ad
// creatives, sorted by source, synced on demand (server-side IG unwrap + cache),
// and saved/frozen to boards. The shared InspirationBrowser carries the source
// toggle, health-aware competitor rail, Sync, and Save wiring.
export function CompetitorInspirationPanel({ brandId }: { brandId: string }) {
  const uiText = useTranslations('competitor');
  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="min-w-0">
        <h1 className="text-base font-semibold">{uiText('inspiration_de74ac7')}</h1>
        <p className="text-xs text-muted-foreground">
          {uiText('competitor_posts_and_ads_sort_by_how_far_a_po_bdfc96a')}
        </p>
      </div>
      <InspirationBrowser brandId={brandId} defaultSource="all" showRail showSync />
    </div>
  );
}
