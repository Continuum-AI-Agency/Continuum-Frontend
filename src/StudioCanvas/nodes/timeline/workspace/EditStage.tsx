'use client';

import {
  type EditorCaptionClip,
  type EditorClip,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTextClip,
  type EditorVideoClip,
  parentPositionDelta,
} from '@continuum/contracts';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import { captionAnimationFromEditorId, captionMotionTransform } from '@/lib/clips/captionAnimation';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { TimelineItem } from '../../../types';
import { clipEffectsToCss, type ResolvedTextOverlay } from '../../../utils/render/effectSpec';
import type { CaptionCue } from '../../../utils/splice/captionCues';
import { orderedVideoClips } from '../editorProjectV2AssemblyModel';
import type { OverlayPreviewLayer } from '../overlayPreview';
import { TimelinePreview } from '../TimelinePreview';
import { useEditorProjectV2AudioPreview } from '../useEditorProjectV2AudioPreview';
import { type ClipMedia, usePlayheadPlayback } from '../usePlayheadPlayback';
import type { TimelineLayout } from '../useTimelineEditorModel';
import type { PlayheadStore } from './playheadStore';
import { StageTransformHandles } from './StageTransformHandles';
import {
  clipEnd,
  type EditBuild,
  findClip,
  mainVideoTrack,
  replaceClipEdit,
} from './timelineEdits';

const CONTROLS_PX = 44;

const activeAt = (clip: EditorClip, sec: number): boolean =>
  clip.enabled && sec >= clip.timelineStartSec && sec < clipEnd(clip);

/** The main track as the playback driver's sequence; the other lanes ride as layers. */
export function mainTrackLayout(project: EditorProjectV2): TimelineLayout {
  const clips = orderedVideoClips(mainVideoTrack(project)).filter((clip) => clip.enabled);
  return {
    totalSec: project.durationSec,
    clips: clips.map((clip, order) => ({
      item: {
        id: clip.id,
        order,
        sourceNodeId: clip.id,
        kind: 'video',
        trimStartSec: clip.sourceInSec,
        trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
      } satisfies TimelineItem,
      startSec: clip.timelineStartSec,
      durationSec: clip.durationSec,
      leftPx: 0,
      widthPx: 0,
    })),
  };
}

function layerFor(
  project: EditorProjectV2,
  clip: EditorOverlayClip | EditorVideoClip,
  url: string | undefined,
  sec: number,
): OverlayPreviewLayer | null {
  if (!url || !activeAt(clip, sec)) return null;
  const effectTimeSec = sec - clip.timelineStartSec;
  const rate = clip.kind === 'video' ? clip.playbackRate : 1;
  const effects = clipEffectSpecFromEditorClip(clip);
  const css = clipEffectsToCss(
    effects,
    clip.durationSec > 0 ? effectTimeSec / clip.durationSec : 0,
  );
  const parent = parentPositionDelta(project, clip.id, sec);
  const parentTranslate =
    parent.x || parent.y ? `translate(${parent.x * 100}%, ${parent.y * 100}%)` : '';
  return {
    id: clip.id,
    kind: clip.kind === 'overlay' && clip.mediaKind === 'image' ? 'image' : 'video',
    url,
    sourceSec: (clip.sourceInSec ?? 0) + effectTimeSec * rate,
    playbackRate: rate,
    muted: true,
    volume: 0,
    effects,
    effectTimeSec,
    mediaStyle: {
      ...css,
      transform: [parentTranslate, css.transform].filter(Boolean).join(' ') || undefined,
      transformOrigin: `${clip.transform.anchorX * 100}% ${clip.transform.anchorY * 100}%`,
    },
    textOverlays: [],
  };
}

