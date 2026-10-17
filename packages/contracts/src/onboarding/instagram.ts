import { z } from 'zod';

export const instagramErrorCodeSchema = z.enum([
  'instagram_not_business',
  'instagram_not_found',
  'instagram_private',
  'instagram_rate_limited',
  'instagram_token_invalid',
  'instagram_token_unavailable',
  'instagram_unknown',
]);
export type InstagramErrorCode = z.infer<typeof instagramErrorCodeSchema>;

export const instagramMediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']);

export const instagramChildSchema = z.object({
  id: z.string().min(1),
  media_type: instagramMediaTypeSchema.optional().nullable(),
  media_url: z.string().optional().nullable(),
});

export const onboardingInstagramPostSchema = z.object({
  id: z.string().min(1),
  caption: z.string().optional().nullable(),
  permalink: z.string().optional().nullable(),
  timestamp: z.string().optional().nullable(),
  media_type: instagramMediaTypeSchema.optional().nullable(),
  media_url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  like_count: z.number().int().nonnegative().optional().nullable(),
  comments_count: z.number().int().nonnegative().optional().nullable(),
  children: z.array(instagramChildSchema).optional().nullable(),
});
export type OnboardingInstagramPost = z.infer<typeof onboardingInstagramPostSchema>;

export const instagramProfileSourceSchema = z.enum(['business_discovery', 'og_scrape']);

export const instagramProfileSchema = z.object({
  handle: z.string().min(1),
  url: z.string().min(1),
  source: instagramProfileSourceSchema,
  fetched_at: z.string().datetime(),

  // Business Discovery fields (all optional so OG-scrape fallback still validates).
  id: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  followers_count: z.number().int().nonnegative().optional().nullable(),
  follows_count: z.number().int().nonnegative().optional().nullable(),
  media_count: z.number().int().nonnegative().optional().nullable(),
  profile_picture_url: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  recent_posts: z.array(onboardingInstagramPostSchema).optional().default([]),

  // OG-scrape-specific fields.
  og_title: z.string().optional().nullable(),
  og_description: z.string().optional().nullable(),
  og_image: z.string().optional().nullable(),
});
export type InstagramProfile = z.infer<typeof instagramProfileSchema>;

export function hasInstagramBrandContext(profile: InstagramProfile | null | undefined): boolean {
  if (profile?.biography?.trim() || profile?.recent_posts.some((post) => post.caption?.trim()))
    return true;
  const description = profile?.og_description?.trim();
  return Boolean(
    description &&
      !/^(?:Instagram|Log in|Sign up|Welcome back)|log (?:in|into) Instagram|sign up .*Instagram|Instagram photos and videos/i.test(
        description,
      ),
  );
}
