import { z } from 'zod';

export const mediaPreviewApprovalSchema = z
  .object({
    draftId: z.string().min(1),
    previewRevision: z.string().min(1),
  })
  .strict();

export type MediaPreviewApproval = z.infer<typeof mediaPreviewApprovalSchema>;
