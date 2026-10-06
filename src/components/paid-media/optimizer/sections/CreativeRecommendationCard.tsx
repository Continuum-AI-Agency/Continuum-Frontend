'use client';

// A creative recommendation, read left to right: what is wearing out (the argument, drawn to
// scale, with the creative and its communication angle) and what to make instead (the
// instruction, the angle to keep, and the flash creatives Creative+ makes from it — or the
// empty slots where they will land). Every line is data or fixed copy. The image is resolved
// live from the ad set's ads (the stored poster URL is a signed Meta CDN link that expires),
// so the card shows the creative as it is today.

import {
  type AdSetSnapshot,
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
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { signLibraryAsset, useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { formatCpa } from '../format';
import * as typeScale from '../typeScale';
import { CreativeStandingBars } from './CreativeStandingBars';
import {
  adImageUrl,
  angleAriaLabel,
  angleChipText,
  audienceWords,
  cardAngles,
  creativeCardCopy,
  flashCreativesFor,
  metaFatigueCardOf,
  type ResolvedAngle,
  type StandingChart,
  SWAP_STATUS_LABEL,
  signedPercent,
  subjectAds,
  type WearOut,
  wearOutComparison,
  wearOutMetricTitle,
} from './creativeCardModel';
import type { ImplementTarget } from './flashCreativesModel';
import { PlatformCardBody } from './platformCards/PlatformCardBody';
import {
  evidenceLine,
  evidenceSeries,
  formatEvidenceValue,
  impactLabel,
  queueHeadlineLine,
} from './recQueueModel';
import { useAdAngles } from './useAdAngles';

type CreativeRecommendationCardProps = {
  rec: RecommendationRow;
  adsetName: string | null;
  ads: readonly AdsetAd[];
  adsLoading: boolean;
  audienceType: string | null | undefined;
  jobs: readonly CreativeSwapJobRow[];
  currency: string | null;
  brandId: string;
  /** The ad account the subject ads live on — lets an expired thumbnail re-resolve. */
  adAccountId?: string | null;
  /** The ad set's creative ranking, when the snapshot carries one. */
  standing: StandingChart | null;
  /** The ad set's latest snapshot: the 3/7/14 day windows the wear-out comparison draws. */
  snapshot?: AdSetSnapshot | null;
  /** The portfolio's result field on a window ("leads", "purchases"). */
  kpiField?: string;
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

/** In-slot actions: a flash slot is a third of the column, so they stay a step under the card buttons. */
const SLOT_BUTTON = 'h-7 px-2 text-xs';

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
          <Button className={SLOT_BUTTON} disabled={busy} size="sm" variant="default">
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <UploadIcon className="size-3.5" />
            )}
            Approve creative
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-3 text-xs">
        <p className="mb-2 text-muted-foreground">
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
              <p className={`${typeScale.label} mb-1 text-muted-foreground`}>
                {RELATION_LABEL[group.relation]}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((target) => (
                  <li key={target.adsetId}>
                    <button
                      className="w-full truncate rounded px-2 py-1.5 text-left hover:bg-muted"
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

/** A subject ad's thumbnail. The URL is a signed Meta CDN link that expires, so a failed (or
 *  missing) image asks the creative-preview endpoint for a fresh one — the same recovery the
 *  audience card takes — and shows a placeholder tile meanwhile, never alt text. */
function SubjectAdThumb({
  ad,
  freshUrl,
  onRecover,
}: {
  ad: AdsetAd;
  freshUrl: string | null;
  onRecover: (adId: string) => void;
}) {
  const stale = adImageUrl(ad);
  const src = freshUrl ?? stale;
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!stale) onRecover(ad.id);
  }, [ad.id, stale, onRecover]);
  if (!src || failedSrc === src) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-md border border-border/60 border-dashed"
        data-testid="subject-ad-placeholder"
      >
        <ImageOffIcon className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: signed, expiring Meta CDN URL; next/image cannot proxy it.
    <img
      alt=""
      className="aspect-square w-full rounded-md border border-border/60 object-cover"
      loading="lazy"
      onError={() => {
        setFailedSrc(src);
        onRecover(ad.id);
      }}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}

