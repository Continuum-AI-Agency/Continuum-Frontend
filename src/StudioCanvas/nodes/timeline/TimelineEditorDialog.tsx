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
import { ChatBubbleIcon, ChevronDownIcon, PlayIcon } from '@radix-ui/react-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { TimelineInputSource } from '../../types';
import { clipEffectsToCss, resolveTextOverlays, speedFor } from '../../utils/render/effectSpec';
import { DEFAULT_EXPORT_PRESET_ID, EXPORT_PRESETS } from '../../utils/render/exportPresets';
import { headFadeFor, tailFadeFor, transitionOverlayAt } from '../../utils/render/transitions';
import { findActiveCue, groupWordsIntoCues } from '../../utils/splice/captionCues';
import { AUDIO_DROP_ID, AudioTracks } from './AudioTracks';
import type { TimelineEditorAdapter, TimelineRenderSinkKind } from './adapter';
import {
  patchAudioItem,
  placeAudioItem,
  removeAudioItem,
  resolveAudioPlacements,
} from './audioTrackModel';
import { CaptionEditor } from './CaptionEditor';
import { ClipInspector } from './ClipInspector';
import { buildClipPlacements } from './commentMapping';
import { BIN_DRAG_PREFIX, MediaBin } from './MediaBin';
import { probeAudioDuration, probeVideoDuration } from './mediaProbe';
import { resolveOverlayTracks } from './multiTrack';
import { OVERLAY_DROP_ID, trackIdFromOverlayDrop } from './OverlayTrack';
import { OverlayTracks } from './OverlayTracks';
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

  const exportPresetId = document.exportPresetId ?? DEFAULT_EXPORT_PRESET_ID;
  const setExportPreset = useCallback(
    (id: string) => {
      patchDocument((current) => ({ ...current, exportPresetId: id }));
    },
    [patchDocument],
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => captions.generate()}
              disabled={captions.isGenerating || isRendering || items.length === 0}
              title="Transcribe the timeline audio with word-level timing"
            >
              <ChatBubbleIcon className="h-3.5 w-3.5" />
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
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps its select control */}
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              Export
              <select
                className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                value={exportPresetId}
                disabled={isRendering}
                onChange={(event) => setExportPreset(event.target.value)}
              >
                {EXPORT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
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
                  <PlayIcon className="h-3.5 w-3.5" />
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
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="rounded-l-none border-l border-primary-foreground/25 px-2"
                        disabled={renderDisabled}
                        aria-label="Choose where the render goes"
                      >
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
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
              <div className="min-h-0 shrink-0 overflow-y-auto">
                <OverlayTracks
                  lanes={overlayModel.lanes}
                  pxPerSec={pxPerSec}
                  totalSec={model.layout.totalSec}
                  selectedId={selectedOverlayId}
                  onSelect={selectOverlayClip}
                  onSetStart={overlayModel.setStart}
                  onAddTrack={overlayModel.addTrack}
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
