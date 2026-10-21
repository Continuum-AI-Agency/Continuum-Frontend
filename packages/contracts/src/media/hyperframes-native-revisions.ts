import { z } from 'zod';
import { hyperframesNativeEditsSchema } from './hyperframes-native';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Public revision identity. Private scene/dependency storage stays in the service registry. */
export const hyperframesRevisionSchema = z
  .object({
    family: z.literal('hyperframes'),
    schemaVersion: z.literal('hyperframes.revision/1'),
    sceneSha256: hash,
    entrySha256: hash,
    compiler: z.string().min(1).max(200),
    editsSha256: hash,
    edits: hyperframesNativeEditsSchema,
  })
  .strict()
  .refine((value) => value.edits.sourceSha256 === value.entrySha256, {
    message: 'Native edits must address the frozen HTML entry',
  });
export type HyperframesRevision = z.infer<typeof hyperframesRevisionSchema>;

/** The complete edit snapshot is recompiled from immutable source bytes on every save. */
export const saveHyperframesRevisionRequestSchema = z
  .object({
    family: z.literal('hyperframes'),
    brandId: z.uuid(),
    parentRevisionId: z.uuid(),
    expectedParentSceneSha256: hash,
    expectedSourceSceneSha256: hash,
    variantId: z.uuid().optional(),
    expectedHeadRevisionId: z.uuid().nullable(),
    name: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().min(1).max(200),
    edits: hyperframesNativeEditsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.variantId
        ? value.expectedHeadRevisionId !== value.parentRevisionId
        : value.expectedHeadRevisionId !== null
    )
      ctx.addIssue({ code: 'custom', message: 'Choose the exact variant head, or a new branch' });
    if (!value.variantId && !value.name)
      ctx.addIssue({ code: 'custom', message: 'Name the new native variant' });
  });
export type SaveHyperframesRevisionRequest = z.infer<typeof saveHyperframesRevisionRequestSchema>;
