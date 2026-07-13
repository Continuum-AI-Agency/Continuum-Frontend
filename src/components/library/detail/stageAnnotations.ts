// Turns threads into the pins the stage draws. Only OPEN threads written on the
// version currently on screen are ever passed in — resolving a thread retires
// its pin (Figma-style), and a thread from another version has no pin at all
// because its geometry addresses bytes nobody is looking at.
//
// Box pins are numbered in creation order; time pins are labeled with their
// timecode. The same label is handed to the sidebar so a card and its pin read
// identically.

import type { MediaComment } from '@continuum/contracts';
import type { CommentThread } from '@/lib/library/comments';
import { displayNameFromEmail, initialsFor } from '@/lib/library/comments';
import type { OverlayPin } from './AnnotationOverlay';
import { formatTimecodeRange } from './annotationGeometry';
import type { VideoTimeMarker } from './VideoAnnotationPlayer';

export function commentAuthor(comment: MediaComment): string {
  return comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member';
}

export function commentTitle(comment: MediaComment): string {
  const snippet = comment.body.length > 80 ? `${comment.body.slice(0, 77)}...` : comment.body;
  return `${commentAuthor(comment)}: ${snippet}`;
}

export type StageAnnotations = {
  imagePins: OverlayPin[];
  videoMarkers: VideoTimeMarker[];
  pinLabels: Map<string, string>;
};

export function buildStageAnnotations(params: {
  openThreads: CommentThread[];
  selectedCommentId: string | null;
}): StageAnnotations {
  const { openThreads, selectedCommentId } = params;
  const pinLabels = new Map<string, string>();
  const imagePins: OverlayPin[] = [];
  const videoMarkers: VideoTimeMarker[] = [];
  let pinNumber = 0;

  for (const thread of openThreads) {
    const annotation = thread.root.annotation;
    if (!annotation) continue;

    if (annotation.kind === 'box') {
      pinNumber += 1;
      const label = String(pinNumber);
      pinLabels.set(thread.root.id, label);
      imagePins.push({
        id: thread.root.id,
        box: annotation,
        label,
        title: commentTitle(thread.root),
        selected: thread.root.id === selectedCommentId,
      });
      continue;
    }

    const endMs = annotation.endMs ?? null;
    pinLabels.set(thread.root.id, formatTimecodeRange(annotation.timeMs, endMs));
    videoMarkers.push({
      id: thread.root.id,
      timeMs: annotation.timeMs,
      endMs,
      box: annotation.box ?? null,
      initials: initialsFor(commentAuthor(thread.root)),
      title: commentTitle(thread.root),
      selected: thread.root.id === selectedCommentId,
    });
  }

  return { imagePins, videoMarkers, pinLabels };
}
