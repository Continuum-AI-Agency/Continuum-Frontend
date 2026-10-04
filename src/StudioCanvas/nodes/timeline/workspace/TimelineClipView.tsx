'use client';

import { type EditorClip, sampleNumericTrack } from '@continuum/contracts';
import { AudioLines, Copy, Scissors, Trash2, VolumeX, Waves } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  ClipMotionMenus,
  type MotionMenuActions,
} from '@/components/video-studio/motion/ClipMotionMenus';
import { cn } from '@/lib/utils';
import { volumeKeyframesOf } from '../../../utils/splice/timelineAudioEnvelope';
import { ClipWaveform } from '../ClipWaveform';
import { useClipMediaPreview } from '../useClipMediaPreview';
import { TIMELINE_SHORTCUT_KEYS as KEYS } from '../useTimelineKeymap';

/** Each action names the clip it was opened on; the workspace widens it to the selection. */
export type ClipMenuActions = MotionMenuActions & {
  split: (clipId: string) => void;
  rippleDelete: (clipId: string) => void;
  deleteLeaveGap: (clipId: string) => void;
  copy: (clipId: string) => void;
  duplicate: (clipId: string) => void;
  toggleClipAudio: (clipId: string) => void;
  cutPauses: (clipId: string) => void;
  detectBeats: (clipId: string) => void;
};

const KIND_STYLES: Record<string, string> = {
  nested_sequence: 'bg-indigo-600/85 border-indigo-300/60',
  video: 'bg-sky-600/85 border-sky-300/60',
  overlay: 'bg-violet-600/85 border-violet-300/60',
  text: 'bg-amber-600/85 border-amber-300/60',
  caption: 'bg-emerald-600/85 border-emerald-300/60',
  audio: 'bg-teal-700/85 border-teal-300/60',
};

const clipLabel = (clip: EditorClip): string =>
  'text' in clip ? clip.text : (clip.name ?? clip.kind);

export const formatSec = (sec: number): string => {
  const safe = Math.max(0, sec);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(1).padStart(4, '0')}`;
};

function ClipPreview({ clip, url }: { clip: EditorClip; url?: string }) {
  if (!url) return <p className="text-xs text-muted-foreground">No preview yet.</p>;
  if (clip.kind === 'overlay' && clip.mediaKind === 'image') {
    // biome-ignore lint/performance/noImgElement: signed Library rendition in a hover preview
    return <img src={url} alt="" className="max-h-40 w-full rounded object-contain" />;
  }
  if (clip.kind === 'audio') {
    // biome-ignore lint/a11y/useMediaCaption: audio audition has no visual content.
    return <audio src={url} controls className="h-8 w-full" />;
  }
  const sourceIn = 'sourceInSec' in clip ? (clip.sourceInSec ?? 0) : 0;
  return (
    <video
      src={`${url}#t=${sourceIn.toFixed(2)}`}
      muted
      playsInline
      preload="metadata"
      className="max-h-40 w-full rounded bg-black object-contain"
    />
  );
}

/** An audio clip's keyed volume (a ducked bed) as a line over its waveform: the top of the
 *  block is its loudest point, the bottom silence. Nothing when the volume is not keyed. */
function VolumeLine({ clip }: { clip: Extract<EditorClip, { kind: 'audio' }> }) {
  const keys = volumeKeyframesOf(clip.keyframes).sort(
    (left, right) => left.timeSec - right.timeSec,
  );
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return null;
  const end = clip.durationSec;
  const stops = Array.from({ length: 41 }, (_, index) => {
    const timeSec = (index / 40) * end;
    return {
      timeSec,
      value: sampleNumericTrack(keys, timeSec, clip.volume, clip.keyframeOffsetSec),
    };
  });
  const peak = Math.max(1e-6, ...stops.map((stop) => stop.value));
  const points = stops
    .map((stop) => `${stop.timeSec.toFixed(4)},${(1 - (0.9 * stop.value) / peak).toFixed(4)}`)
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      data-volume-line={keys.length}
      viewBox={`0 0 ${end} 1`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-3 bottom-0 h-auto w-full"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="text-amber-300"
      />
    </svg>
  );
}

/**
 * One clip on a lane. The block itself is the drag surface and the edges are trim
 * handles; the pointer logic lives in the lane container, which owns snapping and
 * lane-crossing. This renders, labels, and offers the clip's menu and preview.
 */
