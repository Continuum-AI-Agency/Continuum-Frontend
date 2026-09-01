// How the Canvas agent LOOKS at media, expressed once so the browser that samples
// the frames and the backend that reads them agree on what a frame means.
//
// The problem this solves: the composer can wire an image into a generator but has
// never been able to SEE it. `search_media` hands it a filename and, for ~95% of the
// library, a null description — so "use the hero shot" is resolved by name, and
// "make the second one warmer" resolves against nothing at all.
//
// Sampling lives in the BROWSER on purpose. Bun has no WebCodecs (`VideoDecoder` is
// undefined) and backend mediabunny reads containers only, so server-side decoding
// would need a codec package this repo has deliberately not adopted — see the note in
// `App/organic/creative/visionGate.ts`. The canvas already decodes video with
// mediabunny for filmstrip thumbnails, so the frames are cheap exactly where the user
// already is.

import { z } from 'zod';

// The intervals a sample may land on. Doubling, so the frame COUNT stays flat as a
// video gets longer and the token cost of looking is O(1) in duration rather than
// O(duration) — which is the whole point of sampling instead of handing over the file.
export const FRAME_INTERVAL_LADDER_SEC = [2, 4, 8, 16, 32, 64, 128] as const;

/** What a sample aims for: roughly a quarter of the clip per step. */
export const TARGET_FRAMES_PER_VIDEO = 4;

/** Ceiling per video, so one long clip cannot eat a whole turn's budget. */
export const MAX_FRAMES_PER_VIDEO = 6;

/** Floor, so a two-second sting still yields more than a single still. */
export const MIN_FRAMES_PER_VIDEO = 2;

/**
 * The sampling interval for a clip of this length.
 *
 * An 8s clip samples every 2s — a quarter of it per step. Past that the interval
 * climbs the ladder rather than the frame count climbing, so a 64s clip is still read
 * in four looks. Snapped UP: overshooting the interval costs a frame, undershooting
 * costs tokens on every frame after the fourth.
 */
export function resolveFrameIntervalSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return FRAME_INTERVAL_LADDER_SEC[0];
  }
  const ideal = durationSec / TARGET_FRAMES_PER_VIDEO;
  const rung = FRAME_INTERVAL_LADDER_SEC.find((step) => step >= ideal);
  return rung ?? FRAME_INTERVAL_LADDER_SEC[FRAME_INTERVAL_LADDER_SEC.length - 1];
}

/**
 * The timestamps to sample, centred in their own slice.
 *
 * Centred rather than starting at zero: frame 0 of a clip is very often a black or
 * near-black lead-in, and a black frame spends a frame's worth of tokens saying
 * nothing. Sampling the middle of each slice reads what the slice actually contains.
 */
export function planFrameTimestamps(durationSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const interval = resolveFrameIntervalSec(durationSec);
  const count = Math.min(
    MAX_FRAMES_PER_VIDEO,
    Math.max(MIN_FRAMES_PER_VIDEO, Math.round(durationSec / interval)),
  );
  const slice = durationSec / count;
  return Array.from({ length: count }, (_, index) => Number((slice * (index + 0.5)).toFixed(3)));
}

// ---------------------------------------------------------------------------
// The wire shape
// ---------------------------------------------------------------------------

// Deliberately the same per-frame shape as `canvasEditorEvidenceFrameSchema`: that
// path is already proven through the Video Editor, and a second, subtly different
// frame envelope is how the two drift. The BUDGETS differ because the two samplers
// do — this one encodes at 512px, the editor's at 320px — and each is sized from
// what its own encoder actually emits.
//
// Measured 2026-09-01 over 30 real production canvas images, re-encoded exactly as
// `collectVisualEvidence` does (longest edge <= 512px, JPEG quality 0.7). Base64
// bytes per frame: min 11,280, p50 28,892, p90 50,900, max 54,428. Twelve frames
// therefore cost ~339 KB at the median and ~638 KB at the observed worst case.
//
// The previous pair — 160,000 per frame, 1,200,000 in total — was written from a
// guess, not a measurement: three times what the encoder can emit per frame, and
// roughly twice what a full sample weighs. It also disagreed with the route that
// guards it by a factor of twenty, so every turn that sampled even two frames was
// rejected with a 413 before Zod ever ran (Airtable #306). The route now derives its
// bodyLimit from these constants — see CANVAS_COMPOSE_MAX_BODY_BYTES — so the two
// numbers cannot drift apart again.
export const VISUAL_EVIDENCE_MAX_FRAMES = 12;

