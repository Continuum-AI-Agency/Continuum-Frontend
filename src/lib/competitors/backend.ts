import { z } from "zod";

import {
  competitorDashboardSchema,
  competitorPostSchema,
  competitorProfileSchema,
  competitorSavedProfileSchema,
  type CompetitorDashboard,
  type CompetitorSavedProfile,
} from "@/lib/schemas/competitors";

const backendMediaCandidateSchema = z
  .object({
    url: z.string().optional(),
    media_url: z.string().optional(),
    mediaUrl: z.string().optional(),
    display_url: z.string().optional(),
    displayUrl: z.string().optional(),
    src: z.string().optional(),
    source: z.string().optional(),
    thumbnail_url: z.string().optional(),
    thumbnailUrl: z.string().optional(),
  })
  .passthrough();

const backendMediaItemSchema = z.union([z.string(), backendMediaCandidateSchema]);

function normalizeMediaUrl(item: z.infer<typeof backendMediaItemSchema>): string | undefined {
  if (typeof item === "string") {
    const trimmed = item.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  let candidate =
    item.media_url ??
    item.mediaUrl ??
    item.url ??
    item.display_url ??
    item.displayUrl ??
    item.src ??
    item.source ??
    item.thumbnail_url ??
    item.thumbnailUrl;

  if (typeof candidate !== "string") {
    const fallbackCandidate = Object.values(item).find(
      (value): value is string => typeof value === "string" && value.startsWith("http")
    );
    candidate = fallbackCandidate;
  }

  if (typeof candidate !== "string") return undefined;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMediaList(list: Array<z.infer<typeof backendMediaItemSchema>> | null | undefined): string[] | undefined {
  if (!list?.length) return undefined;
  const normalized = list.map(normalizeMediaUrl).filter((value): value is string => Boolean(value));
  return normalized.length ? normalized : undefined;
}

const backendPostSchema = z.object({
  id: z.string(),
  caption: z.string().nullish(),
  hashtags: z.array(z.string()).nullish(),
  media_urls: z.array(backendMediaItemSchema).nullish(),
  carousel_items: z.array(backendMediaItemSchema).nullish(),
  shortcode: z.string().nullish(),
  product_type: z.string().nullish(),
  type: z.string().nullish(),
  likes_count: z.number().int().nonnegative().nullish(),
  comments_count: z.number().int().nonnegative().nullish(),
  views: z.number().int().nonnegative().nullish(),
  is_pinned: z.boolean().nullish(),
  timestamp: z.string(),
});

const backendProfileSchema = z.object({
  username: z.string(),
  biography: z.string().nullish(),
  followers_count: z.number().int().nonnegative().nullish(),
  profile_pic_url: z.string().nullish(),
  verified: z.boolean().nullish(),
  full_name: z.string().nullish(),
  cache_age_seconds: z.number().int().nonnegative().nullish(),
});

const backendSavedCompetitorSchema = z.object({
  username: z.string(),
  biography: z.string().nullish(),
  profile_pic_url: z.string().nullish(),
  full_name: z.string().nullish(),
  cache_age_seconds: z.number().int().nonnegative().nullish(),
});

const backendDashboardSchema = z.object({
  status: z.enum(["success", "scraping", "error"]).or(z.string()),
  message: z.string().nullish(),
  cache_age_seconds: z.number().int().nonnegative().nullish(),
  profile: backendProfileSchema.nullish(),
  posts: z.array(backendPostSchema).nullish(),
});

function mapPost(input: z.infer<typeof backendPostSchema>) {
  return competitorPostSchema.parse({
    id: input.id,
    caption: input.caption ?? undefined,
    hashtags: input.hashtags ?? undefined,
    mediaUrls: normalizeMediaList(input.media_urls),
    carouselItems: normalizeMediaList(input.carousel_items),
    shortCode: input.shortcode ?? undefined,
    productType: input.product_type ?? undefined,
    type: input.type ?? undefined,
    likesCount: input.likes_count ?? 0,
    commentsCount: input.comments_count ?? 0,
    views: input.views ?? undefined,
    isPinned: input.is_pinned ?? false,
    timestamp: input.timestamp,
  });
}

function mapProfile(input: z.infer<typeof backendProfileSchema>) {
  return competitorProfileSchema.parse({
    username: input.username,
    biography: input.biography ?? undefined,
    followersCount: input.followers_count ?? 0,
    profilePicUrl: input.profile_pic_url ?? undefined,
    verified: input.verified ?? false,
    fullName: input.full_name ?? undefined,
  });
}

export function mapSavedCompetitor(input: unknown): CompetitorSavedProfile {
  const parsed = backendSavedCompetitorSchema.parse(input);
  return competitorSavedProfileSchema.parse({
    username: parsed.username,
    biography: parsed.biography ?? undefined,
    profilePicUrl: parsed.profile_pic_url ?? undefined,
    fullName: parsed.full_name ?? undefined,
    cacheAgeSeconds: parsed.cache_age_seconds ?? undefined,
  });
}

export function mapDashboardResponse(payload: unknown): CompetitorDashboard {
  const parsed = backendDashboardSchema.parse(payload);

  if (parsed.status === "error") {
    return competitorDashboardSchema.parse({
      status: "error",
      message: parsed.message ?? "Unable to load competitor data",
      cacheAgeSeconds: parsed.cache_age_seconds ?? undefined,
      profile: parsed.profile ? mapProfile(parsed.profile) : undefined,
      posts: [],
    });
  }

  if (parsed.status === "scraping") {
    return competitorDashboardSchema.parse({
      status: "scraping",
      message: parsed.message ?? undefined,
      cacheAgeSeconds: parsed.cache_age_seconds ?? undefined,
      profile: parsed.profile ? mapProfile(parsed.profile) : undefined,
      posts: [],
    });
  }

  return competitorDashboardSchema.parse({
    status: "success",
    message: parsed.message ?? undefined,
    cacheAgeSeconds: parsed.cache_age_seconds ?? undefined,
    profile: parsed.profile ? mapProfile(parsed.profile) : undefined,
    posts: (parsed.posts ?? []).map(mapPost),
  });
}
