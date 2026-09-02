'use client';

import {
  type CanvasEditorContext,
  timelineAuthoringDocumentSchema,
  timelineDocumentFingerprint,
} from '@continuum/contracts';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, MessageCircle, Play, Redo2, Undo2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasComposer } from '@/components/ai-studio/composer/useCanvasComposer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { generateVideoEvidenceFrames } from '@/lib/library/videoPoster';
import type { TimelineInputSource } from '../../types';
import { clipEffectsToCss, resolveTextOverlays, speedFor } from '../../utils/render/effectSpec';
import {
  availableExportCodecs,
  EXPORT_PRESETS,
  EXPORT_QUALITIES,
  type ExportCodecId,
  type ExportQualityId,
  formatExportSelection,
  probeEncodableVideoCodecs,
  type ResolvedExportCodec,
  resolveExportCodec,
  resolveExportPreset,
  resolveExportQuality,
} from '../../utils/render/exportPresets';
import { headFadeFor, tailFadeFor, transitionOverlayAt } from '../../utils/render/transitions';
import { findActiveCue, groupWordsIntoCues } from '../../utils/splice/captionCues';
import { nleClipsFrom, toEdlCmx3600, toFcpxml } from '../../utils/timeline/nleExport';
import { setTimelineExportCodecPreference } from '../../workers/spliceWorkerClient';
import { AUDIO_DROP_ID, AudioTracks } from './AudioTracks';
import type { TimelineEditorAdapter, TimelineRenderSinkKind } from './adapter';
import {
  patchAudioItem,
  placeAudioItem,
  removeAudioItem,
  resolveAudioPlacements,
} from './audioTrackModel';
import { CaptionEditor } from './CaptionEditor';
import type { ClipBackgroundRemoval } from './ClipInspector';
import { ClipInspector } from './ClipInspector';
import { removeClipBackground, repointClipSource } from './clipBackgroundRemoval';
import { buildClipPlacements } from './commentMapping';
import { BIN_DRAG_PREFIX, MediaBin } from './MediaBin';
import { probeAudioDuration, probeVideoDuration } from './mediaProbe';
import { resolveOverlayTracks } from './multiTrack';
import { OVERLAY_DROP_ID, trackIdFromOverlayDrop } from './OverlayTrack';
import { OverlayTracks } from './OverlayTracks';
import { resolveOverlayPreviewLayers } from './overlayPreview';
import { laneItemEdges } from './snapping';
import { CLIP_DRAG_PREFIX } from './TimelineClipBlock';
import { TimelineCommentLayer } from './TimelineCommentLayer';
import { TimelinePreview } from './TimelinePreview';
import { TIMELINE_DROP_ID, TimelineTrack } from './TimelineTrack';
import { useOverlayModel } from './useOverlayModel';
import { type ClipMedia, usePlayheadPlayback } from './usePlayheadPlayback';
import { useTimelineAudioPreview } from './useTimelineAudioPreview';
import { useTimelineCaptions } from './useTimelineCaptions';
import { clipAtTime, toggleMarkerTime, useTimelineEditorModel } from './useTimelineEditorModel';
import { useTimelineKeymap } from './useTimelineKeymap';
import { useTimelineRender } from './useTimelineRender';

const PX_PER_SEC = 80;

const EXPORT_CODEC_LABELS: Record<ExportCodecId, string> = {
  avc: 'H.264 · MP4',
  hevc: 'HEVC · MP4',
  vp9: 'VP9 · WebM',
};

// Codec picker for the export controls. Options come from the machine's real encoder
// probe, so a codec the hardware refused is never offered; the resolved choice (with
// its container, and any fallback) is reported upward for the render call. The probe
// is a prop only as a test seam — mocking the module would leak process-wide.
export function TimelineExportCodecSelect({
  value,
  onChange,
  onResolvedChange,
  disabled,
  probe = probeEncodableVideoCodecs,
}: {
  value: ExportCodecId;
  onChange: (next: ExportCodecId) => void;
  onResolvedChange?: (resolved: ResolvedExportCodec) => void;
  disabled?: boolean;
  probe?: () => Promise<ReadonlySet<string>>;
}) {
  const [encodable, setEncodable] = useState<ReadonlySet<string>>(() => new Set(['avc']));
  useEffect(() => {
    let mounted = true;
    probe().then((codecs) => {
      if (mounted) setEncodable(codecs);
    });
    return () => {
      mounted = false;
    };
  }, [probe]);

  const resolved = useMemo(() => resolveExportCodec(value, encodable), [value, encodable]);
  useEffect(() => {
    onResolvedChange?.(resolved);
  }, [onResolvedChange, resolved]);

  return (
    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      Codec
      <select
        className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ExportCodecId)}
      >
        {availableExportCodecs(encodable).map((codec) => (
          <option key={codec} value={codec}>
            {EXPORT_CODEC_LABELS[codec]}
          </option>
        ))}
      </select>
      {resolved.fellBackFrom ? (
        <span className="text-2xs">
          {EXPORT_CODEC_LABELS[resolved.fellBackFrom]} unavailable — exporting{' '}
          {EXPORT_CODEC_LABELS[resolved.codec]}
        </span>
      ) : null}
    </label>
  );
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read extracted frame'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