/** One frame. ~1.5x the measured worst case, so a denser frame than any observed still fits. */
export const VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES = 80_000;

/** Every frame in one turn. Above 12x the measured p90, and above the measured 12-frame worst case. */
export const VISUAL_EVIDENCE_MAX_BASE64_BYTES = 720_000;

export const visualEvidenceFrameSchema = z
  .object({
    /** The canvas node this frame was sampled from — how look_at addresses it. */
    nodeId: z.string().min(1),
    kind: z.enum(['image', 'video']),
    /** Seconds into the clip. Always 0 for a still. */
    timestampSec: z.number().nonnegative(),
    /** Whole-clip duration, so the agent can reason about what it did NOT see. */
    durationSec: z.number().nonnegative().optional(),
    label: z.string().min(1).max(160).optional(),
    mediaType: z.enum(['image/webp', 'image/jpeg']),
    base64: z.string().min(1).max(VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES),
  })
  .strict();
export type VisualEvidenceFrame = z.infer<typeof visualEvidenceFrameSchema>;

/**
 * Frames the browser sampled BEFORE the turn started, riding up with the request.
 *
 * They are carried outside the model's context and cost nothing until `look_at` pulls
 * one in — a run that never asks to look never pays for looking. Pre-supplied rather
 * than fetched mid-turn because a composer run is durable and detachable: the client
 * may be gone by the time the agent decides to look, so a mid-turn round trip to the
 * browser would make the agent's reach depend on whether a tab stayed open.
 */
export const canvasVisualEvidenceSchema = z
  .array(visualEvidenceFrameSchema)
  .max(VISUAL_EVIDENCE_MAX_FRAMES)
  .superRefine((frames, ctx) => {
    const total = frames.reduce((sum, frame) => sum + frame.base64.length, 0);
    if (total > VISUAL_EVIDENCE_MAX_BASE64_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `Visual evidence exceeds the ${Math.round(VISUAL_EVIDENCE_MAX_BASE64_BYTES / 1000)} KB request budget.`,
      });
    }
  });
export type CanvasVisualEvidence = z.infer<typeof canvasVisualEvidenceSchema>;

/** Frames for one node, newest sampling wins, in timestamp order. */
export function framesForNode(
  evidence: readonly VisualEvidenceFrame[],
  nodeId: string,
): VisualEvidenceFrame[] {
  return evidence
    .filter((frame) => frame.nodeId === nodeId)
    .sort((a, b) => a.timestampSec - b.timestampSec);
}

/**
 * A one-line description of what was sampled, for the text half of a look.
 *
 * The coverage sentence is load-bearing: an agent told only "here are 4 frames" will
 * happily conclude a 60s clip contains nothing but what those 4 frames show. Saying
 * the interval and the duration makes the gap between them visible.
 */
export function describeSampling(frames: readonly VisualEvidenceFrame[]): string {
  if (frames.length === 0) return 'No frames were sampled.';
  const first = frames[0] as VisualEvidenceFrame;
  if (first.kind === 'image') {
    return `${frames.length} still${frames.length === 1 ? '' : 's'}.`;
  }
  const duration = first.durationSec;
  const stamps = frames.map((frame) => `${frame.timestampSec.toFixed(1)}s`).join(', ');
  return duration
    ? `${frames.length} frame(s) at ${stamps} from a ${duration.toFixed(1)}s clip — everything between them is unseen.`
    : `${frames.length} frame(s) at ${stamps}.`;
}
