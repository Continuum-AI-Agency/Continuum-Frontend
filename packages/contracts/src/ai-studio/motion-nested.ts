import type {
  EditorNestedSequence,
  EditorNestedSequenceClip,
  EditorProjectV2,
} from './editor-project-v2';

export function isLocalNestedClip(
  project: Pick<EditorProjectV2, 'projectId'>,
  clip: EditorNestedSequenceClip,
): boolean {
  return !clip.projectId || clip.projectId === project.projectId;
}

export function resolveNestedSequence(
  project: EditorProjectV2,
  clip: EditorNestedSequenceClip,
): EditorNestedSequence | null {
  if (!isLocalNestedClip(project, clip)) return null;
  return project.nestedSequences.find((sequence) => sequence.id === clip.sequenceId) ?? null;
}

/** Child-local time for a nested instance at a host timeline time. Frozen after the child ends. */
export function nestedChildTimeSec(
  clip: Pick<EditorNestedSequenceClip, 'timelineStartSec' | 'sourceInSec' | 'playbackRate'>,
  childDurationSec: number,
  timelineSec: number,
): number {
  const local = Math.max(0, timelineSec - clip.timelineStartSec);
  const child = clip.sourceInSec + local * (clip.playbackRate > 0 ? clip.playbackRate : 1);
  return Math.max(0, Math.min(childDurationSec, child));
}
