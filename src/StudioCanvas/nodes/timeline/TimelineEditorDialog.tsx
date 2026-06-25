'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { PlayIcon } from '@radix-ui/react-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode, TimelineEditorNodeData, TimelineInputSource } from '../../types';
import { resolveTimelineInputPool } from '../../utils/splice/resolveClipSources';
import { BIN_DRAG_PREFIX, MediaBin } from './MediaBin';
import { probeVideoDuration } from './mediaProbe';
import { CLIP_DRAG_PREFIX } from './TimelineClipBlock';
import { TimelinePreview } from './TimelinePreview';
import { TIMELINE_DROP_ID, TimelineTrack } from './TimelineTrack';
import { type ClipMedia, usePlayheadPlayback } from './usePlayheadPlayback';
import { clipAtTime, useTimelineEditorModel } from './useTimelineEditorModel';
import { useTimelineRender } from './useTimelineRender';

const PX_PER_SEC = 80;

export function TimelineEditorDialog({
  nodeId,
  open,
  onOpenChange,
}: {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);

  const node = nodes.find((candidate) => candidate.id === nodeId);
  const data = node?.data as TimelineEditorNodeData | undefined;
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const pool = useMemo(
    () => resolveTimelineInputPool(nodeId, edges, nodes),
    [nodeId, edges, nodes],
  );
  const poolById = useMemo(() => new Map(pool.map((source) => [source.nodeId, source])), [pool]);

  const [sourceDurations, setSourceDurations] = useState<Map<string, number>>(new Map());
  const probedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    for (const source of pool) {
      if (source.kind !== 'video' || !source.previewUrl || probedRef.current.has(source.nodeId))
        continue;
      probedRef.current.add(source.nodeId);
      probeVideoDuration(source.previewUrl)
        .then((duration) => {
          if (cancelled || duration <= 0) return;
          setSourceDurations((prev) => {
            const next = new Map(prev);
            next.set(source.nodeId, duration);
            return next;
          });
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [open, pool]);

  const model = useTimelineEditorModel({ nodeId, items, sourceDurations, pxPerSec: PX_PER_SEC });
  const { render, isRendering, support } = useTimelineRender(nodeId);

  const mediaFor = useCallback(
    (itemId: string): ClipMedia | undefined => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) return undefined;
      const source = poolById.get(item.sourceNodeId);
      return {
        kind: item.kind ?? source?.kind ?? 'video',
        url: source?.previewUrl,
        trimStartSec: item.trimStartSec ?? 0,
      };
    },
    [items, poolById],
  );

  const playback = usePlayheadPlayback({ layout: model.layout, mediaFor });

  const labelFor = useCallback(
    (sourceNodeId: string) => poolById.get(sourceNodeId)?.label ?? 'Clip',
    [poolById],
  );

  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);

      if (activeId.startsWith(BIN_DRAG_PREFIX)) {
        const payload = active.data.current as
          | { sourceNodeId?: string; kind?: 'video' | 'image' }
          | undefined;
        if (!payload?.sourceNodeId || !payload.kind || !over) return;
        const overId = String(over.id);
        let atIndex: number | undefined;
        if (overId.startsWith(CLIP_DRAG_PREFIX)) {
          const targetId = overId.slice(CLIP_DRAG_PREFIX.length);
          const found = items.findIndex((item) => item.id === targetId);
          atIndex = found >= 0 ? found : undefined;
        } else if (overId !== TIMELINE_DROP_ID) {
          return;
        }
        model.place(payload.sourceNodeId, payload.kind, atIndex);
        return;
      }

      if (activeId.startsWith(CLIP_DRAG_PREFIX) && over) {
        const overId = String(over.id);
        if (!overId.startsWith(CLIP_DRAG_PREFIX) || overId === activeId) return;
        model.reorder(
          activeId.slice(CLIP_DRAG_PREFIX.length),
          overId.slice(CLIP_DRAG_PREFIX.length),
        );
      }
    },
    [items, model],
  );

  const handlePlace = useCallback(
    (source: TimelineInputSource) => model.place(source.nodeId, source.kind),
    [model],
  );

  const handleRender = useCallback(async () => {
    const ok = await render();
    if (ok) onOpenChange(false);
  }, [onOpenChange, render]);

  const activeClip = clipAtTime(model.layout, playback.playheadSec);
  const activeKind = activeClip
    ? (activeClip.item.kind ?? poolById.get(activeClip.item.sourceNodeId)?.kind)
    : undefined;
  const activeImageUrl =
    activeClip && activeKind === 'image'
      ? poolById.get(activeClip.item.sourceNodeId)?.previewUrl
      : undefined;

  const progress = typeof data?.progress === 'number' ? Math.max(0, Math.min(1, data.progress)) : 0;
  const renderDisabled = isRendering || items.length === 0 || (support ? !support.ok : false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-base">Video Editor</DialogTitle>
            <DialogDescription className="text-xs">
              Place clips & stills, trim, split, then render. The clip is saved to your library and
              the workflow continues.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isRendering}
            >
              Done
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleRender} disabled={renderDisabled}>
              <PlayIcon className="h-3.5 w-3.5" />
              {isRendering ? 'Rendering…' : 'Render & Continue'}
            </Button>
          </div>
        </DialogHeader>

        {support && !support.ok ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-xs text-destructive">
            {support.reason}
          </div>
        ) : null}
        {isRendering ? <Progress value={progress * 100} className="h-1 rounded-none" /> : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-3 p-3">
            <div className="min-h-0 overflow-hidden rounded-lg border border-border/60 p-2">
              <MediaBin pool={pool} onPlace={handlePlace} />
            </div>
            <div className="min-h-0">
              <TimelinePreview
                videoRef={playback.videoRef}
                showVideo={activeKind === 'video'}
                activeImageUrl={activeImageUrl}
                isEmpty={items.length === 0}
                isPlaying={playback.isPlaying}
                onTogglePlay={playback.toggle}
                playheadSec={playback.playheadSec}
                totalSec={model.layout.totalSec}
              />
            </div>
          </div>

          <div className="border-t border-border/60 p-3">
            <TimelineTrack
              layout={model.layout}
              pxPerSec={PX_PER_SEC}
              playheadSec={playback.playheadSec}
              onSeek={playback.seek}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              labelFor={labelFor}
              onTrim={model.trim}
              onRemove={(itemId) => {
                model.remove(itemId);
                if (selectedItemId === itemId) setSelectedItemId(undefined);
              }}
              onSplit={model.split}
            />
          </div>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}
