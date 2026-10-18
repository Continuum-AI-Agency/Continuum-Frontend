import { z } from 'zod';

/** Static source facts from the Rust parser. Script-evaluated layout belongs to the browser. */
export const hyperframesStructureSchema = z.object({
  schemaVersion: z.literal(1),
  parser: z.literal('hyperframes-rust@0.1.0'),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
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
      kind: z.enum(['text', 'media']),
      value: z.string(),
      attribute: z.string().optional(),
      copyKind: z.string().nullable().optional(),
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
