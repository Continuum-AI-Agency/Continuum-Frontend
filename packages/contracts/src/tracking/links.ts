import { z } from 'zod';

// Tracked links: the half of comment-to-DM that produces a number.
//
// A DM that sends someone a link proves nothing on its own. The click is the
// first moment a viewer becomes a lead, so the link has to carry, in itself,
// which post and which creative it came from — otherwise the report can say
// "62 clicks" but never "62 clicks from THAT video".
//
// Nothing here is Instagram-specific on purpose. A tracked link works the same
// in a DM, a caption, or a bio, and the DM feature is only its first caller.

/** Where a tracked link was placed. Widen deliberately — each value is a reporting bucket. */
export const trackedLinkPlacementSchema = z.enum([
  'instagram_dm',
  'instagram_comment_reply',
  'caption',
  'bio',
  'manual',
]);
export type TrackedLinkPlacement = z.infer<typeof trackedLinkPlacementSchema>;

/**
 * The code that appears in the URL. Fixed length so the route can reject
 * nonsense before touching the database, and case-sensitive base62 so it stays
 * short — 12 characters is ~3.2e21 possibilities, which is not enumerable.
 */
export const TRACKED_LINK_CODE_LENGTH = 12;
export const TRACKED_LINK_CODE_PATTERN = /^[0-9A-Za-z]{12}$/;
export const trackedLinkCodeSchema = z.string().regex(TRACKED_LINK_CODE_PATTERN);

/**
 * Where a tracked link may send someone.
 *
 * `z.string().url()` alone is not enough: it accepts `javascript:alert(1)` and
 * `data:text/html,...` as perfectly valid URLs, which would turn a link on our
 * own domain into a way to run someone else's script in a stranger's browser.
 * Embedded credentials are refused for the same family of reason — the host a
 * person reads in `https://real-site.example@evil.example/` is not the host
 * their browser goes to.
 *
 * Enforced here rather than only at the route so the Frontend refuses the same
 * input, at the moment someone types it, with the same rule.
 */
export const trackedLinkDestinationSchema = z
  .string()
  .url()
  .refine(
    (raw) => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return false;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return url.username === '' && url.password === '';
    },
    { message: 'destination must be an http(s) address with no embedded credentials' },
  );

export const trackedLinkSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  code: trackedLinkCodeSchema,
  /** Where the visitor ends up. Always absolute http(s) — see `trackedLinkDestinationSchema`. */
  destinationUrl: trackedLinkDestinationSchema,
  placement: trackedLinkPlacementSchema,
  /** The post this link was handed out from, when there is one. */
  platformPostId: z.string().min(1).nullable(),
  /** The creative behind that post, so clicks can roll up per asset. */
  assetId: z.string().uuid().nullable(),
  /** Free-form label for a human reading the report. */
  label: z.string().max(200).nullable(),
  createdAt: z.string(),
});
export type TrackedLink = z.infer<typeof trackedLinkSchema>;

export const createTrackedLinkRequestSchema = z.object({
  brandId: z.string().uuid(),
  destinationUrl: trackedLinkDestinationSchema,
  placement: trackedLinkPlacementSchema,
  platformPostId: z.string().min(1).optional(),
  assetId: z.string().uuid().optional(),
  label: z.string().max(200).optional(),
});
export type CreateTrackedLinkRequest = z.infer<typeof createTrackedLinkRequestSchema>;

export const createTrackedLinkResponseSchema = z.object({
  link: trackedLinkSchema,
  /** The full address to hand out. Built server-side so callers never assemble it. */
  url: z.string().url(),
});
export type CreateTrackedLinkResponse = z.infer<typeof createTrackedLinkResponseSchema>;

/** Clicks for one link, and for the post and creative it belongs to. */
export const trackedLinkStatsSchema = z.object({
  linkId: z.string().uuid(),
  code: trackedLinkCodeSchema,
  clicks: z.number().int().nonnegative(),
  firstClickAt: z.string().nullable(),
  lastClickAt: z.string().nullable(),
});
export type TrackedLinkStats = z.infer<typeof trackedLinkStatsSchema>;
