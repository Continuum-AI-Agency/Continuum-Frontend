import { z } from 'zod';

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);

export const templateAuthoringPreparationArtifactSchema = z
  .object({
    artifactId: uuid,
    userId: uuid,
    brandId: uuid,
    assetId: uuid,
    baseVersionId: uuid,
    draftRevision: z.number().int().positive(),
    sourceChecksum: sha256,
    commandDigest: sha256,
    packageChecksum: sha256,
  })
  .strict();
export type TemplateAuthoringPreparationArtifact = z.infer<typeof templateAuthoringPreparationArtifactSchema>;

export const templateAuthoringPreparationRequestSchema = z
  .object({
    artifactId: uuid,
    expectedDraftRevision: z.number().int().positive(),
    sourceChecksum: sha256,
    commandDigest: sha256,
    packageChecksum: sha256,
  })
  .strict();
export type TemplateAuthoringPreparationRequest = z.infer<typeof templateAuthoringPreparationRequestSchema>;

export const templateAuthoringPreparationStateSchema = z.enum([
  'pending', 'submitted', 'running', 'needs_input', 'draft_ready', 'review_ready', 'failed', 'stale',
]);

export const templateAuthoringPreparationSchema = z
  .object({
    artifactId: uuid,
    scope: z.object({ brandId: uuid, assetId: uuid, baseVersionId: uuid }).strict(),
    userId: uuid,
    draftRevision: z.number().int().positive(),
    sourceChecksum: sha256,
    commandDigest: sha256,
    packageChecksum: sha256,
    state: templateAuthoringPreparationStateSchema,
    runId: z.string().min(1).nullable(),
    forgeState: z.string().min(1).nullable(),
    progress: z.unknown().nullable(),
    errorCode: z.string().min(1).nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type TemplateAuthoringPreparation = z.infer<typeof templateAuthoringPreparationSchema>;
