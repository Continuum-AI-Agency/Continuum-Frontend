'use client';

import type {
  EditorClip,
  EditorOverlayClip,
  EditorProjectV2,
  EditorVideoClip,
} from '@continuum/contracts';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StageTextCanvas } from '@/components/video-studio/motion/StageTextCanvas';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import type { TimelineItem } from '../../../types';
import { clipEffectsToCss } from '../../../utils/render/effectSpec';
import { orderedVideoClips } from '../editorProjectV2AssemblyModel';
import { nestedPreviewGroups } from '../nestedSequencePreview';
import type { OverlayPreviewLayer } from '../overlayPreview';
import { TimelinePreview } from '../TimelinePreview';
import { useEditorProjectV2AudioPreview } from '../useEditorProjectV2AudioPreview';
import { type ClipMedia, usePlayheadPlayback } from '../usePlayheadPlayback';
import type { TimelineLayout } from '../useTimelineEditorModel';
import type { PlayheadStore } from './playheadStore';
import { StageTransformHandles } from './StageTransformHandles';
import { stageTransformAt, stageTransformEdit } from './stageTransform';
import { clipEnd, type EditBuild, findClip, mainVideoTrack } from './timelineEdits';

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
  const effects = clipEffectSpecFromEditorClip(clip, project);
  const css = clipEffectsToCss(
    effects,
    clip.durationSec > 0 ? effectTimeSec / clip.durationSec : 0,
  );
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
    },
    textOverlays: [],
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
  const activeEffects = active ? clipEffectSpecFromEditorClip(active, project) : undefined;
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
  const textClips = visible.flatMap((track) =>
    track.kind === 'text' ? track.clips.filter((clip) => clip.enabled) : [],
  );
  const captionClips = visible.flatMap((track) =>
    track.kind === 'caption' ? track.clips.filter((clip) => clip.enabled) : [],
  );

  const selection = selectedClipId ? findClip(project, selectedClipId) : undefined;
  const selected = selection?.clip;
  const handlesFor =
    selected &&
    activeAt(selected, sec) &&
    !selected.locked &&
    !selection?.track.locked &&
    visible.some((track) => track.id === selection?.track.id) &&
    (selected.kind === 'video' ||
      selected.kind === 'overlay' ||
      selected.kind === 'text' ||
      selected.kind === 'nested_sequence')
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
          frameSize={project.canvas}
          shaderEffects={activeEffects}
          shaderTimeSec={active ? sec - active.timelineStartSec : 0}
          overlayLayers={overlayLayers}
          nestedGroups={nestedPreviewGroups({
            project,
            playheadSec: sec,
            overlayLayerFor: (clip, time, space) => layerFor(space, clip, urls.get(clip.id), time),
          })}
          mediaMuted={audioPreview.active || !active?.audioEnabled || Boolean(main?.muted)}
          motionPath={
            <>
              <StageTextCanvas
                clips={[...captionClips, ...textClips]}
                project={project}
                sec={sec}
                width={canvasWidth}
                height={canvasHeight}
              />
              {handlesFor ? (
                <StageTransformHandles
                  key={handlesFor.id}
                  transform={stageTransformAt(project, handlesFor, sec)}
                  timeSec={sec}
                  onBegin={playback.pause}
                  baseSize={baseSize}
                  frameAspect={canvasWidth / canvasHeight}
                  onCommit={(transform, gesture, timeSec) =>
                    onEdit((current) =>
                      stageTransformEdit(current, handlesFor.id, transform, gesture, timeSec),
                    )
                  }
                />
              ) : null}
            </>
          }
        />
      </div>
    </div>
  );
});
