/* eslint-disable @next/next/no-img-element */
'use client';

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
import { Textarea } from '@/components/ui/textarea';
import { sanitizeCreativeAssetUrl } from '@/lib/creative-assets/assetUrl';
import { useStudioLibraryBrowser } from '@/lib/creative-assets/useStudioLibraryBrowser';
import { createOneShotPost } from '@/lib/organic/oneShotPost';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { Trend } from '@/lib/organic/trends';
import { cn } from '@/lib/utils';
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
  platform: OrganicPlatformKey;
  scheduledAt: string;
  trends: Trend[];
  platformAccountIds?: Record<string, string>;
  initialTrendIds?: string[];
  onCreated?: (response: OneShotPostResponse) => void;
}) {
  const [angle, setAngle] = React.useState('');
  const [guidance, setGuidance] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  // Seeded via useState initializer: the workspace mounts a fresh composer per
  // open, so a "Generate from this trend" entry point needs no sync effect.
  const [selectedTrendIds, setSelectedTrendIds] = React.useState<string[]>(() =>
    (initialTrendIds ?? []).filter((id) => UUID_RE.test(id)),
  );
  const [selectedMetricRefs, setSelectedMetricRefs] = React.useState<string[]>([]);
  const [selectedInsightRefs, setSelectedInsightRefs] = React.useState<string[]>([]);
  const [selectedAngleRefs, setSelectedAngleRefs] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Synchronous re-entrancy latch (blocks a double-click before `submitting` state
  // commits) + a stable per-composition idempotency key so a retry replays the
  // same in-flight generation server-side instead of minting a second draft.
  const dispatchInFlightRef = React.useRef(false);
  const idempotencyKeyRef = React.useRef<string | null>(null);

  const { assets, loading, hasMore, loadMore } = useStudioLibraryBrowser(brandProfileId);
  const evidence = useOneShotEvidence({
    brandId: brandProfileId,
    platform,
    integrationAccountId: platformAccountIds?.[platform] ?? null,
    enabled: open,
  });

  // Reset to a clean slate whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setAngle('');
      setGuidance('');
      setSelectedIds([]);
      setSelectedTrendIds([]);
      setSelectedMetricRefs([]);
      setSelectedInsightRefs([]);
      setSelectedAngleRefs([]);
      setError(null);
      setSubmitting(false);
      dispatchInFlightRef.current = false;
      idempotencyKeyRef.current = null;
    }
  }, [open]);

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
        platform,
        scheduledAt,
        direction: angle.trim() ? angle.trim() : null,
        format: isCarousel ? 'carousel' : null,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the post. Try again.');
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
            Create with AI
          </DialogTitle>
          <DialogDescription>
            Give the agent a direction — or pick a winning angle. Selected metrics and insights
            ground the copy; tagged creatives are used directly (two or more makes a carousel).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-post-direction"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Direction{selectedAngleRefs.length > 0 ? ' (optional — angle selected)' : ''}
            </label>
            <Textarea
              id="ai-post-direction"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. Punchy back-to-school savings hook with our top 3 deals"
              className="min-h-[4.5rem] text-sm"
              autoFocus
            />
          </div>

          {evidence.loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <Loader2 className="size-3 animate-spin" /> Loading brand evidence…
            </div>
          ) : (
            <>
              <EvidenceChipGroup
                title="Winning angles"
                items={evidence.angles.map((a) => ({ refId: a.refId, label: a.angle }))}
                selectedRefs={selectedAngleRefs}
                onToggle={(refId) => setSelectedAngleRefs(toggleRef(refId))}
              />
              <EvidenceChipGroup
                title="Metrics to cite"
                items={evidence.metrics.map((m) => ({
                  refId: m.refId,
                  label: `${m.label}: ${m.value}${m.unit ?? ''}`,
                }))}
                selectedRefs={selectedMetricRefs}
                onToggle={(refId) => setSelectedMetricRefs(toggleRef(refId))}
              />
              <EvidenceChipGroup
                title="Insights"
                items={evidence.insights.map((i) => ({ refId: i.refId, label: i.summary }))}
                selectedRefs={selectedInsightRefs}
                onToggle={(refId) => setSelectedInsightRefs(toggleRef(refId))}
              />
            </>
          )}

          <details className="group/guidance">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Add more guidance (optional)
            </summary>
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="Tone, CTA, or anything else to steer the post."
              className="mt-1.5 min-h-[3rem] text-sm"
            />
          </details>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Images className="size-3.5" /> Creatives
              </p>
              {isCarousel && (
                <Badge variant="secondary" className="text-2xs">
                  Carousel · {selectedIds.length}
                </Badge>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 p-1.5">
              {assets.length === 0 && loading ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted/40" />
                  ))}
                </div>
              ) : assets.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground/60">
                  Nothing in your library yet — the agent will generate the creative.
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
                      Load more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {taggableTrends.length > 0 && (
            <EvidenceChipGroup
              title="Trends"
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
            Cancel
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
            {submitting ? 'Generating…' : 'Create post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
