import { z } from 'zod';
import { hyperframesNativeEditsSchema } from './hyperframes-native';
export * from './template-operation-events';
import { templateRevisionEditsSchema, templateRevisionSchema } from './template-revisions';
import { templateOperationSchema } from './template-operation-events';

const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const object = z.record(z.string(), z.unknown());
const message = z.string().trim().min(1).max(2000);
const key = z.string().trim().min(1).max(200);

export const templateVersionBranchRequestSchema = z.object({
  brandId: id, parentRevisionId: id, name: z.string().trim().min(1).max(120),
  idempotencyKey: key, message: message.optional(),
}).strict();
export const templateVersionDiffRequestSchema = z.object({
  brandId: id, fromRevisionId: id, toRevisionId: id,
}).strict();
export const templateVersionHistoryQuerySchema = z.object({
  brandId: id, workingCopyId: id.optional(),
  afterSequence: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
}).strict().refine((value) => value.afterSequence === undefined || value.workingCopyId !== undefined,
  'A sequence cursor requires its working copy');
export const templateVersionMergePreviewRequestSchema = z.object({
  brandId: id, variantId: id, sourceVariantId: id,
  expectedHeadRevisionId: id, expectedSourceHeadRevisionId: id,
  baseRevisionId: id.optional(),
}).strict();
export const templateVersionMergeCommitRequestSchema = templateVersionMergePreviewRequestSchema.extend({
  idempotencyKey: key, previewToken: hash,
  resolutions: z.array(z.object({ path: z.string().min(1).max(2000), choice: z.enum(['ours', 'theirs']) }).strict()).max(2000),
  message: message.optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.resolutions.map((resolution) => resolution.path)).size !== value.resolutions.length)
    ctx.addIssue({ code: 'custom', message: 'Resolve each conflict once' });
});
export const templateVersionRevertRequestSchema = z.object({
  brandId: id, variantId: id, restoreRevisionId: id, expectedHeadRevisionId: id,
  idempotencyKey: key, message: message.optional(),
}).strict();
export const templateVersionCommitResponseSchema = z.object({
  revisionId: id, variantId: id, revisionNumber: z.number().int().positive(),
}).passthrough();

export const templateVersionFieldChangeSchema = z.object({
  path: z.string().min(1), from: z.unknown().optional(), to: z.unknown().optional(),
}).strict();
export const templateVersionMergeConflictSchema = z.object({
  path: z.string().min(1), base: z.unknown().optional(), ours: z.unknown().optional(), theirs: z.unknown().optional(),
  kind: z.enum(['field', 'structural', 'source']),
}).strict();
export const templateVersionMergePreviewSchema = z.object({
  baseRevisionId: id, headRevisionId: id, sourceHeadRevisionId: id,
  previewToken: hash, conflicts: z.array(templateVersionMergeConflictSchema),
  edits: templateRevisionEditsSchema, nativeEdits: hyperframesNativeEditsSchema.optional(),
}).passthrough();

/** A capability is supported only by an admitted format adapter, never by the presence of this schema. */
export const templateVersionCapabilitiesSchema = z.object({
  family: z.string().min(1),
  branch: z.boolean(), diff: z.boolean(), merge: z.boolean(), revert: z.boolean(),
  release: z.boolean(), pinnedRender: z.boolean(),
  reasons: z.record(z.string(), z.string()).default({}),
}).strict();
export type TemplateVersionCapabilities = z.infer<typeof templateVersionCapabilitiesSchema>;

