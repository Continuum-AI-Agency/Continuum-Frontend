export type FrameCompositionDraw = () => void | Promise<void>;

export interface FrameCompositionPlan {
  /** Base video/still layers and their clip-owned text/effects. */
  drawBase: FrameCompositionDraw;
  /** Timeline overlay tracks, already ordered bottom-to-top. */
  drawOverlays?: FrameCompositionDraw;
  /** Full-frame transition wash or other post-layer color treatment. */
  drawColorTransition?: FrameCompositionDraw;
  /** Captions are always the final, most legible layer. */
  drawCaption?: FrameCompositionDraw;
}

/**
 * Canonical frame layer order shared by video ranges, stills and overlap
 * transitions. Awaiting each boundary prevents an async overlay decode from
 * racing a later caption draw.
 */
export async function drawFrameComposition(plan: FrameCompositionPlan): Promise<void> {
  await plan.drawBase();
  await plan.drawOverlays?.();
  await plan.drawColorTransition?.();
  await plan.drawCaption?.();
}
