'use client';

import {
  type EditorClip,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTrack,
  MOTION_BEZIER_PRESETS,
  MOTION_SPRING_PRESETS,
} from '@continuum/contracts';
import { Diamond, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import { SliderField } from '@/components/ui/slider-field';
import {
  type EditorAssemblyOperation,
  removeClipOperation,
  setClipParentOperation,
  upsertKeyframeOperation,
  upsertOverlayOperation,
} from '../editorProjectV2AssemblyModel';
import { KeyframeDiamond } from '../motion/KeyframeDiamond';
import type { MotionPropertyName } from '../motion/motionLayers';

type OverlayTrack = Extract<EditorTrack, { kind: 'overlay' }>;

export function MediaOverlayEditor({
  project,
  overlayTrack,
  urls,
  playheadSec,
  autoKey,
  onApply,
}: {
  project: EditorProjectV2;
  overlayTrack?: OverlayTrack;
  urls: ReadonlyMap<string, string>;
  playheadSec: number;
  autoKey: boolean;
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
          playheadSec={playheadSec}
          autoKey={autoKey}
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

function writeOverlayKeyframe(
  project: EditorProjectV2,
  trackId: string,
  clip: EditorOverlayClip,
  property: MotionPropertyName,
  timeSec: number,
  value: EditorOverlayClip['keyframes'][number]['value'],
) {
  return upsertKeyframeOperation(project, {
    trackId,
    clipId: clip.id,
    keyframe: {
      id: crypto.randomUUID(),
      property,
      timeSec,
      value,
      interpolation: 'linear',
    },
  });
}

function MediaOverlayRow({
  project,
  trackId,
  clip,
  previewUrl,
  playheadSec,
  autoKey,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  clip: EditorOverlayClip;
  previewUrl?: string;
  playheadSec: number;
  autoKey: boolean;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [start, setStart] = useState(clip.timelineStartSec);
  const [duration, setDuration] = useState(clip.durationSec);
  const [x, setX] = useState(clip.transform.position.x);
  const [y, setY] = useState(clip.transform.position.y);
  const [scale, setScale] = useState(clip.transform.scaleX);
  const [rotation, setRotation] = useState(clip.transform.rotationDeg);
  const [rotateX, setRotateX] = useState(clip.transform.rotateXDeg ?? 0);
  const [rotateY, setRotateY] = useState(clip.transform.rotateYDeg ?? 0);
  const [perspective, setPerspective] = useState(clip.transform.perspective ?? 0);
  const [anchorX, setAnchorX] = useState(clip.transform.anchorX);
  const [opacity, setOpacity] = useState(clip.transform.opacity);
  useEffect(() => {
    setStart(clip.timelineStartSec);
    setDuration(clip.durationSec);
    setX(clip.transform.position.x);
    setY(clip.transform.position.y);
    setScale(clip.transform.scaleX);
    setRotation(clip.transform.rotationDeg);
    setRotateX(clip.transform.rotateXDeg ?? 0);
    setRotateY(clip.transform.rotateYDeg ?? 0);
    setPerspective(clip.transform.perspective ?? 0);
    setAnchorX(clip.transform.anchorX);
    setOpacity(clip.transform.opacity);
  }, [clip]);
  const localSec = Math.max(0, Math.min(clip.durationSec, playheadSec - clip.timelineStartSec));
  const playheadOnClip =
    playheadSec >= clip.timelineStartSec && playheadSec <= clip.timelineStartSec + clip.durationSec;
  const opacityKeyed = clip.keyframes.some(
    (keyframe) =>
      keyframe.property === 'transform.opacity' &&
      Math.abs(keyframe.timeSec - (clip.keyframeOffsetSec ?? 0) - localSec) <= 0.05,
  );
  const opacityKeys = clip.keyframes
    .filter((keyframe) => keyframe.property === 'transform.opacity')
    .toSorted((left, right) => left.timeSec - right.timeSec);
  const departingOpacity = [...opacityKeys]
    .reverse()
    .find((keyframe) => keyframe.timeSec <= localSec + (clip.keyframeOffsetSec ?? 0) + 0.001);
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
        <NumberScrubField
          min={0}
          step={0.1}
          label="At"
          value={start}
          max={project.durationSec}
          onChange={setStart}
        />
        <NumberScrubField
          step={0.1}
          label="Duration"
          value={duration}
          min={0.1}
          onChange={setDuration}
        />
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="X"
          max={1}
          min={0}
          step={0.05}
          value={x}
          onChange={setX}
          onCommit={(value) => {
            setX(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(project, trackId, clip, 'transform.position', localSec, {
                  x: value,
                  y,
                }),
              );
            }
          }}
        />
        <SliderField
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          label="Y"
          max={1}
          min={0}
          step={0.05}
          value={y}
          onChange={setY}
          onCommit={(value) => {
            setY(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(project, trackId, clip, 'transform.position', localSec, {
                  x,
                  y: value,
                }),
              );
            }
          }}
        />
        <SliderField
          label="Scale"
          max={4}
          min={0.05}
          step={0.05}
          suffix="x"
          value={scale}
          onChange={setScale}
          onCommit={(value) => {
            setScale(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(project, trackId, clip, 'transform.scaleX', localSec, value),
              );
              onApply(
                writeOverlayKeyframe(project, trackId, clip, 'transform.scaleY', localSec, value),
              );
            }
          }}
        />
        <SliderField
          label="Rotation"
          max={360}
          min={-360}
          step={1}
          suffix="°"
          value={rotation}
          onChange={setRotation}
          onCommit={(value) => {
            setRotation(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(
                  project,
                  trackId,
                  clip,
                  'transform.rotationDeg',
                  localSec,
                  value,
                ),
              );
            }
          }}
        />
        <SliderField
          label="Rotate X"
          max={90}
          min={-90}
          step={1}
          suffix="°"
          value={rotateX}
          onChange={setRotateX}
          onCommit={(value) => {
            setRotateX(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(
                  project,
                  trackId,
                  clip,
                  'transform.rotateXDeg',
                  localSec,
                  value,
                ),
              );
            }
          }}
        />
        <SliderField
          label="Rotate Y"
          max={90}
          min={-90}
          step={1}
          suffix="°"
          value={rotateY}
          onChange={setRotateY}
          onCommit={(value) => {
            setRotateY(value);
            if (autoKey && playheadOnClip) {
              onApply(
                writeOverlayKeyframe(
                  project,
                  trackId,
                  clip,
                  'transform.rotateYDeg',
                  localSec,
                  value,
                ),
              );
            }
          }}
        />
        <SliderField
          label="Perspective"
          max={4}
          min={0}
          step={0.05}
          value={perspective}
          onChange={setPerspective}
        />
        <label className="col-span-2 flex items-center justify-between gap-2 text-2xs">
          <span className="text-muted-foreground">Parent</span>
          <select
            aria-label="Parent clip"
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-xs"
            value={clip.parentClipId ?? ''}
            onChange={(event) =>
              onApply(
                setClipParentOperation(project, {
                  trackId,
                  clipId: clip.id,
                  parentClipId: event.target.value || null,
                }),
              )
            }
          >
            <option value="">None</option>
            {project.tracks
              .flatMap((track): EditorClip[] => track.clips)
              .filter((candidate) => candidate.id !== clip.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name ?? candidate.id}
                </option>
              ))}
          </select>
        </label>
        <div className="flex items-end gap-1">
          <SliderField
            format={{ style: 'percent', maximumFractionDigits: 0 }}
            label="Anchor"
            max={1}
            min={0}
            step={0.05}
            value={anchorX}
            onChange={setAnchorX}
            className="min-w-0 flex-1"
          />
          <KeyframeDiamond
            labeled="rotation"
            keyed={clip.keyframes.some(
              (keyframe) =>
                keyframe.property === 'transform.rotationDeg' &&
                Math.abs(keyframe.timeSec - (clip.keyframeOffsetSec ?? 0) - localSec) <= 0.05,
            )}
            disabled={!playheadOnClip}
            onToggle={() =>
              onApply(
                writeOverlayKeyframe(
                  project,
                  trackId,
                  clip,
                  'transform.rotationDeg',
                  localSec,
                  rotation,
                ),
              )
            }
          />
        </div>
        <div className="col-span-2 flex items-end gap-1">
          <SliderField
            format={{ style: 'percent', maximumFractionDigits: 0 }}
            label="Opacity"
            max={1}
            min={0}
            step={0.05}
            value={opacity}
            onChange={setOpacity}
            className="min-w-0 flex-1"
            onCommit={(value) => {
              setOpacity(value);
              if (autoKey && playheadOnClip) {
                onApply(
                  writeOverlayKeyframe(
                    project,
                    trackId,
                    clip,
                    'transform.opacity',
                    localSec,
                    value,
                  ),
                );
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5 size-7 shrink-0"
            disabled={!playheadOnClip}
            aria-label={
              opacityKeyed
                ? 'Update opacity keyframe at playhead'
                : 'Add opacity keyframe at playhead'
            }
            aria-pressed={opacityKeyed}
            onClick={() =>
              onApply(
                upsertKeyframeOperation(project, {
                  trackId,
                  clipId: clip.id,
                  keyframe: {
                    id: crypto.randomUUID(),
                    property: 'transform.opacity',
                    timeSec: localSec,
                    value: opacity,
                    interpolation: 'linear',
                  },
                }),
              )
            }
          >
            <Diamond className={opacityKeyed ? 'size-3.5 fill-current' : 'size-3.5'} />
          </Button>
        </div>
        {opacityKeys.length >= 2 &&
        departingOpacity &&
        typeof departingOpacity.value === 'number' ? (
          <label className="col-span-2 flex items-center justify-between gap-2 text-2xs">
            <span className="text-muted-foreground">Opacity easing</span>
            <select
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
              value={
                departingOpacity.interpolation === 'bezier'
                  ? 'easeOutBack'
                  : departingOpacity.interpolation === 'spring'
                    ? 'spring'
                    : departingOpacity.interpolation
              }
              onChange={(event) => {
                const next = event.target.value;
                const interpolation =
                  next === 'hold'
                    ? 'hold'
                    : next === 'spring'
                      ? 'spring'
                      : next === 'easeOutBack'
                        ? 'bezier'
                        : 'linear';
                onApply(
                  upsertKeyframeOperation(project, {
                    trackId,
                    clipId: clip.id,
                    keyframe: {
                      id: departingOpacity.id,
                      property: 'transform.opacity',
                      timeSec: departingOpacity.timeSec,
                      value: departingOpacity.value,
                      interpolation,
                      ...(interpolation === 'bezier'
                        ? { easing: MOTION_BEZIER_PRESETS.easeOutBack }
                        : {}),
                      ...(interpolation === 'spring'
                        ? { spring: { bounce: MOTION_SPRING_PRESETS.gentle } }
                        : {}),
                    },
                  }),
                );
              }}
            >
              <option value="linear">Linear</option>
              <option value="hold">Hold</option>
              <option value="easeOutBack">Ease out back</option>
              <option value="spring">Spring</option>
            </select>
          </label>
        ) : null}
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
                rotationDeg: rotation,
                rotateXDeg: rotateX,
                rotateYDeg: rotateY,
                perspective,
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
