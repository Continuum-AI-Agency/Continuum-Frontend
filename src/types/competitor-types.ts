import { z } from "zod";

import {
  competitorDashboardSchema,
  competitorPostSchema,
  competitorProfileSchema,
  type CompetitorDashboard,
  type CompetitorPost as CompetitorPostType,
  type CompetitorProfile,
} from "@/lib/schemas/competitors";

export type DashboardResponse = CompetitorDashboard;
export type CompetitorInfo = {
  username: string;
  full_name?: string;
  biography?: string;
  profile_pic_url?: string;
  cache_age_seconds?: number;
};

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

export const CompetitorDashboardSchema = competitorDashboardSchema;
export const ProfileDataSchema = competitorProfileSchema;
export const DashboardPostSchema = competitorPostSchema;
