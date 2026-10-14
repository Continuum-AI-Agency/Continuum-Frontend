// The Fast Cut node's ladder preview: the REAL planner (contracts' `planCuts`) run on a
// synthetic grid, so what the node promises per rung is what the server's planner does with
// the same settings. Only the tempo is assumed — the render measures the bed's own.

import {
  CUT_RUNGS_SEC,
  type CutPlanInput,
  type CutRungSec,
  fastCutNodeDataSchema,
  planCuts,
} from '@continuum/contracts';

export const FAST_CUT_PREVIEW_BPM = 150;
const PREVIEW_BEAT = { periodSec: 0.4, bedAtSec: 0 } as const;
// Two long silent clips: enough footage that no setting runs out of in-points.
const PREVIEW_SOURCES: CutPlanInput['sources'] = [
  { id: 'preview-a', durationSec: 600, still: false, speech: [] },
  { id: 'preview-b', durationSec: 600, still: false, speech: [] },
];

export type FastCutSettings = Pick<CutPlanInput, 'pacing' | 'rung' | 'bars' | 'transients'>;

export type FastCutPreview =
  | {
      ok: true;
      fps: 30 | 60;
      durationSec: number;
      totalCuts: number;
      rungs: Array<{ rung: CutRungSec; cuts: number }>;
    }
  | { ok: false; error: string };

/** A node's settings with the schema's defaults filled in; unreadable data reads as the defaults. */
export function fastCutSettings(data: Record<string, unknown>): FastCutSettings {
  const parsed = fastCutNodeDataSchema.safeParse(data);
  const { pacing, rung, bars, transients } = parsed.success
    ? parsed.data
    : fastCutNodeDataSchema.parse({});
  return { pacing, rung, bars, transients };
}

export function fastCutPreview(settings: FastCutSettings): FastCutPreview {
  try {
    const plan = planCuts({ beat: PREVIEW_BEAT, sources: PREVIEW_SOURCES, ...settings });
    return {
      ok: true,
      fps: plan.fps,
      durationSec: plan.frames / plan.fps,
      totalCuts: plan.cuts.length,
      rungs: CUT_RUNGS_SEC.map((rung) => ({
        rung,
        cuts: plan.cuts.filter((cut) => cut.rung === rung).length,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
