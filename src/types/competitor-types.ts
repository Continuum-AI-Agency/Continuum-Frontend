import { z } from "zod";

import {
  competitorDashboardSchema,
  competitorPostSchema,
  competitorProfileSchema,
  competitorSavedProfileSchema,
  type CompetitorDashboard,
  type CompetitorPost as CompetitorPostType,
  type CompetitorProfile,
  type CompetitorSavedProfile,
} from "@/lib/schemas/competitors";

export const CompetitorInfoSchema = z.object({
  username: z.string(),
  fullName: z.string().optional(),
  biography: z.string().optional(),
  profilePicUrl: z.string().optional(),
  cacheAgeSeconds: z.number().int().nonnegative().optional(),
  lastScrapedAt: z.string().optional(),
  verified: z.boolean().optional(),
  igUserId: z.string().optional(),
});

export type CompetitorInfo = z.infer<typeof CompetitorInfoSchema>;
export type DashboardResponse = CompetitorDashboard;

// Legacy shapes kept for compatibility with reference components.
export const CompetitorPostsFilters = z.object({
  sort_by: z.string().optional(),
  time_range: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
});

export type CompetitorPostsFilters = z.infer<typeof CompetitorPostsFilters>;
export type CompetitorPost = CompetitorPostType;
export type ProfileData = CompetitorProfile;
export type SavedCompetitor = CompetitorSavedProfile;

export const CompetitorDashboardSchema = competitorDashboardSchema;
export const ProfileDataSchema = competitorProfileSchema;
export const DashboardPostSchema = competitorPostSchema;
