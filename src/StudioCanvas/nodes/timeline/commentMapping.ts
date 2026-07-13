// Time mapping between a media asset's OWN timeline — where Library comments
// are anchored, and where they stay anchored forever — and the Video Editor's
// OUTPUT timeline, where that same source may be trimmed, sped up, split across
// several clips, or absent entirely.
//
// The asset is the system of record: a comment never moves because someone
// re-cut a timeline. This module is the (pure, React-free) lens that answers
// "where in THIS cut does that source moment land?" in both directions, so the
// editor can show a source's feedback in place and post new feedback back to
// source time. It mirrors the editor's own layout math (effectiveItemDuration /
// computeLayout in useTimelineEditorModel) rather than re-deriving it: the
// caller hands over the placements that layout already produced.

import type { MediaComment } from '@continuum/contracts';
import type { TimelineItem, TimelineTrack } from '../../types';
import { speedFor } from '../../utils/render/effectSpec';
import { effectiveItemDuration } from './useTimelineEditorModel';

// One appearance of a source asset on the editor timeline. `itemId` is the
// TimelineItem id, which is what disambiguates the same asset placed twice.
export type ClipPlacement = {
  itemId: string;
  assetId: string;
  /** Kept source window, in the SOURCE asset's own seconds. */
  trimStartSec: number;
  trimEndSec: number;
  /** speedFor(item.effects) — a divisor on output time; 1 when absent. */
  speed: number;
  /** Transition-aware output position (ClipLayout.startSec / overlay startSec). */
  outputStartSec: number;
  track: 'base' | 'overlay';
};

export type EditorCommentMarker = {
  /** Stable per (comment, placement) — one comment can surface on several clips. */
  key: string;
  commentId: string;
  itemId: string;
  assetId: string;
  outputStartSec: number;
  /** null for a point comment; the span end for a range. */
  outputEndSec: number | null;
  /** The range extended past this clip's trim and was cut down to fit. */
  clipped: boolean;
  track: 'base' | 'overlay';
};

// Floating-point slack, in seconds. Boundary comparisons are inclusive on
// purpose: a comment sitting exactly on a cut shows on BOTH adjacent clips of
// the same source rather than falling through the crack between them.
const EPSILON_SEC = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Speed divides output time, so a zero or negative value would blow the math up.
function safeSpeed(speed: number): number {
  return speed > 0 ? speed : 1;
}

// A still holds a single frame: there is no source time inside it to anchor a
// time comment to, so image placements are never projection targets.
function carriesSourceTime(placement: ClipPlacement): boolean {
  return placement.trimEndSec > placement.trimStartSec;
}

function outputDurationSec(placement: ClipPlacement): number {
  return (placement.trimEndSec - placement.trimStartSec) / safeSpeed(placement.speed);
}

function sourceToOutput(placement: ClipPlacement, sourceSec: number): number {
  const kept = clamp(sourceSec, placement.trimStartSec, placement.trimEndSec);
  return placement.outputStartSec + (kept - placement.trimStartSec) / safeSpeed(placement.speed);
}

type SourceSpan = { startSec: number; endSec: number | null };

function timeSpanOf(comment: MediaComment): SourceSpan | null {
  const annotation = comment.annotation;
  if (!annotation || annotation.kind !== 'time') return null;
  return {
    startSec: annotation.timeMs / 1000,
    endSec: annotation.endMs === undefined ? null : annotation.endMs / 1000,
  };
}

type ProjectedSpan = { outputStartSec: number; outputEndSec: number | null; clipped: boolean };

function projectSpan(placement: ClipPlacement, span: SourceSpan): ProjectedSpan | null {
  const { trimStartSec, trimEndSec } = placement;

  if (span.endSec === null) {
    const outside =
      span.startSec < trimStartSec - EPSILON_SEC || span.startSec > trimEndSec + EPSILON_SEC;
    return outside
      ? null
      : {
          outputStartSec: sourceToOutput(placement, span.startSec),
          outputEndSec: null,
          clipped: false,
        };
  }

  const keptStart = Math.max(span.startSec, trimStartSec);
  const keptEnd = Math.min(span.endSec, trimEndSec);
  if (keptEnd < keptStart - EPSILON_SEC) return null;

  return {
    outputStartSec: sourceToOutput(placement, keptStart),
    outputEndSec: sourceToOutput(placement, keptEnd),
    clipped: keptStart > span.startSec + EPSILON_SEC || keptEnd < span.endSec - EPSILON_SEC,
  };
}

/**
 * Every source-time comment, projected onto whichever clips actually kept the
 * moment it points at. A comment outside every trim yields no marker — the
 * asset detail modal stays the sidebar of truth for the full feedback set.
 * Sorted by output position so render order matches reading order.
 */