const bytesSchema = z.object({ sha256: hash, size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
/** The derivation id hashes intent. It is deliberately separate from both sets of actual bytes. */
export const templateVersioningCandidateSchema = z.object({
  schemaVersion: z.literal(1), intentId: key, ref: z.string().min(1).max(500),
  expectedRef: hash.nullable(), parentCommitSha: hash,
  derivationCommitSha: hash, operationSha256: hash,
  /** Verbatim writer WAL rows; Backend verifies their canonical hash before authenticated import. */
  recordedOperations: z.array(object).max(10000).optional(),
  /** Actual Forge request receipts; authentication facts and client claims remain distinct. */
  requestEvents: z.array(object).max(500).optional(),
  source: bytesSchema,
  /** Verified original upload; source may instead identify a generated arrangement package. */
  uploadedSource: z.object({ assetId: id, versionId: id, sha256: hash, size: z.number().int().positive().optional() }).strict().optional(),
  artifact: bytesSchema.extend({
    mediaType: z.string().min(1), bucket: z.string().min(1).optional(),
    path: z.string().min(1).optional(), generation: z.string().min(1).optional(),
  }).strict(),
  checkout: z.object({ source: bytesSchema, artifact: bytesSchema }).strict(),
  format: z.string().min(1),
  qualification: z.enum(['verified-bytes', 'instruction-only', 'ledger-derived']),
}).strict();
export type TemplateVersioningCandidate = z.infer<typeof templateVersioningCandidateSchema>;
export const templateVersioningAcceptedSchema = z.object({
  intentId: key, revisionId: id, ref: z.string().min(1),
  derivationCommitSha: hash, artifactSha256: hash, expectedRef: hash.nullable(),
}).strict();
export type TemplateVersioningAccepted = z.infer<typeof templateVersioningAcceptedSchema>;

const releaseTarget = {
  brandId: id, bindingId: id, templateKey: z.string().trim().min(1).max(500),
  expectedReleaseId: id.nullable(), idempotencyKey: key,
};
/** Manifests are not accepted from clients: the server derives them from stored revision/receipt pins. */
export const templateReleaseRequestSchema = z.object({ ...releaseTarget, revisionId: id }).strict();
export const templateReleaseRollbackRequestSchema = z.object({ ...releaseTarget, releaseId: id }).strict();
export const templateReleaseListQuerySchema = z.object({
  brandId: id, bindingId: id.optional(), templateKey: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const templateReleaseSchema = z.object({
  id, templateId: id, revisionId: id, variantId: id, bindingId: id,
  templateKey: z.string().min(1), manifest: object,
  createdAt: z.string(), createdBy: z.guid(),
}).passthrough();
export type TemplateRelease = z.infer<typeof templateReleaseSchema>;

export type TemplateVersionBranchRequest = z.infer<typeof templateVersionBranchRequestSchema>;
export type TemplateVersionDiffRequest = z.infer<typeof templateVersionDiffRequestSchema>;
export type TemplateVersionHistoryQuery = z.infer<typeof templateVersionHistoryQuerySchema>;
export type TemplateVersionMergePreviewRequest = z.infer<typeof templateVersionMergePreviewRequestSchema>;
export type TemplateVersionMergeCommitRequest = z.infer<typeof templateVersionMergeCommitRequestSchema>;
export type TemplateVersionRevertRequest = z.infer<typeof templateVersionRevertRequestSchema>;
export type TemplateReleaseRequest = z.infer<typeof templateReleaseRequestSchema>;
export type TemplateReleaseRollbackRequest = z.infer<typeof templateReleaseRollbackRequestSchema>;

export const templateVersionResultSchema = z.object({
  replayed: z.boolean(), revision: templateRevisionSchema,
}).passthrough();
export const templateVersionDiffResponseSchema = z.object({
  fromRevisionId: id, toRevisionId: id, changes: z.array(templateVersionFieldChangeSchema),
  sourceChanged: z.boolean(), nativeChanged: z.boolean().optional(),
}).passthrough();
export const templateVersionHistoryResponseSchema = z.object({
  items: z.array(templateOperationSchema),
}).passthrough();
export const templateVersionCommitsResponseSchema = z.object({
  items: z.array(z.object({
    revisionId: id, kind: z.enum(['save', 'branch', 'merge', 'revert']),
    message: z.string(), mergeParentRevisionId: id.nullable(),
  }).passthrough()),
}).passthrough();
export const templateReleaseListResponseSchema = z.object({
  items: z.array(templateReleaseSchema),
  heads: z.array(z.object({ bindingId: id, templateKey: z.string().min(1), releaseId: id.nullable() })),
}).passthrough();
export const templateReleaseResultSchema = z.object({
  release: templateReleaseSchema, pointerEventId: id,
}).passthrough();
export type TemplateVersionMergePreview = z.infer<typeof templateVersionMergePreviewSchema>;
export type TemplateVersionDiffResponse = z.infer<typeof templateVersionDiffResponseSchema>;
export type TemplateVersionCommitsResponse = z.infer<typeof templateVersionCommitsResponseSchema>;
export type TemplateReleaseListResponse = z.infer<typeof templateReleaseListResponseSchema>;


/** Server-derived image overlay applied to frozen .blend bytes at render time. */
export const templateBlenderDependencySchema = z.object({
  key: z.string().min(1).max(128), assetId: id, versionId: id,
  bucket: z.string().regex(/^gs:\/\/[^/]+$/), path: z.string().min(1).max(4096),
  generation: z.string().regex(/^[0-9]+$/), sha256: hash,
  sizeBytes: z.number().int().positive().max(50 << 20),
  application: z.literal('frozen-render-default'),
}).strict();
export type TemplateBlenderDependency = z.infer<typeof templateBlenderDependencySchema>;
