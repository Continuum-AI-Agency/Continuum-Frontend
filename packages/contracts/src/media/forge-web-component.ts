import { z } from 'zod';
import { templateParseSchema } from './template-source';

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
/**
 * `forge-component.json`: what makes a zip or folder a web component project. It sits at the
 * root or under one wrapping folder (`webComponentManifestPath`), beside the source it names.
 * `stillSec` is when the PNG output is captured.
 */
export const webComponentManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    framework: webComponentFrameworkSchema,
    name: z.string().trim().min(1).max(160),
    entry: webComponentPathSchema,
    width: z.number().int().min(16).max(3840),
    height: z.number().int().min(16).max(3840),
    durationSec: z.number().positive().max(60),
    fps: z.number().int().min(1).max(60),
    stillSec: z.number().min(0).max(60).default(0),
  })
  .strict();
export const webComponentProjectSchema = webComponentManifestSchema
  .extend({
    files: z.record(webComponentPathSchema, z.string().max(2 << 20)),
    assets: z.array(webComponentAssetSchema).max(100).default([]),
    overrides: z.array(webComponentOverrideSchema).max(1000).default([]),
  })
  .superRefine((project, ctx) => {
    if (project.stillSec > project.durationSec)
      ctx.addIssue({
        code: 'custom',
        path: ['stillSec'],
        message: 'stillSec must fall inside the duration',
      });
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
export type WebComponentRenderServiceRequest = z.infer<
  typeof webComponentRenderServiceRequestSchema
>;

/**
 * A web component in the Render log is template `web:<assetId>`. It has no fleet workspace, so
 * on the wire it carries this nil binding; the database stores null (`binding_id is not null or
 * engine = 'web'`).
 */
export const WEB_COMPONENT_BINDING_ID = '00000000-0000-0000-0000-000000000000';
export const webTemplateKey = (assetId: string): string => `web:${assetId}`;
export const isWebTemplateKey = (key: string): boolean => key.startsWith('web:');

/** One render column: a contract-safe key for one node property the component exposes. */
export const webComponentVariableSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    nodeId: z.string().min(1).max(200),
    property: z.string().min(1).max(100),
  })
  .strict();
export const webComponentOutputSchema = z.enum(['png', 'mp4']);

/** The parse of an imported web component, stored in `media.template_sources.parse`. */
export const webComponentParseSchema = templateParseSchema.extend({
  sourceFamily: z.literal('web_component'),
  web: z
    .object({
      manifest: webComponentManifestSchema,
      bundle: z
        .object({
          bucket: z.string().min(1),
          path: z.string().min(1),
          previewPath: z.string().min(1),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
      nodes: z.array(webComponentNodeSchema).max(2000),
      variables: z.array(webComponentVariableSchema).max(1000),
      outputs: z.array(webComponentOutputSchema).min(1).max(2),
    })
    .strict(),
});
export type WebComponentManifest = z.infer<typeof webComponentManifestSchema>;
export type WebComponentVariable = z.infer<typeof webComponentVariableSchema>;
export type WebComponentParse = z.infer<typeof webComponentParseSchema>;
