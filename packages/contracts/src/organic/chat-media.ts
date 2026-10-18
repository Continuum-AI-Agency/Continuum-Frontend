// Media in the Organic agent chat: one typed strip per media tool result, built
// once on the Backend (runtime/chatMedia.ts) and rendered by the Frontend.
//
// A strip item carries a REF, never a URL: refs survive reload, URLs expire (a
// 1-hour signed URL persisted in a frame is a broken tile an hour later). The
// Frontend turns refs into short-lived tile URLs on view, one batched call per
// strip (CHAT_MEDIA_SIGN_ROUTE), and calls it again when a URL expires or fails.
// No transcripts, analyses or captions beyond a short label ride on an item.

import { z } from 'zod';

/** Budgets the strip is held to (asserted by organic:chat-media:bench). */
export const CHAT_MEDIA_STRIP_MAX_ITEMS = 24;
export const CHAT_MEDIA_ITEM_MAX_BYTES = 4 * 1024;
export const CHAT_MEDIA_THUMB_MAX_BYTES = 40 * 1024;
export const CHAT_MEDIA_PERSISTED_UI_CARDS_MAX_BYTES = 16 * 1024;
/** Tile edge the signer resizes to; matches CANVAS_MEDIA_PREVIEW_MAX_EDGE. */
export const CHAT_MEDIA_THUMB_EDGE = 480;
export const CHAT_MEDIA_LABEL_MAX_CHARS = 120;
export const CHAT_MEDIA_SIGN_MAX_REFS = 48;
export const CHAT_MEDIA_SIGN_TTL_SECONDS = 60 * 60;

/** POST { brandId, refs[] } → { items[] }. User JWT + brand access, like every organic route. */
export const CHAT_MEDIA_SIGN_ROUTE = '/api/organic/agent/media/sign';
/** GET ?t=<token>: a resized provider image (Instagram, TikTok, Unsplash …). Token-bound, no auth header. */
export const CHAT_MEDIA_THUMB_ROUTE = '/api/organic/agent/media/thumb';

export const chatMediaPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'unsplash',
]);
export type ChatMediaPlatform = z.infer<typeof chatMediaPlatformSchema>;

const id = z.string().min(1).max(160);

export const chatMediaRefSchema = z.discriminatedUnion('type', [
  /** A Library asset; versionId pins a version other than the head. */
  z
    .object({
      type: z.literal('library'),
      assetId: z.string().uuid(),
      versionId: z.string().uuid().optional(),
    })
    .strict(),
  /** A calendar draft's own media; slide picks a carousel frame (0 = cover). */
  z
    .object({
      type: z.literal('draft'),
      draftId: id,
      slide: z.number().int().min(0).max(19).optional(),
    })
    .strict(),
  /** The brand's own post on a platform. The provider URL stays server-side. */
  z
    .object({ type: z.literal('platform'), platform: chatMediaPlatformSchema, mediaId: id })
    .strict(),
  /** A competitor creative: an Instagram post (media id) or a Meta Ad Library snapshot (snapshot id). */
  z
    .object({ type: z.literal('competitor'), source: z.enum(['instagram', 'meta_ad']), id })
    .strict(),
  /** A headless output registered in the Library (a finished still). */
  z.object({ type: z.literal('headless'), assetId: z.string().uuid() }).strict(),
]);
export type ChatMediaRef = z.infer<typeof chatMediaRefSchema>;

/** Stable identity for a ref: the sign response's `key`, and a tile's React key. */
export function chatMediaRefKey(ref: ChatMediaRef): string {
  switch (ref.type) {
    case 'library':
      return `library:${ref.assetId}${ref.versionId ? `@${ref.versionId}` : ''}`;
    case 'draft':
      return `draft:${ref.draftId}${ref.slide ? `#${ref.slide}` : ''}`;
    case 'platform':
      return `platform:${ref.platform}:${ref.mediaId}`;
    case 'competitor':
      return `competitor:${ref.source}:${ref.id}`;
    case 'headless':
      return `headless:${ref.assetId}`;
  }
}

export const chatMediaKindSchema = z.enum(['image', 'video', 'carousel']);
export type ChatMediaKind = z.infer<typeof chatMediaKindSchema>;

const dimension = z.number().int().positive().nullable();

/** One tile. Strict: a URL, transcript or analysis field is a parse failure, not a passenger. */
export const chatMediaItemSchema = z
  .object({
    ref: chatMediaRefSchema,
    kind: chatMediaKindSchema,
    /** Source pixels when known; null when the provider does not say (Instagram). */
    w: dimension,
    h: dimension,
    durationMs: z.number().int().nonnegative().optional(),
    /** A public, non-expiring page for the media (instagram.com/p/…), never a CDN file URL. */
    permalink: z.string().url().max(512).optional(),
    label: z.string().max(CHAT_MEDIA_LABEL_MAX_CHARS).optional(),
  })
  .strict();
export type ChatMediaItem = z.infer<typeof chatMediaItemSchema>;

export const chatMediaStripDataSchema = z
  .object({
    /** The tool call this strip belongs to: one strip per call, keyed by it on reload. */
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    items: z.array(chatMediaItemSchema).min(1).max(CHAT_MEDIA_STRIP_MAX_ITEMS),
    /** How many media the tool found; above items.length the strip was capped. */
    total: z.number().int().nonnegative(),
  })
  .strict();
export type ChatMediaStripData = z.infer<typeof chatMediaStripDataSchema>;

export const uiMediaStripFrameSchema = z.object({
  type: z.literal('ui.media_strip'),
  data: chatMediaStripDataSchema,
});
export type UiMediaStripFrame = z.infer<typeof uiMediaStripFrameSchema>;

// --- Sign on view ---------------------------------------------------------------

export const chatMediaSignRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    refs: z.array(chatMediaRefSchema).min(1).max(CHAT_MEDIA_SIGN_MAX_REFS),
  })
  .strict();
export type ChatMediaSignRequest = z.infer<typeof chatMediaSignRequestSchema>;

export const chatMediaSignedItemSchema = z
  .object({
    /** chatMediaRefKey(ref) of the requested ref. */
    key: z.string().min(1),
    /**
     * A ≤480 px still for the tile (an image, or a video's poster), or null when there is
     * nothing to show without fetching an original. Either an absolute signed URL or a path
     * under CHAT_MEDIA_THUMB_ROUTE, which the client resolves against its API base.
     */
    thumbUrl: z.string().min(1).nullable(),
    /** Videos only: the poster for an opened player (the same ≤480 px still). */
    posterUrl: z.string().min(1).optional(),
    /** When the URLs stop working; sign again after it (or when a tile fails to load). */
    expiresAt: z.string().datetime(),
  })
  .strict();
export type ChatMediaSignedItem = z.infer<typeof chatMediaSignedItemSchema>;

export const chatMediaSignResponseSchema = z
  .object({
    /** One entry per requested ref, in request order; an unknown or foreign ref signs to thumbUrl null. */
    items: z.array(chatMediaSignedItemSchema),
  })
  .strict();
export type ChatMediaSignResponse = z.infer<typeof chatMediaSignResponseSchema>;
