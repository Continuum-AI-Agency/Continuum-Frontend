import type { EditorClip, EditorProjectV2 } from './editor-project-v2';
import { positionKeysForProperty, samplePositionTrack } from './motion-eval';

const findClip = (project: EditorProjectV2, clipId: string): EditorClip | undefined =>
  project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId);

/** World-space position delta contributed by ancestors at a project timeline time. */
export function parentPositionDelta(
  project: EditorProjectV2,
  clipId: string,
  timelineSec: number,
): { x: number; y: number } {
  let delta = { x: 0, y: 0 };
  const seen = new Set<string>();
  let current = findClip(project, clipId);
  while (current?.parentClipId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = findClip(project, current.parentClipId);
    if (!parent || !('transform' in parent) || !('keyframes' in parent)) break;
    const localSec = Math.max(0, timelineSec - parent.timelineStartSec);
    const sampled = samplePositionTrack(
      positionKeysForProperty(parent.keyframes),
      localSec,
      parent.transform.position,
    );
    delta = {
      x: delta.x + (sampled.x - parent.transform.position.x),
      y: delta.y + (sampled.y - parent.transform.position.y),
    };
    current = parent;
  }
  return delta;
}
