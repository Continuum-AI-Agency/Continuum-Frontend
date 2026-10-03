'use client';

import {
  type EditorProjectV2,
  type EditorTrack,
  type VideoEditorPoolAsset,
  videoEditorPoolAssetSchema,
} from '@continuum/contracts';
import {
  AudioLines,
  Captions,
  Copy,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Lock,
  Magnet,
  Plus,
  Scissors,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  readTemplateDrag,
  TEXT_TEMPLATE_DRAG_TYPE,
  type TemplatePlacement,
} from '@/components/video-studio/motion/TextTemplateShelf';
import {
  type TransitionInput,
  TransitionSeam,
} from '@/components/video-studio/motion/TransitionSeam';
import { VIDEO_STUDIO_ASSET_DRAG_TYPE } from '@/components/video-studio/types';
import { cn } from '@/lib/utils';
import { orderedVideoClips } from '../editorProjectV2AssemblyModel';
import { snapSec } from '../snapping';
import { TIMELINE_SHORTCUT_KEYS as KEYS, type TimelineShortcut } from '../useTimelineKeymap';
import { type PlayheadStore, useLivePlayhead } from './playheadStore';
import { type ClipMenuActions, formatSec, TimelineClipView } from './TimelineClipView';
import { TimelineRuler } from './TimelineRuler';
import {
  clipEnd,
  clipRows,
  type EditBuild,
  findClip,
  type LaneKind,
  laneTracks,
  mainVideoTrack,
  moveClipEdit,
  nudgeClipsEdit,
  snapTimes,
  trimEdit,
} from './timelineEdits';

const HEADER_PX = 132;
const LANE_PX: Record<string, number> = {
  nested_sequence: 44,
  video: 52,
  overlay: 44,
  text: 36,
  caption: 36,
  audio: 44,
};
const DRAG_THRESHOLD_PX = 3;

export type TimelineDrop =
  | { kind: 'files'; files: File[] }
  | { kind: 'asset'; asset: VideoEditorPoolAsset }
  | { kind: 'template'; placement: TemplatePlacement };

const DROP_TYPES = ['Files', VIDEO_STUDIO_ASSET_DRAG_TYPE, TEXT_TEMPLATE_DRAG_TYPE];

type Drag =
  | {
      mode: 'move';
      pointerId: number;
      clipId: string;
      startX: number;
      moved: boolean;
      additive: boolean;
      /** Selected before this press — only then may a shift/⌘ click toggle it off. */
      wasSelected: boolean;
      originSec: number;
      startSec: number;
      targetTrackId: string;
    }
  | {
      mode: 'trim-start' | 'trim-end';
      pointerId: number;
      clipId: string;
      startX: number;
      originSec: number;
      edgeSec: number;
    }
  | {
      mode: 'marquee';
      pointerId: number;
      /** The lanes' client box at the press; x/y below are relative to it. */
      originLeft: number;
      originTop: number;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      additive: boolean;
    }
  | { mode: 'scrub'; pointerId: number };

const TRACK_ICONS: Record<LaneKind, typeof Film> = {
  nested_sequence: Film,
  video: Film,
  overlay: ImageIcon,
  text: Type,
  caption: Captions,
  audio: AudioLines,
};

function ShortcutTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: TimelineShortcut;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 text-muted-foreground">{KEYS[shortcut]}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function PlayheadLine({ store, pxPerSec }: { store: PlayheadStore; pxPerSec: number }) {
  const sec = useLivePlayhead(store);
  return (
    <div
      aria-hidden
      data-playhead=""
      className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500"
      style={{ left: sec * pxPerSec }}
    />
  );
}

function TimelineClock({ store, durationSec }: { store: PlayheadStore; durationSec: number }) {
  const sec = useLivePlayhead(store);
  return (
    <span className="ml-1 text-2xs tabular-nums text-muted-foreground" data-testid="timeline-clock">
      {formatSec(sec)} / {formatSec(durationSec)}
    </span>
  );
}

/** A video track's Mute silences its clips; the picture and the main track never change. */
export const trackIsMuted = (track: EditorTrack): boolean =>
  track.muted ||
  (track.kind === 'video' &&
    track.clips.length > 0 &&
    track.clips.every((clip) => !clip.audioEnabled));

