import { z } from 'zod';

export const templateRevisionRefSchema = z
  .object({
    templateId: z.string().uuid(),
    variantId: z.string().uuid(),
    revisionId: z.string().uuid(),
  })
  .strict();
export type TemplateRevisionRef = z.infer<typeof templateRevisionRefSchema>;

export const templateRevisionPinSchema = templateRevisionRefSchema
  .extend({
    sourceAssetId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    checksum: z.string().regex(/^(sha256:)?[0-9a-f]{64}$/i),
    templateKey: z.string().min(1),
    bindingId: z.string().uuid(),
    contractHash: z.string().min(1),
    capturedFromLegacy: z.boolean().default(false),
  })
  .strict();
export type TemplateRevisionPin = z.infer<typeof templateRevisionPinSchema>;
