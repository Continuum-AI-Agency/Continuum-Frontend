'use client';

// Right pane of the SuggestionExplorer: every ad creative inside ONE selected ad
// set, laid out as a true CSS-columns masonry so each creative keeps its native
// aspect (vertical 9:16 posters, squares, landscape all flow). Each tile carries a
// per-creative metric line (spend · CPM, both always derivable from the ad-level
// daily read) and reveals the full analytics — angle, hook, confidence, spend
// sparkline, last CPA — through the shared CreativeHoverCard on hover.
//
// A tile shows the creative as it actually is: a carousel pages through its slides,
// a video plays on hover when Meta granted us a source, and clicking opens the whole
// thing full-size. That depends entirely on the media the edge resolves — see
// supabase/functions/paid-media-metrics/meta/adset-creatives.ts for why the ad's own
// `thumbnailUrl` (Meta's 64x64) can never be the thing rendered at this size.
//
// The three reads are lazy (keyed by adsetId), so only the selected ad set's ads
// are ever fetched — the same discipline that keeps the drill-in cheap on an
// account with dozens of ad sets. One recovery hook heals every tile's expired
// Meta CDN URL for the whole gallery.

import type { AdDailyTrend, AdsetAd } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import { type ChatMedia, mediaListFromAdsetAd } from '@/components/chat/media/media';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { CreativeHoverCard } from '../charts/CreativeHoverCard';
import { formatCpa, formatCurrency, humanize } from '../format';
import {
  useOptimizerAdAngles,
  useOptimizerAdDailyTrends,
  useOptimizerAdsetAds,
} from '../useOptimizerData';

// Static loading placeholders — mixed aspects hint the masonry that resolves.
const SKELETON_TILES = [
  { id: 'sk-a', ratio: '4 / 5' },
  { id: 'sk-b', ratio: '1 / 1' },
  { id: 'sk-c', ratio: '3 / 4' },
  { id: 'sk-d', ratio: '1 / 1' },
  { id: 'sk-e', ratio: '4 / 5' },
  { id: 'sk-f', ratio: '3 / 4' },
];

type AdsetCreativeMosaicProps = {
  brandId: string;
  accountId: string | null;
  adsetId: string | null;
  currency?: string | null;
};

/** Spend and CPM for one ad, summed across its daily series. CPM is the one cost
 *  that is always honestly derivable from ad-level impressions — objective-specific
 *  costs (CPL, cost-per-conversation) are not in the ad trend, so the tile shows
 *  CPM and leaves the objective cost to the ad-set row on the left. */
function aggregate(trend: AdDailyTrend | null | undefined): { spend: number; cpm: number | null } {
  const series = trend?.series ?? [];
  const spend = series.reduce((sum, point) => sum + point.spend, 0);
  const impressions = series.reduce((sum, point) => sum + point.impressions, 0);
  return { spend, cpm: impressions > 0 ? (spend / impressions) * 1000 : null };
}

/** Lightbox items for one ad's media, in slide order. */
function toLightboxItems(media: ChatMedia[]): LightboxItem[] {
  return media.map((item) => ({
    url: item.url,
    caption: item.caption ?? item.name ?? '',
    isVideo: item.kind === 'video',
  }));
}

