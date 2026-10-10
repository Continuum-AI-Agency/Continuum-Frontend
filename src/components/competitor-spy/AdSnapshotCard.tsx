'use client';

import type { TimelineEntry } from '@continuum/contracts';
import { useState } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromCompetitorAdSnapshot } from '@/components/chat/media/media';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreativeUrl } from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import { SaveToBoardButton } from './SaveToBoardButton';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCompactList(values: string[]): string {
  if (values.length === 0) return '';
  const visible = values.slice(0, 2).join(', ');
  return values.length > 2 ? `${visible} +${values.length - 2}` : visible;
}

function daysActive(firstSeenAt: string, lastSeenAt: string): number {
  const start = new Date(firstSeenAt).getTime();
  const end = new Date(lastSeenAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="text-2xs capitalize text-foreground/80">
      {children}
    </Badge>
  );
}

export function AdSnapshotCard({
  entry,
  inspiration = false,
  brandId,
}: {
  entry: TimelineEntry;
  inspiration?: boolean;
  brandId?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasMedia = entry.hasCreativeMedia ?? false;
  const { data: creativeUrl, refetch: refetchCreativeUrl } = useCreativeUrl(
    entry.snapshotId,
    hasMedia,
  );
  // Persisted competitor creatives can be MP4s — the adapter resolves kind from
  // the signed URL's extension, so video snapshots render as real video.
  const media = mediaFromCompetitorAdSnapshot(entry, creativeUrl ?? null);
  const analysis = entry.analysis ?? null;
  const metadata = entry.publicMetadata;
  const platformLabel = formatCompactList(metadata?.platforms ?? entry.platforms);
  const languageLabel = formatCompactList(metadata?.languages ?? []);

  return (
    <Card className="gap-0 overflow-hidden rounded-lg border-border py-0 shadow-sm">
      <div className="relative aspect-[4/5] w-full bg-muted">
        {media ? (
          <ChatMediaThumb
            media={media}
            className="rounded-none"
            fallbackSeed={entry.competitorName}
            onRecover={() => void refetchCreativeUrl()}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {hasMedia ? 'Loading…' : 'No creative'}
          </div>
        )}
        <button
          type="button"
          aria-label={`View full ad details for ${entry.competitorName}`}
          onClick={() => setDetailsOpen(true)}
          className="absolute inset-0 rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <Badge
          variant={entry.status === 'active' ? 'success' : 'secondary'}
          className="absolute left-2 top-2 text-2xs capitalize shadow-sm"
        >
          {entry.status}
        </Badge>
        {inspiration ? (
          <Badge className="absolute right-2 top-2 bg-black/55 text-2xs text-white backdrop-blur-sm">
            Inspiration
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{entry.competitorName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {daysActive(entry.firstSeenAt, entry.lastSeenAt)}d
          </span>
        </div>

        {entry.body ? (
          <p className="line-clamp-3 text-xs text-muted-foreground">{entry.body}</p>
        ) : null}

        <div className="grid gap-1 border-t border-border/70 pt-2 text-2xs text-muted-foreground">
          {metadata?.creationTime ? <span>Created {formatDate(metadata.creationTime)}</span> : null}
          <span>First seen {formatDate(entry.firstSeenAt)}</span>
          {metadata?.deliveryStart ? (
            <span>
              Delivery {formatDate(metadata.deliveryStart)}
              {metadata.deliveryStop ? ` to ${formatDate(metadata.deliveryStop)}` : ''}
            </span>
          ) : null}
          {platformLabel ? <span>Platforms {platformLabel}</span> : null}
          {languageLabel ? <span>Languages {languageLabel}</span> : null}
        </div>

        {analysis ? (
          <div className="flex flex-wrap gap-1">
            {analysis.sentiment ? <Pill>{analysis.sentiment}</Pill> : null}
            {analysis.hookArchetype ? (
              <Pill>{analysis.hookArchetype.replace(/_/g, ' ')}</Pill>
            ) : null}
            {analysis.primaryTheme ? <Pill>{analysis.primaryTheme}</Pill> : null}
          </div>
        ) : entry.analysisStatus && entry.analysisStatus !== 'done' ? (
          <span className="text-2xs text-muted-foreground">analysis {entry.analysisStatus}</span>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span className="truncate">{metadata?.pageName ?? entry.competitorName}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {brandId ? (
              <SaveToBoardButton
                brandId={brandId}
                request={{ kind: 'paid', snapshotId: entry.snapshotId }}
              />
            ) : null}
            {entry.snapshotUrl ? (
              <a
                href={entry.snapshotUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: 'link', size: 'xs' }),
                  'h-auto p-0 text-xs',
                )}
              >
                View on Meta
              </a>
            ) : null}
          </div>
        </div>
      </CardContent>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="gap-4 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{metadata?.pageName ?? entry.competitorName}</DialogTitle>
            <DialogDescription>
              {platformLabel ? `Platforms: ${platformLabel}` : 'Competitor ad'}
              {entry.cta ? ` · Call to action: ${entry.cta}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {media?.kind === 'video' ? (
                <video
                  src={media.url}
                  poster={media.thumbnailUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${entry.competitorName} ad video`}
                  className="max-h-[65vh] w-full object-contain"
                >
                  <track kind="captions" />
                </video>
              ) : media?.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed competitor creative URL
                <img
                  src={media.url}
                  alt={`${entry.competitorName} ad creative`}
                  className="max-h-[65vh] w-full object-contain"
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">No creative media available.</p>
              )}
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto">
              {entry.body ? (
                <section aria-labelledby={`ad-copy-${entry.snapshotId}`}>
                  <h3 id={`ad-copy-${entry.snapshotId}`} className="mb-1 text-xs font-semibold">
                    Full ad copy
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">No ad copy was captured.</p>
              )}
              <dl className="grid gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <div>First seen {formatDate(entry.firstSeenAt)}</div>
                <div>Last seen {formatDate(entry.lastSeenAt)}</div>
                {languageLabel ? <div>Languages {languageLabel}</div> : null}
                {metadata?.deliveryStart ? (
                  <div>
                    Delivery {formatDate(metadata.deliveryStart)}
                    {metadata.deliveryStop ? ` to ${formatDate(metadata.deliveryStop)}` : ''}
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
          <DialogFooter className="flex-row flex-wrap justify-end gap-2 sm:justify-end">
            {brandId ? (
              <SaveToBoardButton
                brandId={brandId}
                request={{ kind: 'paid', snapshotId: entry.snapshotId }}
              />
            ) : null}
            {entry.snapshotUrl ? (
              <a
                href={entry.snapshotUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                View on Meta
              </a>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
