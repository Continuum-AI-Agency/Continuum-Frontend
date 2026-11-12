import { z } from 'zod';

/** Compatible API failure envelope; diagnostic details remain available to domain adapters. */
export const apiErrorPayloadSchema = z
  .object({
    message: z.string().optional(),
    code: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.unknown().optional(),
  })
  .passthrough();
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;
