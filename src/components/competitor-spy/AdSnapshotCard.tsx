'use client';

import type { TimelineEntry } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
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
import { competitorStateLabel, localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useCreativeUrl } from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import { competitorLanguageLabel } from './brandVisuals';
import { SaveToBoardButton } from './SaveToBoardButton';

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const uiText = useTranslations('competitor');
  const uiLocale = useLocale();
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
  const languageLabel = formatCompactList(
    (metadata?.languages ?? []).map((code) => competitorLanguageLabel(code, uiLocale)),
  );

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
            {hasMedia ? uiText('loading_ba3bbbe') : uiText('no_creative_34a6e07')}
          </div>
        )}
        <button
          type="button"
          aria-label={uiText('m_b90ec015f4', { name: entry.competitorName })}
          onClick={() => setDetailsOpen(true)}
          className="absolute inset-0 rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
        <Badge
          variant={entry.status === 'active' ? 'success' : 'secondary'}
          className="absolute left-2 top-2 text-2xs capitalize shadow-sm"
        >
          {localizeCompetitorCopy(entry.status === 'active' ? 'Active' : 'Paused', uiText)}
        </Badge>
        {inspiration ? (
          <Badge className="absolute right-2 top-2 bg-black/55 text-2xs text-white backdrop-blur-sm">
            {uiText('inspiration_de74ac7')}
          </Badge>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{entry.competitorName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {uiText('sentence_7dfb8b37fac2', {
              count: daysActive(entry.firstSeenAt, entry.lastSeenAt),
            })}
          </span>
        </div>

        {entry.body ? (
          <p className="line-clamp-3 text-xs text-muted-foreground">{entry.body}</p>
        ) : null}

        <div className="grid gap-1 border-t border-border/70 pt-2 text-2xs text-muted-foreground">
          {metadata?.creationTime ? (
            <span>
              {uiText.rich('sentence_26f8d4972219', {
                v0: () => formatDate(metadata.creationTime, uiLocale),
              })}
            </span>
          ) : null}
          <span>
            {uiText.rich('sentence_cb995aca56db', {
              v0: () => formatDate(entry.firstSeenAt, uiLocale),
            })}
          </span>
          {metadata?.deliveryStart ? (
            <span>
              {uiText('m_0ef8c3f0a6', {
                start: formatDate(metadata.deliveryStart, uiLocale),
                range: metadata.deliveryStop ? 'closed' : 'open',
                end: formatDate(metadata.deliveryStop, uiLocale),
              })}
            </span>
          ) : null}
          {platformLabel ? (
            <span>{uiText.rich('sentence_54143f34062c', { v0: () => platformLabel })}</span>
          ) : null}
          {languageLabel ? (
            <span>{uiText.rich('sentence_c668a8e4e879', { v0: () => languageLabel })}</span>
          ) : null}
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
          <span className="text-2xs text-muted-foreground">
            {uiText.rich('sentence_4749b20add5d', {
              v0: () => competitorStateLabel(entry.analysisStatus ?? 'unknown', uiText),
            })}
          </span>
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
                {uiText('view_on_meta_8ad9797')}
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
              {platformLabel
                ? uiText('m_becdc9ec34', { platforms: platformLabel })
                : uiText('competitor_ad_3bbf525')}
              {entry.cta ? uiText('m_4a8f5e5adb', { action: entry.cta }) : ''}
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
                  aria-label={uiText('m_ed32498101', { name: entry.competitorName })}
                  className="max-h-[65vh] w-full object-contain"
                >
                  <track kind="captions" />
                </video>
              ) : media?.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed competitor creative URL
                <img
                  src={media.url}
                  alt={uiText('m_a4347d2395', { name: entry.competitorName })}
                  className="max-h-[65vh] w-full object-contain"
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  {uiText('no_creative_media_available_50d0550')}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto">
              {entry.body ? (
                <section aria-labelledby={`ad-copy-${entry.snapshotId}`}>
                  <h3 id={`ad-copy-${entry.snapshotId}`} className="mb-1 text-xs font-semibold">
                    {uiText('full_ad_copy_d9840c2')}
                  </h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {uiText('no_ad_copy_was_captured_3fc6c16')}
                </p>
              )}
              <dl className="grid gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <div>
                  {uiText.rich('sentence_cb995aca56db', {
                    v0: () => formatDate(entry.firstSeenAt, uiLocale),
                  })}
                </div>
                <div>
                  {uiText.rich('sentence_051241de960f', {
                    v0: () => formatDate(entry.lastSeenAt, uiLocale),
                  })}
                </div>
                {languageLabel ? (
                  <div>{uiText.rich('sentence_c668a8e4e879', { v0: () => languageLabel })}</div>
                ) : null}
                {metadata?.deliveryStart ? (
                  <div>
                    {uiText('m_0ef8c3f0a6', {
                      start: formatDate(metadata.deliveryStart, uiLocale),
                      range: metadata.deliveryStop ? 'closed' : 'open',
                      end: formatDate(metadata.deliveryStop, uiLocale),
                    })}
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
                {uiText('view_on_meta_8ad9797')}
              </a>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
