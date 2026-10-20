import { z } from 'zod';
import {
  hyperframesCapabilitySchema,
  hyperframesClockSchema,
  hyperframesCompilerBuildSchema,
  hyperframesNativeEditsSchema,
  hyperframesSceneRefSchema,
  hyperframesUploadPinSchema,
} from './hyperframes-native';
import { hyperframesNativeRenderRequestSchema } from './hyperframes-native-render';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const outputs = z
  .array(
    z.discriminatedUnion('file', [
      z.object({ file: z.literal('png'), frame: z.number().int().min(0).max(1799) }).strict(),
      z.object({ file: z.literal('mp4'), crf: z.number().int().min(0).max(51) }).strict(),
    ]),
  )
  .min(1)
  .max(2)
  .refine(
    (items) => new Set(items.map((item) => item.file)).size === items.length,
    'Each output format may be requested once',
  );

/** Public intent, including the exact engine/tool selection returned by the scene view. */
export const hyperframesSceneRenderRequestSchema = z
  .object({
    family: z.literal('hyperframes'),
    brandId: z.uuid(),
    revisionId: z.uuid(),
    sceneSha256: hash,
    submissionId: z.uuid(),
    engine: hyperframesNativeRenderRequestSchema.shape.engine,
    tools: hyperframesNativeRenderRequestSchema.shape.tools,
    outputs,
  })
  .strict();
export type HyperframesSceneRenderRequest = z.infer<typeof hyperframesSceneRenderRequestSchema>;

/** Service-only frozen job state. URLs are minted only after a worker claims the job. */
export const hyperframesSceneRenderExecutionSpecSchema = z
  .object({
    schemaVersion: z.literal('scene_render.hyperframes/1'),
    intent: hyperframesSceneRenderRequestSchema,
    source: z
      .object({
        family: z.literal('hyperframes'),
        assetId: z.uuid(),
        versionId: z.uuid(),
        upload: hyperframesUploadPinSchema,
        entrySha256: hash,
        compiler: hyperframesCompilerBuildSchema,
        scene: hyperframesSceneRefSchema.refine(
          (ref) => !!ref.resources,
          'Native jobs require an immutable resource manifest',
        ),
      })
      .strict(),
    revision: hyperframesNativeRenderRequestSchema.shape.revision,
    viewport: hyperframesNativeRenderRequestSchema.shape.viewport,
    clock: hyperframesClockSchema,
  })
  .strict()
  .superRefine((spec, context) => {
    if (
      spec.intent.revisionId !== spec.revision.revisionId ||
      spec.intent.sceneSha256 !== spec.source.scene.sha256 ||
      spec.source.upload.sha256 !== spec.source.scene.sourceSha256 ||
      spec.source.entrySha256 !== spec.source.scene.entrySha256 ||
      spec.source.compiler.compiler !== spec.source.scene.compiler
    )
      context.addIssue({ code: 'custom', message: 'Native job revision/source/scene pins differ' });
    for (const pin of [spec.source.scene, spec.source.scene.resources]) {
      if (
        !pin ||
        !pin.storagePath.startsWith(`${spec.intent.brandId}/native-ingest/`) ||
        !/^[A-Za-z0-9_./-]+$/.test(pin.storagePath) ||
        pin.storagePath.split('/').length < 4 ||
        pin.storagePath.split('/').some((part) => part === '.' || part === '..')
      )
        context.addIssue({
          code: 'custom',
          message: 'Native jobs require protected immutable artifacts under their brand',
        });
    }
    if (
      spec.source.upload.mediaType === 'text/html' &&
      (spec.source.upload.sha256 !== spec.source.entrySha256 ||
        spec.source.upload.byteLength > 32 << 20)
    )
      context.addIssue({
        code: 'custom',
        message: 'Native HTML upload identity exceeds or differs from its entry',
      });
    if (
      spec.viewport.width * spec.viewport.height > 8_388_608 ||
      spec.clock.frameCount > 1800 ||
      spec.clock.frameCount * spec.clock.denominator > 600 * spec.clock.numerator
    )
      context.addIssue({
        code: 'custom',
        message: 'Native job exceeds the viewport/frame/execution budget',
      });
    for (const output of spec.intent.outputs) {
      if (output.file === 'png' && output.frame >= spec.clock.frameCount)
        context.addIssue({
          code: 'custom',
          message: 'The preview frame is outside the frozen delivery clock',
        });
      if (
        output.file === 'mp4' &&
        (spec.viewport.width % 2 !== 0 || spec.viewport.height % 2 !== 0)
      )
        context.addIssue({ code: 'custom', message: 'H.264 delivery requires even dimensions' });
    }
  });
