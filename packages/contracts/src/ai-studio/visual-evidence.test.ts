import { describe, expect, it } from 'bun:test';
import {
  canvasVisualEvidenceSchema,
  describeSampling,
  framesForNode,
  MAX_FRAMES_PER_VIDEO,
  planFrameTimestamps,
  resolveFrameIntervalSec,
  VISUAL_EVIDENCE_MAX_BASE64_BYTES,
  VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES,
  VISUAL_EVIDENCE_MAX_FRAMES,
  visualEvidenceFrameSchema,
  type VisualEvidenceFrame,
} from './visual-evidence';

const frame = (over: Partial<VisualEvidenceFrame> = {}): VisualEvidenceFrame => ({
  nodeId: 'clip',
  kind: 'video',
  timestampSec: 1,
  mediaType: 'image/jpeg',
  base64: 'AAAA',
  ...over,
});

describe('resolveFrameIntervalSec', () => {
  // The anchor the ladder was specified from: a quarter of an 8-second clip.
  it('samples an 8s clip every 2s', () => {
    expect(resolveFrameIntervalSec(8)).toBe(2);
  });

  it('climbs the ladder rather than the frame count', () => {
    expect(resolveFrameIntervalSec(16)).toBe(4);
    expect(resolveFrameIntervalSec(32)).toBe(8);
    expect(resolveFrameIntervalSec(64)).toBe(16);
  });

  // The whole reason for a ladder: looking at a minute-long clip must not cost eight
  // times what looking at an eight-second one costs.
  it('keeps the frame count flat as duration grows', () => {
    for (const duration of [8, 16, 32, 64, 128, 300]) {
      expect(planFrameTimestamps(duration).length).toBeLessThanOrEqual(MAX_FRAMES_PER_VIDEO);
    }
  });

  it('never samples faster than the shortest rung', () => {
    expect(resolveFrameIntervalSec(1)).toBe(2);
    expect(resolveFrameIntervalSec(0.4)).toBe(2);
  });

  it('survives a missing or nonsense duration', () => {
    expect(resolveFrameIntervalSec(0)).toBe(2);
    expect(resolveFrameIntervalSec(Number.NaN)).toBe(2);
    expect(planFrameTimestamps(Number.NaN)).toEqual([0]);
  });
});

describe('planFrameTimestamps', () => {
  it('reads an 8s clip in four evenly spaced looks', () => {
    expect(planFrameTimestamps(8)).toEqual([1, 3, 5, 7]);
  });

  // Frame 0 is very often a black lead-in, and a black frame costs a frame's tokens
  // to say nothing. Every sample sits inside its own slice.
  it('never samples the first instant', () => {
    for (const duration of [4, 8, 30, 90]) {
      const stamps = planFrameTimestamps(duration);
      expect(stamps[0]).toBeGreaterThan(0);
      expect(stamps[stamps.length - 1]).toBeLessThan(duration);
    }
  });

  it('gives a very short clip more than one look', () => {
    expect(planFrameTimestamps(3).length).toBeGreaterThanOrEqual(2);
  });
});

describe('canvasVisualEvidenceSchema', () => {
  // Each frame is legal on its own — this has to fail on the TOTAL, or it would be
  // testing the per-frame cap and would still pass if the total budget disappeared.
  it('refuses a payload past the request budget', () => {
    const fat = frame({ base64: 'x'.repeat(VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES) });
    expect(visualEvidenceFrameSchema.safeParse(fat).success).toBe(true);
    const many = Array.from({ length: VISUAL_EVIDENCE_MAX_FRAMES }, () => fat);
    expect(many.reduce((n, f) => n + f.base64.length, 0)).toBeGreaterThan(
      VISUAL_EVIDENCE_MAX_BASE64_BYTES,
    );
    expect(canvasVisualEvidenceSchema.safeParse(many).success).toBe(false);
  });

  // The budgets exist to keep a real sample under the route's body limit. Twelve
  // frames at the measured p90 (50,900 base64 bytes) is what a media-heavy canvas
  // actually sends; if that no longer fits, the composer 413s again (#306).
  it('accepts a full twelve-frame sample at the measured p90 frame size', () => {
    const realistic = Array.from({ length: VISUAL_EVIDENCE_MAX_FRAMES }, (_, index) =>
      frame({ timestampSec: index, base64: 'x'.repeat(50_900) }),
    );
    expect(canvasVisualEvidenceSchema.safeParse(realistic).success).toBe(true);
  });

  it('accepts a normal sampling', () => {
    const parsed = canvasVisualEvidenceSchema.safeParse([
      frame({ timestampSec: 1 }),
      frame({ timestampSec: 3 }),
    ]);
    expect(parsed.success).toBe(true);
  });
});

describe('framesForNode', () => {
  it('returns only that node, in timestamp order', () => {
    const evidence = [
      frame({ nodeId: 'a', timestampSec: 5 }),
      frame({ nodeId: 'b', timestampSec: 1 }),
      frame({ nodeId: 'a', timestampSec: 1 }),
    ];
    expect(framesForNode(evidence, 'a').map((f) => f.timestampSec)).toEqual([1, 5]);
  });
});

describe('describeSampling', () => {
  // An agent shown four frames of a 60s clip will otherwise conclude the clip contains
  // only what those four frames show.
  it('says what was NOT seen', () => {
    const text = describeSampling([
      frame({ timestampSec: 7.5, durationSec: 60 }),
      frame({ timestampSec: 22.5, durationSec: 60 }),
    ]);
    expect(text).toContain('60.0s');
    expect(text).toContain('unseen');
  });

  it('does not talk about intervals for a still', () => {
    expect(describeSampling([frame({ kind: 'image', timestampSec: 0 })])).toBe('1 still.');
  });
});
