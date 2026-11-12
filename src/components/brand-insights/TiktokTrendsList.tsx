'use client';
import { useLocale, useTranslations } from 'next-intl';

// TikTok trends in the brand's markets, from TikTok's official Discovery API. Top videos
// come with no metrics (TikTok returns none), so they are shown as links, never scored.

import type { TiktokTrendingHashtag, TiktokTrendsResponse } from '@continuum/contracts';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTiktokTrends } from '@/lib/api/competitorSpy';
import { ApiError } from '@/lib/api/errors';

const VIDEO_ROWS = 10;

function RankChange({ value }: { value: string }) {
  const tUi = useTranslations('common');

  if (value === 'NEW')
    return <span className="text-xs text-emerald-600">{tUi('m_c2a6b03f19')}</span>;
  const delta = Number(value);
  if (!Number.isFinite(delta) || delta === 0) return null;
  // Read as places gained when positive; the tiktok trends bench checks this against
  // trending_history's daily ranks.
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={delta > 0 ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>
      <Icon className="inline h-3 w-3" aria-hidden />
      <span className="sr-only">{delta > 0 ? tUi('m_7c0a25c06e') : tUi('m_77346d0447')} </span>
      {Math.abs(delta)}
    </span>
  );
}

function HashtagRow({
  hashtag,
  showVideos,
}: {
  hashtag: TiktokTrendingHashtag;
  showVideos: boolean;
}) {
  const tUi = useTranslations('common');

  const compact = new Intl.NumberFormat(useLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const competitorVideos = hashtag.videos.filter((v) => v.isCompetitor);
  return (
    <li className="border-b px-3 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">#{hashtag.label}</p>
          <p className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
            {hashtag.byCountry.map((c) => (
              <span key={c.country}>
                #{c.rank} {c.country} <RankChange value={c.rankChange} />
              </span>
            ))}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="font-medium">
            {compact.format(hashtag.views)}
            {tUi('m_487a2574f2')}
          </p>
          <p className="text-muted-foreground">
            {compact.format(hashtag.posts)}
            {tUi('m_751313520f')}
          </p>
        </div>
      </div>
      {competitorVideos.length > 0 ? (
        <Badge variant="secondary" className="mt-1 text-xs">
          {tUi('m_d569145b3d')}{' '}
          {[...new Set(competitorVideos.map((v) => `@${v.authorHandle}`))].join(', ')}
        </Badge>
      ) : null}
      {showVideos && hashtag.videos.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {hashtag.videos.map((video) => (
            <li key={video.shareUrl} className="truncate text-xs">
              <a
                href={video.shareUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                {video.authorHandle ? `@${video.authorHandle}` : tUi('m_8d8894c9f4')}
                {video.caption ? ` — ${video.caption}` : ''}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Keywords({ keywords }: { keywords: TiktokTrendsResponse['keywords'] }) {
  const tUi = useTranslations('common');

  const trending = keywords.filter((k) => k.trending);
  const byQuery = new Map<string, string[]>();
  for (const k of keywords) {
    for (const q of k.queries) byQuery.set(q, [...(byQuery.get(q) ?? []), k.label]);
  }
  return (
    <div className="space-y-2 px-3 py-2">
      {trending.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {tUi('m_525b27e56f')}
          </p>
          <div className="flex flex-wrap gap-1">
            {trending.map((k) => (
              <Badge key={k.label} variant="outline" className="text-xs">
                {k.label}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {[...byQuery].map(([query, labels]) => (
        <div key={query}>
          <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
            {tUi('m_2b421ba632')}
            {query}
          </p>
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="outline" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TiktokTrendsList({ brandId, enabled }: { brandId?: string; enabled: boolean }) {
  const tUi = useTranslations('common');

  const { data, error, isLoading } = useTiktokTrends(brandId, enabled);

  if (isLoading) {
    return (
      <div className="space-y-1.5 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`tiktok-row-${i}`} className="h-9 w-full rounded-md bg-muted/70" />
        ))}
      </div>
    );
  }
  if (error) {
    const notConfigured = error instanceof ApiError && error.status === 503;
    return (
      <p className="text-muted-foreground px-3 py-4 text-sm">
        {notConfigured ? tUi('m_3134fe0cb7') : tUi('m_9bce787b2c')}
      </p>
    );
  }
  if (!data || (data.hashtags.length === 0 && data.keywords.length === 0)) {
    return <p className="text-muted-foreground px-3 py-4 text-sm">{tUi('m_fbb302dc69')}</p>;
  }

  return (
    <div className="rounded-lg border">
      {data.keywords.length > 0 ? <Keywords keywords={data.keywords} /> : null}
      {data.hashtags.length > 0 ? (
        <ul className={data.keywords.length > 0 ? 'border-t' : undefined}>
          {data.hashtags.map((hashtag, i) => (
            <HashtagRow key={hashtag.label} hashtag={hashtag} showVideos={i < VIDEO_ROWS} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
