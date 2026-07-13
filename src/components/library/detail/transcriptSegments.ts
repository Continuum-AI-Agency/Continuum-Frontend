// Pure transcript logic for the asset detail view: what state a video's spoken
// track is in, which line is being spoken right now, and what "Copy transcript"
// puts on the clipboard.
//
// The two empty states are NOT the same thing and must never render the same
// sentence: `transcript === ''` means the video WAS analyzed and nobody speaks in
// it; `transcript === null` means it was never transcribed at all (an older
// upload, an image, a failed analysis). One is an answer, the other is an
// absence.

import type { TranscriptSegment } from '@continuum/contracts';

export type TranscriptSource = {
  transcript?: string | null;
  transcriptSegments?: TranscriptSegment[] | null;
};

export type TranscriptView =
  | { status: 'untranscribed' }
  | { status: 'silent' }
  | { status: 'ready'; segments: TranscriptSegment[]; text: string };

export function transcriptView(source: TranscriptSource): TranscriptView {
  const segments = source.transcriptSegments ?? null;
  const transcript = source.transcript ?? null;

  if (segments && segments.length > 0) {
    return { status: 'ready', segments, text: flattenSegments(segments, transcript) };
  }
  if (transcript !== null && transcript.trim() !== '') {
    // Transcribed by a producer that gave us no timecodes: still readable, just
    // not seekable.
    return { status: 'ready', segments: [], text: transcript.trim() };
  }
  // An empty string, or an empty (but present) segments array, is positive
  // evidence that the analyzer ran and heard nothing.
  if (transcript !== null || Array.isArray(segments)) {
    return { status: 'silent' };
  }
  return { status: 'untranscribed' };
}

function flattenSegments(segments: TranscriptSegment[], transcript: string | null): string {
  const flat = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
  return flat || (transcript ?? '').trim();
}

// Index of the segment being spoken at `timeMs`, or -1 when the playhead sits in
// a gap (silence between lines), before the first line, or past the last.
// Containment is [startMs, endMs) so two adjacent lines never both light up.
export function activeSegmentAt(timeMs: number, segments: readonly TranscriptSegment[]): number {
  if (!Number.isFinite(timeMs)) return -1;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    if (timeMs >= segment.startMs && timeMs < segment.endMs) return index;
  }
  return -1;
}

// What the "Copy transcript" affordance writes: the spoken words, without
// timecodes — the form a person actually pastes into a brief or a caption.
export function transcriptClipboardText(view: TranscriptView): string {
  return view.status === 'ready' ? view.text : '';
}

export type SidebarTab = 'comments' | 'transcript';

// Which sidebar tab the detail modal opens on. A video that has words and no
// open comments is almost always being opened to read those words (a search for
// a spoken phrase lands exactly here), so the transcript leads. The moment there
// is a conversation to answer, comments lead again.
export function preferredSidebarTab(input: {
  hasTranscript: boolean;
  openCommentCount: number;
}): SidebarTab {
  return input.hasTranscript && input.openCommentCount === 0 ? 'transcript' : 'comments';
}
