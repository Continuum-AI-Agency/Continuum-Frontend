'use client';

import {
  type CanvasPublishingFormat,
  type PaidCanvasTarget,
  PUBLISH_IMAGE_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Copy, Megaphone, Send, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { PublisherNodeData, StudioNode } from '../types';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
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
export function PaidPublisherBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<PublisherNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
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
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as PublisherNodeData), ...patch },
      }));
      useStudioStore.getState().triggerSave();
    },
    [id, updateNode],
  );

  const assets = useMemo(
    () => resolvePublishingAssets({ nodeId: id, data: { ...data, format }, nodes, edges }),
    [data, edges, format, id, nodes],
  );
  const expectedAssetCount = format === 'carousel' ? handles.length : 1;
  const assetsReady = assets.length === expectedAssetCount;

  const paidLevel = !data.campaignId ? 'campaign' : !data.adsetId ? 'adset' : 'ad';

  useEffect(() => {
    if (!brandId) return;
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
        if (result.adAccountId !== data.adAccountId) {
          patchData({ adAccountId: result.adAccountId });
        }
        setPaidTargets(result.items);
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
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
      const result = data.confirmToken
        ? await publishingApi.replacePaid({
            ...identity,
            mode: 'confirm',
            confirmToken: data.confirmToken,
          })
        : await publishingApi.replacePaid({ ...identity, mode: 'preview' });
      if (result.mode === 'preview') {
        patchData({
          confirmToken: result.confirmToken,
          confirmationExpiresAt: result.expiresAt,
          error: undefined,
        });
        show({
          title: result.requiresApproval ? 'Active ad replacement ready' : 'Paused ad draft ready',
          description: 'Review the selected ad and click Confirm replacement to apply it.',
          variant: 'warning',
        });
      } else {
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
          description:
            'The ad now uses a new immutable creative; the previous creative is retained for restore.',
          variant: 'success',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Replacement failed';
      patchData({ error: message, confirmToken: undefined });
      show({ title: 'Could not replace creative', description: message, variant: 'warning' });
    } finally {
      setActionPending(false);
    }
  }, [assets, brandId, data, format, patchData, show]);

  const actionDisabled = actionPending || !assetsReady || !data.targetAdId;

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[300px] min-h-[360px] rounded-xl transition-shadow',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={300}
        minHeight={360}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={Megaphone} label="Paid Ad">
          <NodeBadge>Meta</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5 text-xs">
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
            {data.adAccountId ? `Meta account ${data.adAccountId}` : 'Resolving Meta account…'}
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
          <Button
            className="nodrag h-8 w-full text-xs"
            disabled={actionDisabled}
            onClick={replacePaid}
          >
            <Send className="mr-1.5" />
            {actionPending
              ? 'Working…'
              : data.confirmToken
                ? 'Confirm replacement'
                : 'Preview replacement'}
          </Button>
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="nodrag h-7 w-7"
              onClick={() => duplicateNode(id)}
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="nodrag h-7 w-7 text-destructive"
              onClick={() => deleteNode(id)}
            >
              <Trash2 />
            </Button>
          </div>
        </NodeContent>
      </CanvasNode>

      {handles.map((handle, index) => (
        <div
          key={handle.id}
          className="absolute -left-2"
          style={{ top: `${((index + 1) / (handles.length + 1)) * 100}%` }}
          title={handle.label}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={handle.id}
            className="studio-handle !h-4 !w-4 !border-2"
          />
        </div>
      ))}
    </div>
  );
}
