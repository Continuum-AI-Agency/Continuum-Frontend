import type { EditorClip, EditorKeyframe, EditorProjectV2 } from './editor-project-v2';
import { type PositionKeyframe, positionKeysForProperty, samplePositionTrack } from './motion-eval';

const findClip = (project: EditorProjectV2, clipId: string): EditorClip | undefined =>
  project.tracks.flatMap((track): EditorClip[] => track.clips).find((clip) => clip.id === clipId);

/** Serializable ancestor position curves, each retaining its own authored clock. */
export type EditorParentPositionTrack = {
  startOffsetSec: number;
  position: { x: number; y: number };
  keyframes: PositionKeyframe[];
  keyframeOffsetSec?: number;
};

function parentPositionSources(
  project: EditorProjectV2,
  clipId: string,
): { clipId: string; track: EditorParentPositionTrack; keyframes: EditorKeyframe[] }[] {
  const child = findClip(project, clipId);
  if (!child) return [];
  if (child.parentMotionBinding) {
    const binding = child.parentMotionBinding;
    return binding.ancestors.flatMap((ancestor) => {
      const parent = findClip(project, ancestor.clipId);
      const live = parent && 'transform' in parent && 'keyframes' in parent ? parent : undefined;
      const source = live ?? ancestor.fallback;
      if (!source) return [];
      const position = 'transform' in source ? source.transform.position : source.position;
      return [
        {
          clipId: ancestor.clipId,
          keyframes: source.keyframes.filter((key) => key.property === 'transform.position'),
          track: {
            startOffsetSec:
              ancestor.startOffsetSec +
              child.timelineStartSec -
              binding.childStartSec -
              (live ? live.timelineStartSec - ancestor.ancestorStartSec : 0),
            position: { x: position.x, y: position.y },
            keyframes: positionKeysForProperty(source.keyframes),
            keyframeOffsetSec:
              ancestor.keyframeOffsetSec +
              (live ? (live.keyframeOffsetSec ?? 0) - ancestor.ancestorKeyframeOffsetSec : 0),
          },
        },
      ];
    });
  }
  const tracks: {
    clipId: string;
    track: EditorParentPositionTrack;
    keyframes: EditorKeyframe[];
  }[] = [];
  const seen = new Set<string>();
  let current: EditorClip | undefined = child;
  while (current && !seen.has(current.id)) {
    if (current !== child && current.parentMotionBinding) {
      const parentStartSec = current.timelineStartSec;
      tracks.push(
        ...parentPositionSources(project, current.id).map((source) => ({
          ...source,
          track: {
            ...source.track,
            startOffsetSec: source.track.startOffsetSec + child.timelineStartSec - parentStartSec,
          },
        })),
      );
      break;
    }
    if (!current.parentClipId) break;
    seen.add(current.id);
    const parent = findClip(project, current.parentClipId);
    if (!parent || !('transform' in parent) || !('keyframes' in parent)) break;
    tracks.push({
      clipId: parent.id,
      keyframes: parent.keyframes.filter((key) => key.property === 'transform.position'),
      track: {
        startOffsetSec: child.timelineStartSec - parent.timelineStartSec,
        position: { x: parent.transform.position.x, y: parent.transform.position.y },
        keyframes: positionKeysForProperty(parent.keyframes),
        ...(parent.keyframeOffsetSec !== undefined
          ? { keyframeOffsetSec: parent.keyframeOffsetSec }
          : {}),
      },
    });
    current = parent;
  }
  return tracks;
}

export function parentPositionTracks(
  project: EditorProjectV2,
  clipId: string,
): EditorParentPositionTrack[] {
  return parentPositionSources(project, clipId).map((source) => source.track);
}

/** Transient provenance supplied by native splits or a range-cut planner. */
export type EditorClipOrigin = { clipId: string; offsetSec: number; motionShiftSec?: number };

/** Preserve ancestor time through a cut without copying live ancestor curves. */
export function retainParentMotionForEdit(
  before: EditorProjectV2,
  after: EditorProjectV2,
  origins: ReadonlyMap<string, EditorClipOrigin>,
  reparented: ReadonlySet<string> = new Set(),
): EditorProjectV2 {
  const survivors = new Map<string, EditorClip>();
  for (const track of after.tracks)
    for (const clip of track.clips) {
      const origin = origins.get(clip.id);
      if (origin && (!survivors.has(origin.clipId) || clip.id === origin.clipId)) {
        survivors.set(origin.clipId, clip);
      }
    }
  return {
    ...after,
    tracks: after.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        const origin = origins.get(clip.id);
        if (!origin || reparented.has(clip.id)) return clip;
        const original = findClip(before, origin.clipId);
        if (!original || original.parentClipId !== clip.parentClipId) return clip;
        const sources = parentPositionSources(before, original.id);
        if (!sources.length || sources.some((source) => reparented.has(source.clipId))) return clip;
        const parent = original.parentClipId ? survivors.get(original.parentClipId) : undefined;
        return {
          ...clip,
          parentClipId: parent?.id,
          parentMotionBinding: {
            childStartSec: clip.timelineStartSec,
            ancestors: sources.map((source) => {
              const survivor = survivors.get(source.clipId);
              return {
                clipId: survivor?.id ?? source.clipId,
                startOffsetSec:
                  source.track.startOffsetSec +
                  origin.offsetSec +
                  (origin.motionShiftSec ?? 0) -
                  (survivor ? (origins.get(survivor.id)?.motionShiftSec ?? 0) : 0),
                keyframeOffsetSec: source.track.keyframeOffsetSec ?? 0,
                ancestorStartSec: survivor?.timelineStartSec ?? 0,
                ancestorKeyframeOffsetSec: survivor?.keyframeOffsetSec ?? 0,
                ...(!survivor
                  ? {
                      fallback: {
                        position: source.track.position,
                        keyframes: source.keyframes,
                      },
                    }
                  : {}),
              };
            }),
          },
        };
      }),
    })),
  } as EditorProjectV2;
}

export function sampleParentPositionTracks(
  tracks: readonly EditorParentPositionTrack[],
  childLocalSec: number,
): { x: number; y: number } {
  let delta = { x: 0, y: 0 };
  for (const track of tracks) {
    const sampled = samplePositionTrack(
      track.keyframes,
      Math.max(0, childLocalSec + track.startOffsetSec),
      track.position,
      track.keyframeOffsetSec,
    );
    delta = {
      x: delta.x + sampled.x - track.position.x,
      y: delta.y + sampled.y - track.position.y,
    };
  }
  return delta;
}

/** World-space position delta contributed by ancestors at a project timeline time. */
export function parentPositionDelta(
  project: EditorProjectV2,
  clipId: string,
  timelineSec: number,
): { x: number; y: number } {
  const child = findClip(project, clipId);
  return child
    ? sampleParentPositionTracks(
        parentPositionTracks(project, clipId),
        timelineSec - child.timelineStartSec,
      )
    : { x: 0, y: 0 };
}
