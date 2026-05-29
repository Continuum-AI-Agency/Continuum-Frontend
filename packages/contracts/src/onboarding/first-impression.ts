import { z } from "zod";

/** Optional 1-line tagline emitted under the rich UX header. */
export const firstImpressionSchema = z.object({
  headline: z.string().min(1).max(210),
});
export type FirstImpression = z.infer<typeof firstImpressionSchema>;
