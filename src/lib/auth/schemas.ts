import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().email("Invalid email address"),
  redirectTo: z.string().min(1).optional(),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