function CanvasEditorCommand({ adapter }: { adapter: TimelineEditorAdapter }) {
  const context = adapter.agentContext;
  const { state, submit } = useCanvasComposer(adapter.brandId ?? undefined, context?.roomId);
  const [prompt, setPrompt] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!context) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = prompt.trim();
    if (!command || preparing || state.status === 'running') return;
    setPreparing(true);
    setLocalError(null);
    try {
      const document = timelineAuthoringDocumentSchema.parse(adapter.getDocument());
      const videoSources = adapter.pool
        .filter((source) => source.kind === 'video' && typeof source.previewUrl === 'string')
        .slice(0, 3);
      const extracted = await Promise.all(
        videoSources.map(async (source) => {
          const response = await fetch(source.previewUrl as string);
          if (!response.ok) return [];
          const frames = await generateVideoEvidenceFrames(await response.blob(), {
            maxFrames: 3,
            maxWidth: 320,
            quality: 0.68,
          });
          return Promise.all(
            frames.map(async (frame) => ({
              sourceNodeId: source.nodeId,
              timestampSec: frame.timestampSec,
              label: source.label,
              mediaType: frame.mimeType as 'image/webp' | 'image/jpeg',
              base64: await blobToBase64(frame.blob),
            })),
          );
        }),
      );
      const editorContext: CanvasEditorContext = {
        nodeId: context.nodeId,
        fingerprint: timelineDocumentFingerprint(document),
        frames: extracted.flat().slice(0, 8),
      };
      await submit(command, [context.nodeId], { editorContext });
      setPrompt('');
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'Could not prepare the editor command.',
      );
    } finally {
      setPreparing(false);
    }
  };

  const busy = preparing || state.status === 'running';
  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-2"
    >
      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Edit with Canvas — tighten pauses, add captions, build a product overlay…"
        className="h-8 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-3 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        disabled={busy}
        aria-label="Edit this video with the Canvas agent"
      />
      <Button type="submit" size="sm" disabled={busy || !prompt.trim()} className="h-8 text-xs">
        {preparing
          ? 'Reading frames…'
          : state.status === 'running'
            ? 'Editing…'
            : 'Edit with Canvas'}
      </Button>
      {localError || state.error ? (
        <span
          className="max-w-56 truncate text-2xs text-destructive"
          title={localError ?? state.error ?? ''}
        >
          {localError ?? state.error}
        </span>
      ) : null}
    </form>
  );
}

