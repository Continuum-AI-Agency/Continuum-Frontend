'use client';

// A creative recommendation, as a creative decision reads: the creative on the left, the
// argument in the middle (angle, audience, the numbers that raised it), and on the right
// the flash creatives Creative+ makes from it — or the empty slots where they will land.
// The image is resolved live from the ad set's ads (the stored poster URL is a signed Meta
// CDN link that expires), so the card shows the creative as it is today.

import type { AdsetAd, CreativeSwapJobRow, RecommendationRow } from '@continuum/contracts';
import { readFlashJobResult } from '@continuum/contracts';
import { ImageOffIcon, Loader2Icon, PencilIcon, SparklesIcon, UploadIcon } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import {
  adImageUrl,
  angleWords,
  audienceWords,
  creativeCardCopy,
  flashCreativesFor,
  SWAP_STATUS_LABEL,
  subjectAds,
} from './creativeCardModel';
import type { ImplementTarget } from './flashCreativesModel';
import { evidenceLine, impactLabel } from './recQueueModel';

type CreativeRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  ads: readonly AdsetAd[];
  adsLoading: boolean;
  audienceType: string | null | undefined;
  jobs: readonly CreativeSwapJobRow[];
  currency: string | null;
  brandId: string;
  /** Ask Creative+ for variants of this recommendation. Null when the row cannot seed one. */
  onGenerate: (() => void) | null;
  generating: boolean;
  /** Why generation is not possible right now (no workflow fits, request failed). */
  generateNote: string | null;
  /** Where a finished variant can be implemented: this ad set first, then the same audience. */
  targets: readonly ImplementTarget[];
  onImplement: (job: CreativeSwapJobRow, assetId: string, target: ImplementTarget) => void;
  implementingKey: string | null;
};

const FLASH_SLOTS = 3;

type FlashSlot = {
  key: string;
  job: CreativeSwapJobRow;
  assetId: string | null;
  roomId: string | null;
};

/** One slot per generated variant; a job still running (or failed) holds one slot alone. */
function flashSlots(jobs: readonly CreativeSwapJobRow[]): FlashSlot[] {
  const slots: FlashSlot[] = [];
  for (const job of jobs) {
    const result = readFlashJobResult(job);
    if (result.assetIds.length === 0) {
      slots.push({ key: job.id, job, assetId: null, roomId: result.roomId });
      continue;
    }
    for (const assetId of result.assetIds) {
      slots.push({ key: `${job.id}:${assetId}`, job, assetId, roomId: result.roomId });
    }
  }
  return slots;
}

function failureText(job: CreativeSwapJobRow): string | null {
  const error = job.error ?? null;
  if (!error) return null;
  const message = error.message ?? error.error ?? error.reason;
  return typeof message === 'string' && message ? message : null;
}

const RELATION_LABEL: Record<ImplementTarget['relation'], string> = {
  here: 'This ad set',
  same_audience: 'Same audience',
  other: 'Other ad sets',
};