function textOverlayFor(
  clip: EditorTextClip,
  sec: number,
  canvasHeight: number,
): ResolvedTextOverlay {
  const motion = captionMotionTransform({
    entry: captionAnimationFromEditorId(clip.animationIn),
    exit: captionAnimationFromEditorId(clip.animationOut),
    cueStartSec: clip.timelineStartSec,
    cueEndSec: clipEnd(clip),
    wordStartSec: clip.timelineStartSec,
    wordEndSec: clipEnd(clip),
    outputTimeSec: sec,
    fontPx: clip.style.fontSizePx,
  });
  return {
    id: clip.id,
    text: clip.text,
    xFrac: clip.transform.position.x,
    yFrac: clip.transform.position.y,
    sizeFrac: clip.style.fontSizePx / canvasHeight,
    color: clip.style.color,
    background: clip.style.backgroundColor,
    fontWeight: clip.style.fontWeight,
    opacity: motion.alpha * clip.transform.opacity,
    scale: motion.scale,
    translateYEm: motion.dy / clip.style.fontSizePx,
  };
}

/** Caption clips carry timeline-time words — the same reading the burn-in makes. */
function captionFor(
  clip: EditorCaptionClip,
  canvasHeight: number,
): { cue: CaptionCue; style: CaptionStyle } {
  const words =
    clip.words.length > 0
      ? // Words count from the clip's start; the preview, like the burn-in, adds it.
        clip.words.map((word) => ({
          text: word.text,
          startSec: clip.timelineStartSec + word.startSec,
          endSec: clip.timelineStartSec + word.endSec,
          ...(word.emphasis ? { emphasis: true } : {}),
        }))
      : [{ text: clip.text, startSec: clip.timelineStartSec, endSec: clipEnd(clip) }];
  return {
    cue: { id: clip.id, startSec: clip.timelineStartSec, endSec: clipEnd(clip), words },
    style: {
      textColor: clip.style.color,
      highlightColor: clip.highlightMode === 'none' ? clip.style.color : '#ffd400',
      outlineColor: clip.style.outlineColor ?? '#000000',
      fontFamily: clip.style.fontFamily,
      fontWeight: clip.style.fontWeight,
      fontSizeFrac: clip.style.fontSizePx / canvasHeight,
      outlineWidthFrac:
        clip.style.fontSizePx > 0 ? clip.style.outlineWidthPx / clip.style.fontSizePx : 0,
      position: { xFrac: clip.transform.position.x, yFrac: clip.transform.position.y },
      ...(clip.style.backgroundColor
        ? { backgroundColor: clip.style.backgroundColor, backgroundMode: 'line' as const }
        : {}),
    },
  };
}

/** The picture, fitted to the project's aspect so layers and handles land where the export puts them. */
function useFittedFrame(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = Math.max(0, entry.contentRect.height - CONTROLS_PX);
      const fitWidth = Math.min(width, height * aspect);
      setBox({ width: Math.floor(fitWidth), height: Math.floor(fitWidth / aspect) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspect]);
  return { ref, box };
}

/**
 * The stage, and the playback driver behind it: the one part of the workspace that
 * re-renders every frame. It reports the playhead to `store` so the ruler line and clock
 * follow live while the lanes, inspector and bin stay still.
 */
