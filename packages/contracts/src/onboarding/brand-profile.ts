import { z } from "zod";
import { httpUrlSchema } from "./_shared";
import { brandVoiceSchema } from "./brand-voice";
import { targetAudienceSchema } from "./target-audience";

export const brandProfileSchema = z
  .object({
    id: z.string().min(1),
    brand_name: z.string().min(1),
    description: z.string().nullable().optional(),
    brand_voice: brandVoiceSchema.nullable().optional(),
    target_audience: targetAudienceSchema.nullable().optional(),
    website_url: httpUrlSchema.nullable().optional(),
  })
  .loose();
export type BrandProfile = z.infer<typeof brandProfileSchema>;
