/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// Calendar "Create with AI" composer — the one-shot "very light harness".
// Collects a direction plus predetermined evidence (selected metrics, insights,
// winning angles), optionally tags library creatives (>=2 ⇒ carousel) and
// trends, then runs ONE synchronous schema-direct generation pass on the
// Backend. The persisted text-checkpoint draft comes back in the response and
// surfaces on the calendar via the existing realtime refetch.

import {
  creativeRefFromAsset,
  type MediaAsset,
  type OneShotPostResponse,
  type OrganicPostFormat,
  organicPostFormatEnum,
  PUBLISH_PLATFORM_LABELS,
  PUBLISH_PLATFORM_ORDER,
  type PublishPlatform,
} from '@continuum/contracts';
import { ImageOff, Images, Loader2, Play, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { createOneShotPost } from '@/lib/organic/oneShotPost';
import { platformVerdicts } from '@/lib/organic/platformSelection';
import { postFormatOptions } from '@/lib/organic/postPlatforms';
import { defaultPublishAccount } from '@/lib/organic/publish-utils';
import { organicPublishFormatLabel } from '@/lib/organic/publishPresentation';
import { accountName, findAccount, usePublishAccounts } from '@/lib/organic/publishTargets';
import type { Trend } from '@/lib/organic/trends';
import { cn } from '@/lib/utils';
import { useDraftMembership } from '../hooks/useFanOutDraft';
import { PlatformSelector } from './PlatformSelector';
import type { OrganicCalendarDraft } from './types';
import { useOneShotEvidence } from './useOneShotEvidence';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ComposerAssetTile({
  asset,
  order,
  onToggle,
}: {
  asset: MediaAsset;
  order: number;
  onToggle: () => void;
}) {
  const url = sanitizeCreativeAssetUrl(asset.signedUrl);
  const isVideo = asset.kind === 'video';
  const isSelected = order > 0;
  return (
    <button
      type="button"
      aria-label={asset.title ?? asset.fileName}
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cn(
        'group relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all duration-150',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-1'
          : 'border-border/50 hover:border-border',
      )}
    >
      {url && !isVideo ? (
        <img
          src={url}
          alt={asset.title ?? asset.fileName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : url && isVideo ? (
        <video
          src={`${url}#t=0.01`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="size-5" />
        </div>
      )}
      {isVideo && (
        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1">
          <Play className="size-3 text-white" />
        </div>
      )}
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
          <div className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {order}
          </div>
        </div>
      )}
    </button>
  );
}

function EvidenceChipGroup({
  title,
  items,
  selectedRefs,
  onToggle,
}: {
  title: string;
  items: Array<{ refId: string; label: string }>;
  selectedRefs: string[];
  onToggle: (refId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selectedRefs.includes(item.refId);
          return (
            <button
              key={item.refId}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(item.refId)}
              className={cn(
                'max-w-full truncate rounded-full border px-2.5 py-1 text-left text-xs transition-colors',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const toggleRef = (refId: string) => (prev: string[]) =>
  prev.includes(refId) ? prev.filter((x) => x !== refId) : [...prev, refId];

export function AiPostComposer({
  open,
  onOpenChange,
  brandProfileId,
  platform,
  scheduledAt,
  trends,
  platformAccountIds,
  initialTrendIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfileId: string;
  /** The platform the composer opens on; more can be ticked. */
  platform: PublishPlatform;
  scheduledAt: string;
  trends: Trend[];
  platformAccountIds?: Record<string, string>;
  initialTrendIds?: string[];
  onCreated?: (response: OneShotPostResponse) => void;
}) {
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('organic');
  const [angle, setAngle] = React.useState('');
  const [guidance, setGuidance] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  // null = the agent picks the format, as it always has; a Story can only be chosen here.
  const [format, setFormat] = React.useState<OrganicPostFormat | null>(null);
  // Seeded via useState initializer: the workspace mounts a fresh composer per
  // open, so a "Generate from this trend" entry point needs no sync effect.
  const [selectedTrendIds, setSelectedTrendIds] = React.useState<string[]>(() =>
    (initialTrendIds ?? []).filter((id) => UUID_RE.test(id)),
  );
  const [selectedMetricRefs, setSelectedMetricRefs] = React.useState<string[]>([]);
  const [selectedInsightRefs, setSelectedInsightRefs] = React.useState<string[]>([]);
  const [selectedAngleRefs, setSelectedAngleRefs] = React.useState<string[]>([]);
  // The post is written for the first platform; the rest join its group once it exists.
  const [platforms, setPlatforms] = React.useState<PublishPlatform[]>([platform]);
  const sourcePlatform = platforms[0] ?? platform;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const accounts = usePublishAccounts(brandProfileId);
  const { setPlatforms: joinPlatforms } = useDraftMembership();
  // Synchronous re-entrancy latch (blocks a double-click before `submitting` state
  // commits) + a stable per-composition idempotency key so a retry replays the
  // same in-flight generation server-side instead of minting a second draft.
  const dispatchInFlightRef = React.useRef(false);
  const idempotencyKeyRef = React.useRef<string | null>(null);

  const { assets, loading, hasMore, loadMore } = useStudioLibraryBrowser(brandProfileId);
  const evidence = useOneShotEvidence({
    brandId: brandProfileId,
    platform: sourcePlatform,
    integrationAccountId: platformAccountIds?.[sourcePlatform] ?? null,
    enabled: open,
  });

  // Reset to a clean slate whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setAngle('');
      setGuidance('');
      setSelectedIds([]);
      setFormat(null);
      setPlatforms([platform]);
      setSelectedTrendIds([]);
      setSelectedMetricRefs([]);
      setSelectedInsightRefs([]);
      setSelectedAngleRefs([]);
      setError(null);
      setSubmitting(false);
      dispatchInFlightRef.current = false;
      idempotencyKeyRef.current = null;
    }
  }, [open, platform]);

  // Only real (uuid) trends can anchor a durable job; seeded slug trends are skipped.
  const taggableTrends = React.useMemo(() => trends.filter((t) => UUID_RE.test(t.id)), [trends]);

  const toggleAsset = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleTrend = (id: string) =>
    setSelectedTrendIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const isCarousel = selectedIds.length > 1;
  const hasDirection = Boolean(angle.trim()) || selectedAngleRefs.length > 0;
  const verdicts = platformVerdicts({
    format: isCarousel ? 'carousel' : format,
    caption: null,
    accounts,
    selected: platforms,
  });
  const togglePlatform = (target: PublishPlatform, next: boolean) =>
    setPlatforms((prev) =>
      next ? [...prev.filter((p) => p !== target), target] : prev.filter((p) => p !== target),
    );
  // Where each platform posts, by name: the workspace's pick, else the brand's default (C6).
  const destinations = PUBLISH_PLATFORM_ORDER.filter((p) => platforms.includes(p)).map((p) => {
    const account =
      findAccount(accounts, platformAccountIds?.[p]) ?? defaultPublishAccount(accounts, p);
    return { platform: p, account: account ? accountName(account) : null, id: account?.id };
  });
  // The rows the post fans out to post as the accounts named above, not the server's pick.
  const destinationIds = Object.fromEntries(
    destinations.flatMap((d) => (d.id ? [[d.platform, d.id]] : [])),
  );

  const handleSubmit = async () => {
    if (!hasDirection || dispatchInFlightRef.current) return;
    dispatchInFlightRef.current = true;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    setSubmitting(true);
    setError(null);
    try {
      const byId = new Map(assets.map((a) => [a.id, a]));
      const libraryCreativeRefs = selectedIds
        .map((id) => byId.get(id))
        .filter((a): a is MediaAsset => !!a)
        .map(creativeRefFromAsset);

      const response = await createOneShotPost({
        brandId: brandProfileId,
        platform: sourcePlatform,
        scheduledAt,
        direction: angle.trim() ? angle.trim() : null,
        format: isCarousel ? 'carousel' : format,
        metrics: evidence.metrics.filter((m) => selectedMetricRefs.includes(m.refId)),
        insights: evidence.insights.filter((i) => selectedInsightRefs.includes(i.refId)),
        angles: evidence.angles.filter((a) => selectedAngleRefs.includes(a.refId)),
        libraryCreativeRefs,
        trendIds: selectedTrendIds,
        guidancePrompt: guidance.trim() ? guidance.trim() : null,
        idempotencyKey: idempotencyKeyRef.current,
        platformAccountIds,
      });
      idempotencyKeyRef.current = null;
      onCreated?.(response);
      onOpenChange(false);
      // The post exists either way; a platform that fails to join is toasted by the hook and
      // can be ticked again from the post's platform menu.
      if (platforms.length > 1) {
        const created = {
          id: response.draftId,
          backendDraftId: response.draftId,
          platforms: [sourcePlatform],
        } as OrganicCalendarDraft;
        await joinPlatforms(created, platforms, destinationIds);
      }
    } catch (err) {
      setError(formatUiError(err));
    } finally {
      dispatchInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {uiText('create_with_ai_1c19341')}
          </DialogTitle>
          <DialogDescription>
            {uiText('give_the_agent_a_direction_or_pick_a_winning__cf535b1')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-post-direction"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {uiText.rich('sentence_224b3d51df96', {
                optional: selectedAngleRefs.length > 0 ? 'yes' : 'no',
              })}
            </label>
            <Textarea
              id="ai-post-direction"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder={uiText('e_g_punchy_back_to_school_savings_hook_with_o_74acaeb')}
              className="min-h-[4.5rem] text-sm"
              autoFocus
            />
          </div>

          {evidence.loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <Loader2 className="size-3 animate-spin" />
              {uiText('loading_brand_evidence_f3be8ab')}
            </div>
          ) : (
            <>
              <EvidenceChipGroup
                title={uiText('winning_angles_608f852')}
                items={evidence.angles.map((a) => ({ refId: a.refId, label: a.angle }))}
                selectedRefs={selectedAngleRefs}
                onToggle={(refId) => setSelectedAngleRefs(toggleRef(refId))}
              />
              <EvidenceChipGroup
                title={uiText('metrics_to_cite_9ec66d2')}
                items={evidence.metrics.map((m) => ({
                  refId: m.refId,
                  label: `${m.label}: ${m.value}${m.unit ?? ''}`,
                }))}
                selectedRefs={selectedMetricRefs}
                onToggle={(refId) => setSelectedMetricRefs(toggleRef(refId))}
              />
              <EvidenceChipGroup
                title={uiText('insights_2a932f9')}
                items={evidence.insights.map((i) => ({ refId: i.refId, label: i.summary }))}
                selectedRefs={selectedInsightRefs}
                onToggle={(refId) => setSelectedInsightRefs(toggleRef(refId))}
              />
            </>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {uiText('platforms_ab9bd75')}
              </p>
              <PlatformSelector
                selected={platforms}
                verdicts={verdicts}
                onToggle={togglePlatform}
                disabledReason={submitting ? 'Generating…' : null}
              />
            </div>
            <ul className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {destinations.map(({ platform: p, account }) => (
                <li key={p} data-composer-target={p}>
                  {PUBLISH_PLATFORM_LABELS[p]}:{' '}
                  <span data-composer-account="" className="text-foreground">
                    {account ?? uiText('choose_the_account_on_the_post_9e5fe2c')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {uiText('format_2f34366')}
            </p>
            {/* Two or more creatives already make it a carousel, so the choice is locked. */}
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              aria-label={uiText('post_format_d6bc2f4')}
              value={isCarousel ? 'carousel' : (format ?? '')}
              onValueChange={(value) =>
                setFormat(organicPostFormatEnum.safeParse(value).data ?? null)
              }
            >
              {postFormatOptions(platforms).map((option) => (
                <ToggleGroupItem
                  key={organicPublishFormatLabel(option, uiText)}
                  value={option.toLowerCase()}
                  disabled={isCarousel || submitting}
                >
                  {organicPublishFormatLabel(option, uiText)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <details className="group/guidance">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              {uiText('add_more_guidance_optional_8deca6d')}
            </summary>
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder={uiText('tone_cta_or_anything_else_to_steer_the_post_0579c1e')}
              className="mt-1.5 min-h-[3rem] text-sm"
            />
          </details>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Images className="size-3.5" />
                {uiText('creatives_2eb70c5')}
              </p>
              {isCarousel && (
                <Badge variant="secondary" className="text-2xs">
                  {uiText.rich('sentence_0895971c7cba', { count: selectedIds.length })}
                </Badge>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 p-1.5">
              {assets.length === 0 && loading ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              ) : assets.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">
                  {uiText('nothing_in_your_library_yet_the_agent_will_ge_1d352c5')}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-5 gap-1.5">
                    {assets.map((asset) => (
                      <ComposerAssetTile
                        key={asset.id}
                        asset={asset}
                        order={selectedIds.indexOf(asset.id) + 1}
                        onToggle={() => toggleAsset(asset.id)}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => loadMore()}
                      className="mt-1.5 w-full rounded-md py-1 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      {uiText('load_more_ac8991e')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {taggableTrends.length > 0 && (
            <EvidenceChipGroup
              title={uiText('trends_e856c6c')}
              items={taggableTrends.map((trend) => ({ refId: trend.id, label: trend.title }))}
              selectedRefs={selectedTrendIds}
              onToggle={toggleTrend}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {uiText('cancel_19766ed')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!hasDirection || submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {submitting ? uiText('generating_d20a447') : uiText('create_post_bcf1bfc')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