export const EditStage = memo(function EditStage({
  project,
  urls,
  store,
  selectedClipId,
  onEdit,
}: {
  project: EditorProjectV2;
  urls: ReadonlyMap<string, string>;
  store: PlayheadStore;
  selectedClipId?: string;
  onEdit: (build: EditBuild) => void;
}) {
  const { width: canvasWidth, height: canvasHeight } = project.canvas;
  const { ref, box } = useFittedFrame(canvasWidth / canvasHeight);
  const main = mainVideoTrack(project);
  const layout = useMemo(() => mainTrackLayout(project), [project]);
  const mediaFor = useCallback(
    (clipId: string): ClipMedia | undefined => {
      const clip = main?.clips.find((candidate) => candidate.id === clipId);
      return clip
        ? {
            kind: 'video',
            url: urls.get(clip.id),
            trimStartSec: clip.sourceInSec,
            speed: clip.playbackRate,
          }
        : undefined;
    },
    [main, urls],
  );
  const audioPreview = useEditorProjectV2AudioPreview({ project, layout, exactUrls: urls });
  const playback = usePlayheadPlayback({
    layout,
    mediaFor,
    audioPreview,
    revisionKey: project.fingerprint,
  });
  useLayoutEffect(() => store.connect(playback));
  useEffect(() => store.publish(playback.playheadSec, playback.isPlaying));
  const sec = playback.playheadSec;
  const active = orderedVideoClips(main).find((clip) => activeAt(clip, sec));
  const activeEffects = active ? clipEffectSpecFromEditorClip(active) : undefined;
  const activeT = active
    ? Math.max(0, Math.min(1, (sec - active.timelineStartSec) / active.durationSec))
    : 0;
  // A muted video track is silent, not invisible; only `enabled` hides picture.
  const visible = project.tracks.filter(
    (track) => track.enabled && (track.kind === 'video' || !track.muted),
  );
  const overlayLayers = [
    ...visible.flatMap((track) => (track.kind === 'overlay' ? track.clips : [])),
    ...visible
      .filter((track) => track.kind === 'video' && track.id !== main?.id)
      .sort((left, right) => left.order - right.order)
      .flatMap((track) => (track.kind === 'video' ? track.clips : [])),
  ].flatMap((clip) => {
    const layer = layerFor(project, clip, urls.get(clip.id), sec);
    return layer ? [layer] : [];
  });
  const textOverlays = visible
    .flatMap((track) => (track.kind === 'text' ? track.clips : []))
    .filter((clip) => activeAt(clip, sec))
    .map((clip) => textOverlayFor(clip, sec, canvasHeight));
  const captionClip = visible
    .flatMap((track) => (track.kind === 'caption' ? track.clips : []))
    .find((clip) => activeAt(clip, sec));
  const caption = captionClip ? captionFor(captionClip, canvasHeight) : undefined;

  const selected = selectedClipId ? findClip(project, selectedClipId)?.clip : undefined;
  const handlesFor =
    selected &&
    activeAt(selected, sec) &&
    (selected.kind === 'video' || selected.kind === 'overlay' || selected.kind === 'text')
      ? selected
      : undefined;
  const baseSize =
    handlesFor?.kind === 'text'
      ? {
          width: Math.min(
            0.95,
            (handlesFor.text.length * handlesFor.style.fontSizePx * 0.55) / canvasWidth,
          ),
          height: (handlesFor.style.fontSizePx * handlesFor.style.lineHeight) / canvasHeight,
        }
      : { width: 1, height: 1 };

  return (
    <div
      ref={ref}
      className="flex h-full min-h-0 w-full items-center justify-center p-3"
      data-testid="edit-stage"
    >
      <div style={{ width: box.width, height: box.height + CONTROLS_PX }}>
        <TimelinePreview
          videoRef={playback.videoRef}
          showVideo={Boolean(active)}
          isEmpty={!main || main.clips.length === 0}
          isPlaying={playback.isPlaying}
          isPreparing={playback.isPreparing}
          onTogglePlay={playback.toggle}
          playheadSec={sec}
          totalSec={project.durationSec}
          mediaStyle={clipEffectsToCss(activeEffects, activeT)}
          shaderEffects={activeEffects}
          shaderTimeSec={active ? sec - active.timelineStartSec : 0}
          textOverlays={textOverlays}
          overlayLayers={overlayLayers}
          caption={caption?.cue}
          captionStyle={caption?.style}
          mediaMuted={audioPreview.active || !active?.audioEnabled || Boolean(main?.muted)}
          motionPath={
            handlesFor ? (
              <StageTransformHandles
                key={handlesFor.id}
                transform={handlesFor.transform}
                baseSize={baseSize}
                onCommit={(transform) =>
                  // Built on the project at apply time, and only the geometry the handles
                  // own: an opacity or crop change still in flight is not undone.
                  onEdit((current) => {
                    const clip = findClip(current, handlesFor.id)?.clip;
                    if (!clip || !('transform' in clip)) return null;
                    const { position, scaleX, scaleY, rotationDeg } = transform;
                    return replaceClipEdit(
                      current,
                      {
                        ...clip,
                        transform: { ...clip.transform, position, scaleX, scaleY, rotationDeg },
                      } as EditorClip,
                      'Transform clip',
                    );
                  })
                }
              />
            ) : null
          }
        />
      </div>
    </div>
  );
});
