import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import type { TimelineItem } from '../../types';
import {
  advancePlayhead,
  type ClipMedia,
  type PlaybackVideoElement,
  syncVideoToTimelineTime,
  usePlayheadPlayback,
} from './usePlayheadPlayback';
import type { ClipLayout, TimelineLayout } from './useTimelineEditorModel';

// A <video> stand-in that models the HTMLMediaElement behaviours the playhead
// driver depends on and that the bug report exercises: a src swap drops the
// element back to HAVE_NOTHING at currentTime 0, and play() on an element whose
// playback has ended seeks it back to the head (HTML spec, "media element load
// algorithm" / play() step 4).
class FakeVideoElement implements PlaybackVideoElement {
  playbackRate = 1;
  paused = true;
  seeking = false;
  ended = false;
  readyState = 4;
  playCalls = 0;
  private source = '';
  private position = 0;
  private readonly attributes = new Map<string, string>();

  get src(): string {
    return this.source;
  }

  set src(url: string) {
    this.source = url;
    this.position = 0;
    this.readyState = 0;
    this.seeking = false;
    this.ended = false;
    this.paused = true;
  }

  get currentTime(): number {
    return this.position;
  }

  set currentTime(sec: number) {
    this.position = sec;
    this.ended = false;
    // With metadata the element starts a real seek and only settles on `seeked`;
    // before it, the value is just a default start position.
    if (this.readyState >= 1) this.seeking = true;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.ended) {
      this.position = 0;
      this.ended = false;
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  /** Loading/seeking settled: the element can now report a trustworthy clock. */
  finishLoad(atSec: number): void {
    this.readyState = 4;
    this.position = atSec;
    this.seeking = false;
  }
}

const clipOf = (params: {
  id: string;
  startSec: number;
  durationSec: number;
  kind?: 'video' | 'image';
}): ClipLayout => {
  const item: TimelineItem = {
    id: params.id,
    order: 0,
    sourceNodeId: `node-${params.id}`,
    kind: params.kind ?? 'video',
  };
  return {
    item,
    startSec: params.startSec,
    durationSec: params.durationSec,
    leftPx: 0,
    widthPx: 0,
  };
};

const layoutOf = (clips: ClipLayout[]): TimelineLayout => ({
  clips,
  totalSec: clips.reduce((end, clip) => Math.max(end, clip.startSec + clip.durationSec), 0),
});

const mediaLookup =
  (media: Record<string, ClipMedia>) =>
  (itemId: string): ClipMedia | undefined =>
    media[itemId];

const FRAME_SEC = 1 / 60;

describe('advancePlayhead — end of a clip whose trim-out is the source end (bug #188 loop)', () => {
  // The reporter's clip: an 8s source trimmed 0.00 → 8.00, so the element reaches
  // its natural end and pauses itself. Calling play() on it would seek back to 0
  // and replay the clip forever.
  const layout = layoutOf([clipOf({ id: 'a', startSec: 0, durationSec: 8 })]);
  const mediaFor = mediaLookup({
    a: { kind: 'video', url: 'blob:a', trimStartSec: 0, speed: 1 },
  });

  it('hands off at the clip end instead of restarting an ended element', () => {
    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(8);
    video.ended = true;
    video.paused = true;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 7.98,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });

    expect(frame.playheadSec).toBe(8);
    expect(video.playCalls).toBe(0);
    expect(video.currentTime).toBe(8);
  });

  it('does not rewind the playhead to the clip start when the source has ended short of its metadata duration', () => {
    // Routine for MP4/WebM: the last frame's PTS falls short of the container's
    // declared duration, so currentTime never reaches clipEnd — only `ended` does.
    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(7.94);
    video.ended = true;
    video.paused = true;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 7.94,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });

    expect(frame.playheadSec).toBe(8);
    expect(video.playCalls).toBe(0);
  });
});

