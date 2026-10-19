import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(200);
export const hyperframesClockSchema = z
  .object({
    numerator: z.number().int().positive().max(120_000),
    denominator: z.number().int().positive().max(10_000),
    frameCount: z.number().int().positive().max(18_000),
  })
  .strict();

/** W3C SVG paint vocabulary. No HTML/foreignObject, scripts, CSS or baked browser pixels. */
export const hyperframesPrimitiveTagSchema = z.enum([
  'g',
  'rect',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feFlood',
  'feComposite',
  'feMerge',
  'feMergeNode',
]);
export type HyperframesPrimitive = {
  id: string;
  tag: z.infer<typeof hyperframesPrimitiveTagSchema>;
  attributes: Record<string, string>;
  text?: string;
  children: HyperframesPrimitive[];
};
export const hyperframesPrimitiveSchema: z.ZodType<HyperframesPrimitive> = z
  .object({
    id,
    tag: hyperframesPrimitiveTagSchema,
    attributes: z.record(z.string(), z.string().max(1 << 20)),
    text: z
      .string()
      .max(1 << 20)
      .optional(),
    children: z.array(z.lazy(() => hyperframesPrimitiveSchema)).max(20_000),
  })
  .strict();

export const hyperframesDependencySchema = z
  .object({
    sha256: hash,
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(512 << 20),
    kind: z.enum(['script', 'stylesheet', 'font', 'image', 'video', 'audio']),
    mediaType: z.string().min(1).max(100),
    /** Original request path/URL, for diagnostics. Never fetched by the painter. */
    source: z.string().min(1).max(4096),
  })
  .strict();

export const hyperframesNativeEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('text'), fieldId: id, value: z.string().max(1 << 20) }).strict(),
  z
    .object({
      op: z.literal('style'),
      nodeId: id,
      properties: z.record(z.string(), z.string().max(4096)),
    })
    .strict(),
  z
    .object({
      op: z.literal('viewport'),
      width: z.number().int().positive().max(8192),
      height: z.number().int().positive().max(8192),
    })
    .strict(),
  z
    .object({ op: z.literal('order'), parentId: id, nodeIds: z.array(id).min(1).max(20_000) })
    .strict(),
  z.object({ op: z.literal('media'), fieldId: id, dependencySha256: hash }).strict(),
  z
    .object({
      op: z.literal('motion'),
      nodeId: id,
      property: z.enum(['translateX', 'translateY', 'scaleX', 'scaleY', 'rotate', 'opacity']),
      keys: z
        .array(
          z.object({ frame: z.number().int().nonnegative(), value: z.number().finite() }).strict(),
        )
        .min(1)
        .max(18_000),
    })
    .strict(),
]);
export const hyperframesNativeEditsSchema = z
  .object({
    schema: z.literal('hyperframes.edits/1'),
    sourceSha256: hash,
    operations: z.array(hyperframesNativeEditSchema).max(1000),
  })
  .strict();
export type HyperframesNativeEdits = z.infer<typeof hyperframesNativeEditsSchema>;

export const hyperframesCapabilitySchema = z
  .object({
    nodeId: id,
    fieldId: id.optional(),
    operation: z.enum([
      'text',
      'typography',
      'palette',
      'media',
      'layout',
      'viewport',
      'order',
      'motion',
    ]),
    state: z.enum(['editable', 'runtime-controlled', 'unsupported']),
    reason: z.string().max(4096).optional(),
  })
  .strict();
export const hyperframesSceneSchema = z
  .object({
    schema: z.literal('hyperframes.scene/1'),
    source: z
      .object({
        sha256: hash,
        documentSha256: hash,
        entrypoint: z.string().min(1),
        parser: z.string().min(1),
      })
      .strict(),
    identity: z
      .object({
        editsSha256: hash,
        compiler: z.string().min(1),
        browser: z.string().min(1),
        runtimeSha256: hash,
      })
      .strict(),
    viewport: z
      .object({
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192),
      })
      .strict(),
    clock: hyperframesClockSchema,
    dependencies: z.array(hyperframesDependencySchema).max(10_000),
    fonts: z.array(z.object({ family: z.string().min(1), sha256: hash }).strict()).max(256),
    /** Deduplicated complete paint states; tracks index them at exact delivery frame times. */
    states: z
      .array(z.object({ sha256: hash, root: hyperframesPrimitiveSchema }).strict())
      .min(1)
      .max(18_000),
    frames: z.array(z.number().int().nonnegative()).min(1).max(18_000),
    capabilities: z.array(hyperframesCapabilitySchema).max(160_000),
    diagnostics: z
      .array(z.object({ code: id, nodeId: id.optional(), detail: z.string().max(4096) }).strict())
      .max(10_000),
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.frames.length !== scene.clock.frameCount)
      context.addIssue({ code: 'custom', message: 'Frame count differs from delivery clock' });
    if (scene.frames.some((state) => state >= scene.states.length))
      context.addIssue({ code: 'custom', message: 'Frame references a missing paint state' });
    const dependencies = new Map(scene.dependencies.map((dep) => [dep.sha256, dep]));
    if (scene.fonts.some((font) => dependencies.get(font.sha256)?.kind !== 'font'))
      context.addIssue({ code: 'custom', message: 'Font has no pinned dependency' });
  });
export type HyperframesScene = z.infer<typeof hyperframesSceneSchema>;
