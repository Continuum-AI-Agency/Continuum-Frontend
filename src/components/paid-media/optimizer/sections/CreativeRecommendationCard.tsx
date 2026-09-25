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
import { formatCpa } from '../format';
import { CreativeStandingBars } from './CreativeStandingBars';
import {
  adImageUrl,
  angleWords,
  audienceWords,
  creativeCardCopy,
  flashCreativesFor,
  type StandingChart,
  SWAP_STATUS_LABEL,
  subjectAds,
} from './creativeCardModel';
import type { ImplementTarget } from './flashCreativesModel';
import { evidenceLine, impactLabel, queueHeadlineLine } from './recQueueModel';

type CreativeRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  ads: readonly AdsetAd[];
  adsLoading: boolean;
  audienceType: string | null | undefined;
  jobs: readonly CreativeSwapJobRow[];
  currency: string | null;
  brandId: string;
  /** The ad set's creative ranking, when the snapshot carries one. */
  standing: StandingChart | null;
  /** The objective's result, lower-cased: "purchases", "conversations". */
  resultWord: string;
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

/** In-slot actions: a flash slot is a third of the column, so they stay a step under the card buttons. */
const SLOT_BUTTON = 'h-8 px-2 text-xs';

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
          <Button className={SLOT_BUTTON} disabled={busy} size="sm" variant="default">
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <UploadIcon className="size-3.5" />
            )}
            Implement
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-3 text-sm">
        <p className="mb-2 text-muted-foreground">
          The new ad is created paused, beside the ad set's current ad. Nothing existing changes.
        </p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.relation}>
              <p className="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
                {RELATION_LABEL[group.relation]}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((target) => (
                  <li key={target.adsetId}>
                    <button
                      className="w-full truncate rounded px-2 py-1.5 text-left hover:bg-muted"
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
  standing,
  resultWord,
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
  const evidence = queueHeadlineLine(rec, currency) ?? evidenceLine(rec.evidence, currency);
  const money = impactLabel(rec, currency);
  const slots = flashSlots(flashCreativesFor(rec, jobs));
  const signed = useSignedAssetUrls(
    brandId,
    slots.flatMap((slot) => (slot.assetId ? [slot.assetId] : [])),
  );
  const emptySlots = Math.max(0, FLASH_SLOTS - slots.length);

  const subjectBar = standing?.bars.find((bar) => bar.subject) ?? null;

  return (
    <div
      className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)_minmax(18rem,24rem)]"
      data-testid="creative-recommendation-card"
    >
      {/* Left — the creative in question */}
      <section className="space-y-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {copy.because === 'winner' ? 'The winner' : 'Creative to renew'}
        </p>
        {adsLoading && subjects.length === 0 ? (
          <div className="aspect-square w-full max-w-44 animate-pulse rounded-lg bg-muted/40" />
        ) : subjects.length === 0 ? (
          <div className="flex aspect-square w-full max-w-44 flex-col items-center justify-center gap-2 rounded-lg border border-border/60 border-dashed p-4 text-center text-muted-foreground text-sm">
            <ImageOffIcon className="size-4" /> No creative could be loaded for this ad set.
          </div>
        ) : (
          <ul className="space-y-2">
            {subjects.map((ad) => {
              const src = adImageUrl(ad);
              return (
                <li className="w-full max-w-44" key={ad.id}>
                  {src ? (
                    // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
                    <img
                      alt={ad.name ?? ad.id}
                      className="aspect-square w-full rounded-lg border border-border/60 object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={src}
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-border/60 border-dashed">
                      <ImageOffIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <p className="mt-2 truncate text-foreground text-sm" title={ad.name ?? ad.id}>
                    {ad.name ?? ad.id}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {subjectBar?.costPerEvent != null ? (
          <p className="text-muted-foreground text-sm">
            <span className="font-semibold text-foreground text-lg tabular-nums">
              {formatCpa(subjectBar.costPerEvent, currency)}
            </span>{' '}
            per {resultWord.replace(/s$/, '')} · {subjectBar.events} {resultWord}
          </p>
        ) : null}
      </section>

      {/* Middle — the argument */}
      <section className="space-y-4 text-sm md:border-border/50 md:border-l md:pl-6">
        <p className="font-medium text-base text-foreground">{copy.headline}</p>
        <dl className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground text-xs">Angle</dt>
            <dd className="min-w-0 text-foreground">
              {angle ?? <span className="text-muted-foreground">not labelled yet</span>}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground text-xs">Audience</dt>
            <dd className="min-w-0 text-foreground">
              {audience ?? adsetName ?? <span className="text-muted-foreground">this ad set</span>}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground text-xs">
              {copy.because === 'winner' ? 'Why it wins' : 'Why now'}
            </dt>
            <dd className="min-w-0 text-foreground tabular-nums">
              {evidence ?? rec.reason ?? '—'}
              {money ? <span className="text-muted-foreground"> · {money}</span> : null}
            </dd>
          </div>
        </dl>
        {standing ? (
          <CreativeStandingBars chart={standing} currency={currency} resultWord={resultWord} />
        ) : (
          <p className="text-muted-foreground text-xs">
            No creative comparison in the latest snapshot for this ad set.
          </p>
        )}
      </section>

      {/* Right — flash creatives */}
      <section className="space-y-3 md:border-border/50 md:border-l md:pl-6">
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
          <SparklesIcon className="size-3.5" /> Flash creatives
        </p>
        <ul className="grid grid-cols-3 gap-2">
          {slots.map((slot) => {
            const src = slot.assetId ? signed[slot.assetId] : undefined;
            const status = slot.job.status;
            const ready = status === 'generated' && slot.assetId !== null;
            const busy = implementingKey === slot.key;
            return (
              <li
                className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-2 text-xs"
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
                  className="w-fit text-xs"
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
                {slot.job.enqueued_via === 'autopilot' ? (
                  <span className="text-muted-foreground text-xs">by autopilot</span>
                ) : null}
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
                        SLOT_BUTTON,
                      )}
                      href={`/ai-studio?roomId=${encodeURIComponent(slot.roomId)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <PencilIcon className="size-3.5" /> Edit
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
          {Array.from({ length: emptySlots }, (_, index) => slots.length + index + 1).map(
            (slotNumber) => (
              <li
                className="flex aspect-square items-center justify-center rounded-lg border border-border/60 border-dashed text-muted-foreground text-xs"
                key={`slot-${slotNumber}`}
              >
                slot {slotNumber}
              </li>
            ),
          )}
        </ul>
        {onGenerate ? (
          <Button
            className="h-9 px-3 text-sm"
            disabled={generating}
            onClick={onGenerate}
            size="sm"
            type="button"
            variant="secondary"
          >
            {generating ? 'Requesting…' : 'Generate with Creative+'}
          </Button>
        ) : null}
        {generateNote ? <p className="text-muted-foreground text-xs">{generateNote}</p> : null}
      </section>
    </div>
  );
}
