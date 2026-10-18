import { z } from 'zod';

export const mediaPreviewApprovalSchema = z
  .object({
    draftId: z.string().min(1),
    previewRevision: z.string().min(1),
    /** Re-paint the draft's copy into this Forge template instead of generating pixels. */
    templateKey: z.string().min(1).optional(),
  })
  .strict();

export type MediaPreviewApproval = z.infer<typeof mediaPreviewApprovalSchema>;