export type HyperframesSceneRenderExecutionSpec = z.infer<
  typeof hyperframesSceneRenderExecutionSpecSchema
>;

/** Public metadata omits private artifact locations, leases and signed renderer URLs. */
export const hyperframesSceneViewSchema = z
  .object({
    family: z.literal('hyperframes'),
    brandId: z.uuid(),
    assetId: z.uuid(),
    sourceVersionId: z.uuid(),
    revision: hyperframesNativeRenderRequestSchema.shape.revision,
    sceneSha256: hash,
    viewport: hyperframesNativeRenderRequestSchema.shape.viewport,
    clock: hyperframesClockSchema,
    edits: hyperframesNativeEditsSchema,
    capabilities: z.array(hyperframesCapabilitySchema).max(160_000),
    renderer: z
      .object({
        engine: hyperframesNativeRenderRequestSchema.shape.engine,
        tools: hyperframesNativeRenderRequestSchema.shape.tools,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((view, context) => {
    if (view.revision.templateId !== view.assetId)
      context.addIssue({
        code: 'custom',
        message: 'Native scene revision belongs to another template',
      });
  });
export type HyperframesSceneView = z.infer<typeof hyperframesSceneViewSchema>;

export const hyperframesSceneRenderStatusSchema = z
  .object({
    family: z.literal('hyperframes'),
    jobId: z.uuid(),
    brandId: z.uuid(),
    assetId: z.uuid(),
    revision: hyperframesNativeRenderRequestSchema.shape.revision,
    state: z.enum(['ready', 'claimed', 'rendering', 'saving', 'completed', 'failed', 'cancelled']),
    error: z
      .object({ code: z.string().max(200), message: z.string().max(2000) })
      .strict()
      .nullable(),
    outputs: z
      .array(
        z
          .object({
            file: z.enum(['png', 'mp4']),
            assetId: z.uuid(),
            versionId: z.uuid(),
            sha256: hash,
            bytes: z
              .number()
              .int()
              .positive()
              .max(128 << 20),
            mimeType: z.enum(['image/png', 'video/mp4']),
          })
          .strict(),
      )
      .max(2),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.revision.templateId !== job.assetId)
      context.addIssue({
        code: 'custom',
        message: 'Native job revision belongs to another template',
      });
    if ((job.state === 'completed') !== (job.outputs.length > 0))
      context.addIssue({
        code: 'custom',
        message: 'Only completed native jobs carry published outputs',
      });
    if (new Set(job.outputs.map((output) => output.file)).size !== job.outputs.length)
      context.addIssue({ code: 'custom', message: 'Native output formats must be unique' });
    for (const output of job.outputs)
      if (output.mimeType !== (output.file === 'png' ? 'image/png' : 'video/mp4'))
        context.addIssue({ code: 'custom', message: 'Native output file and media type differ' });
  });
export type HyperframesSceneRenderStatus = z.infer<typeof hyperframesSceneRenderStatusSchema>;

export const hyperframesSceneRenderHistorySchema = z
  .object({
    family: z.literal('hyperframes'),
    jobs: z.array(hyperframesSceneRenderStatusSchema).max(50),
  })
  .strict();
export type HyperframesSceneRenderHistory = z.infer<typeof hyperframesSceneRenderHistorySchema>;
