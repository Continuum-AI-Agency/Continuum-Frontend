import { z } from 'zod';

/** Original upload and every bundled member, before source mapping or script execution. */
export const hyperframesPackageSchema = z
  .object({
    schema: z.literal('hyperframes.package/1'),
    upload: z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteLength: z.number().int().nonnegative(),
        mediaType: z.enum(['text/html', 'application/zip']),
      })
      .strict(),
    entrypoint: z.string().min(1).max(4096),
    members: z
      .array(
        z
          .object({
            path: z.string().min(1).max(4096),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            byteLength: z.number().int().nonnegative(),
            kind: z.enum([
              'document',
              'script',
              'stylesheet',
              'font',
              'image',
              'video',
              'audio',
              'other',
            ]),
            mediaType: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const paths = new Set<string>();
    let total = 0;
    for (const member of value.members) {
      const parts = member.path.split('/');
      if (
        /[\\\x00-\x1f\x7f]/.test(member.path) ||
        member.path.startsWith('/') ||
        parts[0]!.includes(':') ||
        parts.some((part) => !part || part === '.' || part === '..') ||
        paths.has(member.path)
      )
        context.addIssue({ code: 'custom', message: 'Unsafe or duplicate package member path' });
      paths.add(member.path);
      total += member.byteLength;
    }
    if (total > 512 << 20)
      context.addIssue({ code: 'custom', message: 'Package exceeds expanded size limit' });
    const entry = value.members.find((member) => member.path === value.entrypoint);
    if (!entry || entry.kind !== 'document' || entry.byteLength > 32 << 20)
      context.addIssue({ code: 'custom', message: 'Package has no valid HTML entrypoint' });
    if (
      value.upload.mediaType === 'text/html' &&
      (value.members.length !== 1 ||
        entry?.sha256 !== value.upload.sha256 ||
        entry.byteLength !== value.upload.byteLength)
    )
      context.addIssue({ code: 'custom', message: 'HTML entry does not match uploaded bytes' });
  });
export type HyperframesPackage = z.infer<typeof hyperframesPackageSchema>;

/** Static source facts from the Rust parser. Script-evaluated layout belongs to the browser. */
export const hyperframesStructureSchema = z.object({
  schemaVersion: z.literal(1),
  // Read old immutable sources while new ingestion identifies the mixed-run mapper.
  parser: z.enum(['hyperframes-rust@0.1.0', 'hyperframes-rust@0.2.0']),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  package: hyperframesPackageSchema.optional(),
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parentSourceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  html: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      parent: z.number().int().nonnegative().nullable(),
      tag: z.string(),
      attributes: z.record(z.string(), z.string()),
      directText: z.string(),
      inert: z.boolean(),
    }),
  ),
  compositions: z.array(
    z.object({
      nodeId: z.string(),
      name: z.string().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      durationSec: z.number().nullable(),
      fps: z.number().nullable(),
    }),
  ),
  scenes: z.array(
    z.object({
      nodeId: z.string(),
      startSec: z.number().nullable(),
      durationSec: z.number().nullable(),
      role: z.string().nullable(),
    }),
  ),
  fields: z.array(
    z.object({
      id: z.string(),
      nodeId: z.string(),
      /** `color`/`boolean` come from `data-hf-color`/`data-hf-switch`: AE export controls, not variant edits. */
      kind: z.enum(['text', 'media', 'color', 'boolean']),
      value: z.string(),
      attribute: z.string().optional(),
      copyKind: z.string().nullable().optional(),
      /** Direct text-node ordinal for mixed content; stable while inline structure is unchanged. */
      runIndex: z.number().int().nonnegative().optional(),
    }),
  ),
  dependencies: z.array(
    z.object({ nodeId: z.string(), kind: z.string(), attribute: z.string(), url: z.string() }),
  ),
  diagnostics: z.array(
    z.object({
      code: z.string(),
      nodeId: z.string().optional(),
      node: z.number().optional(),
      detail: z.string(),
    }),
  ),
  timings: z.object({ domMs: z.number().nonnegative(), totalMs: z.number().nonnegative() }),
});
export type HyperframesStructure = z.infer<typeof hyperframesStructureSchema>;

/** One film of an uploaded HyperFrames template: its text fields edited, rendered as uploaded otherwise. */
export const hyperframesFilmRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    edits: z
      .array(
        z.object({ fieldId: z.string().min(1).max(200), value: z.string().max(10_000) }).strict(),
      )
      .max(500)
      .default([]),
  })
  .strict();
export type HyperframesFilmRequest = z.infer<typeof hyperframesFilmRequestSchema>;

/** The Library video a film became, and a signed URL that plays it now. */
export const hyperframesFilmSchema = z
  .object({ assetId: z.string().uuid(), versionId: z.string().uuid(), url: z.string().url() })
  .strict();
export type HyperframesFilm = z.infer<typeof hyperframesFilmSchema>;
