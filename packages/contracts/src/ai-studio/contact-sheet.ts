// The contact-sheet workflow, expressed once so both engines derive it identically.
//
// A contact sheet is N clean vertical panels generated in parallel from the SAME
// character + product references, reviewed together by a human, and only then
// animated. Every panel exists before any video is paid for — that ordering is
// what makes the review checkpoint meaningful, and it is why continuity here is
// expressed panel-to-panel rather than by extracting a frame from a rendered clip
// (which would serialise the whole pipeline behind the first paid render).
//
// Consumers:
//   Canvas   — the UGC compiler wires graph edges from `planContactSheetFrames`.
//   Organic  — `resolveContactSheetFrames` downloads panel bytes from the same plan.
// One rule, two engines, one test.

import { z } from 'zod';

/**
 * How a shot leaves its panel.
 *
 * `cut`   — the clip opens on its panel and ends wherever the model takes it.
 *           A visible jump cut, which is native to UGC and the safe default.
 * `match` — the clip is pinned to open on its own panel and close on the NEXT
 *           panel, so it flows seamlessly into the following shot.
 */
export const shotContinuitySchema = z.enum(['cut', 'match']);
export type ShotContinuity = z.infer<typeof shotContinuitySchema>;

export interface ShotFramePlan {
  sceneIndex: number;
  /** Index into the panel array supplying this shot's opening frame. Always present. */
  firstFramePanelIndex: number;
  /** Index supplying the closing frame, or null when the shot ends on a cut. */
  lastFramePanelIndex: number | null;
}

export interface PlanContactSheetFramesInput {
  panelCount: number;
  /**
   * One entry per shot, or a single value applied to every shot. A shot with no
   * successor is always resolved to `cut` — there is no panel to match into.
   */
  continuity?: ShotContinuity | readonly ShotContinuity[];
}

/**
 * Maps panels onto per-shot frame inputs.
 *
 * Shot i opens on panel i. Under `match` it also closes on panel i+1, giving real
 * shot-to-shot continuity while every clip still renders in parallel. The final
 * shot never carries a closing frame regardless of what was requested.
 */
export function planContactSheetFrames(input: PlanContactSheetFramesInput): ShotFramePlan[] {
  const { panelCount, continuity = 'cut' } = input;
  if (!Number.isInteger(panelCount) || panelCount < 1) {
    throw new Error(`A contact sheet needs at least one panel; received ${panelCount}.`);
  }

  const continuityFor = (index: number): ShotContinuity =>
    Array.isArray(continuity) ? (continuity[index] ?? 'cut') : (continuity as ShotContinuity);

  return Array.from({ length: panelCount }, (_unused, sceneIndex) => {
    const hasSuccessor = sceneIndex < panelCount - 1;
    const wantsMatch = continuityFor(sceneIndex) === 'match';
    return {
      sceneIndex,
      firstFramePanelIndex: sceneIndex,
      lastFramePanelIndex: hasSuccessor && wantsMatch ? sceneIndex + 1 : null,
    };
  });
}

export interface VeoFrameModeInput {
  firstFrame?: unknown;
  lastFrame?: unknown;
  referenceImages?: readonly unknown[];
}

/**
 * The two Veo reference-mode invariants, asserted at the call site.
 *
 * Veo takes EITHER `reference_images` OR first/last frames in one request, and a
 * closing frame is meaningless without an opening one. Both rules are enforced by
 * `videoRequestSchema` at the HTTP boundary — but the Organic reel path builds its
 * request with a cast and never parses it, so without this call a malformed
 * request reaches the provider and 400s with a message nobody sees.
 */
export function assertVeoFrameMode(input: VeoFrameModeInput): void {
  const hasFrames = Boolean(input.firstFrame) || Boolean(input.lastFrame);
  const referenceCount = input.referenceImages?.length ?? 0;

  if (hasFrames && referenceCount > 0) {
    throw new Error(
      'Veo accepts EITHER reference_images OR first_frame/last_frame in one request — pick one reference mode. ' +
        'In the contact-sheet path the approved panel IS the identity carrier, so it replaces the reference images for that shot.',
    );
  }
  if (input.lastFrame && !input.firstFrame) {
    throw new Error('first_frame is required when last_frame is provided');
  }
}
