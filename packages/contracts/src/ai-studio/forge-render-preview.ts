import { z } from 'zod';
import {
  type ApiRenderInputValue,
  type ApiRenderVariable,
  apiRenderInputValueSchema,
  apiRenderVariableKindSchema,
  pinnedRenderAssetSchema,
} from './api-renders';
import { forgeSceneSchema } from './forge-scene';

// The Render tab's EXACT preview: one row, one format, composed on the server. The Backend paints
// the row's changed layers — set by the template parser in the template's own faces — over the
// closest real render, or draws the whole comp from the template when nothing has rendered yet.
// The browser receives the finished picture: the render bucket sends no CORS headers, so no pixel
// of it can be read in a browser anyway. The LIVE preview (below) is drawn in the browser instead.

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

// The LIVE preview: the template's scene for one format, fetched once and repainted in the browser
// on every keystroke, colour drag and picture swap — for every row, from the same kit. Each text
// layer a variable writes carries a layout kit and the scene carries the glyph outlines of the
// faces they set in (never a face file), so a row's text is laid out in the browser exactly as
// the parser lays it out. Footage arrives embedded with its natural size.

export const API_RENDER_PREVIEW_LIVE_ROUTE = '/api/ai-studio/renders/preview/live';

export const forgeRenderLiveRequestSchema = forgeRenderPreviewRequestSchema
  .pick({ brandId: true, environment: true, templateKey: true, format: true, atSec: true })
  .strict();
export type ForgeRenderLiveRequest = z.infer<typeof forgeRenderLiveRequestSchema>;

/** A picture ready to draw: a data URI and its natural size, which a fit rig's clamp reads. */
export const forgeScenePictureSchema = z
  .object({
    uri: z.string().startsWith('data:image/'),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

export const forgeRenderLiveSchema = z
  .object({
    scene: forgeSceneSchema,
    /** The template's variables and the layers each writes, as the Exact preview joins them. */
    variables: z.array(
      z
        .object({
          key: z.string(),
          label: z.string(),
          kind: apiRenderVariableKindSchema,
          reserved: z.boolean(),
          layerIds: z.array(z.number()),
        })
        .strict(),
    ),
    /** What Continuum's own slot shows — the brand's mark — when the template has one. */
    brandMark: forgeScenePictureSchema.nullable(),
    comp: z.string().min(1),
    at: z.number().nonnegative(),
    notes: z.array(z.string()),
  })
  .strict();
export type ForgeRenderLive = z.infer<typeof forgeRenderLiveSchema>;

export const API_RENDER_PREVIEW_PICTURES_ROUTE = '/api/ai-studio/renders/preview/pictures';

/** Library pictures for the Live preview's slots; a video slot is shown as its frame at `at`. */
export const forgeRenderPicturesRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    at: z.number().nonnegative(),
    pins: z
      .array(pinnedRenderAssetSchema.extend({ kind: z.enum(['image', 'video']) }).strict())
      .min(1)
      .max(24),
  })
  .strict();
export type ForgeRenderPicturesRequest = z.infer<typeof forgeRenderPicturesRequestSchema>;

export const forgeRenderPicturesSchema = z
  .object({ pictures: z.array(forgeScenePictureSchema.nullable()) })
  .strict();
export type ForgeRenderPictures = z.infer<typeof forgeRenderPicturesSchema>;

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
