'use client';

import { useTranslations } from 'next-intl';

// The combined "All" view: organic Instagram posts and paid ad snapshots in one
// recency-ordered grid. Each item renders with its existing surface — the paid
// AdSnapshotCard or the organic hover tile — and carries a Save-to-board action
// for its kind, so the toggle's per-source affordances are preserved in the mix.
// A source pill marks each card since the two are interleaved.

import type { ReactNode } from 'react';

import { AdSnapshotCard } from '@/components/competitor-spy/AdSnapshotCard';
import { SaveToBoardButton } from '@/components/competitor-spy/SaveToBoardButton';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CompetitorPostHoverTile } from './CompetitorPostHoverTile';
import type { InspirationFeedItem } from './inspirationFeed';

const DEFAULT_GRID_CLASS =
  'grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
const SKELETON_COUNT = 10;

function SourcePill({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
      {label}
    </span>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <SourcePill label={label} />
      {children}
    </div>
  );
}

export function InspirationFeedGrid({
  brandId,
  items,
  isLoading,
  isError,
  gridClassName = DEFAULT_GRID_CLASS,
}: {
  brandId: string;
  items: InspirationFeedItem[];
  isLoading?: boolean;
  isError?: boolean;
  gridClassName?: string;
}) {
  const uiText = useTranslations('competitor');
  if (isLoading) {
    return (
      <div className={cn(gridClassName)}>
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {uiText('inspiration_is_unavailable_right_now_5ddb3b0')}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {uiText('no_inspiration_yet_tag_competitors_and_run_a__5b23ece')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn(gridClassName)}>
      {items.map((item) =>
        item.source === 'paid' ? (
          <Cell key={item.key} label={uiText('paid_fb81b96')}>
            <AdSnapshotCard entry={item.entry} brandId={brandId} />
          </Cell>
        ) : (
          <Cell key={item.key} label={uiText('organic_89b8cb6')}>
            <CompetitorPostHoverTile
              brandId={brandId}
              view={item.view}
              actions={
                item.view.competitorId ? (
                  <SaveToBoardButton
                    brandId={brandId}
                    request={{
                      kind: 'organic',
                      competitorId: item.view.competitorId,
                      competitorName: item.view.competitorName,
                      instagramUsername: item.view.instagramUsername,
                      post: item.view.post,
                    }}
                  />
                ) : null
              }
            />
          </Cell>
        ),
      )}
    </div>
  );
}