describe('advancePlayhead — end-of-clip detection scales with speed', () => {
  // 8s source at 3.50x → 2.29s of output. One RAF step consumes 3.5 × 16ms ≈ 58ms
  // of source, so a 20ms detection window in source time is narrower than a
  // single sample and the end can be stepped straight over.
  const speed = 3.5;
  const durationSec = 8 / speed;
  const layout = layoutOf([clipOf({ id: 'a', startSec: 0, durationSec })]);
  const mediaFor = mediaLookup({
    a: { kind: 'video', url: 'blob:a', trimStartSec: 0, speed },
  });

  it('treats a sample within one frame-step of the clip end as the end', () => {
    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(7.95);
    video.paused = false;
    video.playbackRate = speed;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 2.27,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });

    expect(frame.playheadSec).toBeCloseTo(durationSec, 5);
  });
});

describe('advancePlayhead — crossing into a trimmed, sped-up clip (bug #188 stall)', () => {
  // Clip 1: 2s of source A at 1x. Clip 2: source B trimmed 4.0 → 8.0 at 2x, so it
  // occupies 2s of output. Swapping src resets the element to 0; without a seek to
  // trimStartSec the playhead pins to the clip start every frame while B plays its
  // untrimmed head.
  const layout = layoutOf([
    clipOf({ id: 'a', startSec: 0, durationSec: 2 }),
    clipOf({ id: 'b', startSec: 2, durationSec: 2 }),
  ]);
  const mediaFor = mediaLookup({
    a: { kind: 'video', url: 'blob:a', trimStartSec: 0, speed: 1 },
    b: { kind: 'video', url: 'blob:b', trimStartSec: 4, speed: 2 },
  });

  const enterClipB = (): { video: FakeVideoElement; frame: ReturnType<typeof advancePlayhead> } => {
    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(2);
    video.paused = false;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 2,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });
    return { video, frame };
  };

  it('points the element at the new source, seeks it to the trim-in, and applies the speed', () => {
    const { video } = enterClipB();

    expect(video.src).toBe('blob:b');
    expect(video.currentTime).toBe(4);
    expect(video.playbackRate).toBe(2);
  });

  it('advances the playhead on wall-clock while the seek is pending instead of pinning it to the clip start', () => {
    const { frame } = enterClipB();

    expect(frame.cue).toMatchObject({ clipId: 'b', sourceSec: 4, pending: true });
    expect(frame.playheadSec).toBeGreaterThan(2);
    expect(frame.playheadSec).toBeCloseTo(2 + FRAME_SEC, 5);
  });

  it('takes the element clock back over once the seek lands', () => {
    const { video, frame } = enterClipB();
    video.finishLoad(4.5);

    const next = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: frame.playheadSec,
      dtSec: FRAME_SEC,
      cue: frame.cue,
    });

    expect(next.cue).toMatchObject({ clipId: 'b', pending: false });
    // 0.5s of source at 2x = 0.25s of output past clip B's start.
    expect(next.playheadSec).toBeCloseTo(2.25, 5);
  });
});

describe('advancePlayhead — adjacent clips sharing one source', () => {
  it('re-seeks a duplicated clip whose source is already past its trim-out', () => {
    // A duplicate: both clips are source A trimmed 0 → 2. The src does not change, so
    // an src-keyed guard never re-seeks — the element sits at 2.0, which is already
    // clip 2's end, and the clip is blown through in a single frame.
    const layout = layoutOf([
      clipOf({ id: 'a', startSec: 0, durationSec: 2 }),
      clipOf({ id: 'a-copy', startSec: 2, durationSec: 2 }),
    ]);
    const mediaFor = mediaLookup({
      a: { kind: 'video', url: 'blob:a', trimStartSec: 0, speed: 1 },
      'a-copy': { kind: 'video', url: 'blob:a', trimStartSec: 0, speed: 1 },
    });

    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(2);
    video.paused = false;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 2,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });

    expect(video.currentTime).toBe(0);
    expect(frame.playheadSec).toBeLessThan(4);
    expect(frame.playheadSec).toBeCloseTo(2 + FRAME_SEC, 5);
  });

  it('plays a split boundary through without a needless re-seek', () => {
    // A split: clip 2 starts exactly where clip 1's trim-out left the element, so the
    // element's clock is already correct and must simply keep rolling.
    const layout = layoutOf([
      clipOf({ id: 'a', startSec: 0, durationSec: 2 }),
      clipOf({ id: 'a-tail', startSec: 2, durationSec: 2 }),
    ]);
    const mediaFor = mediaLookup({
      a: { kind: 'video', url: 'blob:a', trimStartSec: 0, speed: 1 },
      'a-tail': { kind: 'video', url: 'blob:a', trimStartSec: 2, speed: 1 },
    });

    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(2.01);
    video.paused = false;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 2,
      dtSec: FRAME_SEC,
      cue: { clipId: 'a', sourceSec: 0, pending: false },
    });

    expect(frame.cue).toMatchObject({ clipId: 'a-tail', pending: false });
    expect(video.currentTime).toBe(2.01);
    expect(frame.playheadSec).toBeCloseTo(2.01, 5);
  });
});

