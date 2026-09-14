import { z } from 'zod';

export const templateRebindSlotSchema = z
  .object({
    slotKey: z.string().min(1),
    kind: z.string().min(1),
    status: z.enum(['bound', 'missing', 'new', 'ambiguous']),
    previousKind: z.string().min(1).optional(),
    name: z.string().optional(),
  })
  .strict();
export type TemplateRebindSlot = z.infer<typeof templateRebindSlotSchema>;

export const templateRebindPreviewSchema = z
  .object({
    assetId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    versionId: z.string().uuid(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    slots: z.array(templateRebindSlotSchema),
    requiresReview: z.boolean(),
  })
  .strict();
export type TemplateRebindPreview = z.infer<typeof templateRebindPreviewSchema>;

export const templateRebindConfirmSchema = z
  .object({
    brandId: z.string().uuid(),
    versionId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    expectedChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    acceptMissing: z.boolean().default(false),
  })
  .strict();
export type TemplateRebindConfirm = z.infer<typeof templateRebindConfirmSchema>;