function ImplementMenu({
  slot,
  targets,
  onImplement,
  busy,
}: {
  slot: FlashSlot & { assetId: string };
  targets: readonly ImplementTarget[];
  onImplement: (job: CreativeSwapJobRow, assetId: string, target: ImplementTarget) => void;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const groups = (['here', 'same_audience', 'other'] as const)
    .map((relation) => ({ relation, items: targets.filter((t) => t.relation === relation) }))
    .filter((group) => group.items.length > 0);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className="h-6 px-1.5 text-3xs" disabled={busy} size="sm" variant="default">
            {busy ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <UploadIcon className="size-3" />
            )}
            Implement
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2 text-2xs">
        <p className="mb-1.5 text-muted-foreground">
          The new ad is created paused, beside the ad set's current ad. Nothing existing changes.
        </p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.relation}>
              <p className="mb-0.5 text-3xs text-muted-foreground uppercase tracking-wide">
                {RELATION_LABEL[group.relation]}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((target) => (
                  <li key={target.adsetId}>
                    <button
                      className="w-full truncate rounded px-1.5 py-1 text-left hover:bg-muted"
                      onClick={() => {
                        setOpen(false);
                        onImplement(slot.job, slot.assetId, target);
                      }}
                      title={target.name}
                      type="button"
                    >
                      {target.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CreativeRecommendationCard({
  rec,
  adsetName,
  ads,
  adsLoading,
  audienceType,
  jobs,
  currency,
  brandId,
  onGenerate,
  generating,
  generateNote,
  targets,
  onImplement,
  implementingKey,
}: CreativeRecommendationCardProps) {
  const copy = creativeCardCopy(rec);
  const subjects = subjectAds(rec, ads);
  const angle = angleWords(rec);
  const audience = audienceWords(rec, audienceType);
  const evidence = evidenceLine(rec.evidence, currency);
  const money = impactLabel(rec, currency);
  const slots = flashSlots(flashCreativesFor(rec, jobs));
  const signed = useSignedAssetUrls(
    brandId,
    slots.flatMap((slot) => (slot.assetId ? [slot.assetId] : [])),
  );
  const emptySlots = Math.max(0, FLASH_SLOTS - slots.length);

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
      </section>

      {/* Right — flash creatives */}
      <section className="space-y-1.5">
        <p className="flex items-center gap-1 text-3xs text-muted-foreground uppercase tracking-wide">
          <SparklesIcon className="size-3" /> Flash creatives
        </p>
        <ul className="grid grid-cols-3 gap-1.5">
          {slots.map((slot) => {
            const src = slot.assetId ? signed[slot.assetId] : undefined;
            const status = slot.job.status;
            const ready = status === 'generated' && slot.assetId !== null;
            const busy = implementingKey === slot.key;
            return (
              <li
                className="flex flex-col gap-1 rounded-md border border-border/70 bg-muted/20 p-1.5 text-3xs"
                data-testid="flash-slot"
                key={slot.key}
                title={slot.job.id}
              >
                {src ? (
                  // biome-ignore lint/performance/noImgElement: signed, expiring storage URL; next/image cannot proxy it.
                  <img
                    alt="Flash creative"
                    className="aspect-square w-full rounded object-cover"
                    loading="lazy"
                    src={src}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded border border-border/60 border-dashed">
                    {status === 'queued' || status === 'generating' || status === 'publishing' ? (
                      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageOffIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <Badge
                  className="w-fit text-3xs"
                  variant={
                    status === 'published'
                      ? 'success'
                      : status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {SWAP_STATUS_LABEL[status] ?? status}
                </Badge>
                {status === 'failed' && failureText(slot.job) ? (
                  <p className="line-clamp-2 text-destructive" title={failureText(slot.job) ?? ''}>
                    {failureText(slot.job)}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1">
                  {slot.roomId ? (
                    <a
                      className={cn(
                        buttonVariants({ variant: 'secondary', size: 'sm' }),
                        'h-6 px-1.5 text-3xs',
                      )}
                      href={`/ai-studio?roomId=${encodeURIComponent(slot.roomId)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <PencilIcon className="size-3" /> Edit
                    </a>
                  ) : null}
                  {ready ? (
                    <ImplementMenu
                      busy={busy}
                      onImplement={onImplement}
                      slot={slot as FlashSlot & { assetId: string }}
                      targets={targets}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
          {Array.from({ length: emptySlots }, (_, index) => (
            <li
              className="flex aspect-square items-center justify-center rounded-md border border-border/60 border-dashed text-3xs text-muted-foreground"
              key={`slot-${index}`}
            >
              slot {slots.length + index + 1}
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
        ) : null}
        {generateNote ? <p className="text-3xs text-muted-foreground">{generateNote}</p> : null}
      </section>
    </div>
  );
}
