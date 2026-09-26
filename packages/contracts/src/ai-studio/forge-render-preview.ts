import { z } from 'zod';
import {
  type ApiRenderInputValue,
  type ApiRenderVariable,
  apiRenderInputValueSchema,
} from './api-renders';

// The Render tab's live preview: one row, one format, composed on the server. The Backend paints
// the row's changed layers — set by the template parser in the template's own faces — over the
// closest real render, or draws the whole comp from the template when nothing has rendered yet.
// The browser only ever receives the finished picture: brand faces never leave the server, and
// the render bucket sends no CORS headers, so no pixel of it can be read in a browser anyway.

export const API_RENDER_PREVIEW_ROUTE = '/api/ai-studio/renders/preview';

export const forgeRenderPreviewRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    environment: z.string().min(1),
    templateKey: z.string().min(1),
    /** The format, as the tab names it: its ratio and, when the contract measured it, its comp. */
    format: z
      .object({
        id: z.string().min(1),
        ratio: z.string().nullable(),
        comp: z.string().nullable(),
      })
      .strict(),
    values: z.record(z.string(), apiRenderInputValueSchema),
    /** Seconds into the template timeline; null picks the authored settled frame. */
    atSec: z.number().nonnegative().nullable().optional(),
    /** The finished file to paint over, as the tab picked it. Null draws the template whole. */
    backdrop: z
      .object({ jobId: z.string().uuid(), fileName: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();
export type ForgeRenderPreviewRequest = z.infer<typeof forgeRenderPreviewRequestSchema>;

export const forgeRenderPreviewSchema = z
  .object({
    /** The composed frame, `data:image/webp;base64,…`. */
    image: z.string().startsWith('data:image/'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    comp: z.string().min(1),
    /** Seconds into the comp the frame is taken at. */
    at: z.number().nonnegative(),
    /** `render`: a real render with the row's changes painted over it. `template`: drawn whole. */
    source: z.enum(['render', 'template']),
    basedOn: z
      .object({
        jobId: z.string().uuid(),
        label: z.string().nullable(),
        finishedAt: z.string().nullable(),
      })
      .strict()
      .nullable(),
    /** What the picture cannot match, each said once: "Description: resize rig not simulated". */
    notes: z.array(z.string()),
    /** Variables that changed but could not be drawn, by label. */
    notPreviewed: z.array(z.string()),
    /** Text the parser composed past its box, by label. */
    overflows: z.array(z.string()),
  })
  .strict();
export type ForgeRenderPreview = z.infer<typeof forgeRenderPreviewSchema>;

// The animation sketch: the same row and format, drawn from the template at every instant of the
// stretch of the timeline the row is on screen, as a short silent clip. No render and no queue —
// it shows timing and keyframed movement in seconds. Motion an expression drives (an Animation
// Composer preset) is not in it, and the notes name those layers.

export const API_RENDER_PREVIEW_SKETCH_ROUTE = '/api/ai-studio/renders/preview/sketch';

export const forgeRenderSketchRequestSchema = forgeRenderPreviewRequestSchema
  .omit({ atSec: true, backdrop: true })
  .extend({ fps: z.number().positive().max(12).default(8) })
  .strict();
export type ForgeRenderSketchRequest = z.infer<typeof forgeRenderSketchRequestSchema>;

export const forgeRenderSketchSchema = z
  .object({
    /** `data:video/mp4;base64,…`, H.264, silent. */
    video: z.string().startsWith('data:video/mp4;base64,'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    comp: z.string().min(1),
    /** The seconds of the comp the clip covers: where the row's own layers are on screen. */
    window: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
    fps: z.number().positive(),
    frames: z.number().int().positive(),
    notes: z.array(z.string()),
  })
  .strict();
export type ForgeRenderSketch = z.infer<typeof forgeRenderSketchSchema>;

type DiffVariable = Pick<ApiRenderVariable, 'key' | 'kind' | 'reserved'>;

/** One comparable spelling per value: pins by asset, colours without case or `#`, blanks empty. */
function comparable(value: ApiRenderInputValue | undefined, kind: string): string {
  if (value === undefined) return '';
  if (typeof value === 'object') {
    return (Array.isArray(value) ? value : [value]).map((pin) => pin.assetId).join(',');
  }
  const text = String(value).trim();
  return kind === 'color' ? text.replace(/^#/, '').toLowerCase() : text;
}

/**
 * The keys whose value on the row differs from what the render was made with. Reserved variables
 * are Continuum's to fill, so they are never the row's change. A null `renderInput` is a render
 * whose input was not recorded: every key the row has a value for comes back, because none of
 * them can be ruled out.
 */
export function changedKeys(
  variables: readonly DiffVariable[],
  values: Readonly<Record<string, ApiRenderInputValue>>,
  renderInput: Readonly<Record<string, ApiRenderInputValue>> | null,
): string[] {
  return variables
    .filter((variable) => {
      if (variable.reserved) return false;
      const now = comparable(values[variable.key], variable.kind);
      return renderInput === null
        ? now !== ''
        : now !== comparable(renderInput[variable.key], variable.kind);
    })
    .map((variable) => variable.key);
}
