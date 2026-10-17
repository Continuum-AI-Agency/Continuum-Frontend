import { z } from 'zod';
import { httpUrlSchema } from './_shared';
import { instagramProfileSchema } from './instagram';
import { scrapeSchema } from './scrape';

export const onboardingIntakeSchema = z
  .object({
    kind: z.enum(['website', 'instagram', 'facebook', 'documents', 'description']),
    brand_name: z.string().trim().min(1),
    url: httpUrlSchema.nullable().default(null),
    reference_url: httpUrlSchema.nullable().optional(),
    description: z.string().trim().min(1).max(8000).nullable().default(null),
  })
  .superRefine((input, ctx) => {
    if (['website', 'instagram', 'facebook'].includes(input.kind) && !input.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Enter a website or profile URL.' });
    }
    if (input.kind === 'description' && !input.description) {
      ctx.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Tell us what your business does.',
      });
    }
    if (input.url && (input.kind === 'instagram' || input.kind === 'facebook')) {
      const social = onboardingSocialInputSchema.safeParse(input.url);
      if (!social.success || social.data.kind !== input.kind)
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: 'Use a profile URL for the selected platform.',
        });
    }
  });
export type OnboardingIntake = z.infer<typeof onboardingIntakeSchema>;

export const onboardingSocialInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .transform((raw, ctx) => {
    const input = raw.startsWith('@') ? `https://www.instagram.com/${raw.slice(1)}/` : raw;
    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (url.username || url.password || (url.port && url.port !== '443'))
        throw new Error('Invalid profile URL');
      const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
      const segments = url.pathname.split('/').filter(Boolean);
      if (
        host === 'instagram.com' &&
        segments.length === 1 &&
        /^[a-z0-9._]{1,30}$/i.test(segments[0]) &&
        !['p', 'reel', 'reels', 'tv', 'stories', 'accounts', 'explore'].includes(
          segments[0].toLowerCase(),
        )
      ) {
        return {
          kind: 'instagram' as const,
          url: `https://www.instagram.com/${segments[0].toLowerCase()}/`,
        };
      }
      if (
        host === 'facebook.com' &&
        segments.length > 0 &&
        !segments.some((part) =>
          [
            'groups',
            'posts',
            'reel',
            'reels',
            'videos',
            'photos',
            'watch',
            'login',
            'checkpoint',
            'dialog',
            'share',
            'story.php',
          ].includes(part.toLowerCase()),
        )
      ) {
        url.protocol = 'https:';
        url.hostname = 'www.facebook.com';
        url.hash = '';
        const pageId = url.searchParams.get('id');
        url.search = '';
        if (url.pathname === '/profile.php' && pageId && /^\d+$/.test(pageId))
          url.searchParams.set('id', pageId);
        return { kind: 'facebook' as const, url: url.toString() };
      }
    } catch {
      /* Invalid URLs are reported with the same actionable message. */
    }
    ctx.addIssue({
      code: 'custom',
      message: 'Enter an Instagram profile or Facebook business Page URL.',
    });
    return z.NEVER;
  });

export const facebookPageProfileSchema = z.object({
  url: httpUrlSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  image_url: httpUrlSchema.nullable(),
  fetched_at: z.string().datetime(),
  source: z.literal('public_page'),
});
export type FacebookPageProfile = z.infer<typeof facebookPageProfileSchema>;

export const onboardingSourceResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('web'), via: z.string(), scrape: scrapeSchema }),
  z.object({
    kind: z.literal('instagram'),
    via: z.string(),
    instagram_profile: instagramProfileSchema,
  }),
  z.object({
    kind: z.literal('facebook'),
    via: z.string(),
    facebook_profile: facebookPageProfileSchema,
  }),
]);
export type OnboardingSourceResponse = z.infer<typeof onboardingSourceResponseSchema>;

export const onboardingPreviewEvidenceSchema = z.object({
  preview_run_id: z.string().uuid().nullable().optional(),
  intake: onboardingIntakeSchema.nullable().optional(),
  instagram_profile: instagramProfileSchema.nullable().optional(),
  facebook_profile: facebookPageProfileSchema.nullable().optional(),
  document_ids: z.array(z.string().uuid()).max(100).optional(),
});
export type OnboardingPreviewEvidence = z.infer<typeof onboardingPreviewEvidenceSchema>;
