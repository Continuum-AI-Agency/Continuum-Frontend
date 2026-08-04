'use client';

import type {
  EditorAudioClip,
  EditorOverlayClip,
  EditorProjectV2,
  EditorTextClip,
  EditorTrack,
  EditorTransition,
  EditorVideoClip,
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
import { Plus, Redo2, Trash2, Type, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listAssetVersions } from '@/lib/library/versions';
import type { TimelineInputSource, TimelineItem } from '../../types';
import type { ResolvedTextOverlay } from '../../utils/render/effectSpec';
import { AudioTracks } from './AudioTracks';
import {
  type EditorAssemblyOperation,
  editorProjectV2CommentPlacements,
  exactVersionPreviewUrl,
  orderedVideoClips,
  patchAudioOperation,
  placeAudioOperation,
  primaryVideoTrack,
  removeClipOperation,
  removeTransitionOperation,
  reorderVideoOperation,
  splitClipOperation,
  trimClipOperation,
  upsertOverlayOperation,
  upsertTextOperation,
  upsertTransitionOperation,
  videoLayout,
} from './editorProjectV2AssemblyModel';
import type { OverlayPreviewLayer } from './overlayPreview';
import { CLIP_DRAG_PREFIX } from './TimelineClipBlock';
import { TimelineCommentLayer } from './TimelineCommentLayer';
import { TimelinePreview } from './TimelinePreview';
import { TimelineTrack } from './TimelineTrack';
import { useEditorProjectV2AudioPreview } from './useEditorProjectV2AudioPreview';
import { type ClipMedia, usePlayheadPlayback } from './usePlayheadPlayback';

const PX_PER_SEC = 80;

type AudioTrack = Extract<EditorTrack, { kind: 'audio' }>;
type OverlayTrack = Extract<EditorTrack, { kind: 'overlay' }>;
type TextTrack = Extract<EditorTrack, { kind: 'text' }>;

function sourceCoordinates(clip: EditorVideoClip | EditorAudioClip | EditorOverlayClip) {
  const source = clip.source;
  if (source.sourceType !== 'library_asset' || !source.renditionId) return null;
  return { assetId: source.assetId, versionId: source.renditionId };
}

function useExactPreviewUrls(
  project: EditorProjectV2,
  brandId: string,
  pool: TimelineInputSource[],
): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const coordinates = useMemo(() => {
    const values = project.tracks.flatMap((track) =>
      track.clips.flatMap((clip) => {
        if (clip.kind !== 'video' && clip.kind !== 'audio' && clip.kind !== 'overlay') return [];
        const source = sourceCoordinates(clip);
        return source ? [{ clipId: clip.id, ...source }] : [];
      }),
    );
    return values;
  }, [project.tracks]);

  useEffect(() => {
    let cancelled = false;
    const poolUrls = new Map<string, string>();
    for (const coordinate of coordinates) {
      const source = pool.find(
        (candidate) =>
          candidate.sourceAssetId === coordinate.assetId &&
          candidate.sourceVersionId === coordinate.versionId &&
          candidate.previewUrl,
      );
      if (source?.previewUrl) poolUrls.set(coordinate.clipId, source.previewUrl);
    }
    setUrls(poolUrls);

    const assets = [...new Set(coordinates.map((coordinate) => coordinate.assetId))];
    void Promise.all(
      assets.map(async (assetId) => ({
        assetId,
        versions: await listAssetVersions({ brandId, assetId }),
      })),
    )
      .then((results) => {
        if (cancelled) return;
        const byAsset = new Map(
          results.map((result) => [result.assetId, result.versions] as const),
        );
        setUrls((current) => {
          const next = new Map(current);
          for (const coordinate of coordinates) {
            const url = exactVersionPreviewUrl(
              byAsset.get(coordinate.assetId) ?? [],
              coordinate.versionId,
            );
            if (url) next.set(coordinate.clipId, url);
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, coordinates, pool]);

  return urls;
}

function NumberField({
  label,
  value,
  min = 0,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className="space-y-1 text-3xs text-muted-foreground">
      <span>{label}</span>
      <Input
        id={inputId}
        type="number"
        className="h-8 text-xs tabular-nums"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber || 0)}
      />
    </label>
  );
}

function TextOverlayEditor({
  project,
  textTrack,
  playheadSec,
  onApply,
}: {
  project: EditorProjectV2;
  textTrack?: TextTrack;
  playheadSec: number;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [draft, setDraft] = useState('');
  const addText = () => {
    if (!draft.trim()) return;
    onApply(
      upsertTextOperation(project, {
        text: draft,
        timelineStartSec: playheadSec,
        durationSec: Math.min(3, Math.max(0.1, project.durationSec - playheadSec)),
      }),
    );
    setDraft('');
  };

  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <Type className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold">Text overlays</h3>
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add text at the playhead"
          className="h-8 text-xs"
          onKeyDown={(event) => {
            if (event.key === 'Enter') addText();
          }}
        />
        <Button size="sm" className="h-8" onClick={addText} disabled={!draft.trim()}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {(textTrack?.clips ?? []).map((clip) => (
          <TextOverlayRow
            key={clip.id}
            project={project}
            trackId={textTrack?.id as string}
            clip={clip}
            onApply={onApply}
          />
        ))}
        {!textTrack?.clips.length ? (
          <p className="rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground">
            No text overlays yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function TextOverlayRow({
  project,
  trackId,
  clip,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  clip: EditorTextClip;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const colorInputId = useId();
  const [text, setText] = useState(clip.text);
  const [start, setStart] = useState(clip.timelineStartSec);
  const [duration, setDuration] = useState(clip.durationSec);
  const [fontSize, setFontSize] = useState(clip.style.fontSizePx);
  const [color, setColor] = useState(clip.style.color);
  const [x, setX] = useState(clip.transform.position.x);
  const [y, setY] = useState(clip.transform.position.y);
  useEffect(() => {
    setText(clip.text);
    setStart(clip.timelineStartSec);
    setDuration(clip.durationSec);
    setFontSize(clip.style.fontSizePx);
    setColor(clip.style.color);
    setX(clip.transform.position.x);
    setY(clip.transform.position.y);
  }, [clip]);
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-8 text-xs"
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="At" value={start} max={project.durationSec} onChange={setStart} />
        <NumberField label="Duration" value={duration} min={0.1} onChange={setDuration} />
        <NumberField
          label="Size"
          value={fontSize}
          min={1}
          max={2000}
          step={1}
          onChange={setFontSize}
        />
        <label htmlFor={colorInputId} className="space-y-1 text-3xs text-muted-foreground">
          <span>Color</span>
          <Input
            type="color"
            id={colorInputId}
            value={color}
            onChange={(event) => setColor(event.currentTarget.value)}
            className="h-8 p-1"
            aria-label="Text color"
          />
        </label>
        <NumberField label="X" value={x} min={0} max={1} step={0.05} onChange={setX} />
        <NumberField label="Y" value={y} min={0} max={1} step={0.05} onChange={setY} />
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onApply(removeClipOperation(project, trackId, clip.id))}
          aria-label="Delete text overlay"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!text.trim()}
          onClick={() =>
            onApply(
              upsertTextOperation(project, {
                clipId: clip.id,
                text,
                timelineStartSec: start,
                durationSec: duration,
                fontSizePx: fontSize,
                color,
                x,
                y,
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function MediaOverlayEditor({
  project,
  overlayTrack,
  urls,
  onApply,
}: {
  project: EditorProjectV2;
  overlayTrack?: OverlayTrack;
  urls: ReadonlyMap<string, string>;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <h3 className="text-xs font-semibold">Media overlays</h3>
      {(overlayTrack?.clips ?? []).map((clip) => (
        <MediaOverlayRow
          key={clip.id}
          project={project}
          trackId={overlayTrack?.id as string}
          clip={clip}
          previewUrl={urls.get(clip.id)}
          onApply={onApply}
        />
      ))}
      {!overlayTrack?.clips.length ? (
        <p className="rounded-md border border-dashed p-3 text-center text-2xs text-muted-foreground">
          Add a pinned image or video from the media bin.
        </p>
      ) : null}
    </section>
  );
}

function MediaOverlayRow({
  project,
  trackId,
  clip,
  previewUrl,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  clip: EditorOverlayClip;
  previewUrl?: string;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [start, setStart] = useState(clip.timelineStartSec);
  const [duration, setDuration] = useState(clip.durationSec);
  const [x, setX] = useState(clip.transform.position.x);
  const [y, setY] = useState(clip.transform.position.y);
  const [scale, setScale] = useState(clip.transform.scaleX);
  const [opacity, setOpacity] = useState(clip.transform.opacity);
  useEffect(() => {
    setStart(clip.timelineStartSec);
    setDuration(clip.durationSec);
    setX(clip.transform.position.x);
    setY(clip.transform.position.y);
    setScale(clip.transform.scaleX);
    setOpacity(clip.transform.opacity);
  }, [clip]);
  const source = clip.source;
  if (source.sourceType !== 'library_asset' || !source.renditionId) return null;
  const versionId = source.renditionId;
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        {previewUrl && clip.mediaKind === 'image' ? (
          // biome-ignore lint/performance/noImgElement: exact signed Library rendition in an editor thumbnail
          <img src={previewUrl} alt="" className="size-8 rounded object-cover" />
        ) : (
          <div className="flex size-8 items-center justify-center rounded bg-muted text-3xs uppercase">
            {clip.mediaKind.slice(0, 3)}
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {clip.name ?? 'Overlay'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="At" value={start} max={project.durationSec} onChange={setStart} />
        <NumberField label="Duration" value={duration} min={0.1} onChange={setDuration} />
        <NumberField label="X" value={x} min={0} max={1} step={0.05} onChange={setX} />
        <NumberField label="Y" value={y} min={0} max={1} step={0.05} onChange={setY} />
        <NumberField
          label="Scale"
          value={scale}
          min={0.05}
          max={4}
          step={0.05}
          onChange={setScale}
        />
        <NumberField
          label="Opacity"
          value={opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={setOpacity}
        />
      </div>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onApply(removeClipOperation(project, trackId, clip.id))}
          aria-label="Delete media overlay"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onApply(
              upsertOverlayOperation(project, {
                clipId: clip.id,
                assetId: source.assetId,
                versionId,
                label: clip.name ?? 'Overlay',
                mediaKind: clip.mediaKind === 'video' ? 'video' : 'image',
                timelineStartSec: start,
                durationSec: duration,
                x,
                y,
                scale,
                opacity,
              }),
            )
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

const TRANSITION_OPTIONS: Array<{
  value: 'cut' | Exclude<EditorTransition['transitionType'], 'cut' | 'blur' | 'custom'>;
  label: string;
}> = [
  { value: 'cut', label: 'Cut' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'dip_to_black', label: 'Dip to black' },
  { value: 'dip_to_white', label: 'Dip to white' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
];

function TransitionEditor({
  project,
  videoTrack,
  clips,
  onApply,
}: {
  project: EditorProjectV2;
  videoTrack?: Extract<EditorTrack, { kind: 'video' }>;
  clips: EditorVideoClip[];
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  if (!videoTrack || clips.length < 2) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <h3 className="text-xs font-semibold">Transitions</h3>
      {clips.slice(1).map((to, index) => {
        const from = clips[index];
        const transition = project.transitions.find(
          (candidate) =>
            candidate.trackId === videoTrack.id &&
            candidate.fromClipId === from.id &&
            candidate.toClipId === to.id,
        );
        return (
          <TransitionRow
            key={`${from.id}:${to.id}`}
            project={project}
            trackId={videoTrack.id}
            from={from}
            to={to}
            transition={transition}
            onApply={onApply}
          />
        );
      })}
    </section>
  );
}

function TransitionRow({
  project,
  trackId,
  from,
  to,
  transition,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  from: EditorVideoClip;
  to: EditorVideoClip;
  transition?: EditorTransition;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [type, setType] = useState<EditorTransition['transitionType']>(
    transition?.transitionType ?? 'cut',
  );
  const [duration, setDuration] = useState(transition?.durationSec ?? 0.6);
  useEffect(() => {
    setType(transition?.transitionType ?? 'cut');
    setDuration(transition?.durationSec ?? 0.6);
  }, [transition]);
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <p className="truncate text-3xs text-muted-foreground">
        {from.name ?? 'Clip'} → {to.name ?? 'Clip'}
      </p>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <select
          value={type}
          onChange={(event) =>
            setType(event.currentTarget.value as EditorTransition['transitionType'])
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={`Transition from ${from.name ?? from.id} to ${to.name ?? to.id}`}
        >
          {TRANSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <NumberField label="Seconds" value={duration} min={0.1} step={0.1} onChange={setDuration} />
      </div>
      <div className="flex justify-end gap-1">
        {transition ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onApply(removeTransitionOperation(project, transition.id))}
            aria-label="Delete transition"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            if (type === 'cut') {
              if (transition) onApply(removeTransitionOperation(project, transition.id));
              return;
            }
            onApply(
              upsertTransitionOperation(project, {
                transitionId: transition?.id,
                trackId,
                fromClipId: from.id,
                toClipId: to.id,
                transitionType: type,
                durationSec: duration,
              }),
            );
          }}
          disabled={type === 'cut' && !transition}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

export function EditorProjectV2Assembly({
  project,
  brandId,
  pool,
  busy,
  canUndo,
  canRedo,
  canRender,
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
  canRender: boolean;
  onApply: (operation: EditorAssemblyOperation) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRender: () => void;
}) {
  const [pxPerSec, setPxPerSec] = useState(PX_PER_SEC);
  const [selectedVideoId, setSelectedVideoId] = useState<string>();
  const [selectedAudioId, setSelectedAudioId] = useState<string>();
  const layout = useMemo(() => videoLayout(project, pxPerSec), [project, pxPerSec]);
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
  const textTrack = project.tracks.find((track): track is TextTrack => track.kind === 'text');
  const activeText: ResolvedTextOverlay[] = (textTrack?.clips ?? [])
    .filter(
      (clip) =>
        clip.enabled &&
        playback.playheadSec >= clip.timelineStartSec &&
        playback.playheadSec < clip.timelineStartSec + clip.durationSec,
    )
    .map((clip) => ({
      id: clip.id,
      text: clip.text,
      xFrac: clip.transform.position.x,
      yFrac: clip.transform.position.y,
      sizeFrac: clip.style.fontSizePx / project.canvas.height,
      color: clip.style.color,
      background: clip.style.backgroundColor,
      fontWeight: clip.style.fontWeight,
    }));
  const overlayTrack = project.tracks.find(
    (track): track is OverlayTrack => track.kind === 'overlay',
  );
  const overlayLayers: OverlayPreviewLayer[] = (overlayTrack?.clips ?? []).flatMap((clip) => {
    const url = urls.get(clip.id);
    if (
      !url ||
      !clip.enabled ||
      playback.playheadSec < clip.timelineStartSec ||
      playback.playheadSec >= clip.timelineStartSec + clip.durationSec
    )
      return [];
    return [
      {
        id: clip.id,
        kind: clip.mediaKind === 'video' ? 'video' : 'image',
        url,
        sourceSec: (clip.sourceInSec ?? 0) + playback.playheadSec - clip.timelineStartSec,
        playbackRate: 1,
        muted: true,
        volume: 0,
        mediaStyle: {
          opacity: clip.transform.opacity,
          transformOrigin: `${clip.transform.anchorX * 100}% ${clip.transform.anchorY * 100}%`,
          transform: `translate(${(clip.transform.position.x - 0.5) * 100}%, ${(clip.transform.position.y - 0.5) * 100}%) scale(${clip.transform.scaleX}, ${clip.transform.scaleY}) rotate(${clip.transform.rotationDeg}deg)`,
        },
        textOverlays: [],
      },
    ];
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
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!videoTrack || !event.over) return;
      const activeId = String(event.active.id);
      const overId = String(event.over.id);
      if (!activeId.startsWith(CLIP_DRAG_PREFIX) || !overId.startsWith(CLIP_DRAG_PREFIX)) return;
      const operation = reorderVideoOperation(
        project,
        videoTrack.id,
        activeId.slice(CLIP_DRAG_PREFIX.length),
        overId.slice(CLIP_DRAG_PREFIX.length),
      );
      if (operation) onApply(operation);
    },
    [onApply, project, videoTrack],
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
                            assetId: source.sourceAssetId as string,
                            versionId: source.sourceVersionId as string,
                            label: source.label,
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
            disabled={busy || !clips.length || !canRender}
            title={
              canRender ? undefined : 'Approve one final master for every shot before rendering.'
            }
          >
            Render final 1080p
          </Button>
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
            textOverlays={activeText}
            overlayLayers={overlayLayers}
            mediaMuted={
              audioPreview.active || (active ? !clipById.get(active.item.id)?.audioEnabled : true)
            }
          />
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
