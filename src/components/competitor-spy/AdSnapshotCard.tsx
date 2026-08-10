'use client';

import type { TimelineEntry } from '@continuum/contracts';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromCompetitorAdSnapshot } from '@/components/chat/media/media';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    </Card>
  );
}
