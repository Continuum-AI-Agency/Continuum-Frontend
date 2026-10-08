// TikTok Marketing (Business) API v1.3 response envelope, shared by the TikTok ingest, the
// applier and its bench. The envelope is already hand-written three times in the Backend
// (integrations-ts/src/tiktok.ts and two siblings); this is the one to import instead of
// writing a fourth. Design: docs/optimizer-multiplatform/tiktok.html §1 and §3.6.

import { z } from 'zod';

export const TIKTOK_MARKETING_API_VERSION = 'v1.3' as const;

/** `code === 0` is success. `request_id` is what TikTok support asks for, and the only
 *  receipt a write returns — it never echoes the prior value. */
export function tikTokEnvelopeOf<Data extends z.ZodTypeAny>(data: Data) {
  return z.union([
    z.object({ code: z.literal(0), message: z.string(), request_id: z.string(), data }),
    z.object({
      code: z
        .number()
        .int()
        .refine((code) => code !== 0, 'a failure has a non-zero code'),
      message: z.string(),
      request_id: z.string(),
      // On failure TikTok sends `{}` or nothing; nothing in it is trusted.
      data: z.unknown().optional(),
    }),
  ]);
}

export const TikTokEnvelopeSchema = tikTokEnvelopeOf(z.unknown());
export type TikTokEnvelope = z.infer<typeof TikTokEnvelopeSchema>;