export function TimelineClipView({
  clip,
  isMain,
  leftPx,
  widthPx,
  topPx = 4,
  heightPx,
  selected,
  ghost,
  previewUrl,
  transitionsToNext = false,
  actions,
  onPointerDown,
  onContextMenu,
}: {
  clip: EditorClip;
  isMain: boolean;
  leftPx: number;
  widthPx: number;
  topPx?: number;
  heightPx?: number;
  selected: boolean;
  ghost?: boolean;
  previewUrl?: string;
  /** A main-track clip with a clip after it takes a transition into that one. */
  transitionsToNext?: boolean;
  actions: ClipMenuActions;
  onPointerDown: (event: React.PointerEvent, mode: 'move' | 'trim-start' | 'trim-end') => void;
  onContextMenu: () => void;
}) {
  const isAudio = clip.kind === 'audio';
  const isVideo = clip.kind === 'video';
  const media = useClipMediaPreview({
    url: previewUrl,
    isVideo: isVideo && widthPx > 60,
    hasAudio: isAudio,
    thumbnailCount: Math.max(1, Math.min(8, Math.round(widthPx / 80))),
    sourceStartSec: 'sourceInSec' in clip ? clip.sourceInSec : 0,
    sourceEndSec:
      'sourceInSec' in clip
        ? (clip.sourceInSec ?? 0) +
          clip.durationSec * ('playbackRate' in clip ? clip.playbackRate : 1)
        : undefined,
    reverse: 'reverse' in clip && clip.reverse,
  });
  const label = clipLabel(clip);
  const sourceIn = 'sourceInSec' in clip ? (clip.sourceInSec ?? 0) : undefined;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer drag surface; keyboard editing is the timeline keymap.
          <div
            data-clip-id={clip.id}
            data-clip-kind={clip.kind}
            aria-label={`Clip ${label}`}
            aria-selected={selected}
            role="option"
            tabIndex={-1}
            onPointerDown={(event) => {
              // Menus and hover cards portal out of the DOM but still bubble through React;
              // only a press on the block itself starts a drag.
              if (event.currentTarget.contains(event.target as Node)) onPointerDown(event, 'move');
            }}
            onContextMenu={onContextMenu}
            className={cn(
              'absolute top-1 bottom-1 flex cursor-grab touch-none overflow-hidden rounded-md border text-white shadow-sm active:cursor-grabbing',
              KIND_STYLES[clip.kind] ?? 'bg-muted',
              selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
              ghost && 'pointer-events-none opacity-60',
              !clip.enabled && 'opacity-40',
            )}
            style={{
              left: leftPx,
              width: Math.max(4, widthPx),
              top: topPx,
              ...(heightPx === undefined ? {} : { height: heightPx, bottom: 'auto' }),
            }}
          />
        }
      >
        {media.thumbnails.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 flex opacity-60">
            {media.thumbnails.map((src, index) => (
              // biome-ignore lint/performance/noImgElement: decoded filmstrip frame (data URL)
              <img
                key={`${clip.id}:${index}`}
                src={src}
                alt=""
                className="h-full min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        ) : null}
        {isAudio ? (
          <ClipWaveform
            peaks={media.peaks}
            className="pointer-events-none absolute inset-x-0 top-3 bottom-0 h-auto w-full text-white/55"
          />
        ) : null}
        {clip.kind === 'audio' ? <VolumeLine clip={clip} /> : null}
        <HoverCard openDelay={600}>
          <HoverCardTrigger
            render={
              <span className="relative z-10 m-1 h-fit max-w-full truncate rounded bg-black/35 px-1 text-2xs leading-4" />
            }
          >
            {label}
          </HoverCardTrigger>
          <HoverCardContent className="w-64 space-y-2 p-3">
            <ClipPreview clip={clip} url={previewUrl} />
            <div className="space-y-0.5 text-2xs text-muted-foreground">
              <p className="truncate font-medium text-foreground">{label}</p>
              <p>
                {formatSec(clip.timelineStartSec)} →{' '}
                {formatSec(clip.timelineStartSec + clip.durationSec)} ·{' '}
                {clip.durationSec.toFixed(2)}s
              </p>
              {sourceIn !== undefined ? <p>Source in {sourceIn.toFixed(2)}s</p> : null}
            </div>
          </HoverCardContent>
        </HoverCard>
        {ghost ? null : (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Trim start of ${label}`}
              data-trim-handle="start"
              className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/40"
              onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDown(event, 'trim-start');
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Trim end of ${label}`}
              data-trim-handle="end"
              className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize bg-white/0 hover:bg-white/40"
              onPointerDown={(event) => {
                event.stopPropagation();
                onPointerDown(event, 'trim-end');
              }}
            />
          </>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => actions.split(clip.id)}>
          <Scissors /> Split at playhead
          <ContextMenuShortcut>{KEYS.split}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.duplicate(clip.id)}>
          <Copy /> Duplicate
          <ContextMenuShortcut>{KEYS.duplicate}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.copy(clip.id)}>
          Copy
          <ContextMenuShortcut>{KEYS.copy}</ContextMenuShortcut>
        </ContextMenuItem>
        {isVideo ? (
          <ContextMenuItem onClick={() => actions.toggleClipAudio(clip.id)}>
            <VolumeX />{' '}
            {clip.kind === 'video' && clip.audioEnabled ? 'Mute clip audio' : 'Unmute clip audio'}
          </ContextMenuItem>
        ) : null}
        {isVideo || isAudio ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => actions.cutPauses(clip.id)}>
              <AudioLines /> Cut pauses in this clip
            </ContextMenuItem>
            <ContextMenuItem onClick={() => actions.detectBeats(clip.id)}>
              <Waves /> Detect beats from this clip
            </ContextMenuItem>
          </>
        ) : null}
        <ClipMotionMenus clip={clip} transitionsToNext={transitionsToNext} actions={actions} />
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => actions.rippleDelete(clip.id)}>
          <Trash2 /> Ripple delete
          <ContextMenuShortcut>{KEYS.rippleDelete}</ContextMenuShortcut>
        </ContextMenuItem>
        {isMain ? null : (
          <ContextMenuItem variant="destructive" onClick={() => actions.deleteLeaveGap(clip.id)}>
            Delete, leave gap
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
