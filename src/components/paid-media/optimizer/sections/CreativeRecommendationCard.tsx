'use client';

// A creative recommendation, as a creative decision reads: the creative on the left, the
// argument in the middle (angle, audience, the numbers that raised it), and on the right
// the flash creatives Creative+ makes from it — or the empty slots where they will land.
// The image is resolved live from the ad set's ads (the stored poster URL is a signed Meta
// CDN link that expires), so the card shows the creative as it is today.

import {
  type AdsetAd,
  type CreativeOutputManifest,
  type CreativeSwapJobRow,
  creativeGenerationReviewSchema,
  type RecommendationRow,
  readCreativeOutputManifests,
  readFlashJobResult,
} from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { ImageOffIcon, Loader2Icon, PencilIcon, SparklesIcon, UploadIcon } from 'lucide-react';
import * as React from 'react';
import { ElementsPanel } from '@/components/ai-studio/elements/ElementsPanel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { signLibraryAsset, useSignedAssetUrls } from '@/lib/ai-studio/elements';
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
  onImplement: (
    job: CreativeSwapJobRow,
    assetId: string,
    target: ImplementTarget,
    manifest: CreativeOutputManifest,
  ) => void;
  implementingKey: string | null;
  onRetry?: (job: CreativeSwapJobRow) => void;
};

const FLASH_SLOTS = 3;

type FlashSlot = {
  key: string;
  job: CreativeSwapJobRow;
  assetId: string | null;
  roomId: string | null;
  manifest: CreativeOutputManifest | null;
};

