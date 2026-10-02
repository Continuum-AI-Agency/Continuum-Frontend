'use client';

import {
  type EditorAudioClip,
  type EditorClip,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTrack,
  type EditorVideoClip,
  motionRecipeFromClip,
  parseMotionRecipe,
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
import { Plus, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useElementMutations, useElements } from '@/lib/ai-studio/elements';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import { captionAnimationFromEditorId, captionMotionTransform } from '@/lib/clips/captionAnimation';
import type { TimelineInputSource, TimelineItem } from '../../types';
import {
  clipEffectsToCss,
  type ResolvedTextOverlay,
  resolveTransformAt,
} from '../../utils/render/effectSpec';
import { mergeClipShaderEffects } from '../../utils/render/shaderStack';
import { AUDIO_DROP_ID, AudioTracks } from './AudioTracks';
import { MediaOverlayEditor } from './assembly/MediaOverlayEditor';
import { TextOverlayEditor } from './assembly/TextOverlayEditor';
import { TransitionEditor } from './assembly/TransitionEditor';
import {
  applyAnimationStyleOperation,
  applyMotionRecipeOperation,
  applyNestedSequenceEdit,
  type EditorAssemblyOperation,
  editorProjectV2CommentPlacements,
  orderedVideoClips,
  patchAudioOperation,
  placeAudioOperation,
  placeVideoOperation,
  precomposeClipsOperation,
  primaryVideoTrack,
  removeClipOperation,
  reorderVideoOperation,
  splitClipOperation,
  trimAnimationStyleOperation,
  trimClipOperation,
  upsertKeyframeOperation,
  upsertOverlayOperation,
  videoLayout,
  viewProjectForSequence,
} from './editorProjectV2AssemblyModel';
import { BIN_DRAG_PREFIX, MediaBin } from './MediaBin';
import { probeAudioDuration, probeVideoDuration } from './mediaProbe';
import { MotionPathOverlay } from './motion/MotionPathOverlay';
import { MotionTimeline } from './motion/MotionTimeline';
import { currentPropertyValue } from './motion/motionLayers';
import { nestedPreviewGroups } from './nestedSequencePreview';
import type { OverlayPreviewLayer } from './overlayPreview';
import { CLIP_DRAG_PREFIX } from './TimelineClipBlock';
import { TimelineCommentLayer } from './TimelineCommentLayer';
import { TimelinePreview } from './TimelinePreview';
import { TIMELINE_DROP_ID, TimelineTrack } from './TimelineTrack';
import { useExactPreviewUrls } from './useClipPreviewUrls';
import { useEditorProjectV2AudioPreview } from './useEditorProjectV2AudioPreview';
import { type ClipMedia, usePlayheadPlayback } from './usePlayheadPlayback';

const PX_PER_SEC = 80;

type AudioTrack = Extract<EditorTrack, { kind: 'audio' }>;
type OverlayTrack = Extract<EditorTrack, { kind: 'overlay' }>;
type TextTrack = Extract<EditorTrack, { kind: 'text' }>;

function poolSourceForClip(
  clip: EditorVideoClip | EditorAudioClip | EditorOverlayClip,
  pool: readonly TimelineInputSource[],
): TimelineInputSource | undefined {
  const sourceRef = clip.source;
  if (sourceRef.sourceType === 'canvas_node') {
    return pool.find((source) => source.nodeId === sourceRef.nodeId);
  }
  if (sourceRef.sourceType !== 'library_asset') return undefined;
  return pool.find(
    (source) =>
      source.sourceAssetId === sourceRef.assetId &&
      (!sourceRef.renditionId || source.sourceVersionId === sourceRef.renditionId),
  );
}

const probeSourceDuration = (
  kind: TimelineInputSource['kind'],
  url: string,
): Promise<number | undefined> =>
  (kind === 'audio' ? probeAudioDuration(url) : probeVideoDuration(url))
    .then((seconds) => (seconds > 0 ? seconds : undefined))
    .catch(() => undefined);

export function EditorProjectV2Assembly({
  project,
  brandId,
  pool,
  busy,
  canUndo,
  canRedo,
  renderBlockers,
  initialTimelineMode = 'edit',
  onApply,
  onUndo,
  onRedo,
  onRender,
}: {
  project: EditorProjectV2;
  brandId: string;
  pool: TimelineInputSource[];
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** `editorRenderBlockers(project)` — empty means the project can render. */
  renderBlockers: readonly string[];
  initialTimelineMode?: 'edit' | 'motion';
  onApply: (operation: EditorAssemblyOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRender: () => void;
}) {
  const { show } = useToast();
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC);
  const [timelineMode, setTimelineMode] = useState<'edit' | 'motion'>(initialTimelineMode);
  const [autoKey, setAutoKey] = useState(false);
  const [selectedMotionClipId, setSelectedMotionClipId] = useState<string | null>(null);
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);
  const viewProject = viewProjectForSequence(project, editingSequenceId);
  const commit = (operation: EditorAssemblyOperation) => {
    onApply(
      editingSequenceId
        ? applyNestedSequenceEdit(project, editingSequenceId, operation)
        : operation,
    );
  };
  const { elements } = useElements(brandId);
  const elementMutations = useElementMutations(brandId);
  const motionElements = useMemo(
    () =>
      elements
        .filter(
          (element) =>
            Boolean(element.motionRecipe) &&
            (element.category === 'animation' || element.category === 'effect'),
        )
        .map((element) => ({ id: element.id, name: element.name })),
    [elements],
  );
  const [selectedVideoId, setSelectedVideoId] = useState<string>();
  const [selectedAudioId, setSelectedAudioId] = useState<string>();
  const layout = useMemo(() => {
    const computed = videoLayout(viewProject, pxPerSec);
    return computed.totalSec >= viewProject.durationSec
      ? computed
      : { ...computed, totalSec: viewProject.durationSec };
  }, [pxPerSec, viewProject]);
  const videoTrack = primaryVideoTrack(project);
  const clips = useMemo(() => orderedVideoClips(videoTrack), [videoTrack]);
  const clipById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip] as const)), [clips]);
  const urls = useExactPreviewUrls(project, brandId, pool);
  const mediaFor = useCallback(
    (clipId: string): ClipMedia | undefined => {
      const clip = clipById.get(clipId);
      if (!clip) return undefined;
      return {
        kind: 'video',
        url: urls.get(clip.id),
        trimStartSec: clip.sourceInSec,
        speed: clip.playbackRate,
      };
    },
    [clipById, urls],
  );
  const audioPreview = useEditorProjectV2AudioPreview({ project, layout, exactUrls: urls });
  const playback = usePlayheadPlayback({
    layout,
    mediaFor,
    audioPreview,
    revisionKey: project.fingerprint,
  });
  const commentPlacements = useMemo(
    () => editorProjectV2CommentPlacements(project, layout),
    [layout, project],
  );
  const active = layout.clips.find(
    (clip) =>
      playback.playheadSec >= clip.startSec &&
      playback.playheadSec < clip.startSec + clip.durationSec,
  );
  const activeVideoClip = active ? clipById.get(active.item.id) : undefined;
  const activeEffectTimeSec = active ? Math.max(0, playback.playheadSec - active.startSec) : 0;
  const activeEffects = activeVideoClip
    ? mergeClipShaderEffects(
        clipEffectSpecFromEditorClip(activeVideoClip, viewProject),
        poolSourceForClip(activeVideoClip, pool)?.shaderStack,
      )
    : undefined;
  const activeClipT =
    active && active.durationSec > 0
      ? Math.max(0, Math.min(1, activeEffectTimeSec / active.durationSec))
      : 0;
  const textTrack = project.tracks.find((track): track is TextTrack => track.kind === 'text');
  const activeText: ResolvedTextOverlay[] = (textTrack?.clips ?? [])
    .filter(
      (clip) =>
        clip.enabled &&
        playback.playheadSec >= clip.timelineStartSec &&
        playback.playheadSec < clip.timelineStartSec + clip.durationSec,
    )
    .map((clip) => {
      const motion = captionMotionTransform({
        entry: captionAnimationFromEditorId(clip.animationIn),
        exit: captionAnimationFromEditorId(clip.animationOut),
        cueStartSec: clip.timelineStartSec,
        cueEndSec: clip.timelineStartSec + clip.durationSec,
        cueAnimationClock: clip.textAnimationClock,
        wordStartSec: clip.timelineStartSec,
        wordEndSec: clip.timelineStartSec + clip.durationSec,
        outputTimeSec: playback.playheadSec,
        fontPx: clip.style.fontSizePx,
      });
      const spec = clipEffectSpecFromEditorClip(clip, viewProject);
      const at = resolveTransformAt(
        spec,
        (playback.playheadSec - clip.timelineStartSec) / clip.durationSec,
      );
      return {
        id: clip.id,
        text: clip.text,
        xFrac: 0.5 + at.offsetX,
        yFrac: 0.5 + at.offsetY,
        sizeFrac: clip.style.fontSizePx / project.canvas.height,
        color: clip.style.color,
        background: clip.style.backgroundColor,
        fontWeight: clip.style.fontWeight,
        opacity: motion.alpha,
        scale: motion.scale,
        translateYEm: motion.dy / clip.style.fontSizePx,
      };
    });
  const overlayTrack = viewProject.tracks.find(
    (track): track is OverlayTrack => track.kind === 'overlay',
  );
  const overlayLayerAt = (
    clip: EditorOverlayClip,
    playheadSec: number,
    space: EditorProjectV2,
  ): OverlayPreviewLayer | null => {
    const url = urls.get(clip.id);
    if (
      !url ||
      !clip.enabled ||
      playheadSec < clip.timelineStartSec ||
      playheadSec >= clip.timelineStartSec + clip.durationSec
    )
      return null;
    const effectTimeSec = playheadSec - clip.timelineStartSec;
    const effects = mergeClipShaderEffects(
      clipEffectSpecFromEditorClip(clip, space),
      poolSourceForClip(clip, pool)?.shaderStack,
    );
    const css = clipEffectsToCss(
      effects,
      clip.durationSec > 0 ? effectTimeSec / clip.durationSec : 0,
    );
    return {
      id: clip.id,
      kind: clip.mediaKind === 'video' ? 'video' : 'image',
      url,
      sourceSec: (clip.sourceInSec ?? 0) + playheadSec - clip.timelineStartSec,
      playbackRate: 1,
      muted: true,
      volume: 0,
      effects,
      effectTimeSec,
      mediaStyle: {
        ...css,
        transformOrigin: `${clip.transform.anchorX * 100}% ${clip.transform.anchorY * 100}%`,
      },
      textOverlays: [],
    };
  };
  const overlayLayers: OverlayPreviewLayer[] = (overlayTrack?.clips ?? []).flatMap((clip) => {
    const layer = overlayLayerAt(clip, playback.playheadSec, viewProject);
    return layer ? [layer] : [];
  });
  const nestedGroups = editingSequenceId
    ? []
    : nestedPreviewGroups({
        project,
        playheadSec: playback.playheadSec,
        overlayLayerFor: (clip, timeSec) => overlayLayerAt(clip, timeSec, project),
      });

  const audioTracks = project.tracks.filter(
    (track): track is AudioTrack => track.kind === 'audio' && !track.id.endsWith(':audio'),
  );
  const audioLocationById = new Map(
    audioTracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id] as const)),
  );
  const audioPlacements = audioTracks.flatMap((track) =>
    track.clips.map((clip) => ({
      trackId: track.id,
      item: {
        id: clip.id,
        order: 0,
        sourceNodeId: clip.id,
        kind: 'audio' as const,
        startSec: clip.timelineStartSec,
        trimStartSec: clip.sourceInSec,
        trimEndSec: clip.sourceInSec + clip.durationSec,
        volume: clip.volume,
        audioFadeInSec: clip.fadeInSec,
        audioFadeOutSec: clip.fadeOutSec,
      } satisfies TimelineItem,
      startSec: clip.timelineStartSec,
      durationSec: clip.durationSec,
      endSec: clip.timelineStartSec + clip.durationSec,
    })),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  // A media bin tile becomes a durable clip. The source's length is probed off its own
  // preview when the host does not already know it, so a dropped clip is as long as the
  // media actually is rather than a placeholder everyone then has to trim.
  const place = useCallback(
    async (source: TimelineInputSource) => {
      const durationSec =
        source.durationSec ??
        (source.kind !== 'image' && source.previewUrl
          ? await probeSourceDuration(source.kind, source.previewUrl)
          : undefined);
      try {
        onApply(
          source.kind === 'audio'
            ? placeAudioOperation(project, {
                source,
                timelineStartSec: playback.playheadSec,
                sourceDurationSec: durationSec,
              })
            : placeVideoOperation(project, { source, durationSec }),
        );
      } catch (error) {
        show({
          title: 'Could not place that clip',
          description:
            error instanceof Error ? error.message : 'The assembly could not take this source.',
          variant: 'warning',
        });
      }
    },
    [onApply, playback.playheadSec, project, show],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over) return;
      const activeId = String(event.active.id);
      const overId = String(event.over.id);
      if (activeId.startsWith(BIN_DRAG_PREFIX)) {
        const nodeId = (event.active.data.current as { sourceNodeId?: string } | undefined)
          ?.sourceNodeId;
        const source = pool.find((candidate) => candidate.nodeId === nodeId);
        const onTimeline = overId === TIMELINE_DROP_ID || overId.startsWith(CLIP_DRAG_PREFIX);
        const onAudio = overId === AUDIO_DROP_ID && source?.kind === 'audio';
        if (!source || !(onTimeline || onAudio)) return;
        void place(source);
        return;
      }
      if (!videoTrack) return;
      if (!activeId.startsWith(CLIP_DRAG_PREFIX) || !overId.startsWith(CLIP_DRAG_PREFIX)) return;
      const operation = reorderVideoOperation(
        project,
        videoTrack.id,
        activeId.slice(CLIP_DRAG_PREFIX.length),
        overId.slice(CLIP_DRAG_PREFIX.length),
      );
      if (operation) onApply(operation);
    },
    [onApply, place, pool, project, videoTrack],
  );

  const audioPool = pool.filter(
    (source) => source.kind === 'audio' && source.sourceAssetId && source.sourceVersionId,
  );
  const overlayPool = pool.filter(
    (source) =>
      (source.kind === 'image' || source.kind === 'video') &&
      source.sourceAssetId &&
      source.sourceVersionId,
  );
  const selectedAudio = audioPlacements.find((placement) => placement.item.id === selectedAudioId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-3 lg:min-h-[640px] lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="flex flex-col rounded-lg border border-border/60 bg-card p-3 lg:min-h-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Canonical assembly</h2>
            <div className="flex">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onUndo}
                disabled={!canUndo || busy}
                aria-label="Undo assembly edit"
              >
                <Undo2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onRedo}
                disabled={!canRedo || busy}
                aria-label="Redo assembly edit"
              >
                <Redo2 className="size-3.5" />
              </Button>
            </div>
          </div>
          <p className="mb-3 text-2xs text-muted-foreground">
            Every edit commits a durable project revision. Undo and redo restore persisted timeline
            snapshots with optimistic concurrency.
          </p>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3">
            <section className="min-h-[9rem]">
              <MediaBin pool={pool} onPlace={(source) => void place(source)} />
            </section>
            <section>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                Pinned overlays
              </div>
              {overlayPool.length ? (
                <div className="space-y-2">
                  {overlayPool.map((source) => (
                    <Button
                      key={source.nodeId}
                      variant="outline"
                      size="sm"
                      className="h-auto w-full justify-start py-2 text-left text-xs"
                      onClick={() =>
                        onApply(
                          upsertOverlayOperation(project, {
                            assetId: source.sourceAssetId as string,
                            versionId: source.sourceVersionId as string,
                            label: source.label,
                            mediaKind: source.kind as 'image' | 'video',
                            timelineStartSec: playback.playheadSec,
                            durationSec: source.kind === 'video' ? (source.durationSec ?? 3) : 3,
                          }),
                        )
                      }
                      disabled={busy}
                    >
                      <Plus className="size-3.5" /> {source.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground">
                  Connect a pinned Library image or video to add picture-in-picture or a logo.
                </p>
              )}
            </section>
            <section>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Pinned audio</div>
              {audioPool.length ? (
                <div className="space-y-2">
                  {audioPool.map((source) => (
                    <Button
                      key={source.nodeId}
                      variant="outline"
                      size="sm"
                      className="h-auto w-full justify-start py-2 text-left text-xs"
                      onClick={() =>
                        onApply(
                          placeAudioOperation(project, {
                            source,
                            timelineStartSec: playback.playheadSec,
                            sourceDurationSec: source.durationSec,
                          }),
                        )
                      }
                      disabled={busy}
                    >
                      <Plus className="size-3.5" /> {source.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground">
                  Connect a pinned Library audio source to place music or voiceover.
                </p>
              )}
            </section>
          </div>
          <Button
            className="mt-auto w-full"
            onClick={onRender}
            disabled={busy || !clips.length || renderBlockers.length > 0}
            title={renderBlockers.length > 0 ? renderBlockers.join(' ') : undefined}
          >
            Render final 1080p
          </Button>
          {renderBlockers.length > 0 ? (
            <p className="mt-1.5 text-2xs text-muted-foreground">{renderBlockers[0]}</p>
          ) : null}
        </aside>

        <div className="grid min-w-0 grid-rows-[minmax(280px,1fr)_220px_auto_110px] gap-3 lg:min-h-0">
          <TimelinePreview
            videoRef={playback.videoRef}
            showVideo={Boolean(active)}
            isEmpty={!clips.length}
            isPlaying={playback.isPlaying}
            isPreparing={playback.isPreparing}
            onTogglePlay={playback.toggle}
            playheadSec={playback.playheadSec}
            totalSec={layout.totalSec}
            mediaStyle={clipEffectsToCss(activeEffects, activeClipT)}
            shaderEffects={activeEffects}
            shaderTimeSec={activeEffectTimeSec}
            textOverlays={activeText}
            overlayLayers={overlayLayers}
            nestedGroups={nestedGroups}
            motionPath={
              overlayTrack?.clips.find((clip) => clip.id === selectedMotionClipId) ? (
                <MotionPathOverlay
                  clip={
                    overlayTrack.clips.find(
                      (clip) => clip.id === selectedMotionClipId,
                    ) as NonNullable<(typeof overlayTrack.clips)[number]>
                  }
                />
              ) : null
            }
            mediaMuted={
              audioPreview.active || (active ? !clipById.get(active.item.id)?.audioEnabled : true)
            }
          />
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={timelineMode === 'edit' ? 'default' : 'outline'}
                className="h-7 text-2xs"
                onClick={() => setTimelineMode('edit')}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant={timelineMode === 'motion' ? 'default' : 'outline'}
                className="h-7 text-2xs"
                onClick={() => setTimelineMode('motion')}
              >
                Motion
              </Button>
              {editingSequenceId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-2xs"
                  onClick={() => setEditingSequenceId(null)}
                >
                  Main /{' '}
                  {project.nestedSequences.find((sequence) => sequence.id === editingSequenceId)
                    ?.name ?? 'Precomp'}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-2xs"
                disabled={
                  Boolean(editingSequenceId) ||
                  !selectedMotionClipId ||
                  !viewProject.tracks.some((track) =>
                    track.clips.some(
                      (clip) =>
                        clip.id === selectedMotionClipId &&
                        (clip.kind === 'overlay' || clip.kind === 'text'),
                    ),
                  )
                }
                onClick={() => {
                  if (!selectedMotionClipId) return;
                  commit(
                    precomposeClipsOperation(viewProject, { clipIds: [selectedMotionClipId] }),
                  );
                  setSelectedMotionClipId(null);
                }}
              >
                Precompose
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-2xs"
                disabled={
                  Boolean(editingSequenceId) ||
                  !project.tracks.some(
                    (track) =>
                      track.kind === 'nested_sequence' &&
                      track.clips.some((clip) => clip.id === selectedMotionClipId),
                  )
                }
                onClick={() => {
                  const nest = project.tracks
                    .flatMap((track) => (track.kind === 'nested_sequence' ? track.clips : []))
                    .find((clip) => clip.id === selectedMotionClipId);
                  if (nest?.kind === 'nested_sequence') {
                    setEditingSequenceId(nest.sequenceId);
                    playback.seek(0);
                  }
                }}
              >
                Open nest
              </Button>
            </div>
            {timelineMode === 'motion' ? (
              <MotionTimeline
                project={viewProject}
                playheadSec={playback.playheadSec}
                pxPerSec={pxPerSec}
                autoKey={autoKey}
                playbackMode={playback.playbackMode}
                isPlaying={playback.isPlaying}
                selectedClipId={selectedMotionClipId}
                canSaveElement={Boolean(
                  (() => {
                    const clip = project.tracks
                      .flatMap((track): EditorClip[] => track.clips)
                      .find((candidate) => candidate.id === selectedMotionClipId);
                    return (
                      clip &&
                      'keyframes' in clip &&
                      clip.keyframes.length > 0 &&
                      'source' in clip &&
                      clip.source.sourceType === 'library_asset'
                    );
                  })(),
                )}
                savingElement={elementMutations.create.isPending}
                motionElements={motionElements}
                onSelectClip={setSelectedMotionClipId}
                onSeek={playback.seek}
                onToggleAutoKey={() => setAutoKey((current) => !current)}
                onTogglePlay={playback.toggle}
                onCyclePlayback={playback.cyclePlaybackMode}
                onPatchKeyframe={({ trackId, clipId, keyframe }) =>
                  commit(upsertKeyframeOperation(viewProject, { trackId, clipId, keyframe }))
                }
                onAddKeyframe={({ trackId, clipId, property, timeSec }) => {
                  const track = viewProject.tracks.find((candidate) => candidate.id === trackId);
                  const clip = track?.clips.find((candidate) => candidate.id === clipId);
                  if (!clip || !('transform' in clip)) return;
                  commit(
                    upsertKeyframeOperation(viewProject, {
                      trackId,
                      clipId,
                      keyframe: {
                        id: crypto.randomUUID(),
                        property,
                        timeSec,
                        value: currentPropertyValue(clip.transform, property),
                        interpolation: 'linear',
                      },
                    }),
                  );
                }}
                onApplyStyle={({ trackId, clipId, styleId }) => {
                  const clip = viewProject.tracks
                    .find((track) => track.id === trackId)
                    ?.clips.find((candidate) => candidate.id === clipId);
                  commit(
                    applyAnimationStyleOperation(viewProject, {
                      trackId,
                      clipId,
                      styleId,
                      timelineOffsetSec: clip
                        ? Math.max(0, playback.playheadSec - clip.timelineStartSec)
                        : 0,
                    }),
                  );
                }}
                onTrimStyle={({ trackId, clipId, instanceId, startSec, endSec }) =>
                  commit(
                    trimAnimationStyleOperation(viewProject, {
                      trackId,
                      clipId,
                      instanceId,
                      startSec,
                      endSec,
                    }),
                  )
                }
                onSaveElement={() => {
                  const clip = viewProject.tracks
                    .flatMap((track): EditorClip[] => track.clips)
                    .find((candidate) => candidate.id === selectedMotionClipId);
                  if (!clip || !('keyframes' in clip) || !('source' in clip)) return;
                  if (clip.source.sourceType !== 'library_asset') {
                    show({
                      title: 'Needs a Library overlay',
                      description: 'Save Element uses the overlay image as the Element member.',
                      variant: 'warning',
                    });
                    return;
                  }
                  const recipe = motionRecipeFromClip(clip);
                  if (!recipe) return;
                  void elementMutations.create
                    .mutateAsync({
                      name: `${clip.name ?? 'Motion'} motion`,
                      category: 'animation',
                      memberAssetIds: [clip.source.assetId],
                      motionRecipe: recipe,
                    })
                    .then(() => {
                      show({
                        title: 'Saved Element',
                        description: 'Place it onto any overlay from Motion.',
                      });
                    })
                    .catch((error: unknown) => {
                      show({
                        title: 'Could not save Element',
                        description:
                          error instanceof Error
                            ? error.message
                            : 'The Element could not be created.',
                        variant: 'warning',
                      });
                    });
                }}
                onPlaceElement={(elementId) => {
                  const clip = viewProject.tracks
                    .flatMap((track): EditorClip[] => track.clips)
                    .find((candidate) => candidate.id === selectedMotionClipId);
                  const track = viewProject.tracks.find((candidate) =>
                    candidate.clips.some((item) => item.id === selectedMotionClipId),
                  );
                  const recipe = parseMotionRecipe(
                    elements.find((element) => element.id === elementId)?.motionRecipe,
                  );
                  if (!clip || !track || !recipe) return;
                  commit(
                    applyMotionRecipeOperation(viewProject, {
                      trackId: track.id,
                      clipId: clip.id,
                      recipe,
                    }),
                  );
                }}
              />
            ) : (
              <TimelineTrack
                layout={layout}
                pxPerSec={pxPerSec}
                onZoomChange={setPxPerSec}
                playheadSec={playback.playheadSec}
                onSeek={playback.seek}
                selectedItemId={selectedVideoId}
                onSelectItem={setSelectedVideoId}
                labelFor={(clipId) => clipById.get(clipId)?.name ?? 'Approved master'}
                previewUrlFor={(clipId) => urls.get(clipId)}
                onTrim={(clipId, range) => {
                  if (!videoTrack) return;
                  const clip = clipById.get(clipId);
                  if (!clip) return;
                  const sourceInSec = range.startSec ?? clip.sourceInSec;
                  const sourceEnd =
                    range.endSec ?? clip.sourceInSec + clip.durationSec * clip.playbackRate;
                  onApply(
                    trimClipOperation(project, videoTrack.id, clipId, {
                      sourceInSec,
                      durationSec: (sourceEnd - sourceInSec) / clip.playbackRate,
                    }),
                  );
                }}
                onRemove={(clipId) => {
                  if (videoTrack) onApply(removeClipOperation(project, videoTrack.id, clipId));
                }}
                onSplit={(clipId, localSec) => {
                  if (!videoTrack) return;
                  const operation = splitClipOperation(
                    project,
                    videoTrack.id,
                    clipId,
                    localSec,
                    crypto.randomUUID(),
                  );
                  if (operation) onApply(operation);
                }}
              />
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-card px-3 py-2">
            <div className="mb-1 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review · comments persist on the source
            </div>
            <div
              className="min-w-full"
              style={{ width: `${Math.max(480, layout.totalSec * pxPerSec)}px` }}
            >
              <TimelineCommentLayer
                brandId={brandId}
                placements={commentPlacements}
                pxPerSec={pxPerSec}
                playheadSec={playback.playheadSec}
                onSeek={playback.seek}
              />
            </div>
          </div>
          <AudioTracks
            placements={audioPlacements}
            pxPerSec={pxPerSec}
            totalSec={project.durationSec}
            selectedId={selectedAudioId}
            labelFor={(clipId) =>
              audioTracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId)
                ?.name ?? 'Audio'
            }
            onSelect={setSelectedAudioId}
            onPatch={(clipId, patch) => {
              const trackId = audioLocationById.get(clipId);
              const placement = audioPlacements.find((candidate) => candidate.item.id === clipId);
              if (!trackId || !placement) return;
              const sourceInSec = patch.trimStartSec ?? placement.item.trimStartSec ?? 0;
              const trimEndSec =
                patch.trimEndSec ??
                placement.item.trimEndSec ??
                sourceInSec + placement.durationSec;
              onApply(
                patchAudioOperation(project, trackId, clipId, {
                  timelineStartSec: patch.startSec,
                  sourceInSec,
                  durationSec: trimEndSec - sourceInSec,
                  volume: patch.volume,
                  fadeInSec: patch.audioFadeInSec,
                  fadeOutSec: patch.audioFadeOutSec,
                }),
              );
            }}
            onRemove={(clipId) => {
              const trackId = audioLocationById.get(clipId);
              if (trackId) onApply(removeClipOperation(project, trackId, clipId));
            }}
          />
          {selectedAudio && urls.get(selectedAudio.item.id) ? (
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-card px-3 py-2">
              <span className="shrink-0 text-2xs font-medium text-muted-foreground">
                Audition selected audio
              </span>
              {/* biome-ignore lint/a11y/useMediaCaption: audio audition has no visual content. */}
              <audio
                controls
                className="h-8 min-w-0 flex-1"
                src={urls.get(selectedAudio.item.id)}
              />
            </div>
          ) : null}
        </div>

        <aside className="space-y-3 lg:min-h-0 lg:overflow-y-auto">
          <TextOverlayEditor
            project={project}
            textTrack={textTrack}
            playheadSec={playback.playheadSec}
            onApply={onApply}
          />
          <MediaOverlayEditor
            project={project}
            overlayTrack={overlayTrack}
            urls={urls}
            playheadSec={playback.playheadSec}
            autoKey={autoKey}
            onApply={onApply}
          />
          <TransitionEditor
            project={project}
            videoTrack={videoTrack}
            clips={clips}
            onApply={onApply}
          />
        </aside>
      </div>
    </DndContext>
  );
}
