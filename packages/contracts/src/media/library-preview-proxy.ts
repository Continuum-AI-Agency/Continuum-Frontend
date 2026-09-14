import { z } from 'zod';

/** Backend asks Continuum-Render for an H.264 proxy of an MXF / unplayable MOV. */
export const libraryPreviewProxyRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
  })
  .strict();
export type LibraryPreviewProxyRequest = z.infer<typeof libraryPreviewProxyRequestSchema>;

export const libraryPreviewProxyResponseSchema = z
  .object({
    state: z.enum(['ready', 'awaiting_companion', 'failed', 'skipped']),
    signedUrl: z.string().nullable(),
    errorCode: z.string().nullable().optional(),
  })
  .strict();
export type LibraryPreviewProxyResponse = z.infer<typeof libraryPreviewProxyResponseSchema>;
