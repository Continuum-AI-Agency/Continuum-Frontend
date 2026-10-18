import { z } from 'zod';
import { clientRenderJobStateSchema } from './client-render';

export const webComponentFrameworkSchema = z.enum(['three', 'r3f', 'pixi', 'dom']);
export const webComponentBase64Schema = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const webComponentValueSchema = z.union([
  z.number().finite(),
  z.string().max(10000),
  z.boolean(),
]);
export const webComponentPathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes(':') &&
      !path.includes('\0') &&
      path.split('/').every((part) => part !== '..' && part !== '.' && part !== ''),
    'Use a relative bundle path without traversal',
  );
export const webComponentOverrideSchema = z
  .object({
    nodeId: z.string().min(1).max(200),
    property: z.string().min(1).max(100),
    value: webComponentValueSchema,
  })
  .strict();
export const webComponentPropertySchema = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    type: z.enum(['number', 'string', 'boolean', 'color', 'select']),
    value: webComponentValueSchema,
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().finite().positive().optional(),
    options: z.array(z.string().max(200)).max(100).optional(),
  })
  .strict();
export const webComponentNodeSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().max(200),
    kind: z.string().max(100),
    parentId: z.string().max(200).nullable().default(null),
    properties: z.array(webComponentPropertySchema).max(100),
  })
  .strict();
export const webComponentAssetSchema = z
  .object({
    path: webComponentPathSchema,
    base64: z
      .string()
      .max(24 << 20)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    contentType: z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/),
  })
  .strict();
export const webComponentProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    framework: webComponentFrameworkSchema,
    name: z.string().trim().min(1).max(160),
    entry: webComponentPathSchema,
    files: z.record(webComponentPathSchema, z.string().max(2 << 20)),
    assets: z.array(webComponentAssetSchema).max(100).default([]),
    width: z.number().int().min(16).max(3840),
    height: z.number().int().min(16).max(3840),
    durationSec: z.number().positive().max(60),
    fps: z.number().int().min(1).max(60),
    overrides: z.array(webComponentOverrideSchema).max(1000).default([]),
  })
  .strict()
  .superRefine((project, ctx) => {
    if (!Object.hasOwn(project.files, project.entry))
      ctx.addIssue({ code: 'custom', path: ['entry'], message: 'Entry must name a source file' });
    if (Object.keys(project.files).length > 100)
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'At most 100 source files are supported',
      });
    if (JSON.stringify(project).length > 32 << 20)
      ctx.addIssue({ code: 'custom', message: 'Component package exceeds 32 MiB' });
    const paths = [...Object.keys(project.files), ...project.assets.map((asset) => asset.path)];
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({
        code: 'custom',
        path: ['assets'],
        message: 'Source and asset paths must be unique',
      });
    const keys = project.overrides.map((item) => JSON.stringify([item.nodeId, item.property]));
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: 'custom',
        path: ['overrides'],
        message: 'Override properties must be unique per node',
      });
  });
const id = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const webComponentDraftSchema = z
  .object({
    id,
    brandId: id,
    ownerId: id,
    revision: z.number().int().nonnegative(),
    project: webComponentProjectSchema,
    updatedAt: z.string(),
  })
  .strict();
export const webComponentBuildSchema = z
  .object({
    id,
    draftId: id,
    draftRevision: z.number().int().nonnegative(),
    projectHash: hash,
    checksum: hash,
    entry: webComponentPathSchema,
    files: z.record(webComponentPathSchema, webComponentBase64Schema),
    inspected: z.boolean().default(false),
    nodes: z.array(webComponentNodeSchema).max(2000),
    unresolvedOverrides: z.array(webComponentOverrideSchema).max(1000),
    createdAt: z.string(),
  })
  .strict();
export const webComponentRevisionSchema = z
  .object({
    id,
    draftId: id,
    draftRevision: z.number().int().nonnegative(),
    project: webComponentProjectSchema,
    build: webComponentBuildSchema,
    assetId: id.nullable(),
    versionId: id.nullable(),
    reviewedBy: id,
    reviewedAt: z.string(),
    createdAt: z.string(),
  })
  .strict();
