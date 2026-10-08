// A Library transcript as the three files an editor actually hands on: SRT for
// NLEs and social uploaders, WebVTT for the web player, TXT for a brief. Pure
// strings — the panel owns the Blob and the download.

import type { TranscriptSegment } from '@continuum/contracts';

export type TranscriptExportFormat = 'srt' | 'vtt' | 'txt';

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function timestamp(ms: number, fractionSeparator: ',' | '.'): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${fractionSeparator}${pad(total % 1000, 3)}`;
}

// A blank line ends a cue in both SRT and VTT, so one inside a line's text would
// split it into a malformed second cue.
function cueText(text: string): string {
  return text.trim().replace(/\n\s*\n/g, '\n');
}

function orderedCues(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  return segments.filter((segment) => segment.text.trim()).sort((a, b) => a.startMs - b.startMs);
}

export function toSrt(segments: readonly TranscriptSegment[]): string {
  return orderedCues(segments)
    .map(
      (segment, index) =>
        `${index + 1}\n${timestamp(segment.startMs, ',')} --> ${timestamp(segment.endMs, ',')}\n${cueText(segment.text)}\n`,
    )
    .join('\n');
}

export function toVtt(segments: readonly TranscriptSegment[], language?: string | null): string {
  const header = language ? `WEBVTT\nLanguage: ${language}\n` : 'WEBVTT\n';
  const cues = orderedCues(segments).map(
    (segment) =>
      `${timestamp(segment.startMs, '.')} --> ${timestamp(segment.endMs, '.')}\n${cueText(segment.text)}\n`,
  );
  return [header, ...cues].join('\n');
}

// Timecoded lines read in spoken order; a producer that gave no timecodes still
// leaves the flat transcript.
export function toTxt(transcript: string | null, segments: readonly TranscriptSegment[]): string {
  const cues = orderedCues(segments);
  const body = cues.length
    ? cues.map((segment) => segment.text.trim()).join('\n')
    : (transcript ?? '').trim();
  return body ? `${body}\n` : '';
}
