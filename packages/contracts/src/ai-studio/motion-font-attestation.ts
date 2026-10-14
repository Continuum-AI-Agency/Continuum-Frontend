import { z } from 'zod';

/** Exact native collector and render/upload footprint reviewed with this contract. */
export const SUPPORTED_MOTION_FONT_BUILD = {
  collectorSha256: '5ab8cfa902f1c5f920973c56326a181e6ac0f1aedea9b0bdb1ab792566d574f6',
  buildId: 'ec287173303bc4c410734ec27fc1427060f37bd00ab68ce40ae04c55716bec43',
} as const;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(200);
const packagePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !/[\\:\x00]/.test(value) &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Font paths must be relative package member paths.',
  );

export const motionFontSourceSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    checksum: digest,
    rawAepChecksum: digest,
    projectMember: packagePath.optional(),
  })
  .strict();

export const motionFontManifestSchema = z
  .object({
    schema: z.literal('motion-font-manifest/v1'),
    jobId: z.string().uuid(),
    source: motionFontSourceSchema,
    dependencyDigest: digest,
    fonts: z
      .array(
        z
          .object({
            postScriptName: identity,
            registryName: identity,
            packagePath,
            sha256: digest,
          })
          .strict(),
      )
      .max(16),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const faces = new Set<string>(),
      paths = new Set<string>(),
      registries = new Set<string>();
    for (const [index, font] of manifest.fonts.entries()) {
      const face = font.postScriptName.toLowerCase(),
        path = font.packagePath.toLowerCase(),
        registry = font.registryName.toLowerCase();
      if (faces.has(face) || paths.has(path) || registries.has(registry))
        ctx.addIssue({
          code: 'custom',
          path: ['fonts', index],
          message: 'Each frozen font must own one unique face, registry name and package member.',
        });
      faces.add(face);
      paths.add(path);
      registries.add(registry);
    }
  });
export type MotionFontManifest = z.infer<typeof motionFontManifestSchema>;

const fontObservation = z
  .object({
    postScriptName: identity,
    registryName: identity,
    packagePath,
    expectedSha256: digest,
    packageSha256: digest,
    registered: z
      .array(
        z
          .object({
            hive: z.enum(['HKLM', 'HKCU']),
            path: z.string().min(1).max(1000),
            sha256: digest,
          })
          .strict(),
      )
      .max(16),
    status: z.enum(['pass', 'fail', 'unknown', 'not_run']),
  })
  .strict();

export const motionFontAttestationSchema = z
  .object({
    schema: z.literal('motion-font-attestation/v1'),
    status: z.enum(['pass', 'fail', 'unknown', 'not_run']),
    jobId: z.string().uuid(),
    workerJobUid: identity,
    taskUID: identity,
    source: motionFontSourceSchema,
    dependencyDigest: digest,
    manifestDigest: digest,
    platform: z.string().min(1).max(30),
    worker: z
      .object({
        id: identity,
        host: identity,
        buildId: digest,
        collectorSha256: digest,
        aeBinarySha256: digest,
      })
      .strict()
      .optional(),
    preflightAt: z.string().datetime().optional(),
    launchAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    activation: z
      .object({
        mode: z.literal('existing-registered'),
        freshProcess: z.boolean(),
        reuse: z.boolean(),
      })
      .strict()
      .optional(),
    fonts: z.array(fontObservation).max(16),
    runtime: z
      .object({
        status: z.enum(['pass', 'fail', 'unknown', 'not_run']),
        aeVersion: identity,
        projectPath: z.string().min(1).max(1000),
        fonts: z
          .array(
            z
              .object({
                postScriptName: identity,
                path: z.string().min(1).max(1000),
                isSubstitute: z.boolean(),
              })
              .strict(),
          )
          .max(16),
      })
      .strict()
      .optional(),
    renderOutput: z
      .object({
        profile: z.literal('rgba-straight-v1'),
        capture: z.literal('render-queue-done'),
        intermediateAlpha: z.literal('premultiplied-black'),
        color: z.literal('Premultiplied (Matted)'),
        channels: z.literal('RGB + Alpha'),
        format: z.literal('AVI'),
        composition: identity,
        background: z.tuple([z.literal(0), z.literal(0), z.literal(0)]),
        workingSpace: z.string().max(200),
      })
      .strict()
      .optional(),
    aeProcess: z
      .object({ pid: z.number().int().positive(), exitCode: z.number().int() })
      .strict()
      .optional(),
    outputs: z
      .array(
        z
          .object({
            fileName: z
              .string()
              .min(1)
              .max(500)
              .refine((value) => !/[\\/\x00]/.test(value)),
            sha256: digest,
          })
          .strict(),
      )
      .max(100)
      .optional(),
    error: z
      .object({ code: identity, message: z.string().min(1).max(1000) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.status !== 'pass') return;
    const complete =
      receipt.platform === 'win32' &&
      receipt.worker &&
      receipt.preflightAt &&
      receipt.launchAt &&
      receipt.completedAt &&
      receipt.activation?.freshProcess === true &&
      receipt.activation.reuse === false &&
      receipt.runtime?.status === 'pass' &&
      receipt.runtime.fonts.length === receipt.fonts.length &&
      receipt.runtime.fonts.every((font) => font.isSubstitute === false) &&
      receipt.aeProcess?.exitCode === 0 &&
      receipt.outputs?.length &&
      receipt.renderOutput &&
      receipt.fonts.every((font) => font.status === 'pass' && font.registered.length > 0) &&
      !receipt.error;
    if (!complete)
      ctx.addIssue({
        code: 'custom',
        message:
          'A passing font attestation requires completed native launch, runtime, font and output evidence.',
      });
  });
export type MotionFontAttestation = z.infer<typeof motionFontAttestationSchema>;

/** Object keys are sorted recursively; array order is part of the frozen request. */
export function motionFontCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(motionFontCanonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${motionFontCanonicalJson(item)}`)
      .join(',')}}`;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Font manifests must contain JSON values.');
  return serialized;
}
