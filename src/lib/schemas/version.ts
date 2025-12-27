import { z } from "zod";

export const versionResponseSchema = z.object({
  sha: z.string().min(1),
});

export type VersionResponse = z.infer<typeof versionResponseSchema>;
