// Pure math behind the compare dialog: the follower's drift controller, the
// source frame rate, and the thresholded pixel diff. Kept free of the DOM so the
// numbers the bench grades are pinned by unit tests.

export const DEFAULT_FPS = 30;

// Past this the follower is simply somewhere else (a missed seek, a stall), and
// a rate nudge would take seconds to close the gap.
const HARD_SEEK_DRIFT_SEC = 0.25;
const RATE_GAIN = 4;
const MIN_RATE = 0.9;
const MAX_RATE = 1.1;

export type FollowerCorrection = { seek: true } | { playbackRate: number };

// `drift` = follower.currentTime − master.currentTime. Seeking on every small
// drift is what held the old dialog at ~50 ms: each seek stalls the decoder for
// longer than the drift it fixed. Proportional rate control closes small gaps
// without a stall, and the dead band (a quarter frame) stops it hunting.
export function followerCorrection({
  drift,
  frameSec,
}: {
  drift: number;
  frameSec: number;
}): FollowerCorrection {
  const magnitude = Math.abs(drift);
  if (magnitude > HARD_SEEK_DRIFT_SEC) return { seek: true };
  if (magnitude < frameSec / 4) return { playbackRate: 1 };
  return { playbackRate: Math.min(MAX_RATE, Math.max(MIN_RATE, 1 - drift * RATE_GAIN)) };
}

// requestVideoFrameCallback mediaTimes of consecutive presented frames. The
// smallest positive step is one source frame; larger steps are dropped frames.
export function estimateFps(mediaTimes: readonly number[]): number {
  let step = Number.POSITIVE_INFINITY;
  for (let index = 1; index < mediaTimes.length; index += 1) {
    const delta = mediaTimes[index] - mediaTimes[index - 1];
    if (delta > 0 && delta < step) step = delta;
  }
  const fps = 1 / step;
  return fps >= 1 && fps <= 240 ? Math.round(fps * 100) / 100 : DEFAULT_FPS;
}

// Translucent highlight painted where a pixel changed.
const HIGHLIGHT_RGBA = [255, 40, 120, 170] as const;

// `a` and `b` are same-sized RGBA buffers (getImageData). A pixel counts as
// changed when any channel moved by more than `threshold` (0–255). `mask` is an
// RGBA buffer ready for putImageData: highlight where changed, clear elsewhere.
export function diffMask(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  threshold: number,
): { mask: Uint8ClampedArray<ArrayBuffer>; changedRatio: number } {
  const mask = new Uint8ClampedArray(a.length);
  const pixels = a.length / 4;
  let changed = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    const delta = Math.max(
      Math.abs(a[offset] - b[offset]),
      Math.abs(a[offset + 1] - b[offset + 1]),
      Math.abs(a[offset + 2] - b[offset + 2]),
    );
    if (delta > threshold) {
      mask.set(HIGHLIGHT_RGBA, offset);
      changed += 1;
    }
  }
  return { mask, changedRatio: pixels > 0 ? changed / pixels : 0 };
}
