import { z } from "zod";

const tolerantIso = z
  .string()
  .transform((value, ctx) => {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Expected ISO timestamp" });
      return z.NEVER;
    }
    return normalized;
  });

export const competitorPostSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string()).optional(),
  carouselItems: z.array(z.string()).optional(),
  shortCode: z.string().optional(),
  productType: z.string().optional(),
  type: z.string().optional(),
  likesCount: z.number().int().nonnegative().default(0),
  commentsCount: z.number().int().nonnegative().default(0),
  views: z.number().int().nonnegative().optional(),
  isPinned: z.boolean().optional(),
  timestamp: tolerantIso,
});

export const competitorProfileSchema = z.object({
  username: z.string(),
  biography: z.string().optional(),
  followersCount: z.number().int().nonnegative().default(0),
  profilePicUrl: z.string().optional(),
  verified: z.boolean().optional(),
});

export const competitorDashboardSchema = z.object({
  status: z.enum(["success", "scraping", "error"]),
  message: z.string().optional(),
  cacheAgeSeconds: z.number().int().nonnegative().optional(),
  profile: competitorProfileSchema.optional(),
  posts: z.array(competitorPostSchema).default([]),
});

export type CompetitorPost = z.infer<typeof competitorPostSchema>;
export type CompetitorProfile = z.infer<typeof competitorProfileSchema>;
export type CompetitorDashboard = z.infer<typeof competitorDashboardSchema>;

export const competitorSavedProfileSchema = z.object({
  username: z.string(),
  fullName: z.string().optional(),
  biography: z.string().optional(),
  profilePicUrl: z.string().optional(),
  cacheAgeSeconds: z.number().int().nonnegative().optional(),
});

export type CompetitorSavedProfile = z.infer<typeof competitorSavedProfileSchema>;
