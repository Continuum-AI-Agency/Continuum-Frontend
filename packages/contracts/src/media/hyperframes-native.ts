import { z } from 'zod';
import { hyperframesFontFaceSchema } from './hyperframes-fonts';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(200);
/** Canonical finite JSON used for native source, edit, scene and cache identities. */
export function hyperframesCanonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const compareKeys = (a: string, b: string) => {
    let i = 0,
      j = 0;
    while (i < a.length && j < b.length) {
      const x = a.codePointAt(i)!,
        y = b.codePointAt(j)!;
      if (x !== y) return x - y;
      i += x > 0xffff ? 2 : 1;
      j += y > 0xffff ? 2 : 1;
    }
    return (i < a.length ? 1 : 0) - (j < b.length ? 1 : 0);
  };
  const visit = (item: unknown, depth: number): string => {
    if (depth > 128) throw Error('Native identity exceeds the JSON depth budget');
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return JSON.stringify(item);
    if (typeof item !== 'object' || ancestors.has(item))
      throw Error('Native identities require finite acyclic JSON');
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw Error('Native identities require plain JSON objects');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        const parts: string[] = [];
        for (let index = 0; index < item.length; index++) {
          if (!Object.hasOwn(item, index)) throw Error('Native identities reject sparse arrays');
          parts.push(visit(item[index], depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      return `{${Object.keys(item)
        .sort(compareKeys)
        .map(
          (key) =>
            `${JSON.stringify(key)}:${visit((item as Record<string, unknown>)[key], depth + 1)}`,
        )
        .join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  return visit(value, 0);
}
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
    kind: z.enum(['script', 'stylesheet', 'font', 'image', 'video', 'audio', 'data']),
    mediaType: z.string().min(1).max(100),
    /** Original request path/URL, for diagnostics. Never fetched by the painter. */
    source: z.string().min(1).max(4096),
    /** Replay the captured redirect so relative CSS/module URLs retain their response base. */
    redirect: z
      .object({
        to: z.string().min(1).max(4096),
        status: z.union([
          z.literal(301),
          z.literal(302),
          z.literal(303),
          z.literal(307),
          z.literal(308),
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();

export type HyperframesDependency = z.infer<typeof hyperframesDependencySchema>;
/** URL bindings are retained even when their content hashes match. CAS bytes remain shared. */
export function hyperframesDependencyOrder(
  a: Pick<HyperframesDependency, 'sha256' | 'source'>,
  b: Pick<HyperframesDependency, 'sha256' | 'source'>,
): number {
  return a.sha256 < b.sha256
    ? -1
    : a.sha256 > b.sha256
      ? 1
      : a.source < b.source
        ? -1
        : a.source > b.source
          ? 1
          : 0;
}
/** Canonical mount URLs bind relative package paths and redirect targets to the entry. */
export function hyperframesDependencyBinding(
  record: HyperframesDependency,
  entrypoint: string,
): HyperframesDependency {
  const base = new URL(entrypoint, 'https://hf-compile.invalid/');
  const canonical = (value: string, parent: URL) => {
    const url = new URL(value, parent);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw Error('Native dependencies require HTTP(S) URLs without credentials');
    url.hash = '';
    if (url.href.length > 4096) throw Error('Native dependency URL exceeds its budget');
    return url;
  };
  const source = canonical(record.source, base);
  return {
    ...record,
    source: source.href,
    ...(record.redirect
      ? { redirect: { ...record.redirect, to: canonical(record.redirect.to, source).href } }
      : {}),
  };
}
export const hyperframesMissingRequestsSchema = z
  .array(
    z
      .object({
        url: z.string().url().max(4096),
        resourceType: z.enum(['script', 'stylesheet', 'font', 'image', 'media', 'fetch', 'xhr']),
      })
      .strict(),
  )
  .max(64)
  .refine((requests) => requests.reduce((sum, item) => sum + item.url.length, 0) <= 16384, {
    message: 'Missing dependency report exceeds its URL budget',
  });
export type HyperframesMissingRequests = z.infer<typeof hyperframesMissingRequestsSchema>;

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
export const hyperframesCompilerBuildSchema = z
  .object({
    compiler: z.string().min(1),
    browser: z.string().min(1),
    runtimeSha256: hash,
  })
  .strict();
export type HyperframesCompilerBuild = z.infer<typeof hyperframesCompilerBuildSchema>;
/** Verified untouched upload provenance, independent of an HTML entry inside a ZIP. */
export const hyperframesUploadPinSchema = z
  .object({
    sha256: hash,
    byteLength: z
      .number()
      .int()
      .positive()
      .max(250 << 20),
    mediaType: z.enum(['text/html', 'application/zip']),
  })
  .strict();
export type HyperframesUploadPin = z.infer<typeof hyperframesUploadPinSchema>;

export const hyperframesSceneSchema = z
  .object({
    schema: z.literal('hyperframes.scene/1'),
    source: z
      .object({
        sha256: hash,
        documentSha256: hash,
        entrypoint: z.string().min(1),
        parser: z.string().min(1),
        /** Absent only on earlier local scenes; native render jobs require this pin. */
        upload: hyperframesUploadPinSchema.optional(),
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
    fonts: z
      .array(
        hyperframesFontFaceSchema
          .partial({ weight: true, style: true, stretch: true })
          .refine(
            (face) =>
              [face.weight, face.style, face.stretch].every((value) => value === undefined) ||
              [face.weight, face.style, face.stretch].every((value) => value !== undefined),
            'A font descriptor must be complete',
          ),
      )
      .max(256),
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

/** Service compiler boundary; dependency bytes come from immutable ingestion storage. */
export const hyperframesCompileRequestSchema = z
  .object({
    html: z
      .string()
      .min(1)
      .max(32 << 20),
    sourceSha256: hash,
    upload: hyperframesUploadPinSchema.optional(),
    entrypoint: z.string().min(1).max(4096).default('index.html'),
    viewport: z
      .object({
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192),
      })
      .strict(),
    clock: hyperframesClockSchema,
    dependencies: z
      .array(
        hyperframesDependencySchema
          .extend({
            /** At least one payload per hash; URL aliases reference the same immutable bytes. */
            bytesBase64: z
              .string()
              .max(24 << 20)
              .optional(),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    fonts: z.array(hyperframesFontFaceSchema).max(256).default([]),
    edits: hyperframesNativeEditsSchema.optional(),
  })
  .strict();
export type HyperframesCompileRequest = z.infer<typeof hyperframesCompileRequestSchema>;
export const hyperframesCompileResponseSchema = z
  .object({
    scene: hyperframesSceneSchema,
    sha256: hash,
    timings: z
      .object({ parseMs: z.number().nonnegative(), compileMs: z.number().nonnegative() })
      .strict(),
  })
  .strict();
export type HyperframesCompileResponse = z.infer<typeof hyperframesCompileResponseSchema>;

/** Original uploaded HTML/ZIP pin. Its SHA differs from the entry SHA for archives. */
export const hyperframesSourcePinSchema = z
  .object({
    assetId: z.uuid(),
    versionId: z.uuid(),
    sha256: hash,
    bucket: z.string().min(1).max(200),
    storagePath: z.string().min(1).max(4096),
    fileName: z.string().min(1).max(4096),
    mimeType: z.string().min(1).max(200),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(512 << 20),
  })
  .strict();
export const hyperframesIngestExecutionSpecSchema = z
  .object({
    schemaVersion: z.literal('template_ingest/1'),
    family: z.literal('hyperframes'),
    parser: z.literal('hyperframes-rust@0.2.0'),
    source: hyperframesSourcePinSchema,
  })
  .strict();
export type HyperframesIngestExecutionSpec = z.infer<typeof hyperframesIngestExecutionSpecSchema>;

export const hyperframesSceneRefSchema = z
  .object({
    schemaVersion: z.literal('hyperframes.scene-ref/1'),
    /** SHA of the original upload, including the archive container when applicable. */
    sourceSha256: hash,
    entrySha256: hash,
    sha256: hash,
    compiler: z.string().min(1).max(200),
    bucket: z.literal('media-library'),
    storagePath: z.string().min(1).max(4096),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(32 << 20),
  })
  .strict();
export type HyperframesSceneRef = z.infer<typeof hyperframesSceneRefSchema>;