export function AdsetCreativeMosaic({
  brandId,
  accountId,
  adsetId,
  currency,
}: AdsetCreativeMosaicProps) {
  const adsQuery = useOptimizerAdsetAds(brandId, accountId, adsetId);
  const trendsQuery = useOptimizerAdDailyTrends(brandId, accountId, adsetId);
  const anglesQuery = useOptimizerAdAngles(brandId, accountId, adsetId);
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId: accountId });

  // Natural aspect per ad, learned as each image paints — what turns a uniform grid
  // into a real masonry. Portrait-ish default keeps layout shift small before load.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  // Which ad is open full-size, and on which of its slides.
  const [opened, setOpened] = useState<{ ad: AdsetAd; index: number } | null>(null);

  const angleByAd = useMemo(
    () => new Map(anglesQuery.data.map((angle) => [angle.ad_id, angle])),
    [anglesQuery.data],
  );
  const trendByAd = useMemo(
    () => new Map(trendsQuery.data.map((trend) => [trend.ad_id, trend])),
    [trendsQuery.data],
  );

  if (!adsetId) {
    return (
      <div className="grid h-full min-h-0 place-items-center rounded-md border border-border/60 border-dashed">
        <p className="text-2xs text-muted-foreground">Select an ad set to see its creatives.</p>
      </div>
    );
  }

  if (adsQuery.isLoading) {
    return (
      <div className="columns-2 gap-3 md:columns-3">
        {SKELETON_TILES.map((tile) => (
          <Skeleton
            className="mb-3 w-full rounded-md"
            key={tile.id}
            style={{ aspectRatio: tile.ratio }}
          />
        ))}
      </div>
    );
  }

  if (adsQuery.isError) {
    return (
      <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-6 text-center text-2xs text-warning">
        Couldn&rsquo;t load the ads in this ad set.
      </p>
    );
  }

  if (adsQuery.data.length === 0) {
    return (
      <p className="rounded-md border border-border/60 px-3 py-6 text-center text-2xs text-muted-foreground">
        No ads in this ad set.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="columns-2 gap-3 md:columns-3">
        {adsQuery.data.map((ad) => {
          const label = ad.name || ad.id;
          const angle = angleByAd.get(ad.id) ?? null;
          const trend = trendByAd.get(ad.id) ?? null;
          const { spend, cpm } = aggregate(trend);
          const media = mediaListFromAdsetAd(ad, freshUrlById[ad.id]);

          return (
            <CreativeHoverCard
              accountId={accountId}
              ad={ad}
              angle={angle}
              brandId={brandId}
              currency={currency}
              key={ad.id}
              posterUrl={ad.creative?.posterUrl ?? ad.creative?.imageUrl ?? null}
              trend={trend}
            >
              <div className="mb-3 break-inside-avoid overflow-hidden rounded-md border border-border/60 bg-card transition-colors hover:border-border">
                {media.length > 0 ? (
                  <span
                    className="relative block w-full overflow-hidden bg-muted"
                    style={{ aspectRatio: ratios[ad.id] ?? 0.8 }}
                  >
                    <ChatMediaCarousel
                      fallbackSeed={label}
                      hoverPlay
                      items={media}
                      onLoadDimensions={({ width, height }) => {
                        if (width > 0 && height > 0) {
                          setRatios((prev) =>
                            prev[ad.id] ? prev : { ...prev, [ad.id]: width / height },
                          );
                        }
                      }}
                      onOpen={(index) => setOpened({ ad, index })}
                      onRecoverItem={() => recover(ad.id)}
                    />
                  </span>
                ) : (
                  <span
                    className="grid w-full place-items-center bg-muted text-3xs text-muted-foreground"
                    style={{ aspectRatio: '4 / 5' }}
                    aria-hidden="true"
                  >
                    AD
                  </span>
                )}
                <div className="space-y-1 p-2">
                  <p className="truncate text-2xs text-foreground" title={label}>
                    {label}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xs tabular-nums text-muted-foreground">
                      {formatCurrency(spend, currency)}
                      {cpm != null ? ` · CPM ${formatCpa(cpm, currency)}` : ''}
                    </span>
                    {angle ? (
                      <Badge className="shrink-0 text-3xs" variant="secondary">
                        {humanize(angle.angle)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </CreativeHoverCard>
          );
        })}
      </div>
      {trendsQuery.data.length === 0 ? (
        <p className="px-1 pt-1 text-3xs text-muted-foreground">
          Per-creative spend appears once daily metrics load — hover a creative for its angle and
          trend.
        </p>
      ) : null}
      {opened ? (
        <MediaLightbox
          index={opened.index}
          items={toLightboxItems(mediaListFromAdsetAd(opened.ad, freshUrlById[opened.ad.id]))}
          onIndexChange={(index) => setOpened({ ad: opened.ad, index })}
          onOpenChange={(open) => {
            if (!open) setOpened(null);
          }}
          open
          title={opened.ad.name || opened.ad.id}
        />
      ) : null}
    </div>
  );
}
