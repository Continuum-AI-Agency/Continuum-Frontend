'use client';

// A creative recommendation, as a creative decision reads: the creative on the left, the
// argument in the middle (angle, audience, the numbers that raised it), and on the right
// the flash creatives Creative+ makes from it — or the empty slots where they will land.
// The image is resolved live from the ad set's ads (the stored poster URL is a signed Meta
// CDN link that expires), so the card shows the creative as it is today.

import type { AdsetAd, CreativeSwapJobRow, RecommendationRow } from '@continuum/contracts';
import { ImageOffIcon, SparklesIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  adImageUrl,
  angleWords,
  audienceWords,
  creativeCardCopy,
  flashCreativesFor,
  SWAP_STATUS_LABEL,
  subjectAds,
} from './creativeCardModel';
import { evidenceLine, impactLabel } from './recQueueModel';

type CreativeRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  ads: readonly AdsetAd[];
  adsLoading: boolean;
  audienceType: string | null | undefined;
  jobs: readonly CreativeSwapJobRow[];
  currency: string | null;
  /** Ask Creative+ for variants of this recommendation. Null when the row cannot seed one. */
  onGenerate: (() => void) | null;
  generating: boolean;
};

const FLASH_SLOTS = 3;

export function CreativeRecommendationCard({
  rec,
  adsetName,
  ads,
  adsLoading,
  audienceType,
  jobs,
  currency,
  onGenerate,
  generating,
}: CreativeRecommendationCardProps) {
  const copy = creativeCardCopy(rec);
  const subjects = subjectAds(rec, ads);
  const angle = angleWords(rec);
  const audience = audienceWords(rec, audienceType);
  const evidence = evidenceLine(rec.evidence, currency);
  const money = impactLabel(rec, currency);
  const flash = flashCreativesFor(rec, jobs);
  const emptySlots = Math.max(0, FLASH_SLOTS - flash.length);

  return (
    <div
      className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]"
      data-testid="creative-recommendation-card"
    >
      {/* Left — the creative in question */}
      <section className="space-y-1.5">
        <p className="text-3xs text-muted-foreground uppercase tracking-wide">
          {copy.because === 'winner' ? 'The winner' : 'Creative to renew'}
        </p>
        {adsLoading && subjects.length === 0 ? (
          <div className="h-32 w-full animate-pulse rounded-md bg-muted/40" />
        ) : subjects.length === 0 ? (
          <div className="flex h-32 items-center justify-center gap-2 rounded-md border border-border/60 border-dashed text-2xs text-muted-foreground">
            <ImageOffIcon className="size-4" /> No creative could be loaded for this ad set.
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {subjects.map((ad) => {
              const src = adImageUrl(ad);
              return (
                <li className="w-28" key={ad.id}>
                  {src ? (
                    // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
                    <img
                      alt={ad.name ?? ad.id}
                      className="h-28 w-28 rounded-md border border-border/60 object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={src}
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-md border border-border/60 border-dashed">
                      <ImageOffIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <p
                    className="mt-1 truncate text-2xs text-muted-foreground"
                    title={ad.name ?? ad.id}
                  >
                    {ad.name ?? ad.id}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Middle — the argument */}
      <section className="space-y-1.5 text-2xs">
        <p className="font-medium text-foreground text-xs">{copy.headline}</p>
        <dl className="space-y-1">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Angle</dt>
            <dd className="min-w-0 text-foreground">
              {angle ?? <span className="text-muted-foreground">not labelled yet</span>}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">Audience</dt>
            <dd className="min-w-0 text-foreground">
              {audience ?? adsetName ?? <span className="text-muted-foreground">this ad set</span>}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-muted-foreground">
              {copy.because === 'winner' ? 'Why it wins' : 'Why now'}
            </dt>
            <dd className="min-w-0 text-foreground tabular-nums">
              {evidence ?? rec.reason ?? '—'}
              {money ? <span className="text-muted-foreground"> · {money}</span> : null}
            </dd>
          </div>
        </dl>
        {evidence && rec.reason ? (
          <p className="text-muted-foreground" title={rec.reason}>
            {rec.reason}
          </p>
        ) : null}
      </section>

      {/* Right — flash creatives */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1 text-3xs text-muted-foreground uppercase tracking-wide">
          <SparklesIcon className="size-3" /> Flash creatives
        </p>
        <ul className="grid grid-cols-3 gap-1.5">
          {flash.map((job) => (
            <li
              className="flex h-20 flex-col justify-between rounded-md border border-border/70 bg-muted/20 p-1.5 text-3xs"
              key={job.id}
              title={job.id}
            >
              <Badge
                className="w-fit text-3xs"
                variant={
                  job.status === 'published'
                    ? 'success'
                    : job.status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {SWAP_STATUS_LABEL[job.status] ?? job.status}
              </Badge>
              <span className="truncate text-muted-foreground">
                {job.asset_id ? (
                  <a
                    className="text-primary hover:underline"
                    href={`/library?asset=${job.asset_id}`}
                  >
                    Open in Library
                  </a>
                ) : (
                  job.mode
                )}
              </span>
            </li>
          ))}
          {Array.from({ length: emptySlots }, (_, index) => (
            <li
              className="flex h-20 items-center justify-center rounded-md border border-border/60 border-dashed text-3xs text-muted-foreground"
              key={`slot-${index}`}
            >
              slot {flash.length + index + 1}
            </li>
          ))}
        </ul>
        {onGenerate ? (
          <Button
            disabled={generating}
            onClick={onGenerate}
            size="sm"
            type="button"
            variant="secondary"
          >
            {generating ? 'Requesting…' : 'Generate with Creative+'}
          </Button>
        ) : (
          <p className="text-3xs text-muted-foreground">
            Variants seed from a winning creative; this row has none yet.
          </p>
        )}
      </section>
    </div>
  );
}