const LEANING_NOTE =
  'Below the classifier’s confidence bar, so this angle is a leaning and not confirmed.';

function AngleChip({ angle }: { angle: ResolvedAngle }) {
  const aria = angleAriaLabel(angle);
  if (angle.status === 'none') {
    return (
      <span
        aria-label={aria}
        className="text-muted-foreground text-xs"
        data-angle-status="none"
        data-testid="angle-chip"
        role="note"
        title={aria}
      >
        {angleChipText(angle)}
      </span>
    );
  }
  return (
    <span
      aria-label={aria}
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs',
        angle.status === 'confirmed'
          ? 'border-primary font-medium text-foreground'
          : 'border-muted-foreground/50 border-dashed text-muted-foreground',
      )}
      data-angle-status={angle.status}
      data-testid="angle-chip"
      role="note"
      title={angle.status === 'leaning' ? `${aria}. ${LEANING_NOTE}` : aria}
    >
      {angleChipText(angle)}
    </span>
  );
}

function WearOutBars({ chart, currency }: { chart: WearOut; currency: string | null }) {
  const flagged = chart.rows.find((row) => row.flagged) ?? null;
  return (
    <figure className="space-y-1.5" data-testid="wear-out-bars">
      <figcaption
        className={`${typeScale.label} flex flex-wrap items-baseline justify-between gap-2 text-muted-foreground`}
      >
        <span>{wearOutMetricTitle(chart.metric)}</span>
        {flagged?.changePct != null ? (
          <span className="text-destructive normal-case tracking-normal">
            {flagged.label} {signedPercent(flagged.changePct)} vs 14 days
          </span>
        ) : null}
      </figcaption>
      <ol className="space-y-1 tabular-nums">
        {chart.rows.map((row) => (
          <li
            className="grid grid-cols-[4rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs"
            data-flagged={row.flagged ? 'true' : undefined}
            key={row.label}
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="relative h-2.5 rounded-sm bg-muted/50">
              <span
                className={cn(
                  'absolute inset-y-0 left-0 rounded-sm',
                  row.flagged ? 'bg-destructive/70' : 'bg-primary/60',
                )}
                data-testid="wear-out-fill"
                style={{ width: `${Math.max(1, row.share * 100)}%` }}
              />
              {row.flagged ? (
                <span
                  aria-hidden
                  className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-foreground"
                  data-testid="wear-out-baseline"
                  style={{ left: `${chart.baselineShare * 100}%` }}
                  title="14-day level"
                />
              ) : null}
            </span>
            <span
              className={cn(
                'text-right font-semibold',
                row.flagged ? 'text-destructive' : 'text-foreground',
              )}
            >
              {formatEvidenceValue(chart.unit, row.value, currency)}
            </span>
          </li>
        ))}
      </ol>
      {chart.costChangePct != null ? (
        <p className="tabular-nums">
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-xs',
              chart.costChangePct > 0
                ? 'border-destructive/50 text-destructive'
                : 'border-border text-muted-foreground',
            )}
            data-testid="cost-change-chip"
          >
            cost per result {signedPercent(chart.costChangePct)}
          </span>
        </p>
      ) : null}
    </figure>
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
  adAccountId = null,
  standing,
  snapshot = null,
  kpiField = '',
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
  const fatigueCard = metaFatigueCardOf(rec);
  const subjects = subjectAds(rec, ads);
  const anglesQuery = useAdAngles(brandId, rec.adset_id);
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });
  const angles = cardAngles(rec, subjects, anglesQuery.data);
  const audience = audienceWords(rec, audienceType);
  const reason =
    queueHeadlineLine(rec, currency) ?? evidenceLine(rec.evidence, currency) ?? rec.reason;
  const money = impactLabel(rec, currency);
  const wearOut = wearOutComparison(
    evidenceSeries(rec.evidence, snapshot, kpiField),
    snapshot,
    kpiField,
  );
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
  const keepAngle =
    angles.dominant.status !== 'none' && rec.kind !== 'pause_ad' ? angles.dominant : null;

  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2" data-testid="creative-recommendation-card">
        {/* Left — what is wearing out */}
        <section
          className="min-w-0 space-y-3 rounded-lg border border-border/60 bg-background p-4 text-xs"
          data-testid="creative-card-problem"
        >
          <p className={`${typeScale.label} text-muted-foreground`}>
            {copy.because === 'winner' ? 'What’s working' : 'What’s wearing out'}
          </p>
          {fatigueCard ? (
            <>
              <PlatformCardBody card={fatigueCard} />
              {money ? <p className="text-muted-foreground text-sm">{money}</p> : null}
            </>
          ) : (
            <p className="text-foreground text-sm">
              <span className="font-semibold">{copy.problem}.</span>
              {reason ? <span className="text-muted-foreground"> {reason}</span> : null}
              {money ? <span className="text-muted-foreground"> · {money}</span> : null}
            </p>
          )}
          {wearOut ? <WearOutBars chart={wearOut} currency={currency} /> : null}
          {adsLoading && subjects.length === 0 ? (
            <div className="size-20 animate-pulse rounded-lg bg-muted/40" />
          ) : subjects.length === 0 ? (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <ImageOffIcon className="size-4" /> No creative could be loaded for this ad set.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {subjects.map((ad) => {
                const own = angles.mixed ? (angles.perAd.get(ad.id) ?? null) : null;
                return (
                  <li className="w-20 space-y-1" key={ad.id}>
                    <SubjectAdThumb
                      ad={ad}
                      freshUrl={freshUrlById[ad.id] ?? null}
                      onRecover={recover}
                    />
                    <p className="truncate text-foreground text-xs" title={ad.name ?? ad.id}>
                      {ad.name ?? ad.id}
                    </p>
                    {own ? <AngleChip angle={own} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {subjectBar?.costPerEvent != null ? (
            <p className="text-muted-foreground text-xs">
              <span className="font-semibold text-base text-foreground tabular-nums">
                {formatCpa(subjectBar.costPerEvent, currency)}
              </span>{' '}
              per {resultWord.replace(/s$/, '')} · {subjectBar.events} {resultWord}
            </p>
          ) : null}
          <dl className="space-y-1.5">
            <div className="flex items-center gap-2" data-testid="angle-row">
              <dt className="w-20 shrink-0 text-muted-foreground text-xs">Angle</dt>
              <dd className="min-w-0">
                <AngleChip angle={angles.dominant} />
              </dd>
            </div>
            {angles.hook ? (
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground text-xs">Hook</dt>
                <dd className="min-w-0 text-foreground italic" data-testid="angle-hook">
                  “{angles.hook}”
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground text-xs">Audience</dt>
              <dd className="min-w-0 text-foreground">
                {audience ?? adsetName ?? (
                  <span className="text-muted-foreground">this ad set</span>
                )}
              </dd>
            </div>
          </dl>
          {standing ? (
            <CreativeStandingBars chart={standing} currency={currency} resultWord={resultWord} />
          ) : null}
        </section>

        {/* Right — what to make */}
        <section
          className="min-w-0 space-y-3 rounded-lg border border-border/60 bg-background p-4 text-xs"
          data-testid="creative-card-prescription"
        >
          <p className={`${typeScale.label} text-muted-foreground`}>What to make</p>
          <p className="font-semibold text-foreground text-sm">
            {copy.instruction ?? copy.headline}
          </p>
          {keepAngle ? (
            <p className="flex flex-wrap items-center gap-1.5 text-foreground">
              Keep the angle: <AngleChip angle={keepAngle} />
            </p>
          ) : null}
          <p className={`${typeScale.label} flex items-center gap-1.5 text-muted-foreground`}>
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
                    <p
                      className="line-clamp-2 text-destructive"
                      title={failureText(slot.job) ?? ''}
                    >
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
                          SLOT_BUTTON,
                        )}
                        href={`/ai-studio?roomId=${encodeURIComponent(slot.roomId)}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <PencilIcon className="size-3.5" /> Edit
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
              className="h-8 px-3 text-sm"
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