export const webComponentCreateDraftRequestSchema = z
  .object({ brandId: id, project: webComponentProjectSchema })
  .strict();
export const webComponentSaveDraftRequestSchema = z
  .object({ expectedRevision: z.number().int().nonnegative(), project: webComponentProjectSchema })
  .strict();
export const webComponentBuildRequestSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export const webComponentCommitRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    buildId: id,
    reviewed: z.literal(true),
  })
  .strict();
export const webComponentBuildResponseSchema = z
  .object({
    build: webComponentBuildSchema,
    previewHtml: z.string(),
    browser: z.string().optional(),
    renderer: z.string().nullable().optional(),
  })
  .strict();
export const webComponentDraftSummarySchema = z
  .object({
    id,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string(),
    name: z.string(),
    framework: webComponentFrameworkSchema,
  })
  .strict();
export const webComponentDraftListResponseSchema = z
  .object({ drafts: z.array(webComponentDraftSummarySchema) })
  .strict();
export const webComponentRenderRequestSchema = z
  .object({ format: z.enum(['png', 'mp4']).default('mp4'), timeSec: z.number().min(0).optional() })
  .strict();
export const webComponentRenderServiceRequestSchema = z
  .object({
    files: z.record(webComponentPathSchema, webComponentBase64Schema),
    entry: webComponentPathSchema,
    width: z.number().int().min(16).max(3840),
    height: z.number().int().min(16).max(3840),
    durationSec: z.number().positive().max(60),
    fps: z.number().int().min(1).max(60),
    format: z.enum(['png', 'mp4']).default('mp4'),
    timeSec: z.number().min(0).max(60).default(0),
    overrides: z.array(webComponentOverrideSchema).max(1000).default([]),
  })
  .strict();
export const webComponentBridgeRequestSchema = z
  .object({
    channel: z.literal('forge-web-component'),
    nonce: z.string().min(16).max(200),
    id: z.string().min(1).max(100),
    method: z.enum([
      'renderAt',
      'resize',
      'describeScene',
      'applyOverrides',
      'dispose',
      'play',
      'pause',
    ]),
    params: z.unknown().optional(),
  })
  .strict();
export type WebComponentFramework = z.infer<typeof webComponentFrameworkSchema>;
export type WebComponentValue = z.infer<typeof webComponentValueSchema>;
export type WebComponentOverride = z.infer<typeof webComponentOverrideSchema>;
export type WebComponentProperty = z.infer<typeof webComponentPropertySchema>;
export type WebComponentNode = z.infer<typeof webComponentNodeSchema>;
export type WebComponentProject = z.infer<typeof webComponentProjectSchema>;
export type WebComponentDraft = z.infer<typeof webComponentDraftSchema>;
export type WebComponentBuild = z.infer<typeof webComponentBuildSchema>;
export type WebComponentRevision = z.infer<typeof webComponentRevisionSchema>;
export type WebComponentBuildResponse = z.infer<typeof webComponentBuildResponseSchema>;
export type WebComponentRenderServiceRequest = z.infer<
  typeof webComponentRenderServiceRequestSchema
>;

export type WebComponentDraftSummary = z.infer<typeof webComponentDraftSummarySchema>;

/** Durable service-lane export, always addressed to a pinned immutable revision. */
export const webComponentRenderJobSchema = z
  .object({
    id: z.uuid(),
    state: clientRenderJobStateSchema,
    progress: z.number().min(0).max(1).default(0),
    phase: z.string().nullable().default(null),
    error: z.string().nullable(),
    url: z.url().nullable(),
  })
  .strict();
export const webComponentRenderJobResponseSchema = z
  .object({ job: webComponentRenderJobSchema })
  .strict();
export type WebComponentRenderJob = z.infer<typeof webComponentRenderJobSchema>;
