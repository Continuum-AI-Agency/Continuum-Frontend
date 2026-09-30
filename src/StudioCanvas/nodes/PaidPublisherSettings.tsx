'use client';

import {
  type CanvasPublishingFormat,
  type PaidCanvasCreativeReplacementRequest,
  type PaidCanvasCreativeReplacementResponse,
  type PaidCanvasTarget,
  PUBLISH_IMAGE_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';
import { Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { signLibraryAsset } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { useStudioStore } from '../stores/useStudioStore';
import type { PublisherNodeData, StudioNode } from '../types';
import { publishingApi } from './publish/publishingApi';
import { resolvePublishingAssets } from './publish/resolvePublishingAssets';

const FORMAT_OPTIONS: Array<{ value: CanvasPublishingFormat; label: string }> = [
  { value: 'image', label: 'Post / Image' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video', label: 'Reel / Video' },
];

const randomSlot = (order: number) => ({
  id: crypto.randomUUID?.() ?? `asset-${Date.now()}-${order}`,
  order,
});

function inputHandles(data: PublisherNodeData): Array<{ id: string; label: string }> {
  if (data.format === 'image') return [{ id: PUBLISH_IMAGE_INPUT_HANDLE, label: 'Image' }];
  if (data.format === 'video') return [{ id: PUBLISH_VIDEO_INPUT_HANDLE, label: 'Video' }];
  return [...(data.assetSlots ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((slot, index) => ({ id: `asset-${slot.id}`, label: String(index + 1) }));
}

/**
 * Replace the creative on an existing Meta ad with canvas creative.
 *
 * Organic publishing used to share this component. It now lives in `PlannerDraftBlock`
 * (find/create/edit a Planner draft) and `OrganicPublishBlock` (post it), because the two
 * worlds only ever looked alike: an ad swap is one immutable-creative replacement with a
 * restore handle, while an organic post is a draft row a human approves and publishes.
 */
export function PaidPublisherSettings({ id, data }: { id: string; data: PublisherNodeData }) {
  const activeRoomId = useStudioStore((state) => state.activeRoomId);
  const updateNode = useStudioStore((state) => state.updateNode);
  const { show } = useToast();
  const [pending, setPending] = useState<{
    urls: string[];
    preview: Extract<PaidCanvasCreativeReplacementResponse, { mode: 'preview' }>;
    identity: Extract<PaidCanvasCreativeReplacementRequest, { mode: 'preview' }>;
  } | null>(null);
  const [restore, setRestore] = useState<{
    replacementId: string;
    previousCreativeId?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [paidTargets, setPaidTargets] = useState<PaidCanvasTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const format = data.format ?? 'image';
  const handles = inputHandles({ ...data, format });

  const patchData = useCallback(
    (patch: Partial<PublisherNodeData>) => {
      if (
        useStudioStore.getState().brandId !== brandId ||
        useStudioStore.getState().activeRoomId !== activeRoomId
      )
        return;
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as PublisherNodeData), ...patch },
      }));
      useStudioStore.getState().triggerSave();
    },
    [id, updateNode, brandId, activeRoomId],
  );

  const assets = useMemo(
    () => resolvePublishingAssets({ nodeId: id, data: { ...data, format }, nodes, edges }),
    [data, edges, format, id, nodes],
  );
  const expectedAssetCount = format === 'carousel' ? handles.length : 1;
  const assetsReady =
    assets.length === expectedAssetCount && assets.every((asset) => asset.versionId);

  const paidLevel = !data.campaignId ? 'campaign' : !data.adsetId ? 'adset' : 'ad';

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const result = await publishingApi.searchPaid({
          brandId,
          adAccountId: data.adAccountId,
          level: paidLevel,
          parentId: data.adsetId ?? data.campaignId,
          format: paidLevel === 'ad' ? format : undefined,
          query: query || undefined,
          limit: 20,
        });
        if (cancelled) return;
        if (result.adAccountId !== data.adAccountId) {
          patchData({ adAccountId: result.adAccountId });
        }
        setPaidTargets(result.items);
      } catch (error) {
        if (cancelled) return;
        setSearchError(error instanceof Error ? error.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    brandId,
    data.adAccountId,
    data.adsetId,
    data.campaignId,
    format,
    paidLevel,
    patchData,
    query,
  ]);

  const changeFormat = useCallback(
    (nextFormat: CanvasPublishingFormat) => {
      const slots = nextFormat === 'carousel' ? [randomSlot(0), randomSlot(1)] : [];
      const state = useStudioStore.getState();
      state.setEdges(state.edges.filter((edge) => edge.target !== id));
      patchData({
        format: nextFormat,
        assetSlots: slots,
        targetAdId: undefined,
        targetAdName: undefined,
        expectedCreativeId: undefined,
        confirmToken: undefined,
      });
    },
    [id, patchData],
  );

  const addCarouselCard = useCallback(() => {
    const slots = [...(data.assetSlots ?? [])];
    if (slots.length >= 10) return;
    patchData({ assetSlots: [...slots, randomSlot(slots.length)], confirmToken: undefined });
  }, [data.assetSlots, patchData]);

  const removeCarouselCard = useCallback(() => {
    const slots = [...(data.assetSlots ?? [])];
    if (slots.length <= 2) return;
    const removed = slots.at(-1);
    if (removed) {
      const state = useStudioStore.getState();
      state.setEdges(
        state.edges.filter(
          (edge) => !(edge.target === id && edge.targetHandle === `asset-${removed.id}`),
        ),
      );
    }
    patchData({ assetSlots: slots.slice(0, -1), confirmToken: undefined });
  }, [data.assetSlots, id, patchData]);

  const replacePaid = useCallback(async () => {
    if (
      !brandId ||
      !data.adAccountId ||
      !data.campaignId ||
      !data.adsetId ||
      !data.targetAdId ||
      !data.expectedCreativeId
    ) {
      return;
    }
    setActionPending(true);
    try {
      const identity = {
        brandId,
        adAccountId: data.adAccountId,
        campaignId: data.campaignId,
        adsetId: data.adsetId,
        adId: data.targetAdId,
        expectedCreativeId: data.expectedCreativeId,
        format,
        assets,
      };
      const result = await publishingApi.replacePaid({ ...identity, mode: 'preview' });
      if (result.mode !== 'preview')
        throw new Error('The server did not return a replacement review.');
      const urls = await Promise.all(
        assets.map((asset) => signLibraryAsset(brandId, asset.assetId, asset.versionId)),
      );
      setPending({ urls, preview: result, identity: { ...identity, mode: 'preview' } });
      patchData({ confirmToken: undefined, error: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Replacement failed';
      patchData({ error: message, confirmToken: undefined });
      show({ title: 'Could not replace creative', description: message, variant: 'warning' });
    } finally {
      setActionPending(false);
    }
  }, [assets, brandId, data, format, patchData, show]);

  const confirmReplacement = async () => {
    const review = pending;
    setPending(null);
    if (!review) return;
    const current = {
      brandId,
      adAccountId: data.adAccountId,
      campaignId: data.campaignId,
      adsetId: data.adsetId,
      adId: data.targetAdId,
      expectedCreativeId: data.expectedCreativeId,
      format,
      assets,
      mode: 'preview',
    };
    if (JSON.stringify(current) !== JSON.stringify(review.identity)) {
      patchData({ error: 'The creative or target changed. Review the replacement again.' });
      return;
    }
    setActionPending(true);
    try {
      const result = await publishingApi.replacePaid({
        ...review.identity,
        mode: 'confirm',
        confirmToken: review.preview.confirmToken,
      });
      if (result.mode !== 'confirm') throw new Error('The replacement returned no receipt.');
      patchData({
        confirmToken: undefined,
        replacementId: result.replacementId,
        previousCreativeId: result.previousCreativeId,
        appliedCreativeId: result.creativeId,
        expectedCreativeId: result.creativeId,
        publishedAt: result.appliedAt,
        error: undefined,
      });
      show({
        title: 'Ad creative replaced',
        description: 'The receipt retains the previous creative for restore.',
        variant: 'success',
      });
    } catch (cause) {
      patchData({
        error:
          cause instanceof Error
            ? cause.message
            : 'No replacement receipt. Check the ad before retrying.',
      });
    } finally {
      setActionPending(false);
    }
  };
  const confirmRestore = async () => {
    const review = restore;
    setRestore(null);
    if (!review || !brandId || review.replacementId !== data.replacementId) return;
    setActionPending(true);
    try {
      const result = await publishingApi.restorePaid({
        brandId,
        replacementId: review.replacementId,
      });
      patchData({
        expectedCreativeId: result.restoredCreativeId,
        appliedCreativeId: result.restoredCreativeId,
        replacementId: undefined,
        publishedAt: undefined,
        error: undefined,
      });
      show({ title: 'Previous creative restored', variant: 'success' });
    } catch (cause) {
      patchData({ error: cause instanceof Error ? cause.message : 'Could not restore creative.' });
    } finally {
      setActionPending(false);
    }
  };

  const actionDisabled = actionPending || !assetsReady || !data.targetAdId;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Terminal handoff — a canvas run never executes a publisher sink. The
              delivery below is the explicit handoff (same service as studio_deliver). */}
      <p
        data-testid="publisher-handoff-state"
        className="-mx-1.5 -mt-1.5 border-b border-border/60 bg-muted/50 px-2 py-1 text-2xs text-muted-foreground"
      >
        {data.publishedAt
          ? 'Delivered — ad creative replaced.'
          : 'Delivery handoff — a canvas run never publishes this. Deliver below.'}
      </p>

      <select
        className="nodrag h-8 rounded-md border border-border bg-background px-2"
        value={format}
        onChange={(event) => changeFormat(event.target.value as CanvasPublishingFormat)}
        aria-label="Creative format"
      >
        {FORMAT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {format === 'carousel' ? (
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <span>{handles.length} ordered cards</span>
          <span className="flex gap-1">
            <button
              type="button"
              className="nodrag rounded border px-1.5"
              onClick={removeCarouselCard}
            >
              −
            </button>
            <button
              type="button"
              className="nodrag rounded border px-1.5"
              onClick={addCarouselCard}
            >
              +
            </button>
          </span>
        </div>
      ) : null}

      <p className="truncate text-2xs text-muted-foreground">
        {data.adAccountId
          ? `Meta account ${data.adAccountId}`
          : loading
            ? 'Resolving Meta account…'
            : 'Meta account unavailable'}
      </p>
      {data.campaignId ? (
        <button
          type="button"
          className="nodrag truncate text-left text-2xs text-brand-primary"
          onClick={() =>
            patchData({
              campaignId: undefined,
              campaignName: undefined,
              adsetId: undefined,
              adsetName: undefined,
              targetAdId: undefined,
            })
          }
        >
          Campaign: {data.campaignName ?? data.campaignId} ×
        </button>
      ) : null}
      {data.adsetId ? (
        <button
          type="button"
          className="nodrag truncate text-left text-2xs text-brand-primary"
          onClick={() =>
            patchData({
              adsetId: undefined,
              adsetName: undefined,
              targetAdId: undefined,
              confirmToken: undefined,
            })
          }
        >
          Ad set: {data.adsetName ?? data.adsetId} ×
        </button>
      ) : null}

      <Input
        className="nodrag h-8 text-xs"
        placeholder={`Search ${paidLevel}s`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="nodrag -mx-1.5 min-h-0 flex-1 overflow-y-auto border-y border-border/60">
        {loading ? <p className="p-2 text-muted-foreground">Searching…</p> : null}
        {searchError ? <p className="p-2 text-destructive">{searchError}</p> : null}
        {!loading && !searchError
          ? paidTargets.map((target) => (
              <button
                type="button"
                key={target.id}
                className="block w-full border-b p-2 text-left last:border-b-0 hover:bg-muted/60"
                onClick={() => {
                  if (target.level === 'campaign')
                    patchData({ campaignId: target.id, campaignName: target.name });
                  else if (target.level === 'adset')
                    patchData({ adsetId: target.id, adsetName: target.name });
                  else
                    patchData({
                      targetAdId: target.id,
                      targetAdName: target.name,
                      expectedCreativeId: target.creativeId ?? undefined,
                      confirmToken: undefined,
                    });
                  setQuery('');
                }}
              >
                <span className="block truncate font-medium">{target.name}</span>
                <span className="text-2xs text-muted-foreground">
                  {target.status}
                  {target.format ? ` · ${target.format}` : ''}
                </span>
              </button>
            ))
          : null}
        {!loading && !searchError && paidTargets.length === 0 ? (
          <p className="p-2 text-muted-foreground">No {paidLevel}s match this search.</p>
        ) : null}
      </div>

      <p className={cn('text-2xs', assetsReady ? 'text-muted-foreground' : 'text-amber-600')}>
        {assets.length}/{expectedAssetCount} Library assets connected
      </p>
      {data.error ? (
        <p className="rounded bg-destructive/10 p-2 text-2xs text-destructive">{data.error}</p>
      ) : null}
      <Button className="nodrag h-8 w-full text-xs" disabled={actionDisabled} onClick={replacePaid}>
        <Send className="mr-1.5" />
        {actionPending ? 'Working…' : 'Review replacement'}
      </Button>
      {data.replacementId ? (
        <Button
          variant="outline"
          disabled={actionPending}
          onClick={() =>
            setRestore({
              replacementId: data.replacementId!,
              previousCreativeId: data.previousCreativeId,
            })
          }
        >
          Restore previous creative
        </Button>
      ) : null}
      <AlertDialog
        open={Boolean(pending || restore)}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setRestore(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {restore ? 'Restore previous creative?' : 'Replace ad creative?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {restore
                ? `Restore creative ${restore.previousCreativeId ?? ''}. The server refuses if this ad has changed since the replacement.`
                : `Replace ${data.targetAdName ?? pending?.identity.adId} in account ${pending?.identity.adAccountId}. Review the exact Library versions and current creative before confirming.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending ? (
            <div className="space-y-2 text-xs">
              <p>Current creative: {pending.preview.currentCreativeId}</p>
              <p>
                {pending.preview.requiresApproval ? 'This ad is active.' : 'This ad is paused.'}{' '}
                {pending.identity.format} · {pending.identity.assets.length} media items
              </p>
              <ol>
                {pending.identity.assets.map((asset, index) => (
                  <li key={`${asset.assetId}:${asset.order}`} className="break-all">
                    {asset.kind === 'image' ? (
                      <img
                        src={pending.urls[index]}
                        alt={`Replacement creative ${asset.order + 1}`}
                        className="my-2 max-h-40 rounded object-contain"
                      />
                    ) : (
                      // biome-ignore lint/a11y/useMediaCaption: exact reviewer-selected creative; no separate caption track is available.
                      <video
                        src={pending.urls[index]}
                        controls
                        aria-label={`Replacement creative video ${asset.order + 1}`}
                        preload="metadata"
                        className="my-2 max-h-40 rounded"
                      />
                    )}
                    {asset.order + 1}. {asset.assetId} · version {asset.versionId}
                  </li>
                ))}
              </ol>
              <p>Review expires: {pending.preview.expiresAt}</p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              onClick={restore ? confirmRestore : confirmReplacement}
            >
              {restore ? 'Confirm restore' : 'Confirm replacement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
