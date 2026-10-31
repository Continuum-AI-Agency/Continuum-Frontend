import { z } from 'zod';

const uuid = z.string().uuid();

/** Immutable authoring context; the source UUIDs remain Library identities. */
export const templateAuthoringWorkingCopySchema = z.object({
  id: uuid,
  brandId: uuid,
  principalId: z.guid(),
  templateId: uuid,
  variantId: uuid,
  baseRevisionId: uuid,
  sourceAssetId: uuid,
  sourceVersionId: uuid,
  sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  createdAt: z.string().datetime({ offset: true }),
  landedRevisionId: uuid.nullable(),
  closedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type TemplateAuthoringWorkingCopy = z.infer<typeof templateAuthoringWorkingCopySchema>;

/** An omitted ID resumes the owned open branch copy before creating from its current head. */
export const templateAuthoringWorkingCopyOpenRequestSchema = z.object({
  brandId: uuid, variantId: uuid, baseRevisionId: uuid, workingCopyId: uuid.optional(),
}).strict();
export type TemplateAuthoringWorkingCopyOpenRequest = z.infer<typeof templateAuthoringWorkingCopyOpenRequestSchema>;
export const templateAuthoringWorkingCopyListQuerySchema = z.object({
  brandId: uuid, variantId: uuid.optional(),
}).strict();
export type TemplateAuthoringWorkingCopyListQuery = z.infer<typeof templateAuthoringWorkingCopyListQuerySchema>;
export const templateAuthoringWorkingCopyListSchema = z.object({
  items: z.array(templateAuthoringWorkingCopySchema),
}).strict();
export type TemplateAuthoringWorkingCopyList = z.infer<typeof templateAuthoringWorkingCopyListSchema>;

export const templateAuthoringScopeQuerySchema = z.object({
  brandId: uuid, baseVersionId: uuid, workingCopyId: uuid.optional(),
}).strict();
export type TemplateAuthoringScopeQuery = z.infer<typeof templateAuthoringScopeQuerySchema>;