/** One slot per generated variant; a job still running (or failed) holds one slot alone. */
function flashSlots(jobs: readonly CreativeSwapJobRow[]): FlashSlot[] {
  const slots: FlashSlot[] = [];
  for (const job of jobs) {
    const result = readFlashJobResult(job);
    const manifests = readCreativeOutputManifests(job.result);
    if (manifests.length) {
      for (const manifest of manifests)
        slots.push({
          key: `${job.id}:${manifest.assets.map((ref) => ref.versionId).join(':')}`,
          job,
          assetId: manifest.assets[0]!.assetId,
          roomId: result.roomId,
          manifest,
        });
      continue;
    }
    if (result.assetIds.length === 0) {
      slots.push({ key: job.id, job, assetId: null, roomId: result.roomId, manifest: null });
      continue;
    }
    for (const assetId of result.assetIds) {
      slots.push({
        key: `${job.id}:${assetId}`,
        job,
        assetId,
        roomId: result.roomId,
        manifest: null,
      });
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
  slot: FlashSlot & { assetId: string; manifest: CreativeOutputManifest };
  targets: readonly ImplementTarget[];
  onImplement: (
    job: CreativeSwapJobRow,
    assetId: string,
    target: ImplementTarget,
    manifest: CreativeOutputManifest,
  ) => void;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(false);
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
            Approve creative
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2 text-2xs">
        <p className="mb-1.5 text-muted-foreground">
          The new ad is created paused, beside the ad set's current ad. Nothing existing changes.
        </p>
        <label className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />{' '}
          I reviewed{' '}
          {slot.manifest.format === 'carousel'
            ? `all ${slot.manifest.assets.length} cards`
            : 'the full creative'}
          .
        </label>
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
                      disabled={!reviewed}
                      onClick={() => {
                        setOpen(false);
                        onImplement(slot.job, slot.assetId, target, slot.manifest);
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
  onRetry,
}: CreativeRecommendationCardProps) {
  const [reviewElementId, setReviewElementId] = React.useState<string | null>(null);
  const copy = creativeCardCopy(rec);
  const subjects = subjectAds(rec, ads);
  const angle = angleWords(rec);
  const audience = audienceWords(rec, audienceType);
  const evidence = evidenceLine(rec.evidence, currency);
  const money = impactLabel(rec, currency);
  const slots = flashSlots(flashCreativesFor(rec, jobs));
  const signed = useSignedAssetUrls(
    brandId,
    slots.flatMap((slot) => (!slot.manifest && slot.assetId ? [slot.assetId] : [])),
  );
  const pinned = slots.flatMap((slot) => slot.manifest?.assets ?? []);
  const previewQueries = useQueries({
    queries: pinned.map((ref) => ({
      queryKey: ['creative-review-url', brandId, ref.assetId, ref.versionId],
      queryFn: () => signLibraryAsset(brandId, ref.assetId, ref.versionId),
      staleTime: 30 * 60_000,
      retry: false,
    })),
  });
  const pinnedUrls = new Map(
    pinned.map((ref, index) => [ref.versionId, previewQueries[index]?.data]),
  );
  const emptySlots = Math.max(0, FLASH_SLOTS - slots.length);

  const subjectBar = standing?.bars.find((bar) => bar.subject) ?? null;

  return (
    <div
      className="grid gap-5 md:grid-cols-[11rem_minmax(0,1fr)_minmax(15rem,19rem)]"
      data-testid="creative-recommendation-card"
    >
      {/* Left — the creative in question */}
      <section className="space-y-2">
        <p className="text-3xs text-muted-foreground uppercase tracking-wide">
          {copy.because === 'winner' ? 'The winner' : 'Creative to renew'}
        </p>
        {adsLoading && subjects.length === 0 ? (
          <div className="aspect-square w-full max-w-44 animate-pulse rounded-lg bg-muted/40" />
        ) : subjects.length === 0 ? (
          <div className="flex aspect-square w-full max-w-44 flex-col items-center justify-center gap-2 rounded-lg border border-border/60 border-dashed p-3 text-center text-2xs text-muted-foreground">
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
                  <p className="mt-1.5 truncate text-2xs text-foreground" title={ad.name ?? ad.id}>
                    {ad.name ?? ad.id}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {subjectBar?.costPerEvent != null ? (
          <p className="text-2xs text-muted-foreground">
            <span className="font-semibold text-foreground text-sm tabular-nums">
              {formatCpa(subjectBar.costPerEvent, currency)}
            </span>{' '}
            per {resultWord.replace(/s$/, '')} · {subjectBar.events} {resultWord}
          </p>
        ) : null}
      </section>

      {/* Middle — the argument */}
      <section className="space-y-3 text-2xs md:border-border/50 md:border-l md:pl-5">
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
        {standing ? (
          <CreativeStandingBars chart={standing} currency={currency} resultWord={resultWord} />
        ) : (
          <p className="text-3xs text-muted-foreground">
            No creative comparison in the latest snapshot for this ad set.
          </p>
        )}
      </section>

      {/* Right — flash creatives */}
      <section className="space-y-2 md:border-border/50 md:border-l md:pl-5">
        <p className="flex items-center gap-1 text-3xs text-muted-foreground uppercase tracking-wide">
          <SparklesIcon className="size-3" /> Flash creatives
        </p>
        <ul className="grid grid-cols-3 gap-2">
          {slots.map((slot) => {
            const src = slot.assetId ? signed[slot.assetId] : undefined;
            const status = slot.job.status;
            const ready = status === 'generated' && slot.assetId !== null;
            const busy = implementingKey === slot.key;
            return (
              <li
                className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-1.5 text-3xs"
                data-testid="flash-slot"
                key={slot.key}
                title={slot.job.id}
              >
                {slot.manifest ? (
                  <div className="space-y-2">
                    {slot.manifest.assets.map((ref, index) => {
                      const url = pinnedUrls.get(ref.versionId);
                      return (
                        <div key={ref.versionId}>
                          {slot.manifest!.format === 'carousel' ? (
                            <p>
                              Card {index + 1} of {slot.manifest!.assets.length}
                            </p>
                          ) : null}
                          {url ? (
                            slot.manifest!.format === 'video' ? (
                              // biome-ignore lint/a11y/useMediaCaption: generated reels include burned-in captions; presenter-free clips have no speech.
                              <video
                                controls
                                preload="metadata"
                                src={url}
                                className="w-full rounded"
                                aria-label="Full creative preview"
                              />
                            ) : (
                              <img
                                alt={`Creative card ${index + 1}`}
                                src={url}
                                className="max-h-96 w-full rounded object-contain"
                              />
                            )
                          ) : (
                            <p>Loading exact creative version…</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : src ? (
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
                {slot.job.enqueued_via === 'autopilot' ? (
                  <span className="text-3xs text-muted-foreground">by autopilot</span>
                ) : null}
                {status === 'failed' && failureText(slot.job) ? (
                  <p className="line-clamp-2 text-destructive" title={failureText(slot.job) ?? ''}>
                    {failureText(slot.job)}
                  </p>
                ) : null}
                {status === 'generated' && !slot.manifest ? (
                  <p>Regenerate this creative to review its exact version before approval.</p>
                ) : null}
                {status === 'failed' &&
                ['elements_need_approval', 'headless_pending'].includes(
                  String(slot.job.error?.code),
                ) ? (
                  <div className="flex gap-2">
                    {(() => {
                      const detail = slot.job.error?.detail;
                      const review = creativeGenerationReviewSchema.safeParse(
                        detail && typeof detail === 'object' && 'review' in detail
                          ? detail.review
                          : null,
                      );
                      return review.success ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReviewElementId(review.data.elementIds[0]!)}
                        >
                          Review Elements
                        </Button>
                      ) : null;
                    })()}
                    {onRetry ? (
                      <Button size="sm" variant="outline" onClick={() => onRetry(slot.job)}>
                        Resume generation
                      </Button>
                    ) : null}
                  </div>
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
                  {ready &&
                  slot.manifest &&
                  slot.manifest.assets.every(
                    (ref) => pinnedUrls.has(ref.versionId) && pinnedUrls.get(ref.versionId),
                  ) ? (
                    <ImplementMenu
                      busy={busy}
                      onImplement={onImplement}
                      slot={
                        slot as FlashSlot & { assetId: string; manifest: CreativeOutputManifest }
                      }
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
                className="flex aspect-square items-center justify-center rounded-lg border border-border/60 border-dashed text-3xs text-muted-foreground"
                key={`slot-${slotNumber}`}
              >
                slot {slotNumber}
              </li>
            ),
          )}
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
      <ElementsPanel
        brandId={brandId}
        open={reviewElementId !== null}
        initialElementId={reviewElementId ?? undefined}
        onOpenChange={(open) => {
          if (!open) setReviewElementId(null);
        }}
      />
    </div>
  );
}