export function TimelineEditorDialog({
  adapter,
  open,
  onOpenChange,
}: {
  adapter: TimelineEditorAdapter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { document, patchDocument, pool, renderSinks, onEditorOpenChange } = adapter;
  const items = document.items;
  const overlayTracks = useMemo(() => resolveOverlayTracks(document), [document]);

  const poolById = useMemo(() => new Map(pool.map((source) => [source.nodeId, source])), [pool]);

  // Clip geometry needs each source's duration. Hosts that already know it hand it
  // over with the pool; the rest are probed from their preview media once.
  const [sourceDurations, setSourceDurations] = useState<Map<string, number>>(new Map());
  const probedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSourceDurations((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const source of pool) {
        const known = source.durationSec;
        if (typeof known !== 'number' || known <= 0) continue;
        if (next.get(source.nodeId) === known) continue;
        next.set(source.nodeId, known);
        changed = true;
      }
      return changed ? next : prev;
    });

    let cancelled = false;
    for (const source of pool) {
      if (typeof source.durationSec === 'number' && source.durationSec > 0) continue;
      if (
        (source.kind !== 'video' && source.kind !== 'audio') ||
        !source.previewUrl ||
        probedRef.current.has(source.nodeId)
      )
        continue;
      probedRef.current.add(source.nodeId);
      const probe =
        source.kind === 'audio'
          ? probeAudioDuration(source.previewUrl)
          : probeVideoDuration(source.previewUrl);
      probe
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

  // Let the host know the editor is up: the canvas claims the keyboard scope so its
  // Delete/copy/undo handlers stand down while the dialog owns the keys.
  useEffect(() => {
    if (!open) return;
    onEditorOpenChange(true);
    return () => onEditorOpenChange(false);
  }, [open, onEditorOpenChange]);

  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC);
  const model = useTimelineEditorModel({ adapter, items, sourceDurations, pxPerSec });
  const { render, isRendering, progress, status, support } = useTimelineRender(adapter);
  const captions = useTimelineCaptions(adapter);

  const mediaFor = useCallback(
    (itemId: string): ClipMedia | undefined => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) return undefined;
      const source = poolById.get(item.sourceNodeId);
      const kind = item.kind ?? source?.kind ?? 'video';
      if (kind === 'audio') return undefined;
      return {
        kind,
        url: source?.previewUrl,
        trimStartSec: item.trimStartSec ?? 0,
        speed: speedFor(item.effects),
      };
    },
    [items, poolById],
  );

  const revisionKey = useMemo(() => JSON.stringify(document), [document]);
  const audioPreview = useTimelineAudioPreview({
    adapter,
    layout: model.layout,
    sourceDurations,
    revisionKey,
  });
  const playback = usePlayheadPlayback({
    layout: model.layout,
    mediaFor,
    audioPreview,
    revisionKey,
  });

  const labelFor = useCallback(
    (sourceNodeId: string) => poolById.get(sourceNodeId)?.label ?? 'Clip',
    [poolById],
  );

  const previewUrlFor = useCallback(
    (sourceNodeId: string) => poolById.get(sourceNodeId)?.previewUrl,
    [poolById],
  );

  const overlayModel = useOverlayModel({
    adapter,
    tracks: overlayTracks,
    sourceDurations,
    labelFor,
  });
  const audioPlacements = useMemo(
    () => resolveAudioPlacements(document, sourceDurations),
    [document, sourceDurations],
  );

  // Base, overlay, and audio selections are mutually exclusive — selecting one clears
  // the other so the inspector edits a single clip.
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | undefined>(undefined);
  const [selectedAudioId, setSelectedAudioId] = useState<string | undefined>(undefined);
  const selectBaseClip = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    setSelectedOverlayId(undefined);
    setSelectedAudioId(undefined);
  }, []);
  const selectOverlayClip = useCallback((itemId: string) => {
    setSelectedOverlayId(itemId);
    setSelectedItemId(undefined);
    setSelectedAudioId(undefined);
  }, []);
  const selectAudioClip = useCallback((itemId: string) => {
    setSelectedAudioId(itemId);
    setSelectedItemId(undefined);
    setSelectedOverlayId(undefined);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedItemId(undefined);
    setSelectedOverlayId(undefined);
    setSelectedAudioId(undefined);
  }, []);

  // Selection-driven keyboard actions. Delete removes the selected clip (base or
  // overlay) — never the canvas node; S splits the clip under the playhead.
  const handleDeleteSelected = useCallback(() => {
    if (selectedAudioId) {
      patchDocument((current) => removeAudioItem(current, selectedAudioId));
      setSelectedAudioId(undefined);
      return;
    }
    if (selectedOverlayId) {
      overlayModel.remove(selectedOverlayId);
      setSelectedOverlayId(undefined);
      return;
    }
    if (!selectedItemId) return;
    model.remove(selectedItemId);
    setSelectedItemId(undefined);
  }, [
    model.remove,
    overlayModel.remove,
    patchDocument,
    selectedAudioId,
    selectedItemId,
    selectedOverlayId,
  ]);

  const handleSplitAtPlayhead = useCallback(() => {
    const clip = clipAtTime(model.layout, playback.playheadSec);
    if (!clip) return;
    model.split(clip.item.id, playback.playheadSec - clip.startSec);
  }, [model.layout, model.split, playback.playheadSec]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedItemId) model.duplicate(selectedItemId);
  }, [model.duplicate, selectedItemId]);

  // Dropping a lane drops its overlays with it, so a selection that lived there has
  // to go too or the inspector would edit an item no longer in the document.
  const handleRemoveOverlayTrack = useCallback(
    (trackId: string) => {
      const lane = overlayModel.lanes.find((candidate) => candidate.trackId === trackId);
      if (lane?.items.some((item) => item.id === selectedOverlayId)) {
        setSelectedOverlayId(undefined);
      }
      overlayModel.removeTrack(trackId);
    },
    [overlayModel.lanes, overlayModel.removeTrack, selectedOverlayId],
  );

  // Library review feedback, projected onto this cut. Canvas-scoped timelines
  // are deliberately excluded: there a clip's source id names an upstream canvas
  // node, not a media.assets row, so there is nothing for a comment to hang off.
  const commentPlacements = useMemo(() => {
    if (adapter.scope !== 'library') return null;
    return buildClipPlacements({
      layoutClips: model.layout.clips,
      overlayTracks,
      sourceDurations,
    });
  }, [adapter.scope, model.layout.clips, overlayTracks, sourceDurations]);

  const markers = useMemo(() => document.markers ?? [], [document.markers]);
  // A ruler marker cannot change the rendered output, so it must not invalidate a
  // render that already happened.
  const handleToggleMarker = useCallback(() => {
    patchDocument(
      (current) => ({
        ...current,
        markers: toggleMarkerTime(current.markers ?? [], playback.playheadSec),
      }),
      { invalidatesRender: false },
    );
  }, [patchDocument, playback.playheadSec]);

  useTimelineKeymap({
    enabled: open,
    playheadSec: playback.playheadSec,
    totalSec: model.layout.totalSec,
    onSeek: playback.seek,
    onTogglePlay: playback.toggle,
    onDeleteSelected: handleDeleteSelected,
    onSplitAtPlayhead: handleSplitAtPlayhead,
    onDuplicateSelected: handleDuplicateSelected,
    onToggleMarker: handleToggleMarker,
    onUndo: () => adapter.undoManager?.undo(),
    onRedo: () => adapter.undoManager?.redo(),
  });

  const selectedClip = selectedItemId
    ? model.layout.clips.find((clip) => clip.item.id === selectedItemId)
    : undefined;
  const selectedSourceDuration = selectedClip
    ? sourceDurations.get(selectedClip.item.sourceNodeId)
    : undefined;

  // The inspector edits whichever clip is selected — base or overlay — binding
  // its controls to the matching model.
  const selectedOverlay = overlayModel.findItem(selectedOverlayId);
  const inspectingOverlay = Boolean(selectedOverlay);
  const inspectorItem = selectedOverlay ?? selectedClip?.item;
  const inspectorDuration = selectedOverlay
    ? overlayModel.durationOf(selectedOverlay)
    : (selectedClip?.durationSec ?? 0);
  const inspectorSourceDuration = selectedOverlay
    ? overlayModel.sourceDurationOf(selectedOverlay)
    : selectedSourceDuration;
  const inspectorLabel = inspectorItem ? labelFor(inspectorItem.sourceNodeId) : '';
  const inspectorSource = inspectorItem ? poolById.get(inspectorItem.sourceNodeId) : undefined;

  const [backgroundRemovalState, setBackgroundRemovalState] = useState<{
    pending: boolean;
    progress: number;
    error?: string;
  }>({ pending: false, progress: 0 });

  // The cutout is a NEW bin member, so the control only exists on hosts whose bin can
  // grow. On the canvas the bin IS the node graph's incoming edges — nothing can be
  // added from in here, and a Remove Background action node is the affordance instead.
  const addPoolSources = adapter.addPoolSources;
  const runBackgroundRemoval = useCallback(() => {
    const item = inspectorItem;
    const sourceAssetId = inspectorSource?.sourceAssetId;
    if (!item || !sourceAssetId || !addPoolSources) return;
    setBackgroundRemovalState({ pending: true, progress: 0 });
    removeClipBackground({
      item,
      sourceAssetId,
      label: `${inspectorLabel} (cutout)`,
      brandId: adapter.brandId,
      durationSec: inspectorSourceDuration,
      onProgress: (progress) => setBackgroundRemovalState((current) => ({ ...current, progress })),
    })
      .then((source) => {
        addPoolSources([source]);
        patchDocument((current) => repointClipSource(current, item.id, source.nodeId));
        setBackgroundRemovalState({ pending: false, progress: 1 });
      })
      .catch((error: unknown) => {
        setBackgroundRemovalState({
          pending: false,
          progress: 0,
          error: error instanceof Error ? error.message : 'Background removal failed',
        });
      });
  }, [
    addPoolSources,
    adapter.brandId,
    inspectorItem,
    inspectorLabel,
    inspectorSource,
    inspectorSourceDuration,
    patchDocument,
  ]);

  const backgroundRemoval: ClipBackgroundRemoval | undefined =
    addPoolSources && inspectorItem && inspectorItem.kind !== 'audio'
      ? { run: runBackgroundRemoval, ...backgroundRemovalState }
      : undefined;

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
          | { sourceNodeId?: string; kind?: 'video' | 'image' | 'audio' }
          | undefined;
        if (!payload?.sourceNodeId || !payload.kind || !over) return;
        const overId = String(over.id);
        if (payload.kind === 'audio') {
          if (overId !== AUDIO_DROP_ID) return;
          patchDocument((current) =>
            placeAudioItem(current, {
              sourceNodeId: payload.sourceNodeId as string,
              startSec: playback.playheadSec,
              sourceDurationSec: sourceDurations.get(payload.sourceNodeId as string),
            }),
          );
          return;
        }
        // Dropping onto an overlay lane places a layer at the playhead, in that lane.
        if (overId.startsWith(OVERLAY_DROP_ID)) {
          overlayModel.place(
            payload.sourceNodeId,
            payload.kind,
            playback.playheadSec,
            trackIdFromOverlayDrop(overId),
          );
          return;
        }
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
    [items, model, overlayModel.place, patchDocument, playback.playheadSec, sourceDurations],
  );

  const handlePlace = useCallback(
    (source: TimelineInputSource) => {
      if (source.kind === 'audio') {
        patchDocument((current) =>
          placeAudioItem(current, {
            sourceNodeId: source.nodeId,
            startSec: playback.playheadSec,
            sourceDurationSec: sourceDurations.get(source.nodeId),
          }),
        );
        return;
      }
      model.place(source.nodeId, source.kind);
    },
    [model, patchDocument, playback.playheadSec, sourceDurations],
  );

  // Geometry and quality share the one `exportPresetId` string the strict authoring
  // contract already allows — see `formatExportSelection`.
  const exportPreset = resolveExportPreset(document.exportPresetId);
  const exportQuality = resolveExportQuality(document.exportPresetId);
  // The codec choice is session-local (the strict authoring contract has no field for
  // it); the resolved codec+container reach the render through the worker client's
  // preference seam, which useTimelineRender's runTimelineInWorker call reads.
  const [exportCodec, setExportCodec] = useState<ExportCodecId>('avc');
  const handleResolvedCodec = useCallback((resolved: ResolvedExportCodec) => {
    setTimelineExportCodecPreference({
      videoCodec: resolved.codec,
      container: resolved.container,
    });
  }, []);
  const setExportSelection = useCallback(
    (presetId: string, qualityId: ExportQualityId) => {
      patchDocument((current) => ({
        ...current,
        exportPresetId: formatExportSelection(presetId, qualityId),
      }));
    },
    [patchDocument],
  );

  // NLE interchange: built here, downloaded here, nothing sent anywhere. `sourceLabel`
  // falls back to the item id so a clip whose pool entry has gone missing still names
  // itself in the EDL instead of exporting an empty FROM CLIP NAME.
  const downloadNle = useCallback(
    (format: 'edl' | 'fcpxml') => {
      const clips = nleClipsFrom(model.layout.clips, (sourceNodeId, index) =>
        poolById.get(sourceNodeId)?.label?.trim()
          ? `${poolById.get(sourceNodeId)?.label}`
          : `clip-${index + 1}`,
      );
      if (clips.length === 0) return;
      const title = 'Continuum Timeline';
      const text =
        format === 'edl'
          ? toEdlCmx3600(clips, { title })
          : toFcpxml(clips, {
              title,
              width: exportPreset.width ?? undefined,
              height: exportPreset.height ?? undefined,
            });
      const blob = new Blob([text], {
        type: format === 'edl' ? 'text/plain' : 'application/xml',
      });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = format === 'edl' ? 'timeline.edl' : 'timeline.fcpxml';
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [exportPreset.height, exportPreset.width, model.layout.clips, poolById],
  );

  const handleRender = useCallback(
    async (sink: TimelineRenderSinkKind) => {
      const ok = await render(sink);
      if (ok) onOpenChange(false);
    },
    [onOpenChange, render],
  );

  const activeClip = clipAtTime(model.layout, playback.playheadSec);
  const activeSourceKind = activeClip
    ? (activeClip.item.kind ?? poolById.get(activeClip.item.sourceNodeId)?.kind)
    : undefined;
  const activeKind = activeSourceKind === 'audio' ? undefined : activeSourceKind;
  const activeImageUrl =
    activeClip && activeKind === 'image'
      ? poolById.get(activeClip.item.sourceNodeId)?.previewUrl
      : undefined;

  // Effect CSS + text for the clip under the playhead, resolved at its normalized
  // time so Ken Burns/animated effects track the scrubber. Same spec the export uses.
  const activeClipT =
    activeClip && activeClip.durationSec > 0
      ? Math.max(
          0,
          Math.min(1, (playback.playheadSec - activeClip.startSec) / activeClip.durationSec),
        )
      : 0;
  const activeMediaStyle = clipEffectsToCss(activeClip?.item.effects, activeClipT);
  const activeTextOverlays = resolveTextOverlays(activeClip?.item.effects);
  const activeOverlayLayers = useMemo(() => {
    const layers = resolveOverlayPreviewLayers({
      document,
      pool,
      playheadSec: playback.playheadSec,
      sourceDurations,
    });
    return audioPreview.active ? layers.map((layer) => ({ ...layer, muted: true })) : layers;
  }, [audioPreview.active, document, playback.playheadSec, pool, sourceDurations]);

  const activeIndex = activeClip
    ? model.layout.clips.findIndex((clip) => clip.item.id === activeClip.item.id)
    : -1;
  const activeFadeOverlay = activeClip
    ? transitionOverlayAt(
        playback.playheadSec - activeClip.startSec,
        activeClip.durationSec,
        headFadeFor(activeClip.item.transition, activeIndex === 0),
        tailFadeFor(model.layout.clips[activeIndex + 1]?.item.transition),
      )
    : null;

  // Two-layer cross-dissolve preview: while the playhead is in the tail window of a
  // clip whose successor cross-dissolves in, fade the incoming clip's frame in over
  // the outgoing one (a real A→B blend, not a dip). The DOM preview approximates;
  // the exported blend is exact.
  const nextDissolveClip = model.layout.clips[activeIndex + 1];
  const nextTransition = nextDissolveClip?.item.transition;
  const activeCrossfade = (() => {
    if (!activeClip || !nextDissolveClip || nextTransition?.type !== 'crossDissolve')
      return undefined;
    const dur = Math.min(nextTransition.durationSec, activeClip.durationSec);
    if (dur <= 0) return undefined;
    const localOut = playback.playheadSec - activeClip.startSec;
    const tailStart = activeClip.durationSec - dur;
    if (localOut < tailStart) return undefined;
    const url = poolById.get(nextDissolveClip.item.sourceNodeId)?.previewUrl;
    if (!url) return undefined;
    const kind =
      nextDissolveClip.item.kind ??
      poolById.get(nextDissolveClip.item.sourceNodeId)?.kind ??
      'video';
    if (kind === 'audio') return undefined;
    return { url, kind, opacity: Math.min(1, (localOut - tailStart) / dur) };
  })();

  const captionCues = useMemo(
    () =>
      document.captionCues ??
      (document.captionWords?.length ? groupWordsIntoCues(document.captionWords) : []),
    [document.captionCues, document.captionWords],
  );
  const captionsEnabled = document.captionsEnabled;
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | undefined>(undefined);
  const activeCaption = captionsEnabled
    ? (findActiveCue(captionCues, playback.playheadSec) ?? undefined)
    : undefined;
  const updateCaptionCues = useCallback(
    (nextCues: typeof captionCues) => {
      patchDocument((current) => ({
        ...current,
        captionCues: nextCues,
        captionWords: undefined,
        captionsEnabled: nextCues.length > 0,
        captionStyle: current.captionStyle ?? DEFAULT_CAPTION_STYLE,
      }));
    },
    [patchDocument],
  );

  const renderProgress = Math.max(0, Math.min(1, progress));
  const renderDisabled = isRendering || items.length === 0 || (support ? !support.ok : false);
  const primarySink = renderSinks[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="md:left-[var(--app-sidebar-width,3.5rem)]"
        className="left-4 right-4 top-4 bottom-4 z-50 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border border-border/60 p-0 shadow-2xl sm:max-w-none md:left-[calc(var(--app-sidebar-width,3.5rem)+1rem)]"
      >
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-base">{adapter.header.title}</DialogTitle>
            <DialogDescription className="text-xs">{adapter.header.description}</DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            {adapter.undoManager ? (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={adapter.undoManager.undo}
                  disabled={!adapter.undoManager.canUndo || isRendering}
                  aria-label="Undo timeline edit"
                  title="Undo (⌘Z)"
                >
                  <Undo2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={adapter.undoManager.redo}
                  disabled={!adapter.undoManager.canRedo || isRendering}
                  aria-label="Redo timeline edit"
                  title="Redo (⇧⌘Z)"
                >
                  <Redo2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => captions.generate()}
              disabled={captions.isGenerating || isRendering || items.length === 0}
              title="Transcribe the timeline audio with word-level timing"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {captions.isGenerating
                ? 'Captioning…'
                : captionCues.length > 0
                  ? 'Re-caption'
                  : 'Auto-captions'}
            </Button>
            {captionCues.length > 0 ? (
              // biome-ignore lint/a11y/noLabelWithoutControl: label wraps its Switch control
              <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Switch
                  checked={captionsEnabled ?? false}
                  onCheckedChange={(checked) => captions.setCaptionsEnabled(checked)}
                />
                Captions
              </label>
            ) : null}
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              Export
              <select
                className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                value={exportPreset.id}
                disabled={isRendering}
                onChange={(event) => setExportSelection(event.target.value, exportQuality.id)}
              >
                {EXPORT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              Quality
              <select
                className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                value={exportQuality.id}
                disabled={isRendering}
                onChange={(event) =>
                  setExportSelection(exportPreset.id, event.target.value as ExportQualityId)
                }
                title={exportQuality.description}
              >
                {EXPORT_QUALITIES.map((quality) => (
                  <option key={quality.id} value={quality.id}>
                    {quality.label}
                  </option>
                ))}
              </select>
            </label>
            <TimelineExportCodecSelect
              value={exportCodec}
              onChange={setExportCodec}
              onResolvedChange={handleResolvedCodec}
              disabled={isRendering}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-2xs"
                onClick={() => downloadNle('edl')}
                disabled={items.length === 0}
                title="Download a CMX3600 EDL of this timeline (free, no render)"
              >
                EDL
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-2xs"
                onClick={() => downloadNle('fcpxml')}
                disabled={items.length === 0}
                title="Download an FCPXML of this timeline (free, no render)"
              >
                FCPXML
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            {primarySink ? (
              <div className="flex items-center">
                <Button
                  size="sm"
                  className={renderSinks.length > 1 ? 'gap-1.5 rounded-r-none' : 'gap-1.5'}
                  onClick={() => handleRender(primarySink.kind)}
                  disabled={renderDisabled}
                >
                  <Play className="h-3.5 w-3.5" />
                  {isRendering
                    ? status === 'queued'
                      ? 'Queued…'
                      : status === 'saving'
                        ? 'Saving…'
                        : 'Rendering…'
                    : primarySink.label}
                </Button>
                {renderSinks.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="sm"
                          className="rounded-l-none border-l border-primary-foreground/25 px-2"
                          disabled={renderDisabled}
                          aria-label="Choose where the render goes"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-64">
                      {renderSinks.map((sink) => (
                        <DropdownMenuItem
                          key={sink.kind}
                          onClick={() => handleRender(sink.kind)}
                          className="flex flex-col items-start gap-0.5"
                        >
                          <span className="text-xs font-medium">{sink.label}</span>
                          {sink.description ? (
                            <span className="text-2xs text-muted-foreground">
                              {sink.description}
                            </span>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <CanvasEditorCommand adapter={adapter} />

        {support && !support.ok ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-xs text-destructive">
            {support.reason}
          </div>
        ) : null}
        {isRendering ? (
          <Progress value={renderProgress * 100} className="h-1 rounded-none" />
        ) : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_320px] grid-rows-1 gap-3 p-3">
              <div className="min-h-0 overflow-hidden rounded-lg border border-border/60 p-2">
                <MediaBin
                  pool={pool}
                  onPlace={handlePlace}
                  onRemove={adapter.removePoolSource}
                  action={adapter.binAction}
                />
              </div>
              <div className="min-h-0">
                <TimelinePreview
                  videoRef={playback.videoRef}
                  showVideo={activeKind === 'video'}
                  activeImageUrl={activeImageUrl}
                  isEmpty={items.length === 0}
                  isPlaying={playback.isPlaying}
                  isPreparing={playback.isPreparing}
                  onTogglePlay={playback.toggle}
                  playheadSec={playback.playheadSec}
                  totalSec={model.layout.totalSec}
                  mediaStyle={activeMediaStyle}
                  textOverlays={activeTextOverlays}
                  fadeOverlay={activeFadeOverlay}
                  crossfade={activeCrossfade}
                  overlayLayers={activeOverlayLayers}
                  mediaMuted={audioPreview.active || activeClip?.item.muteAudio}
                  mediaVolume={activeClip?.item.volume}
                  caption={activeCaption}
                  captionStyle={document.captionStyle}
                  onCaptionPositionChange={(position) => {
                    if (!activeCaption) return;
                    setSelectedCaptionId(activeCaption.id);
                    updateCaptionCues(
                      captionCues.map((cue) =>
                        cue.id === activeCaption.id
                          ? { ...cue, style: { ...cue.style, position } }
                          : cue,
                      ),
                    );
                  }}
                />
              </div>
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                <div className="min-h-[220px]">
                  <ClipInspector
                    item={inspectorItem}
                    context={inspectingOverlay ? 'overlay' : 'base'}
                    durationSec={inspectorDuration}
                    sourceDurationSec={inspectorSourceDuration}
                    label={inspectorLabel}
                    sourceAssetId={inspectorSource?.sourceAssetId}
                    backgroundRemoval={backgroundRemoval}
                    onTrim={(range) => {
                      if (inspectingOverlay) {
                        if (selectedOverlayId) overlayModel.trim(selectedOverlayId, range);
                      } else if (selectedItemId) {
                        model.trim(selectedItemId, range);
                      }
                    }}
                    onSetStill={(sec) => {
                      if (inspectingOverlay) {
                        if (selectedOverlayId) overlayModel.setStill(selectedOverlayId, sec);
                      } else if (selectedItemId) {
                        model.setStill(selectedItemId, sec);
                      }
                    }}
                    onSetMute={(mute) => {
                      if (inspectingOverlay) {
                        if (selectedOverlayId) overlayModel.setMuteAudio(selectedOverlayId, mute);
                      } else if (selectedItemId) {
                        model.setMuteAudio(selectedItemId, mute);
                      }
                    }}
                    onSetAudio={(patch) => {
                      if (inspectingOverlay) {
                        if (selectedOverlayId) overlayModel.setAudio(selectedOverlayId, patch);
                      } else if (selectedItemId) {
                        model.setAudio(selectedItemId, patch);
                      }
                    }}
                    onSetEffects={(patch) => {
                      if (inspectingOverlay) {
                        if (selectedOverlayId) overlayModel.setEffects(selectedOverlayId, patch);
                      } else if (selectedItemId) {
                        model.setEffects(selectedItemId, patch);
                      }
                    }}
                    onSetTransition={(transition) => {
                      if (!inspectingOverlay && selectedItemId)
                        model.setTransition(selectedItemId, transition);
                    }}
                    onClose={clearSelection}
                  />
                </div>
                {captionCues.length > 0 ? (
                  <CaptionEditor
                    cues={captionCues}
                    selectedId={selectedCaptionId}
                    style={document.captionStyle}
                    onSelect={setSelectedCaptionId}
                    onChangeCues={updateCaptionCues}
                    onChangeStyle={(captionStyle) =>
                      patchDocument((current) => ({ ...current, captionStyle }))
                    }
                  />
                ) : null}
              </div>
            </div>

            <div className="flex h-[42%] min-h-0 shrink-0 flex-col gap-2 overflow-hidden border-t border-border/60 p-3">
              <div className="shrink-0">
                <AudioTracks
                  placements={audioPlacements}
                  pxPerSec={pxPerSec}
                  totalSec={model.layout.totalSec}
                  selectedId={selectedAudioId}
                  labelFor={labelFor}
                  onSelect={selectAudioClip}
                  onPatch={(itemId, patch) =>
                    patchDocument((current) => patchAudioItem(current, itemId, patch))
                  }
                  onRemove={(itemId) => {
                    patchDocument((current) => removeAudioItem(current, itemId));
                    if (selectedAudioId === itemId) setSelectedAudioId(undefined);
                  }}
                />
              </div>
              {/* Bounded so the lane list can be shorter than its content and scroll:
                  a shrink-0 box with no max height is always exactly as tall as its
                  lanes, which starves the timeline track below it. Two lanes fit. */}
              <div className="max-h-44 min-h-0 shrink-0 overflow-y-auto">
                <OverlayTracks
                  lanes={overlayModel.lanes}
                  pxPerSec={pxPerSec}
                  totalSec={model.layout.totalSec}
                  selectedId={selectedOverlayId}
                  onSelect={selectOverlayClip}
                  onSetStart={overlayModel.setStart}
                  onAddTrack={overlayModel.addTrack}
                  onRemoveTrack={handleRemoveOverlayTrack}
                  onRemove={(itemId) => {
                    overlayModel.remove(itemId);
                    if (selectedOverlayId === itemId) setSelectedOverlayId(undefined);
                  }}
                />
              </div>
              <div className="min-h-0 flex-1">
                <TimelineTrack
                  layout={model.layout}
                  pxPerSec={pxPerSec}
                  onZoomChange={setPxPerSec}
                  playheadSec={playback.playheadSec}
                  onSeek={playback.seek}
                  selectedItemId={selectedItemId}
                  onSelectItem={selectBaseClip}
                  labelFor={labelFor}
                  previewUrlFor={previewUrlFor}
                  extraSnapTimes={laneItemEdges(overlayModel.laneItems)}
                  markers={markers}
                  onTrim={model.trim}
                  onRemove={(itemId) => {
                    model.remove(itemId);
                    if (selectedItemId === itemId) setSelectedItemId(undefined);
                  }}
                  onSplit={model.split}
                  onDuplicate={model.duplicate}
                  onSetMute={model.setMuteAudio}
                  commentLane={
                    commentPlacements && adapter.brandId ? (
                      <TimelineCommentLayer
                        brandId={adapter.brandId}
                        placements={commentPlacements}
                        pxPerSec={pxPerSec}
                        playheadSec={playback.playheadSec}
                        onSeek={playback.seek}
                      />
                    ) : null
                  }
                />
              </div>
            </div>
          </div>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}
