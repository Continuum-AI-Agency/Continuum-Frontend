/**
 * The one Frontend config for how each organic platform is previewed and posted.
 *
 * Keyed by the contracts `PublishPlatform`, so a platform that gains a publisher and has no
 * entry here is a compile error. Before this existed, about ten hand-written lists stopped at
 * Instagram/Facebook/LinkedIn: a TikTok draft rendered "Preview for tiktok is coming soon",
 * never mounted its media, labelled itself "Instagram" and could not be posted — while the
 * backend TikTok publisher sat ready behind it.
 *
 * What a platform ACCEPTS (formats, carousel and caption limits, media transport) is not
 * repeated here; it lives in `PLATFORM_CAPABILITIES` in `@continuum/contracts`.
 */
import { type PublishPlatform, publishPlatformSchema, supportsFormat } from '@continuum/contracts';

export type PostPreviewFrame = 'phone' | 'feed' | 'desktop';

export type PostPlatformConfig = {
  label: string;
  abbr: string;
  color: string;
  gradient: [string, string];
  /** Which shared preview chrome the platform renders in (`SocialPostFrame`). */
  frame: PostPreviewFrame;
  /** Placeholder canvas size; its ratio is the preview's still-media aspect. */
  mediaTemplate: { width: number; height: number };
  /** Preview aspect for a reel/video. */
  reelAspect: number;
  /** Public URL of a published post, for platforms whose post id alone forms one. */
  permalink?: (postId: string) => string;
};

export const POST_PLATFORMS: Readonly<Record<PublishPlatform, PostPlatformConfig>> = {
  instagram: {
    label: 'Instagram',
    abbr: 'IG',
    color: '#E1306C',
    gradient: ['#E1306C', '#833AB4'],
    frame: 'phone',
    mediaTemplate: { width: 1080, height: 1080 },
    reelAspect: 4 / 5,
    permalink: (postId) => `https://www.instagram.com/p/${postId}/`,
  },
  facebook: {
    label: 'Facebook',
    abbr: 'FB',
    color: '#1877F2',
    gradient: ['#1877F2', '#0550AE'],
    frame: 'feed',
    mediaTemplate: { width: 1080, height: 1080 },
    reelAspect: 4 / 5,
  },
  linkedin: {
    label: 'LinkedIn',
    abbr: 'LI',
    color: '#0A66C2',
    gradient: ['#0A66C2', '#004182'],
    frame: 'desktop',
    mediaTemplate: { width: 1200, height: 628 },
    reelAspect: 4 / 5,
  },
  tiktok: {
    label: 'TikTok',
    abbr: 'TT',
    color: '#69C9D0',
    gradient: ['#69C9D0', '#010101'],
    frame: 'phone',
    mediaTemplate: { width: 1080, height: 1920 },
    reelAspect: 9 / 16,
  },
  youtube: {
    label: 'YouTube',
    abbr: 'YT',
    color: '#FF0000',
    gradient: ['#FF0000', '#CC0000'],
    frame: 'phone',
    mediaTemplate: { width: 1080, height: 1920 },
    reelAspect: 9 / 16,
  },
};

/** Every platform the planner can preview and post to, in canonical order. */
export const ORGANIC_POST_PLATFORM_KEYS = publishPlatformSchema.options;

export function isPostPlatform(value: string | null | undefined): value is PublishPlatform {
  return (ORGANIC_POST_PLATFORM_KEYS as readonly string[]).includes(value ?? '');
}

export function postPlatformLabel(value: string): string {
  return isPostPlatform(value) ? POST_PLATFORMS[value].label : value;
}

const POST_FORMATS = [
  { option: 'Post', format: 'POST' },
  { option: 'Carousel', format: 'CAROUSEL' },
  { option: 'Reel', format: 'REEL' },
] as const;

export type PostFormatOption = (typeof POST_FORMATS)[number]['option'];

/** The formats every one of `platforms` can publish — one post goes out on all of them. */
export function postFormatOptions(platforms: readonly string[]): PostFormatOption[] {
  const publishable = platforms.filter(isPostPlatform);
  return POST_FORMATS.filter(({ format }) =>
    publishable.every((platform) => supportsFormat(platform, format)),
  ).map(({ option }) => option);
}