/**
 * The multi-lane timeline: V2 above V1, text, captions and audio below. Owns the pointer
 * gestures — drag across lanes, trim handles, marquee, ruler scrub — and turns each into
 * an edit builder the workspace applies on the latest project. Snapping pulls to the
 * playhead, clip edges and the beat grid. The playhead reaches it only through `store`,
 * so playback never re-renders the lanes.
 */
export const EditTimeline = memo(function EditTimeline({
  project,
  store,
  selection,
  onSelectionChange,
  previewUrlFor,
  sourceDurationFor,
  onEdit,
  onDrop,
  clipActions,
  onShortcut,
  onAddTrack,
  onTrackState,
  onRemoveTrack,
  onDetectBeats,
  onAddMarker,
  onTransition,
  toolbarExtra,
}: {
  project: EditorProjectV2;
  store: PlayheadStore;
  selection: readonly string[];
  onSelectionChange: (clipIds: string[]) => void;
  previewUrlFor: (clipId: string) => string | undefined;
  sourceDurationFor: (clipId: string) => number | undefined;
  onEdit: (build: EditBuild) => void;
  onDrop: (drop: TimelineDrop, at: { atSec: number; trackId?: string }) => void;
  clipActions: ClipMenuActions;
  onShortcut: (shortcut: TimelineShortcut) => void;
  onAddTrack: (kind: LaneKind) => void;
  onTrackState: (
    track: EditorTrack,
    state: { muted?: boolean; locked?: boolean; enabled?: boolean },
  ) => void;
  onRemoveTrack: (track: EditorTrack) => void;
  onDetectBeats: () => void;
  onAddMarker: () => void;
  onTransition: (input: TransitionInput) => void;
  toolbarExtra?: React.ReactNode;
}) {
  const [pxPerSec, setPxPerSec] = useState(60);
  const [snapping, setSnapping] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropHint, setDropHint] = useState<{ trackId?: string; atSec: number } | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const lanes = laneTracks(project);
  const main = mainVideoTrack(project);
  const clipLayouts = new Map(
    lanes.map((track) => [
      track.id,
      track.id === main?.id
        ? { rows: new Map(track.clips.map((clip) => [clip.id, 0])), count: 1 }
        : clipRows(track.clips),
    ]),
  );
  const laneHeight = (track: EditorTrack) =>
    LANE_PX[track.kind] * (clipLayouts.get(track.id)?.count ?? 1);
  const mainOrder = orderedVideoClips(main);
  const nextOnMain = new Map(
    mainOrder.slice(0, -1).map((clip, index) => [clip.id, mainOrder[index + 1]] as const),
  );
  const contentSec = project.durationSec + 12;
  const onSeek = store.seek;
  const setDragState = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const timeAt = (clientX: number): number => {
    const left = lanesRef.current?.getBoundingClientRect().left ?? 0;
    return Math.max(0, (clientX - left) / pxPerSec);
  };
  const laneAt = (clientX: number, clientY: number): string | undefined =>
    document
      .elementsFromPoint(clientX, clientY)
      .map((element) => (element as HTMLElement).closest?.('[data-lane-id]'))
      .find(Boolean)
      ?.getAttribute('data-lane-id') ?? undefined;
  const snap = (sec: number, exclude: readonly string[]): number =>
    snapping ? snapSec(sec, snapTimes(project, store.getSec(), exclude), pxPerSec) : sec;

  const beginClip = (
    event: React.PointerEvent,
    clipId: string,
    mode: 'move' | 'trim-start' | 'trim-end',
  ) => {
    if (event.button !== 0) return;
    const found = findClip(project, clipId);
    if (!found) return;
    event.preventDefault();
    lanesRef.current?.setPointerCapture(event.pointerId);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const wasSelected = selection.includes(clipId);
    if (!wasSelected || (!additive && mode !== 'move')) {
      onSelectionChange(additive ? [...selection, clipId] : [clipId]);
    }
    setDragState(
      mode === 'move'
        ? {
            mode,
            pointerId: event.pointerId,
            clipId,
            startX: event.clientX,
            moved: false,
            additive,
            wasSelected,
            originSec: found.clip.timelineStartSec,
            startSec: found.clip.timelineStartSec,
            targetTrackId: found.track.id,
          }
        : {
            mode,
            pointerId: event.pointerId,
            clipId,
            startX: event.clientX,
            originSec: mode === 'trim-start' ? found.clip.timelineStartSec : clipEnd(found.clip),
            edgeSec: mode === 'trim-start' ? found.clip.timelineStartSec : clipEnd(found.clip),
          },
    );
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.mode === 'scrub') {
      onSeek(snap(timeAt(event.clientX), []));
      return;
    }
    if (current.mode === 'marquee') {
      setDragState({
        ...current,
        x1: event.clientX - current.originLeft,
        y1: event.clientY - current.originTop,
      });
      return;
    }
    const found = findClip(project, current.clipId);
    if (!found) return;
    const deltaSec = (event.clientX - current.startX) / pxPerSec;
    if (current.mode === 'move') {
      const moved = current.moved || Math.abs(event.clientX - current.startX) > DRAG_THRESHOLD_PX;
      if (!moved) return;
      const raw = Math.max(0, current.originSec + deltaSec);
      const exclude = [current.clipId, ...selection];
      const byStart = snap(raw, exclude);
      const byEnd = snap(raw + found.clip.durationSec, exclude) - found.clip.durationSec;
      const startSec = Math.max(
        0,
        Math.abs(byStart - raw) >= Math.abs(byEnd - raw) && byEnd !== raw ? byEnd : byStart,
      );
      const hovered = laneAt(event.clientX, event.clientY);
      const hoveredTrack = project.tracks.find((track) => track.id === hovered);
      const targetTrackId =
        hoveredTrack && hoveredTrack.kind === found.clip.kind && !current.additive
          ? hoveredTrack.id
          : found.track.id;
      setDragState({ ...current, moved, startSec, targetTrackId });
      return;
    }
    setDragState({ ...current, edgeSec: snap(current.originSec + deltaSec, [current.clipId]) });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    setDragState(null);
    lanesRef.current?.releasePointerCapture(event.pointerId);
    if (current.mode === 'scrub') return;
    if (current.mode === 'marquee') {
      const width = Math.abs(current.x1 - current.x0);
      const height = Math.abs(current.y1 - current.y0);
      if (width < DRAG_THRESHOLD_PX && height < DRAG_THRESHOLD_PX) {
        onSeek(snap(timeAt(current.x0 + current.originLeft), []));
        if (!current.additive) onSelectionChange([]);
        return;
      }
      const box = {
        left: Math.min(current.x0, current.x1) + current.originLeft,
        right: Math.max(current.x0, current.x1) + current.originLeft,
        top: Math.min(current.y0, current.y1) + current.originTop,
        bottom: Math.max(current.y0, current.y1) + current.originTop,
      };
      const hits = [...(lanesRef.current?.querySelectorAll<HTMLElement>('[data-clip-id]') ?? [])]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.right > box.left &&
            rect.left < box.right &&
            rect.bottom > box.top &&
            rect.top < box.bottom
          );
        })
        .map((element) => element.dataset.clipId as string);
      onSelectionChange(current.additive ? [...new Set([...selection, ...hits])] : hits);
      return;
    }
    if (current.mode === 'move') {
      if (!current.moved) {
        if (!current.additive) onSelectionChange([current.clipId]);
        else if (current.wasSelected && selection.length > 1) {
          onSelectionChange(selection.filter((id) => id !== current.clipId));
        }
        return;
      }
      const found = findClip(project, current.clipId);
      if (!found) return;
      const group = selection.includes(current.clipId) && selection.length > 1;
      const ids = [...selection];
      const deltaSec = current.startSec - current.originSec;
      const { clipId, targetTrackId, startSec } = current;
      // Built when applied, on whatever the previous edit left: gestures are deltas, so
      // one still saving never gets overwritten by this one.
      onEdit(
        group && targetTrackId === found.track.id
          ? (latest) => nudgeClipsEdit(latest, ids, deltaSec)
          : (latest) => moveClipEdit(latest, clipId, targetTrackId, startSec),
      );
      return;
    }
    const edge = current.mode === 'trim-start' ? 'start' : 'end';
    const { clipId, edgeSec, originSec } = current;
    const sourceDurationSec = sourceDurationFor(clipId);
    onEdit((latest) => {
      const clip = findClip(latest, clipId)?.clip;
      if (!clip) return null;
      const edgeNow = edge === 'start' ? clip.timelineStartSec : clipEnd(clip);
      return trimEdit(latest, clipId, edge, edgeNow + (edgeSec - originSec), sourceDurationSec);
    });
  };

  const readDrop = (event: React.DragEvent): TimelineDrop | null => {
    const placement = readTemplateDrag(event.dataTransfer);
    if (placement) return { kind: 'template', placement };
    const payload = event.dataTransfer.getData(VIDEO_STUDIO_ASSET_DRAG_TYPE);
    if (payload) {
      const parsed = videoEditorPoolAssetSchema.safeParse(JSON.parse(payload));
      return parsed.success ? { kind: 'asset', asset: parsed.data } : null;
    }
    const files = [...event.dataTransfer.files];
    return files.length > 0 ? { kind: 'files', files } : null;
  };
  const acceptsDrag = (event: React.DragEvent) =>
    DROP_TYPES.some((type) => event.dataTransfer.types.includes(type));

  const marquee = drag?.mode === 'marquee' ? drag : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <ShortcutTooltip label="Split at playhead" shortcut="split">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Split at playhead"
            onClick={() => onShortcut('split')}
          >
            <Scissors className="size-3.5" />
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label="Duplicate" shortcut="duplicate">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Duplicate selection"
            disabled={selection.length === 0}
            onClick={() => onShortcut('duplicate')}
          >
            <Copy className="size-3.5" />
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label="Ripple delete" shortcut="rippleDelete">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Ripple delete selection"
            disabled={selection.length === 0}
            onClick={() => onShortcut('rippleDelete')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={snapping ? 'Snapping on' : 'Snapping off'}>
          <Button
            size="icon"
            variant={snapping ? 'secondary' : 'ghost'}
            className="size-7"
            aria-label="Toggle snapping"
            aria-pressed={snapping}
            onClick={() => setSnapping((value) => !value)}
          >
            <Magnet className="size-3.5" />
          </Button>
        </ShortcutTooltip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" />}
          >
            <Plus className="size-3.5" /> Track
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(['video', 'overlay', 'text', 'caption', 'audio'] as const).map((kind) => {
              const Icon = TRACK_ICONS[kind];
              return (
                <DropdownMenuItem key={kind} onClick={() => onAddTrack(kind)}>
                  <Icon /> {kind === 'caption' ? 'Captions' : kind[0].toUpperCase() + kind.slice(1)}{' '}
                  track
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <TimelineClock store={store} durationSec={project.durationSec} />
        <div className="ml-auto flex items-center gap-2">
          {toolbarExtra}
          <Slider
            aria-label="Timeline zoom"
            className="w-28"
            min={15}
            max={300}
            value={[pxPerSec]}
            onValueChange={(value) =>
              setPxPerSec(Array.isArray(value) ? (value[0] ?? pxPerSec) : value)
            }
          />
        </div>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: file drop target and zoom wheel; Import and the Media tab are the keyboard path. */}
      <div
        className="relative min-h-0 flex-1 overflow-auto"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          setPxPerSec((value) =>
            Math.max(15, Math.min(300, value * (event.deltaY < 0 ? 1.1 : 0.9))),
          );
        }}
        onDragOver={(event) => {
          if (!acceptsDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          setDropHint({
            trackId: laneAt(event.clientX, event.clientY),
            atSec: snap(timeAt(event.clientX), []),
          });
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={(event) => {
          if (!acceptsDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          setDropHint(null);
          const drop = readDrop(event);
          if (drop) {
            onDrop(drop, {
              atSec: snap(timeAt(event.clientX), []),
              trackId: laneAt(event.clientX, event.clientY),
            });
          }
        }}
      >
        <div className="relative" style={{ width: HEADER_PX + contentSec * pxPerSec }}>
          <div className="sticky top-0 z-30 flex bg-card">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-b border-border/60 bg-card"
              style={{ width: HEADER_PX }}
            />
            <TimelineRuler
              totalSec={contentSec}
              pxPerSec={pxPerSec}
              markers={project.markers}
              onDetectBeats={onDetectBeats}
              onAddMarker={onAddMarker}
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.currentTarget.contains(event.target as Node))
                  return;
                lanesRef.current?.setPointerCapture(event.pointerId);
                setDragState({ mode: 'scrub', pointerId: event.pointerId });
                onSeek(snap(timeAt(event.clientX), []));
              }}
            />
          </div>

          <div className="flex">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-border/60 bg-card"
              style={{ width: HEADER_PX }}
            >
              {lanes.map((track) => {
                const Icon = TRACK_ICONS[track.kind as LaneKind];
                return (
                  <ContextMenu key={track.id}>
                    <ContextMenuTrigger
                      render={
                        <div
                          data-track-header={track.id}
                          className="flex items-center gap-1 border-b border-border/40 px-2 text-2xs"
                          style={{ height: laneHeight(track) }}
                        />
                      }
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {track.name}
                        {track.id === main?.id ? (
                          <span className="ml-1 text-muted-foreground">· main</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        aria-label={
                          trackIsMuted(track) ? `Unmute ${track.name}` : `Mute ${track.name}`
                        }
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onTrackState(track, { muted: !trackIsMuted(track) })}
                      >
                        {trackIsMuted(track) ? (
                          <VolumeX className="size-3" />
                        ) : (
                          <Volume2 className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onTrackState(track, { locked: !track.locked })}
                      >
                        {track.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-52">
                      <ContextMenuItem
                        onClick={() => onTrackState(track, { enabled: !track.enabled })}
                      >
                        {track.enabled ? <EyeOff /> : <Eye />}{' '}
                        {track.enabled ? 'Hide track' : 'Show track'}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => onTrackState(track, { muted: !trackIsMuted(track) })}
                      >
                        {trackIsMuted(track) ? <Volume2 /> : <VolumeX />}{' '}
                        {trackIsMuted(track) ? 'Unmute' : 'Mute'}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => onTrackState(track, { locked: !track.locked })}
                      >
                        {track.locked ? <Unlock /> : <Lock />} {track.locked ? 'Unlock' : 'Lock'}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => onAddTrack(track.kind as LaneKind)}>
                        <Plus /> Add{' '}
                        {track.kind === 'nested_sequence'
                          ? 'group'
                          : track.kind === 'caption'
                            ? 'captions'
                            : track.kind}{' '}
                        track
                      </ContextMenuItem>
                      <ContextMenuItem variant="destructive" onClick={() => onRemoveTrack(track)}>
                        <Trash2 /> Delete track
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>

            {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer gesture surface; the keymap covers keyboard editing. */}
            <div
              ref={lanesRef}
              role="listbox"
              aria-label="Timeline lanes"
              aria-multiselectable
              className="relative flex-1 touch-none"
              onPointerDown={(event) => {
                if (
                  event.button !== 0 ||
                  !event.currentTarget.contains(event.target as Node) ||
                  (event.target as HTMLElement).closest('[data-clip-id], [data-seam]')
                )
                  return;
                const lanesBox = event.currentTarget.getBoundingClientRect();
                event.currentTarget.setPointerCapture(event.pointerId);
                const x = event.clientX - lanesBox.left;
                const y = event.clientY - lanesBox.top;
                setDragState({
                  mode: 'marquee',
                  pointerId: event.pointerId,
                  originLeft: lanesBox.left,
                  originTop: lanesBox.top,
                  x0: x,
                  y0: y,
                  x1: x,
                  y1: y,
                  additive: event.shiftKey || event.metaKey,
                });
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDragState(null)}
            >
              {lanes.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  Drop a video, audio or image here — or record one — to start the edit.
                </div>
              ) : null}
              {lanes.map((track) => (
                <div
                  key={track.id}
                  data-lane-id={track.id}
                  data-lane-kind={track.kind}
                  className={cn(
                    'relative border-b border-border/40',
                    track.id === main?.id ? 'bg-sky-500/5' : 'bg-muted/10',
                    !track.enabled && 'opacity-50',
                  )}
                  style={{ height: laneHeight(track) }}
                >
                  {track.clips.map((clip) => {
                    const dragging =
                      drag &&
                      drag.mode !== 'marquee' &&
                      drag.mode !== 'scrub' &&
                      drag.clipId === clip.id
                        ? drag
                        : null;
                    const movingAway = dragging?.mode === 'move' && dragging.moved;
                    const start =
                      dragging?.mode === 'trim-start'
                        ? Math.min(dragging.edgeSec, clipEnd(clip) - 0.1)
                        : clip.timelineStartSec;
                    const end =
                      dragging?.mode === 'trim-end'
                        ? Math.max(dragging.edgeSec, clip.timelineStartSec + 0.1)
                        : clipEnd(clip);
                    return (
                      <div key={clip.id} className={movingAway ? 'opacity-30' : undefined}>
                        <TimelineClipView
                          clip={clip}
                          topPx={
                            4 +
                            (clipLayouts.get(track.id)?.rows.get(clip.id) ?? 0) *
                              LANE_PX[track.kind]
                          }
                          heightPx={LANE_PX[track.kind] - 8}
                          isMain={track.id === main?.id}
                          leftPx={start * pxPerSec}
                          widthPx={(end - start) * pxPerSec}
                          selected={selection.includes(clip.id)}
                          previewUrl={previewUrlFor(clip.id)}
                          transitionsToNext={track.id === main?.id && nextOnMain.has(clip.id)}
                          actions={clipActions}
                          onPointerDown={(event, mode) => beginClip(event, clip.id, mode)}
                          onContextMenu={() => {
                            if (!selection.includes(clip.id)) onSelectionChange([clip.id]);
                          }}
                        />
                      </div>
                    );
                  })}
                  {drag?.mode === 'move' && drag.moved && drag.targetTrackId === track.id
                    ? (() => {
                        const found = findClip(project, drag.clipId);
                        return found ? (
                          <TimelineClipView
                            clip={found.clip}
                            topPx={
                              4 +
                              (clipLayouts.get(track.id)?.rows.get(found.clip.id) ?? 0) *
                                LANE_PX[track.kind]
                            }
                            heightPx={LANE_PX[track.kind] - 8}
                            isMain={track.id === main?.id}
                            leftPx={drag.startSec * pxPerSec}
                            widthPx={found.clip.durationSec * pxPerSec}
                            selected
                            ghost
                            actions={clipActions}
                            onPointerDown={() => undefined}
                            onContextMenu={() => undefined}
                          />
                        ) : null;
                      })()
                    : null}
                  {track.id === main?.id && !drag
                    ? mainOrder.slice(0, -1).map((clip, index) => {
                        const next = mainOrder[index + 1];
                        if (!next) return null;
                        return (
                          <TransitionSeam
                            key={`${clip.id}:${next.id}`}
                            fromClip={{
                              id: clip.id,
                              label: clip.name ?? 'clip',
                              durationSec: clip.durationSec,
                            }}
                            toClip={{
                              id: next.id,
                              label: next.name ?? 'clip',
                              durationSec: next.durationSec,
                            }}
                            existing={project.transitions.find(
                              (transition) =>
                                transition.fromClipId === clip.id &&
                                transition.toClipId === next.id,
                            )}
                            // A transition overlaps the two clips; its seam sits mid-overlap.
                            leftPx={((clipEnd(clip) + next.timelineStartSec) / 2) * pxPerSec}
                            onApply={onTransition}
                          />
                        );
                      })
                    : null}
                  {dropHint && dropHint.trackId === track.id ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
                      style={{ left: dropHint.atSec * pxPerSec }}
                    />
                  ) : null}
                </div>
              ))}
              <PlayheadLine store={store} pxPerSec={pxPerSec} />
              {marquee ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-40 border border-primary bg-primary/10"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
