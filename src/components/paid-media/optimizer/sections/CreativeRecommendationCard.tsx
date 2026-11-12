'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useUiErrorMessage } from '@/i18n/errors';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

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
import { Skeleton } from '@/components/ui/skeleton';
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
      slots.push({
        key: job.id,
        job,
        assetId: null,
        roomId: result.roomId,
        manifest: null,
      });
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

function failureText(
  job: CreativeSwapJobRow,
  formatError?: (error: unknown) => string,
): string | null {
  const error = job.error ?? null;
  if (!error) return null;
  if (formatError) return formatError(error);
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
  const uiText = useTranslations('scale');
  const creativeReviewControlId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(false);
  const groups = (['here', 'same_audience', 'other'] as const)
    .map((relation) => ({
      relation,
      items: targets.filter((t) => t.relation === relation),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className={SLOT_BUTTON} disabled={busy} size="sm" variant="default">
            {uiText.rich('sentence_b9499c243b21', {
              v0: () =>
                busy ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <UploadIcon className="size-3.5" />
                ),
            })}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-3 text-xs">
        <p className="mb-2 text-muted-foreground">
          {uiText('the_new_ad_is_created_paused_beside_the_ad_se_122b2b0')}
        </p>
        <label htmlFor={creativeReviewControlId} className="mb-2 flex items-center gap-2">
          {uiText.rich('sentence_9a57de38bd51', {
            checkbox: () => (
              <input
                id={creativeReviewControlId}
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
            ),
            carousel: slot.manifest.format === 'carousel' ? 'yes' : 'no',
            count: slot.manifest.assets.length,
          })}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const aria = angleAriaLabel(angle, uiText, uiLocale);
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
        {angleChipText(angle, uiText, uiLocale)}
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
      title={angle.status === 'leaning' ? `${aria}. ${uiText('creativeLeaningHint')}` : aria}
    >
      {angleChipText(angle, uiText, uiLocale)}
    </span>
  );
}

function WearOutBars({ chart, currency }: { chart: WearOut; currency: string | null }) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const flagged = chart.rows.find((row) => row.flagged) ?? null;
  return (
    <figure className="space-y-1.5" data-testid="wear-out-bars">
      <figcaption
        className={`${typeScale.label} flex flex-wrap items-baseline justify-between gap-2 text-muted-foreground`}
      >
        <span>{wearOutMetricTitle(chart.metric, uiText)}</span>
        {flagged?.changePct != null ? (
          <span className="text-destructive normal-case tracking-normal">
            {uiText.rich('sentence_1e609cb04c5e', {
              v0: flagged.label,
              v1: signedPercent(flagged.changePct, uiLocale),
            })}
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
                  title={uiText('14_day_level_5939e29')}
                />
              ) : null}
            </span>
            <span
              className={cn(
                'text-right font-semibold',
                row.flagged ? 'text-destructive' : 'text-foreground',
              )}
            >
              {formatEvidenceValue(chart.unit, row.value, currency, uiLocale)}
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
            {uiText.rich('sentence_0b266ebaa2e7', {
              v0: signedPercent(chart.costChangePct, uiLocale),
            })}
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const [reviewElementId, setReviewElementId] = React.useState<string | null>(null);
  const copy = creativeCardCopy(rec, uiText);
  const fatigueCard = metaFatigueCardOf(rec);
  const subjects = subjectAds(rec, ads);
  const anglesQuery = useAdAngles(brandId, rec.adset_id);
  const { freshUrlById, recover } = usePaidCreativeRecovery({
    brandId,
    adAccountId,
  });
  const angles = cardAngles(rec, subjects, anglesQuery.data);
  const audience = audienceWords(rec, audienceType);
  const reason =
    queueHeadlineLine(rec, currency, uiLocale) ??
    evidenceLine(rec.evidence, currency, optimizerText, uiLocale) ??
    rec.reason;
  const money = impactLabel(rec, currency, optimizerText, uiLocale);
  const wearOut = wearOutComparison(
    evidenceSeries(rec.evidence, snapshot, kpiField, optimizerText),
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
        <section className="min-w-0 space-y-3 text-xs" data-testid="creative-card-problem">
          <p className={`${typeScale.label} text-muted-foreground`}>
            {copy.because === 'winner'
              ? uiText('what_s_working_9f395dc')
              : uiText('what_s_wearing_out_0b62fee')}
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
            <Skeleton className="size-20 rounded-lg" />
          ) : subjects.length === 0 ? (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <ImageOffIcon className="size-4" />
              {uiText('no_creative_could_be_loaded_for_this_ad_set_6821129')}
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
              {uiText.rich('sentence_d7506866b0ee', {
                v0: () => (
                  <span className="font-semibold text-base text-foreground tabular-nums">
                    {formatCpa(subjectBar.costPerEvent, currency, uiLocale)}
                  </span>
                ),
                v1: resultWord.replace(/s$/, ''),
                v2: subjectBar.events,
                v3: resultWord,
              })}
            </p>
          ) : null}
          <dl className="space-y-1.5">
            <div className="flex items-center gap-2" data-testid="angle-row">
              <dt className="w-20 shrink-0 text-muted-foreground text-xs">
                {uiText('angle_1968034')}
              </dt>
              <dd className="min-w-0">
                <AngleChip angle={angles.dominant} />
              </dd>
            </div>
            {angles.hook ? (
              <div className="flex items-baseline gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground text-xs">
                  {uiText('hook_536ff50')}
                </dt>
                <dd className="min-w-0 text-foreground italic" data-testid="angle-hook">
                  “{angles.hook}”
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground text-xs">
                {uiText('audience_545c023')}
              </dt>
              <dd className="min-w-0 text-foreground">
                {audience ?? adsetName ?? (
                  <span className="text-muted-foreground">{uiText('this_ad_set_75e5434')}</span>
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
          className="min-w-0 space-y-3 border-border/60 border-t pt-4 text-xs @2xl:border-t-0 @2xl:border-l @2xl:pt-0 @2xl:pl-4"
          data-testid="creative-card-prescription"
        >
          <p className={`${typeScale.label} text-muted-foreground`}>
            {uiText('what_to_make_c505c0c')}
          </p>
          <p className="font-semibold text-foreground text-sm">
            {copy.instruction ?? copy.headline}
          </p>
          {keepAngle ? (
            <p className="flex flex-wrap items-center gap-1.5 text-foreground">
              {uiText.rich('sentence_56ab879809fd', {
                v0: () => <AngleChip angle={keepAngle} />,
              })}
            </p>
          ) : null}
          <p className={`${typeScale.label} flex items-center gap-1.5 text-muted-foreground`}>
            <SparklesIcon className="size-3.5" />
            {uiText('flash_creatives_a8dddbb')}
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
                                {uiText.rich('sentence_24231db33b8b', {
                                  v0: index + 1,
                                  v1: slot.manifest!.assets.length,
                                })}
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
                                  aria-label={uiText('full_creative_preview_2668756')}
                                />
                              ) : (
                                <img
                                  alt={uiText('template_4f72f5286fc2', {
                                    v0: index + 1,
                                  })}
                                  src={url}
                                  className="max-h-96 w-full rounded object-contain"
                                />
                              )
                            ) : (
                              <p>{uiText('loading_exact_creative_version_ab1a687')}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : src ? (
                    // biome-ignore lint/performance/noImgElement: signed, expiring storage URL; next/image cannot proxy it.
                    <img
                      alt={uiText('flash_creative_d38f7c6')}
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
                    {uiText('creativeSwapState', { status })}
                  </Badge>
                  {slot.job.enqueued_via === 'autopilot' ? (
                    <span className="text-muted-foreground text-xs">
                      {uiText('by_autopilot_7024e50')}
                    </span>
                  ) : null}
                  {status === 'failed' && failureText(slot.job, formatUiError) ? (
                    <p
                      className="line-clamp-2 text-destructive"
                      title={failureText(slot.job, formatUiError) ?? ''}
                    >
                      {failureText(slot.job, formatUiError)}
                    </p>
                  ) : null}
                  {status === 'generated' && !slot.manifest ? (
                    <p>{uiText('regenerate_this_creative_to_review_its_exact__1386977')}</p>
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
                            {uiText('review_elements_d7e0162')}
                          </Button>
                        ) : null;
                      })()}
                      {onRetry ? (
                        <Button size="sm" variant="outline" onClick={() => onRetry(slot.job)}>
                          {uiText('resume_generation_7b5f01c')}
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
                        <PencilIcon className="size-3.5" />
                        {uiText('edit_464c4ff')}
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
                          slot as FlashSlot & {
                            assetId: string;
                            manifest: CreativeOutputManifest;
                          }
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
                  {uiText.rich('sentence_7ace866baa90', { v0: slotNumber })}
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
              {generating ? uiText('requesting_1db9285') : uiText('generate_with_creative_dadb6f7')}
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