describe('advancePlayhead — image stills', () => {
  it('holds the element paused and advances the playhead on wall-clock', () => {
    const layout = layoutOf([clipOf({ id: 'still', startSec: 0, durationSec: 3, kind: 'image' })]);
    const mediaFor = mediaLookup({
      still: { kind: 'image', url: 'blob:still', trimStartSec: 0 },
    });

    const video = new FakeVideoElement();
    video.paused = false;

    const frame = advancePlayhead({
      layout,
      mediaFor,
      video,
      playheadSec: 1,
      dtSec: FRAME_SEC,
      cue: null,
    });

    expect(video.paused).toBe(true);
    expect(frame.playheadSec).toBeCloseTo(1 + FRAME_SEC, 5);
  });
});

describe('syncVideoToTimelineTime — Web Audio owns the clock', () => {
  it('seeks visual media to the source time derived from the audio timeline', () => {
    const layout = layoutOf([clipOf({ id: 'a', startSec: 0, durationSec: 4 })]);
    const mediaFor = mediaLookup({
      a: { kind: 'video', url: 'blob:a', trimStartSec: 2, speed: 1.5 },
    });
    const video = new FakeVideoElement();
    video.src = 'blob:a';
    video.setAttribute('data-clip-src', 'blob:a');
    video.finishLoad(2);

    const cue = syncVideoToTimelineTime({
      layout,
      mediaFor,
      video,
      timelineSec: 1,
      cue: { clipId: 'a', sourceSec: 2, pending: false },
    });

    expect(video.currentTime).toBe(3.5);
    expect(video.playbackRate).toBe(1.5);
    expect(cue).toEqual({ clipId: 'a', sourceSec: 3.5, pending: true });
  });
});

describe('usePlayheadPlayback — the running loop follows edits made mid-playback', () => {
  const originalRequestFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  let pendingFrames: FrameRequestCallback[] = [];

  const stepFrame = (timestampMs: number): void => {
    const due = pendingFrames;
    pendingFrames = [];
    act(() => {
      for (const frame of due) frame(timestampMs);
    });
  };

  beforeEach(() => {
    pendingFrames = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      pendingFrames.push(callback);
      return pendingFrames.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((): void => {
      pendingFrames = [];
    }) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestFrame;
    globalThis.cancelAnimationFrame = originalCancelFrame;
  });

  it('stops at the new total when a clip is trimmed while the preview is playing', () => {
    const mediaFor = mediaLookup({
      still: { kind: 'image', url: 'blob:still', trimStartSec: 0 },
    });
    const longLayout = layoutOf([
      clipOf({ id: 'still', startSec: 0, durationSec: 10, kind: 'image' }),
    ]);
    const trimmedLayout = layoutOf([
      clipOf({ id: 'still', startSec: 0, durationSec: 1, kind: 'image' }),
    ]);

    const { result, rerender } = renderHook(
      ({ layout }: { layout: TimelineLayout }) => usePlayheadPlayback({ layout, mediaFor }),
      { initialProps: { layout: longLayout } },
    );

    act(() => result.current.play());
    stepFrame(0);
    stepFrame(1000);
    expect(result.current.playheadSec).toBeCloseTo(1, 5);

    rerender({ layout: trimmedLayout });
    stepFrame(3000);

    expect(result.current.playheadSec).toBe(1);
    expect(result.current.isPlaying).toBe(false);
  });
});
