import type { TimelineLayout } from './useTimelineEditorModel';

// Precision helpers for the Video Editor: snap a scrub/trim time to nearby
// structural boundaries (clip edges, timeline start/end) when within a small
// pixel threshold, so edits land cleanly on cuts the way CapCut does. Pure so
// it can be unit-tested and reused by the playhead and (later) trim handles.

export function boundaryTimes(layout: TimelineLayout): number[] {
  const times = new Set<number>([0, layout.totalSec]);
  for (const clip of layout.clips) {
    times.add(clip.startSec);
    times.add(clip.startSec + clip.durationSec);
  }
  return [...times];
}

// Absolute start/end edges of a set of lane items (overlay clips). Feeding these
// into the snap candidates makes the playhead and overlay drags snap ACROSS tracks
// — an overlay lands on a base cut, the playhead lands on an overlay edge.
export function laneItemEdges(items: { startSec: number; durationSec: number }[]): number[] {
  const times: number[] = [];
  for (const item of items) {
    times.push(item.startSec, item.startSec + item.durationSec);
  }
  return times;
}

export function snapSec(
  sec: number,
  candidates: number[],
  pxPerSec: number,
  thresholdPx = 8,
): number {
  const thresholdSec = pxPerSec > 0 ? thresholdPx / pxPerSec : 0;
  let best = sec;
  let bestDist = thresholdSec;
  for (const candidate of candidates) {
    const dist = Math.abs(candidate - sec);
    if (dist <= bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
