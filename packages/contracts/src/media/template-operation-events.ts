import { z } from 'zod';

const id = z.string().uuid();
const object = z.record(z.string(), z.unknown());

export const templateOperationOriginSchema = z.object({
  button: z.string().max(200).optional(),
  shortcut: z.string().max(200).optional(),
  /** Actual input label or control identity reported by the client; omit unknown labels. */
  control: z.string().min(1).max(200).optional(),
  /** The actual gesture, such as a canvas drag; this is not an authenticated identity. */
  gesture: z.string().min(1).max(200).optional(),
  tool: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
}).strict();
export type TemplateOperationOrigin = z.infer<typeof templateOperationOriginSchema>;

/** Recorded order is local to a working copy. Wall-clock time never proves global order. */
export const templateOperationInputSchema = z.object({
  id,
  workingCopyId: id,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  command: z.string().min(1).max(200),
  baseRevisionId: id.nullable(),
  channel: z.enum(['ui', 'cli', 'mcp', 'forge', 'api', 'import']),
  outcome: z.enum(['requested', 'succeeded', 'failed', 'cancelled']),
  affectedObjects: z.array(z.string().min(1).max(500)).max(1000).default([]),
  changes: object.default({}),
  origin: templateOperationOriginSchema.optional(),
  evidence: z.enum(['recorded', 'inferred', 'unknown']).default('recorded'),
  causedBy: z.array(id).max(100).default([]),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  rawRecord: object.optional(),
}).strict();
export type TemplateOperationInput = z.infer<typeof templateOperationInputSchema>;

/** The principal comes from authentication, never from client-reported origin labels. */
export const templateOperationSchema = templateOperationInputSchema.extend({
  principalId: z.guid(),
  revisionId: id.nullable(),
  revisionIds: z.array(id).default([]),
  /** Server lifecycle records may reference the full authenticated client + Forge commit batch. */
  causedBy: z.array(id).max(11000).default([]),
  receivedAt: z.string(),
}).strict();
export type TemplateOperation = z.infer<typeof templateOperationSchema>;

export const templateOperationCoverageSchema = z.object({
  workingCopyId: id, throughSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type TemplateOperationCoverage = z.infer<typeof templateOperationCoverageSchema>;

export const templateVersionHistoryAppendRequestSchema = z.object({
  brandId: id, operations: z.array(templateOperationInputSchema).min(1).max(500),
}).strict().superRefine((value, ctx) => {
  const ids = value.operations.map((operation) => operation.id);
  const sequences = value.operations.map((operation) => `${operation.workingCopyId}:${operation.sequence}`);
  if (new Set(ids).size !== ids.length || new Set(sequences).size !== sequences.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate operation identity or working-copy sequence' });
});
export type TemplateVersionHistoryAppendRequest = z.infer<typeof templateVersionHistoryAppendRequestSchema>;
export const templateVersionHistoryAppendResponseSchema = z.object({
  items: z.array(templateOperationSchema),
}).strict();
export type TemplateVersionHistoryAppendResponse = z.infer<typeof templateVersionHistoryAppendResponseSchema>;