export function projectCommentsToTimeline(
  comments: MediaComment[],
  placements: ClipPlacement[],
): EditorCommentMarker[] {
  const markers: EditorCommentMarker[] = [];

  for (const comment of comments) {
    const span = timeSpanOf(comment);
    if (!span) continue;

    for (const placement of placements) {
      if (placement.assetId !== comment.assetId || !carriesSourceTime(placement)) continue;
      const projected = projectSpan(placement, span);
      if (!projected) continue;
      markers.push({
        key: `${comment.id}:${placement.itemId}`,
        commentId: comment.id,
        itemId: placement.itemId,
        assetId: placement.assetId,
        track: placement.track,
        ...projected,
      });
    }
  }

  return markers.sort((a, b) => a.outputStartSec - b.outputStartSec || a.key.localeCompare(b.key));
}

export type SourceAnchor = { assetId: string; itemId: string; sourceTimeMs: number };

/**
 * The inverse: which source frame is the viewer looking at when the playhead
 * sits at `outputSec`? Base track only — the overlay layer floats over whatever
 * the base is playing, and the base is what the playhead reads as "the video".
 * Returns null over a gap or a still, where there is no source time to anchor to.
 */
export function editorTimeToSource(
  outputSec: number,
  placements: ClipPlacement[],
): SourceAnchor | null {
  let visible: ClipPlacement | null = null;

  for (const placement of placements) {
    if (placement.track !== 'base' || !carriesSourceTime(placement)) continue;
    const startSec = placement.outputStartSec;
    const endSec = startSec + outputDurationSec(placement);
    if (outputSec < startSec - EPSILON_SEC || outputSec > endSec + EPSILON_SEC) continue;
    // During a cross-dissolve two clips occupy the same output time. The viewer
    // is resolving ONTO the incoming clip, so the later start wins.
    if (!visible || placement.outputStartSec > visible.outputStartSec) visible = placement;
  }

  if (!visible) return null;

  const sourceSec = clamp(
    visible.trimStartSec + (outputSec - visible.outputStartSec) * safeSpeed(visible.speed),
    visible.trimStartSec,
    visible.trimEndSec,
  );
  return {
    assetId: visible.assetId,
    itemId: visible.itemId,
    sourceTimeMs: Math.round(sourceSec * 1000),
  };
}

export type SourceRangeAnchor = {
  assetId: string;
  itemId: string;
  timeMs: number;
  endMs: number;
};

/**
 * An in/out sweep on the output timeline, resolved back to one source range.
 * Non-null ONLY when both ends land on the same placement: a sweep across a cut
 * describes two different source windows and cannot be one comment, and a sweep
 * shorter than a millisecond is a point, not a range (the contract requires
 * endMs > timeMs). Callers surface null as "range crosses a cut".
 */
export function editorRangeToSource(
  startSec: number,
  endSec: number,
  placements: ClipPlacement[],
): SourceRangeAnchor | null {
  const head = editorTimeToSource(Math.min(startSec, endSec), placements);
  const tail = editorTimeToSource(Math.max(startSec, endSec), placements);
  if (!head || !tail) return null;
  if (head.itemId !== tail.itemId || head.assetId !== tail.assetId) return null;

  const timeMs = Math.min(head.sourceTimeMs, tail.sourceTimeMs);
  const endMs = Math.max(head.sourceTimeMs, tail.sourceTimeMs);
  if (endMs <= timeMs) return null;

  return { assetId: head.assetId, itemId: head.itemId, timeMs, endMs };
}

// Turn the editor's own layout into the placements the projection needs.
//
// The base track's output positions come from computeLayout (transition-aware,
// so a cross-dissolve's overlap is already accounted for); overlay items float
// at their own absolute startSec. A clip's SOURCE window is recovered from its
// output duration rather than re-derived: output = (trimEnd - trimStart)/speed,
// so trimEnd = trimStart + output*speed. Stills carry no source timeline and
// are dropped — a time comment can never land on one.
export function buildClipPlacements(input: {
  layoutClips: ReadonlyArray<{ item: TimelineItem; startSec: number; durationSec: number }>;
  overlayTracks?: ReadonlyArray<TimelineTrack>;
  sourceDurations?: ReadonlyMap<string, number>;
}): ClipPlacement[] {
  const placements: ClipPlacement[] = [];

  const push = (
    item: TimelineItem,
    outputStartSec: number,
    outputDurationSec: number,
    track: 'base' | 'overlay',
  ) => {
    if (item.kind === 'image') return;
    const speed = speedFor(item.effects);
    const trimStartSec = item.trimStartSec ?? 0;
    const trimEndSec =
      item.trimEndSec ??
      (outputDurationSec > 0
        ? trimStartSec + outputDurationSec * speed
        : (input.sourceDurations?.get(item.sourceNodeId) ?? 0));
    if (!(trimEndSec > trimStartSec)) return;
    placements.push({
      itemId: item.id,
      assetId: item.sourceNodeId,
      trimStartSec,
      trimEndSec,
      speed,
      outputStartSec,
      track,
    });
  };

  for (const clip of input.layoutClips) {
    push(clip.item, clip.startSec, clip.durationSec, 'base');
  }
  for (const track of input.overlayTracks ?? []) {
    for (const item of track.items) {
      const duration = effectiveItemDuration(item, input.sourceDurations?.get(item.sourceNodeId));
      push(item, item.startSec ?? 0, duration, 'overlay');
    }
  }

  return placements;
}
