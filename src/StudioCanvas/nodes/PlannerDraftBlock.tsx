'use client';

import {
  type CanvasPublishingFormat,
  DRAFT_OUTPUT_HANDLE,
  type OrganicCanvasTarget,
  PLANNER_DRAFT_TEXT_INPUT_HANDLE,
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
import { CalendarRange, Copy, ExternalLink, Save, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  type OrganicPublishTarget,
  OrganicPublishTargetPicker,
} from '@/components/automations/workspace/pickers/OrganicPublishTargetPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { PlannerDraftNodeData, StudioNode } from '../types';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
import { describeDraftWriteError } from './publish/draftWriteErrors';
import { PlannerDraftBrowser } from './publish/PlannerDraftBrowser';
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

const todayDayId = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export function mediaInputHandles(
  data: PlannerDraftNodeData,
): Array<{ id: string; label: string }> {
  if (data.format === 'image') return [{ id: PUBLISH_IMAGE_INPUT_HANDLE, label: 'Image' }];
  if (data.format === 'video') return [{ id: PUBLISH_VIDEO_INPUT_HANDLE, label: 'Video' }];
  return [...(data.assetSlots ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((slot, index) => ({ id: `asset-${slot.id}`, label: String(index + 1) }));
}

/** Caption text wired in from an upstream node, if any. */
export function upstreamCaption(args: {
  nodeId: string;
  nodes: StudioNode[];
  edges: Array<{ target?: string; targetHandle?: string | null; source: string }>;
}): string | null {
  const edge = args.edges.find(
    (candidate) =>
      candidate.target === args.nodeId &&
      candidate.targetHandle === PLANNER_DRAFT_TEXT_INPUT_HANDLE,
  );
  if (!edge) return null;
  const source = args.nodes.find((node) => node.id === edge.source);
  const data = (source?.data ?? {}) as Record<string, unknown>;
  for (const candidate of [data.value, data.text, data.generatedText]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * The organic Planner draft this canvas branch belongs to — found or created here, and
 * saved through the Planner's own write path so it shows up on the calendar exactly like
 * a draft made in the Planner itself.
 *
 * Publishing is NOT here. It is a separate downstream node, wired off `draft`, because a
 * post is irreversible and publicly visible: it deserves its own explicit act, on a saved
 * row, behind its own confirmation.
 */
export function PlannerDraftBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<PlannerDraftNodeData>>) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
  const brandId = useStudioStore((state) => state.brandId);
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const [saving, setSaving] = useState(false);

  const format = data.format ?? 'image';
  const mode = data.mode ?? 'find';
  const handles = mediaInputHandles({ ...data, format });

  const patchData = useCallback(
    (patch: Partial<PlannerDraftNodeData>) => {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as PlannerDraftNodeData), ...patch },
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
  const wiredCaption = useMemo(
    () => upstreamCaption({ nodeId: id, nodes, edges }),
    [edges, id, nodes],
  );

  // A wired caption fills the field until the user types their own. Overwriting an edited
  // caption on every upstream keystroke would silently discard their work.
  useEffect(() => {
    if (wiredCaption && data.caption === undefined) patchData({ caption: wiredCaption });
  }, [data.caption, patchData, wiredCaption]);

  const caption = data.caption ?? wiredCaption ?? '';

  const changeFormat = useCallback(
    (nextFormat: CanvasPublishingFormat) => {
      const slots = nextFormat === 'carousel' ? [randomSlot(0), randomSlot(1)] : [];
      const state = useStudioStore.getState();
      // The media handles change shape, so their edges cannot survive. The BOUND DRAFT
      // does: switching format to match a draft you just picked must not unpick it.
      state.setEdges(
        state.edges.filter(
          (edge) => edge.target !== id || edge.targetHandle === PLANNER_DRAFT_TEXT_INPUT_HANDLE,
        ),
      );
      patchData({ format: nextFormat, assetSlots: slots });
    },
    [id, patchData],
  );

  const addCarouselCard = useCallback(() => {
    const slots = [...(data.assetSlots ?? [])];
    if (slots.length >= 20) return;
    patchData({ assetSlots: [...slots, randomSlot(slots.length)] });
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
    patchData({ assetSlots: slots.slice(0, -1) });
  }, [data.assetSlots, id, patchData]);

  const selectTarget = useCallback(
    (target: OrganicCanvasTarget) =>
      patchData({
        targetDraftId: target.id,
        targetUpdatedAt: target.updatedAt,
        targetTitle: target.title,
        targetStatus: target.status,
        targetFormat: target.format,
        platform: target.platform,
        ...(target.platformAccountId ? { platformAccountId: target.platformAccountId } : {}),
        error: undefined,
      }),
    [patchData],
  );

  const save = useCallback(async () => {
    if (!brandId) return;
    setSaving(true);
    try {
      const result = await publishingApi.writeOrganicDraft({
        brandId,
        ...(data.targetDraftId ? { draftId: data.targetDraftId } : {}),
        ...(data.targetDraftId ? {} : { platform: data.platform ?? 'instagram' }),
        ...(data.targetDraftId || !data.platformAccountId
          ? {}
          : { platformAccountId: data.platformAccountId }),
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        format,
        ...(data.targetDraftId ? {} : { dayId: data.dayId ?? todayDayId() }),
        ...(data.dayId && data.targetDraftId ? { dayId: data.dayId } : {}),
        ...(data.timeOfDay ? { timeOfDay: data.timeOfDay } : {}),
        ...(assets.length > 0 ? { assets } : {}),
        ...(data.targetUpdatedAt ? { expectedUpdatedAt: data.targetUpdatedAt } : {}),
        clientKey: `canvas:${id}`,
      });
      patchData({
        targetDraftId: result.draftId,
        targetUpdatedAt: result.updatedAt,
        savedAt: new Date().toISOString(),
        error: undefined,
      });
      show({
        title: result.created ? 'Draft created' : 'Draft updated',
        description: 'It is on the organic Planner now.',
        variant: 'success',
      });
    } catch (cause) {
      const message = describeDraftWriteError(cause);
      patchData({ error: message });
      show({ title: 'Could not save the draft', description: message, variant: 'warning' });
    } finally {
      setSaving(false);
    }
  }, [assets, brandId, caption, data, format, id, patchData, show]);

  const readyToSave =
    !saving &&
    Boolean(brandId) &&
    (data.targetDraftId ? true : Boolean(data.platform)) &&
    (assets.length === expectedAssetCount || caption.trim().length > 0);

  const target: OrganicPublishTarget = {
    platform: (data.platform ?? 'instagram') as OrganicPublishTarget['platform'],
    accountId: data.platformAccountId ?? '',
  };

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[320px] min-h-[400px] rounded-xl transition-shadow',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={320}
        minHeight={400}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={CalendarRange} label="Planner Draft">
          <NodeBadge>Organic</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5 text-xs">
          <div className="nodrag flex rounded-sm border border-border/60 p-0.5 text-2xs">
            {(['find', 'create'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                className={cn(
                  'flex-1 rounded px-2 py-1',
                  mode === value ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
                onClick={() => patchData({ mode: value })}
              >
                {value === 'find' ? 'Find draft' : 'New draft'}
              </button>
            ))}
          </div>

          <select
            className="nodrag h-8 rounded-md border border-border bg-background px-2"
            value={format}
            onChange={(event) => changeFormat(event.target.value as CanvasPublishingFormat)}
            aria-label="Post format"
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

          {data.targetDraftId ? (
            <div className="-mx-1.5 border-y border-border/60 bg-muted/40 px-2 py-1.5">
              <p className="truncate text-xs font-medium">{data.targetTitle ?? 'Planner draft'}</p>
              <p className="text-2xs text-muted-foreground">
                {data.platform ?? 'instagram'}
                {data.targetStatus ? ` · ${data.targetStatus}` : ''}
                {data.savedAt ? ' · saved' : ''}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <a
                  className="nodrag flex items-center gap-1 text-2xs text-brand-primary underline"
                  href={`/organic?tab=planner&draftId=${encodeURIComponent(data.targetDraftId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  Open in planner
                </a>
                <button
                  type="button"
                  className="nodrag text-2xs text-muted-foreground underline"
                  onClick={() =>
                    patchData({
                      targetDraftId: undefined,
                      targetUpdatedAt: undefined,
                      targetTitle: undefined,
                      targetStatus: undefined,
                      targetFormat: undefined,
                      savedAt: undefined,
                    })
                  }
                >
                  Unbind
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'create' && !data.targetDraftId ? (
            <div className="nodrag flex flex-col gap-2">
              <OrganicPublishTargetPicker
                brandId={brandId ?? undefined}
                value={target}
                disabled={saving}
                onChange={(next) =>
                  patchData({ platform: next.platform, platformAccountId: next.accountId })
                }
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  className="nodrag h-8 text-xs"
                  value={data.dayId ?? todayDayId()}
                  onChange={(event) => patchData({ dayId: event.target.value })}
                  aria-label="Scheduled day"
                />
                <Input
                  type="time"
                  className="nodrag h-8 w-24 text-xs"
                  value={data.timeOfDay ?? '09:00'}
                  onChange={(event) => patchData({ timeOfDay: event.target.value })}
                  aria-label="Scheduled time"
                />
              </div>
            </div>
          ) : null}

          {mode === 'find' && !data.targetDraftId && brandId ? (
            <PlannerDraftBrowser
              brandId={brandId}
              format={format}
              selectedDraftId={data.targetDraftId}
              onSelect={selectTarget}
              onSwitchFormat={changeFormat}
            />
          ) : null}

          <Textarea
            className="nodrag min-h-16 text-xs"
            placeholder="Caption — or wire one in on the left"
            value={caption}
            onChange={(event) => patchData({ caption: event.target.value })}
            aria-label="Caption"
          />

          <p
            className={cn(
              'text-2xs',
              assets.length === expectedAssetCount ? 'text-muted-foreground' : 'text-amber-600',
            )}
          >
            {assets.length}/{expectedAssetCount} Library assets connected
          </p>
          {data.error ? (
            <p className="rounded bg-destructive/10 p-2 text-2xs text-destructive">{data.error}</p>
          ) : null}

          <Button className="nodrag h-8 w-full text-xs" disabled={!readyToSave} onClick={save}>
            <Save className="mr-1.5" />
            {saving ? 'Saving…' : data.targetDraftId ? 'Save to planner' : 'Create draft'}
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

      <div className="absolute -left-2 top-3" title="Caption">
        <Handle
          type="target"
          position={Position.Left}
          id={PLANNER_DRAFT_TEXT_INPUT_HANDLE}
          className="studio-handle !h-4 !w-4 !border-2"
        />
      </div>
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
      <div className="absolute -right-2 top-1/2" title="Planner draft">
        <Handle
          type="source"
          position={Position.Right}
          id={DRAFT_OUTPUT_HANDLE}
          className="studio-handle !h-4 !w-4 !border-2"
        />
      </div>
    </div>
  );
}
