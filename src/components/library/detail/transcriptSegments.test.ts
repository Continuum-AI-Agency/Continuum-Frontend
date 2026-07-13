import { describe, expect, it } from 'bun:test';
import type { TranscriptSegment } from '@continuum/contracts';
import { createPlaybackClock } from './playbackClock';
import {
  activeSegmentAt,
  preferredSidebarTab,
  transcriptClipboardText,
  transcriptView,
} from './transcriptSegments';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 1500, text: 'Olive oil, cold pressed.' },
  { startMs: 1500, endMs: 4200, text: 'Three ingredients. Nothing else.' },
  { startMs: 5000, endMs: 7000, text: 'Taste the difference.' },
];

describe('transcriptView', () => {
  it('is untranscribed when the asset was never transcribed', () => {
    expect(transcriptView({ transcript: null, transcriptSegments: null })).toEqual({
      status: 'untranscribed',
    });
    expect(transcriptView({})).toEqual({ status: 'untranscribed' });
  });

  it('distinguishes "analyzed, no speech" (empty string) from "never transcribed" (null)', () => {
    expect(transcriptView({ transcript: '', transcriptSegments: [] })).toEqual({
      status: 'silent',
    });
    expect(transcriptView({ transcript: '', transcriptSegments: null })).toEqual({
      status: 'silent',
    });
    // A present-but-empty segments array is also positive evidence of analysis.
    expect(transcriptView({ transcript: null, transcriptSegments: [] })).toEqual({
      status: 'silent',
    });
    expect(transcriptView({ transcript: null, transcriptSegments: null }).status).toBe(
      'untranscribed',
    );
  });

  it('is ready with timecoded segments', () => {
    const view = transcriptView({ transcript: 'flat text', transcriptSegments: SEGMENTS });
    expect(view.status).toBe('ready');
    if (view.status !== 'ready') throw new Error('expected ready');
    expect(view.segments).toHaveLength(3);
    expect(view.text).toBe(
      'Olive oil, cold pressed.\nThree ingredients. Nothing else.\nTaste the difference.',
    );
  });

  it('is ready (but unseekable) when a transcript exists with no segments', () => {
    const view = transcriptView({ transcript: '  Spoken, untimed.  ', transcriptSegments: null });
    expect(view).toEqual({ status: 'ready', segments: [], text: 'Spoken, untimed.' });
  });

  it('treats a whitespace-only transcript as silent, not as speech', () => {
    expect(transcriptView({ transcript: '   ', transcriptSegments: null }).status).toBe('silent');
  });
});

describe('activeSegmentAt', () => {
  it('finds the segment covering the playhead', () => {
    expect(activeSegmentAt(0, SEGMENTS)).toBe(0);
    expect(activeSegmentAt(1499, SEGMENTS)).toBe(0);
    expect(activeSegmentAt(1500, SEGMENTS)).toBe(1);
    expect(activeSegmentAt(6999, SEGMENTS)).toBe(2);
  });

  it('highlights nothing in a gap, or past the end', () => {
    expect(activeSegmentAt(4500, SEGMENTS)).toBe(-1);
    expect(activeSegmentAt(7000, SEGMENTS)).toBe(-1);
    expect(activeSegmentAt(99_000, SEGMENTS)).toBe(-1);
  });

  it('is safe on empty and non-finite input', () => {
    expect(activeSegmentAt(1000, [])).toBe(-1);
    expect(activeSegmentAt(Number.NaN, SEGMENTS)).toBe(-1);
  });
});

describe('transcriptClipboardText', () => {
  it('copies the spoken words without timecodes', () => {
    const view = transcriptView({ transcript: null, transcriptSegments: SEGMENTS });
    expect(transcriptClipboardText(view)).toBe(
      'Olive oil, cold pressed.\nThree ingredients. Nothing else.\nTaste the difference.',
    );
  });

  it('copies nothing when there is nothing to copy', () => {
    expect(transcriptClipboardText({ status: 'silent' })).toBe('');
    expect(transcriptClipboardText({ status: 'untranscribed' })).toBe('');
  });
});

describe('preferredSidebarTab', () => {
  it('leads with the transcript when there are words and no conversation', () => {
    expect(preferredSidebarTab({ hasTranscript: true, openCommentCount: 0 })).toBe('transcript');
  });

  it('leads with comments when there is a conversation, or nothing to read', () => {
    expect(preferredSidebarTab({ hasTranscript: true, openCommentCount: 2 })).toBe('comments');
    expect(preferredSidebarTab({ hasTranscript: false, openCommentCount: 0 })).toBe('comments');
  });
});

describe('createPlaybackClock', () => {
  it('fans the playhead out to subscribers and remembers the latest value', () => {
    const clock = createPlaybackClock();
    const seen: number[] = [];
    const unsubscribe = clock.subscribe((ms) => seen.push(ms));

    clock.publish(250);
    clock.publish(1500);
    expect(seen).toEqual([250, 1500]);
    expect(clock.get()).toBe(1500);

    unsubscribe();
    clock.publish(3000);
    expect(seen).toEqual([250, 1500]);
    // Still tracked for late subscribers even with nobody listening.
    expect(clock.get()).toBe(3000);
  });
});
