/**
 * The publish plan: exactly what a platform will receive for a draft, decided ONCE.
 *
 * Before this, three resolvers decided a draft's format (the publish-now body builder, the
 * scheduled publisher and the approve gate), staging picked media by its own precedence, the
 * preview picked media by another, and the caption was clamped where nobody could see it.
 * The preview could show a carousel the publisher sent as one image, tags the wire dropped,
 * and a network the row did not hold.
 *
 * `resolvePublishPlan` is pure and browser-safe. The planner preview renders the plan, the
 * readiness gate and the backend's approve/publish/scheduler gate all call
 * `checkPublishability(plan)`, and the backend publisher stages and sends the plan's media in
 * the plan's order — so what the user sees and what goes out cannot disagree.
 */
import { z } from 'zod';
import {
  assembleCaption,
  assemblePlatformCaption,
  type HashtagTiers,
} from '../media/instagram-caption';
import {
  matchPublishFormat,
  type PublishOptions,
  savedPublishOptions,
  unsupportedPublishOptions,
} from './publish-body';
import {
  PLATFORM_CAPABILITIES,
  type PublishFormat,
  type PublishPlatform,
  publishFormatSchema,
  publishPlatformSchema,
  supportsFormat,
} from './publishing';

// ── Input ─────────────────────────────────────────────────────────────────────

/** A realized `publishingAssets` entry — what the planner writes when a user attaches media. */
export interface PublishPlanAsset {
  role: string;
  kind: 'image' | 'video';
  slideIndex: number | null;
  assetId: string | null;
  bucket: string | null;
  storagePath: string | null;
  storageUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

export interface PublishPlanGeneratedSlide {
  order: number | null;
  url: string | null;
  assetUrl: string | null;
  signedUrl: string | null;
  assetBase64: string | null;
  bucket: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

/** The headless generation record (`creative.mediaSuggestion`), reduced to what can publish. */
export interface PublishPlanMediaSuggestion {
  mediaStatus: string | null;
  url: string | null;
  assetUrl: string | null;
  signedUrl: string | null;
  assetBase64: string | null;
  bucket: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  assets: ReadonlyArray<PublishPlanGeneratedSlide>;
  reel: {
    url: string | null;
    bucket: string | null;
    signedUrl: string | null;
    thumbnailUrl: string | null;
    mimeType: string | null;
  } | null;
  hyperframe: {
    mp4Path: string | null;
    mp4Url: string | null;
    mp4Bucket: string | null;
    mp4Status: 'pending' | 'ready' | 'failed' | null;
    coverPath: string | null;
    coverImageUrl: string | null;
    bucket: string | null;
  } | null;
}

export interface PublishPlanDraft {
  id: string;
  /** Format spellings, freshest first. The first one that names a format wins. */
  formats: ReadonlyArray<string | null | undefined>;
  caption: string | null;
  hashtags: HashtagTiers | null;
  publishingAssets: ReadonlyArray<PublishPlanAsset>;
  mediaSuggestion: PublishPlanMediaSuggestion | null;
  /** `content_json.publishOptions`: one saved block per destination platform. */
  savedPublishOptions: unknown;
}

/**
 * One account a brand can post to — what `GET /api/organic/publish-accounts` lists and the dry run
 * returns. `id` is the integration-account UUID, the id space of `platform_account_id`. Posting
 * asset types only (no ad accounts), de-duplicated by the platform's own account id.
 */
export const publishAccountCandidateSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** The connection's token expired or was revoked: shown, never selectable, never published to. */
  needsReauth: z.boolean(),
  /** The brand's default account for this platform: new drafts are stamped with it. */
  isDefault: z.boolean(),
  /**
   * The same account linked a second time (a "twin": connected through two logins), each link
   * with its own reconnect state. The list shows the account once; a draft stamped with a twin's
   * id is still THIS account — match a stamp against `id` or any alias id.
   */
  aliases: z.array(z.object({ id: z.string(), needsReauth: z.boolean() })).optional(),
});
export type PublishAccountCandidate = z.infer<typeof publishAccountCandidateSchema>;

/** What the account resolver reads of a candidate. A full `PublishAccountCandidate` fits. */
export interface PublishPlanAccountCandidate {
  /** Integration-account UUID — the id space of `platform_account_id`. */
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  needsReauth?: boolean;
  aliases?: ReadonlyArray<{ id: string; needsReauth: boolean }>;
}

/**
 * The candidate a stamp names — by its id or a twin's — and whether THAT link needs reconnecting:
 * a publish goes through the stamped link's own token, so a dead twin is dead even when the
 * account's other link is live.
 */
export function findStampedCandidate<T extends PublishPlanAccountCandidate>(
  accounts: ReadonlyArray<T>,
  stamp: string,
): { candidate: T; needsReauth: boolean } | null {
  for (const candidate of accounts) {
    if (candidate.id === stamp) return { candidate, needsReauth: candidate.needsReauth === true };
    const alias = candidate.aliases?.find((twin) => twin.id === stamp);
    if (alias) return { candidate, needsReauth: alias.needsReauth };
  }
  return null;
}

export interface PublishPlanAccountInput {
  /**
   * The draft's ONE stamp, `platform_account_id`. A publish goes to exactly this account: no
   * request names another, and nothing swaps it for "the brand's only account" at publish time.
   */
  boundAccountId: string | null;
  /**
   * The brand's candidates for the platform. Null means "not loaded" and trusts the stamp — a
   * backend gate always loads them.
   */
  accounts: ReadonlyArray<PublishPlanAccountCandidate> | null;
}

/** Media a non-persisted (inline) publish carried in its request. The lowest precedence. */
export interface PublishPlanRequestMedia {
  imageUrl: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  items: ReadonlyArray<{ imageUrl?: string; videoUrl?: string }>;
}

export interface PublishPlanInput {
  draft: PublishPlanDraft;
  platform: PublishPlatform;
  account: PublishPlanAccountInput;
  /** Options named for THIS publish; null takes the draft's saved block for the platform. */
  publishOptions: PublishOptions | null;
  /**
   * Whether the media came out of a generation pipeline (the backend reads the library's
   * provenance). Null derives it from the plan's own media sources.
   */
  mediaGenerated: boolean | null;
  /** Backend inline path only. */
  requestMedia?: PublishPlanRequestMedia | null;
}

// ── Output ────────────────────────────────────────────────────────────────────

export const publishPlanVerbSchema = z.enum(['post', 'text', 'reel', 'carousel', 'story']);
export type PublishPlanVerb = z.infer<typeof publishPlanVerbSchema>;

export const publishPlanMediaSourceSchema = z.enum([
  'publishing_asset',
  'generated',
  'reel',
  'hyperframe',
  'inline',
  'request',
]);

export const publishPlanMediaSchema = z.object({
  kind: z.enum(['image', 'video']),
  source: publishPlanMediaSourceSchema,
  assetId: z.string().nullable(),
  bucket: z.string().nullable(),
  /** A durable object path. Staging signs `bucket` + `storagePath`; it wins over `url`. */
  storagePath: z.string().nullable(),
  /** A URL already held: the asset's signed URL, a generated URL, a data: URI, a request URL. */
  url: z.string().nullable(),
  mimeType: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  slideIndex: z.number().nullable(),
});
export type PublishPlanMedia = z.infer<typeof publishPlanMediaSchema>;

export const publishPlanCoverSchema = z.object({
  source: z.enum(['chosen_url', 'chosen_frame', 'hyperframe', 'publishing_asset', 'request']),
  url: z.string().nullable(),
  bucket: z.string().nullable(),
  storagePath: z.string().nullable(),
  offsetMs: z.number().nullable(),
});
export type PublishPlanCover = z.infer<typeof publishPlanCoverSchema>;

export const publishPlanAccountSchema = z.object({
  /**
   * `resolved` — the stamp is one of the brand's candidates and is connected.
   * `missing` — no account is chosen (or the brand has none connected).
   * `foreign` — the stamp is not one of the brand's candidates for this platform.
   * `needs_reauth` — the stamp is a candidate whose connection must be renewed.
   */
  status: z.enum(['resolved', 'missing', 'foreign', 'needs_reauth']),
  /** The stamp, whatever its status; null only when `missing`. */
  id: z.string().nullable(),
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  candidateCount: z.number().nullable(),
  /** Why it cannot publish, naming the account and the choices. Null when `resolved`. */
  message: z.string().nullable(),
});
export type PublishPlanAccount = z.infer<typeof publishPlanAccountSchema>;

export const publishPlanNoticeSchema = z.object({
  code: z.enum([
    'hashtags_dropped',
    'caption_not_sent',
    'media_not_sent',
    'aspect_out_of_range',
    'cover_platform_default',
    'platform_defaults',
  ]),
  message: z.string(),
  target: z.enum(['caption', 'media', 'cover', 'options', 'account']),
});
export type PublishPlanNotice = z.infer<typeof publishPlanNoticeSchema>;

export const publishPlanSchema = z.object({
  draftId: z.string(),
  platform: publishPlatformSchema,
  format: publishFormatSchema,
  verb: publishPlanVerbSchema,
  account: publishPlanAccountSchema,
  caption: z.object({
    /** Exactly the wire string; null when nothing is sent. */
    text: z.string().nullable(),
    body: z.string(),
    keptHashtags: z.array(z.string()),
    droppedHashtags: z.array(z.string()),
    truncated: z.boolean(),
    truncatedAt: z.number().nullable(),
    limit: z.number(),
    hashtagLimit: z.number(),
    length: z.number(),
  }),
  /** In sent order. Empty for a text post, and for a draft whose media is not there yet. */
  media: z.array(publishPlanMediaSchema),
  /**
   * Why `media` is empty when it is: a generation in flight or a hyperframe still rendering.
   * Null otherwise.
   */
  mediaPending: z.enum(['generating', 'hyperframe_rendering']).nullable(),
  /** Only a cover the platform actually receives; null means the platform picks the frame. */
  cover: publishPlanCoverSchema.nullable(),
  options: z.object({
    firstComment: z.string().nullable(),
    trial: z.object({ graduationStrategy: z.enum(['MANUAL', 'SS_PERFORMANCE']) }).nullable(),
    shareToFeed: z.boolean().nullable(),
    /** Null when the platform has no field for the label on this format. */
    aiGenerated: z.boolean().nullable(),
    altText: z.string().nullable(),
    youtube: z
      .object({
        title: z.string(),
        privacyStatus: z.literal('public'),
        selfDeclaredMadeForKids: z.literal(false),
      })
      .nullable(),
    tiktok: z
      .object({
        /**
         * Photo posts only; video posts carry none. Requested, not guaranteed: an account TikTok
         * restricts posts at the widest level it permits (`resolvePrivacyLevel`).
         */
        privacyLevel: z.literal('PUBLIC_TO_EVERYONE').nullable(),
        isBrandOrganic: z.literal(false),
        isBrandedContent: z.literal(false),
      })
      .nullable(),
  }),
  /** Every way what goes out differs from what the user typed or attached. */
  notices: z.array(publishPlanNoticeSchema),
  /** Options asked for that the platform cannot honour for this format. They block. */
  unsupportedOptions: z.array(z.enum(['firstComment', 'thumbnail', 'trial'])),
});
export type PublishPlan = z.infer<typeof publishPlanSchema>;

export const publishPlanIssueSchema = z.object({
  reason: z.enum([
    'unsupported_format',
    'media_missing',
    'hyperframe_mp4_not_ready',
    'caption_missing',
    'caption_too_long',
    'account_missing',
  ]),
  message: z.string(),
  fix: z.enum(['caption', 'media', 'account', 'format', 'cover', 'options']),
});
export type PublishPlanIssue = z.infer<typeof publishPlanIssueSchema>;

export interface PublishPlanVerdict {
  publishable: boolean;
  blockers: PublishPlanIssue[];
  warnings: PublishPlanIssue[];
}

// ── Row adapter ───────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The draft's format spellings, freshest first. Four writers spell it and no row carries all
 * four: the browser autosave + canvas attach (`slot_data.draftSnapshot.format`), the
 * generator (`content.format`, then `content.type` when format degraded to `'Text'`), and the
 * MCP stub (`slot_data.format`, written once at creation and never updated).
 */
export function draftFormatCandidates(row: {
  content_json?: unknown;
  slot_data?: unknown;
}): string[] {
  const slotData = asRecord(row.slot_data);
  const content = asRecord(asRecord(row.content_json)['content']);
  return [
    asRecord(slotData['draftSnapshot'])['format'],
    content['format'],
    content['type'],
    slotData['format'],
  ].flatMap((value) => (typeof value === 'string' ? [value] : []));
}

/**
 * The account a draft row is bound to: `platform_account_id`, the one stamp. The copies older
 * writers left in `slot_data` (`platform.accountId`, `draftSnapshot.targetAccountId`) are never
 * read — three stamps read in three orders is how the preview and the publish disagreed.
 * `'unassigned'` is the planner's placeholder, not an account.
 */
export function boundAccountIdFromRow(row: {
  slot_data?: unknown;
  platform_account_id?: string | null;
}): string | null {
  return realAccountId(row.platform_account_id);
}

function realAccountId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value !== 'unassigned' ? value : null;
}

function planAsset(raw: unknown): PublishPlanAsset | null {
  const a = asRecord(raw);
  if (a['kind'] !== 'image' && a['kind'] !== 'video') return null;
  return {
    role: str(a['role']) ?? 'primary',
    kind: a['kind'],
    slideIndex: num(a['slideIndex']),
    assetId: str(a['assetId']),
    bucket: str(a['bucket']),
    storagePath: str(a['storagePath']),
    storageUrl: str(a['storageUrl']),
    mimeType: str(a['mimeType']),
    width: num(a['width']),
    height: num(a['height']),
  };
}

function planMediaSuggestion(raw: unknown): PublishPlanMediaSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const ms = asRecord(raw);
  const reel = ms['reel'] ? asRecord(ms['reel']) : null;
  const hf = ms['hyperframe'] ? asRecord(ms['hyperframe']) : null;
  const mp4Status = hf?.['mp4Status'];
  return {
    mediaStatus: str(ms['mediaStatus']),
    url: str(ms['url']),
    assetUrl: str(ms['assetUrl']),
    signedUrl: str(ms['signedUrl']),
    assetBase64: str(ms['assetBase64']),
    bucket: str(ms['bucket']),
    mimeType: str(ms['mimeType']),
    width: num(ms['width']),
    height: num(ms['height']),
    alt: str(ms['alt']),
    assets: (Array.isArray(ms['assets']) ? ms['assets'] : []).map((value) => {
      const s = asRecord(value);
      return {
        order: num(s['order']),
        url: str(s['url']),
        assetUrl: str(s['assetUrl']),
        signedUrl: str(s['signedUrl']),
        assetBase64: str(s['assetBase64']),
        bucket: str(s['bucket']),
        mimeType: str(s['mimeType']),
        width: num(s['width']),
        height: num(s['height']),
      };
    }),
    reel: reel
      ? {
          url: str(reel['url']),
          bucket: str(reel['bucket']),
          signedUrl: str(reel['signedUrl']),
          thumbnailUrl: str(reel['thumbnailUrl']),
          mimeType: str(reel['mimeType']),
        }
      : null,
    hyperframe: hf
      ? {
          mp4Path: str(hf['mp4Path']),
          mp4Url: str(hf['mp4Url']),
          mp4Bucket: str(hf['mp4Bucket']),
          mp4Status:
            mp4Status === 'pending' || mp4Status === 'ready' || mp4Status === 'failed'
              ? mp4Status
              : null,
          coverPath: str(hf['coverPath']),
          coverImageUrl: str(hf['coverImageUrl']),
          bucket: str(hf['bucket']),
        }
      : null,
  };
}

/** A persisted `organic_calendar_drafts` row as plan input. */
export function publishPlanDraftFromRow(row: {
  id: string;
  content_json: unknown;
  slot_data: unknown;
}): PublishPlanDraft {
  const placement = asRecord(row.content_json);
  const copy = asRecord(placement['copy']);
  const hashtags = copy['hashtags'];
  return {
    id: row.id,
    formats: draftFormatCandidates(row),
    caption: typeof copy['caption'] === 'string' ? copy['caption'] : null,
    hashtags: hashtags && typeof hashtags === 'object' ? (hashtags as HashtagTiers) : null,
    publishingAssets: (Array.isArray(placement['publishingAssets'])
      ? placement['publishingAssets']
      : []
    ).flatMap((value) => planAsset(value) ?? []),
    mediaSuggestion: planMediaSuggestion(asRecord(placement['creative'])['mediaSuggestion']),
    savedPublishOptions: placement['publishOptions'] ?? null,
  };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value) || value.startsWith('data:');

/** Instagram refuses a feed image outside 4:5 … 1.91:1. */
const INSTAGRAM_ASPECT = { min: 0.8, max: 1.91 } as const;

const YOUTUBE_TITLE_MAX = 100;

/**
 * YouTube's `snippet.title`: the caption's first non-empty line, `<`/`>` stripped (YouTube
 * rejects them), cut to 100 characters. Empty when the caption yields none.
 */
export function youtubeTitleFromCaption(caption: string): string {
  const firstLine = caption
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const source = (firstLine ?? caption).trim().replace(/[<>]/g, '');
  return source.length > YOUTUBE_TITLE_MAX ? source.slice(0, YOUTUBE_TITLE_MAX).trimEnd() : source;
}

/**
 * The user's selection in slide order: by `slideIndex`, unindexed last, ties in array order. A
 * cover is never a slide. An item with no media source stays, so a carousel refuses it instead
 * of publishing a subset (Airtable 400).
 */
function orderedSelection(assets: ReadonlyArray<PublishPlanAsset>): PublishPlanAsset[] {
  return assets
    .map((asset, position) => ({ asset, position }))
    .filter(({ asset }) => asset.role !== 'cover')
    .sort(
      (a, b) =>
        (a.asset.slideIndex ?? Number.POSITIVE_INFINITY) -
          (b.asset.slideIndex ?? Number.POSITIVE_INFINITY) || a.position - b.position,
    )
    .map(({ asset }) => asset);
}

/** The selection's realized items: what a single-media pick chooses from. */
function orderedSlides(assets: ReadonlyArray<PublishPlanAsset>): PublishPlanAsset[] {
  return orderedSelection(assets).filter((asset) => asset.storagePath || asset.storageUrl);
}

function fromAsset(asset: PublishPlanAsset): PublishPlanMedia {
  return {
    kind: asset.kind,
    source: 'publishing_asset',
    assetId: asset.assetId,
    bucket: asset.bucket,
    storagePath: asset.storagePath,
    url: asset.storageUrl,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    slideIndex: asset.slideIndex,
  };
}

function bare(
  kind: 'image' | 'video',
  source: PublishPlanMedia['source'],
  fields: Partial<PublishPlanMedia>,
): PublishPlanMedia {
  return {
    kind,
    source,
    assetId: null,
    bucket: null,
    storagePath: null,
    url: null,
    mimeType: null,
    width: null,
    height: null,
    slideIndex: null,
    ...fields,
  };
}

/** A generated slot: `url` is the realized storage path after realize, else a URL. Base64 rides as a data: URI. */
function generatedMedia(
  kind: 'image' | 'video',
  slot: {
    url: string | null;
    assetUrl: string | null;
    signedUrl: string | null;
    assetBase64: string | null;
    bucket: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
  },
  slideIndex: number | null,
): PublishPlanMedia | null {
  const storagePath = slot.url && !isUrl(slot.url) ? slot.url : null;
  const url =
    slot.assetUrl ??
    slot.signedUrl ??
    (slot.url && isUrl(slot.url) ? slot.url : null) ??
    (slot.assetBase64 ? `data:${slot.mimeType ?? 'image/png'};base64,${slot.assetBase64}` : null);
  if (!storagePath && !url) return null;
  return bare(kind, storagePath || !slot.assetBase64 ? 'generated' : 'inline', {
    bucket: slot.bucket,
    storagePath,
    url,
    mimeType: slot.mimeType,
    width: slot.width,
    height: slot.height,
    slideIndex,
  });
}

interface MediaContext {
  slides: PublishPlanAsset[];
  /** Every selected slide, sourced or not: a carousel publishes this set or nothing. */
  selection: PublishPlanAsset[];
  ms: PublishPlanMediaSuggestion | null;
  /** A generation in flight: anything still on the record is a stale leftover. */
  generating: boolean;
  request: PublishPlanRequestMedia | null;
}

function generatedImage(ctx: MediaContext): PublishPlanMedia | null {
  if (!ctx.ms || ctx.generating) return null;
  return generatedMedia('image', ctx.ms, null);
}

type VideoPick = { media: PublishPlanMedia | null; pending: PublishPlan['mediaPending'] };

/** The one video a reel or story sends: an attached video, the rendered hyperframe, the reel record, the request. */
function pickVideo(ctx: MediaContext, isHyperframe: boolean): VideoPick {
  const attached = ctx.slides.find((asset) => asset.kind === 'video');
  if (attached) return { media: fromAsset(attached), pending: null };

  const hf = ctx.ms?.hyperframe;
  if (hf && (hf.mp4Path || hf.mp4Url || isHyperframe)) {
    if (hf.mp4Status === 'ready' && (hf.mp4Path || hf.mp4Url)) {
      return {
        media: bare('video', 'hyperframe', {
          bucket: hf.mp4Bucket ?? 'hyperframes-mp4',
          storagePath: hf.mp4Path,
          url: hf.mp4Url,
          mimeType: 'video/mp4',
        }),
        pending: null,
      };
    }
    if (isHyperframe) return { media: null, pending: 'hyperframe_rendering' };
  }

  const reel = ctx.ms?.reel;
  if (reel && !ctx.generating) {
    const path = reel.url ?? ctx.ms?.url ?? null;
    const media = generatedMedia(
      'video',
      {
        url: path,
        assetUrl: reel.signedUrl ?? ctx.ms?.assetUrl ?? null,
        signedUrl: ctx.ms?.signedUrl ?? null,
        assetBase64: null,
        bucket: reel.bucket ?? ctx.ms?.bucket ?? null,
        mimeType: reel.mimeType ?? ctx.ms?.mimeType ?? 'video/mp4',
        width: null,
        height: null,
      },
      null,
    );
    if (media) return { media: { ...media, source: 'reel' }, pending: null };
  }

  if (ctx.request?.videoUrl) {
    return { media: bare('video', 'request', { url: ctx.request.videoUrl }), pending: null };
  }
  return { media: null, pending: ctx.generating ? 'generating' : null };
}

function pickImage(ctx: MediaContext): { media: PublishPlanMedia | null; extra: number } {
  const images = ctx.slides.filter((asset) => asset.kind === 'image');
  const chosen = images.find((asset) => asset.role === 'primary') ?? images[0];
  if (chosen) return { media: fromAsset(chosen), extra: ctx.slides.length - 1 };
  const generated = generatedImage(ctx);
  if (generated) return { media: generated, extra: ctx.slides.length };
  if (ctx.request?.imageUrl) {
    return { media: bare('image', 'request', { url: ctx.request.imageUrl }), extra: 0 };
  }
  return { media: null, extra: ctx.slides.length };
}

function generatedSlides(ctx: MediaContext): PublishPlanMedia[] {
  if (!ctx.ms || ctx.generating) return [];
  return ctx.ms.assets
    .map((slide, position) => ({ slide, position }))
    .sort(
      (a, b) =>
        (a.slide.order ?? Number.POSITIVE_INFINITY) - (b.slide.order ?? Number.POSITIVE_INFINITY) ||
        a.position - b.position,
    )
    .flatMap(({ slide }, index) => {
      const kind = slide.mimeType?.startsWith('video/') ? 'video' : 'image';
      // A slide realized without its own bucket lives in the record's.
      const located = { ...slide, bucket: slide.bucket ?? ctx.ms?.bucket ?? null };
      return generatedMedia(kind, located, slide.order ?? index + 1) ?? [];
    });
}

/** A platform as people write it — messages reach the user verbatim. */
export const PUBLISH_PLATFORM_LABELS: Readonly<Record<PublishPlatform, string>> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
};

const label = (platform: PublishPlatform): string => PUBLISH_PLATFORM_LABELS[platform];

/**
 * How an account is named to a person — never a UUID. A Facebook Page reads as its name.
 * Some providers store the handle with its '@' (YouTube's `@channel`), so one is stripped.
 */
export function publishAccountLabel(account: {
  handle: string | null;
  displayName: string | null;
}): string {
  const handle = account.handle?.replace(/^@/, '') || null;
  if (handle && handle !== account.displayName && account.handle !== account.displayName) {
    return `@${handle}`;
  }
  return account.displayName ?? handle ?? 'an unnamed account';
}

/** The one caption-too-long sentence: the writer, the verdict and the gate all say this. */
export function captionTooLongMessage(
  platform: PublishPlatform,
  maxLength: number,
  length: number,
): string {
  return `${label(platform)} captions are at most ${maxLength} characters, hashtags included — this one is ${length}`;
}

function choiceList(accounts: ReadonlyArray<PublishPlanAccountCandidate>): string {
  return accounts.map(publishAccountLabel).join(', ');
}

/**
 * The account a publish addresses: EXACTLY the draft's stamp, when it is one of the brand's
 * connected candidates for the platform. Nothing else is an answer — not a request's choice, not
 * the brand's only account (that is stamped at creation, never swapped in at publish), not a bare
 * platform id that cannot be checked. Every other case blocks with a message naming the accounts.
 */
export function resolvePublishPlanAccount(
  input: PublishPlanAccountInput,
  platform?: PublishPlatform,
): PublishPlanAccount {
  const name = platform ? label(platform) : 'this platform';
  const stamp = realAccountId(input.boundAccountId);
  const accounts = input.accounts;
  const usable = (accounts ?? []).filter((candidate) => !candidate.needsReauth);
  const base = {
    id: stamp,
    handle: null,
    displayName: null,
    avatarUrl: null,
    candidateCount: accounts?.length ?? null,
  };
  const choose =
    usable.length > 0
      ? `choose one of: ${choiceList(usable)}`
      : accounts && accounts.length > 0
        ? `reconnect ${name} first (${choiceList(accounts)} ${accounts.length === 1 ? 'needs' : 'need'} reconnecting)`
        : `connect ${name} first`;

  if (!stamp) {
    return {
      ...base,
      status: 'missing',
      // Unloaded candidates say nothing about what is connected, so the advice cannot be "connect".
      message: !accounts
        ? `Choose which ${name} account this draft posts to`
        : usable.length > 0
          ? `Choose which ${name} account this posts to: ${choiceList(usable)}`
          : `No ${name} account is chosen — ${choose}`,
    };
  }
  if (!accounts) return { ...base, status: 'resolved', message: null };

  const found = findStampedCandidate(accounts, stamp);
  if (!found) {
    return {
      ...base,
      status: 'foreign',
      message: `This draft is set to post to an account that is not one of this brand's connected ${name} accounts — ${choose}`,
    };
  }
  const { candidate } = found;
  const described = {
    ...base,
    handle: candidate.handle,
    displayName: candidate.displayName,
    avatarUrl: candidate.avatarUrl,
  };
  if (found.needsReauth) {
    return {
      ...described,
      status: 'needs_reauth',
      message: `${publishAccountLabel(candidate)} must be reconnected before it can post — reconnect ${name} in Settings${usable.length > 0 ? `, or ${choose}` : ''}`,
    };
  }
  return { ...described, status: 'resolved', message: null };
}

function resolveFormat(formats: ReadonlyArray<string | null | undefined>): {
  format: PublishFormat;
  isHyperframe: boolean;
} {
  for (const candidate of formats) {
    const format = matchPublishFormat(candidate);
    if (format) {
      return { format, isHyperframe: (candidate ?? '').toLowerCase().includes('hyperframe') };
    }
  }
  return { format: 'POST', isHyperframe: false };
}

/** Exactly what `input.platform` will receive for `input.draft`. Pure. */
export function resolvePublishPlan(input: PublishPlanInput): PublishPlan {
  const { draft, platform } = input;
  const capability = PLATFORM_CAPABILITIES[platform];
  const { format, isHyperframe } = resolveFormat(draft.formats);
  const notices: PublishPlanNotice[] = [];
  const ms = draft.mediaSuggestion;
  const ctx: MediaContext = {
    slides: orderedSlides(draft.publishingAssets),
    selection: orderedSelection(draft.publishingAssets),
    ms,
    generating: ms?.mediaStatus === 'generating' || ms?.mediaStatus === 'pending',
    request: input.requestMedia ?? null,
  };

  // ── media ──
  let media: PublishPlanMedia[] = [];
  let mediaPending: PublishPlan['mediaPending'] = null;
  let verb: PublishPlanVerb;
  if (format === 'REEL') {
    verb = 'reel';
    const pick = pickVideo(ctx, isHyperframe);
    media = pick.media ? [pick.media] : [];
    mediaPending = pick.pending;
  } else if (format === 'STORY') {
    verb = 'story';
    const video = pickVideo(ctx, isHyperframe);
    const image = video.media ? null : pickImage(ctx).media;
    media = video.media ? [video.media] : image ? [image] : [];
    mediaPending = media.length ? null : video.pending;
  } else if (format === 'CAROUSEL') {
    verb = 'carousel';
    const { min } = capability.carousel;
    const attached = ctx.selection.map(fromAsset);
    const generated = generatedSlides(ctx);
    const requested = (ctx.request?.items ?? []).flatMap((item) =>
      item.videoUrl
        ? [bare('video', 'request', { url: item.videoUrl })]
        : item.imageUrl
          ? [bare('image', 'request', { url: item.imageUrl })]
          : [],
    );
    // The user's selection wins even below the minimum: a reduced selection is published as
    // chosen or refused, never refilled from the generated slides (Airtable 396).
    if (attached.length > 0) {
      media = attached;
    } else if (generated.length >= min) {
      media = generated;
    } else if (requested.length > 0) {
      media = requested;
    } else {
      media = generated;
    }
    if (media.length === 0 && ctx.generating) mediaPending = 'generating';
  } else {
    const pick = pickImage(ctx);
    media = pick.media ? [pick.media] : [];
    if (pick.media && pick.extra > 0) {
      notices.push({
        code: 'media_not_sent',
        message: `A post sends one image — ${pick.extra} more attached ${pick.extra === 1 ? 'item is' : 'items are'} not posted. Switch to Carousel to post them all`,
        target: 'media',
      });
    }
    if (!pick.media && ctx.generating) mediaPending = 'generating';
    // Text only when there is truly nothing to post: a video on a POST is a format to fix,
    // not a caption to send alone.
    const nothingAttached =
      !pick.media && ctx.slides.length === 0 && !pickVideo(ctx, isHyperframe).media;
    verb = nothingAttached && !mediaPending && capability.textPost ? 'text' : 'post';
    if (verb === 'text' && ms?.mediaStatus === 'failed') {
      notices.push({
        code: 'media_not_sent',
        message:
          'The image could not be generated, so this posts as text only. Attach an image to post one',
        target: 'media',
      });
    }
  }

  if (
    platform === 'instagram' &&
    (verb === 'post' || verb === 'carousel') &&
    media.some(
      (item) =>
        item.kind === 'image' &&
        item.width &&
        item.height &&
        (item.width / item.height < INSTAGRAM_ASPECT.min ||
          item.width / item.height > INSTAGRAM_ASPECT.max),
    )
  ) {
    notices.push({
      code: 'aspect_out_of_range',
      message:
        'Instagram takes feed images from 4:5 to 1.91:1 — an image here is outside that and is sent uncropped, so Instagram may refuse it',
      target: 'media',
    });
  }

  // ── caption ──
  const assembled = assemblePlatformCaption(platform, draft.caption, draft.hashtags);
  let text: string | null = assembled.text || null;
  if (verb === 'story') {
    if (text) {
      notices.push({
        code: 'caption_not_sent',
        message: 'A story has no caption — this text is not posted',
        target: 'caption',
      });
    }
    text = null;
  } else {
    if (assembled.droppedHashtags.length > 0) {
      notices.push({
        code: 'hashtags_dropped',
        message: `${assembled.droppedHashtags.length} hashtag${assembled.droppedHashtags.length === 1 ? ' is' : 's are'} not posted (${label(platform)} keeps ${assembled.hashtagLimit} within ${assembled.limit} characters): ${assembled.droppedHashtags.join(' ')}`,
        target: 'caption',
      });
    }
  }

  // ── options and cover ──
  const options: PublishOptions | undefined =
    input.publishOptions ?? savedPublishOptions(draft.savedPublishOptions, platform);
  const unsupportedOptions = unsupportedPublishOptions(platform, format, options);
  const isReel = verb === 'reel';
  const chosen = isReel ? options?.thumbnail : undefined;
  let cover: PublishPlanCover | null = null;
  if (chosen && !unsupportedOptions.includes('thumbnail')) {
    cover =
      'url' in chosen
        ? { source: 'chosen_url', url: chosen.url, bucket: null, storagePath: null, offsetMs: null }
        : {
            source: 'chosen_frame',
            url: null,
            bucket: null,
            storagePath: null,
            offsetMs: chosen.offsetMs,
          };
  } else if (isReel && platform === 'instagram') {
    // Only Instagram takes a derived cover; TikTok sends a chosen one or none.
    const hf = ms?.hyperframe;
    const coverAsset = draft.publishingAssets.find(
      (asset) => asset.role === 'cover' && asset.kind === 'image',
    );
    if (hf?.coverPath) {
      cover = {
        source: 'hyperframe',
        url: hf.coverImageUrl,
        bucket: hf.bucket,
        storagePath: hf.coverPath,
        offsetMs: null,
      };
    } else if (coverAsset) {
      cover = {
        source: 'publishing_asset',
        url: coverAsset.storageUrl,
        bucket: coverAsset.bucket,
        storagePath: coverAsset.storagePath,
        offsetMs: null,
      };
    } else if (ctx.request?.coverUrl) {
      cover = {
        source: 'request',
        url: ctx.request.coverUrl,
        bucket: null,
        storagePath: null,
        offsetMs: null,
      };
    }
  }
  if (isReel && !cover && media.length > 0) {
    notices.push({
      code: 'cover_platform_default',
      message: `${label(platform)} picks the cover frame — the poster shown here is not sent`,
      target: 'cover',
    });
  }

  // Media a person uploaded onto the generation record is theirs, not a pipeline's.
  const generatedSources = new Set(['generated', 'reel', 'hyperframe', 'inline']);
  const mediaGenerated =
    input.mediaGenerated ??
    (draft.mediaSuggestion?.mediaStatus !== 'user_supplied' &&
      media.some((item) => generatedSources.has(item.source)));
  const aiGenerated =
    capability.publishOptions.aiGeneratedLabel && isReel
      ? options?.aiGenerated === true || mediaGenerated
      : null;

  const youtube =
    platform === 'youtube'
      ? {
          title: youtubeTitleFromCaption(text ?? ''),
          privacyStatus: 'public' as const,
          selfDeclaredMadeForKids: false as const,
        }
      : null;
  const tiktok =
    platform === 'tiktok'
      ? {
          privacyLevel: isReel ? null : ('PUBLIC_TO_EVERYONE' as const),
          isBrandOrganic: false as const,
          isBrandedContent: false as const,
        }
      : null;
  if (youtube) {
    notices.push({
      code: 'platform_defaults',
      message: `Posts to YouTube as public, not made for kids${youtube.title ? `, titled "${youtube.title}"` : ''}`,
      target: 'options',
    });
  }
  if (tiktok) {
    notices.push({
      code: 'platform_defaults',
      message: 'Posts to TikTok publicly, not marked as branded content',
      target: 'options',
    });
  }

  return {
    draftId: draft.id,
    platform,
    format,
    verb,
    account: resolvePublishPlanAccount(input.account, platform),
    caption: {
      text,
      body: assembled.body,
      keptHashtags: verb === 'story' ? [] : assembled.keptHashtags,
      droppedHashtags: verb === 'story' ? [] : assembled.droppedHashtags,
      truncated: verb !== 'story' && assembled.truncated,
      truncatedAt: verb === 'story' ? null : assembled.truncatedAt,
      limit: assembled.limit,
      hashtagLimit: assembled.hashtagLimit,
      length: text?.length ?? 0,
    },
    media,
    mediaPending,
    cover,
    options: {
      firstComment: unsupportedOptions.includes('firstComment')
        ? null
        : (options?.firstComment ?? null),
      trial: isReel && !unsupportedOptions.includes('trial') ? (options?.trial ?? null) : null,
      shareToFeed: isReel && platform === 'instagram' ? true : null,
      aiGenerated,
      // The generator writes `alt` for the image it made; a user's own image never inherits it.
      // TikTok's photo API has no alt-text field; every other image post sends it.
      altText:
        verb === 'post' && platform !== 'tiktok' && media[0]?.source === 'generated'
          ? (ms?.alt ?? null)
          : null,
      youtube,
      tiktok,
    },
    notices,
    unsupportedOptions,
  };
}

// ── Gate ──────────────────────────────────────────────────────────────────────

/**
 * The caption the plan was built from — body + every tag under the count cap — before the length
 * clamp. Kept + dropped is the whole tag list in order: the clamp only ever drops a tail.
 */
function unclampedCaptionLength(caption: PublishPlan['caption']): number {
  return assembleCaption(caption.body, [...caption.keptHashtags, ...caption.droppedHashtags], {
    maxLength: Number.POSITIVE_INFINITY,
    maxHashtags: caption.hashtagLimit,
  }).text.length;
}

/**
 * Can this plan publish? The planner's readiness gate and the backend's approve, publish and
 * scheduler gates all ask this one function. The backend adds its own content-review rules
 * (quality, slide copy, unsourced claims) on top; it never re-derives these.
 */
export function checkPublishability(plan: PublishPlan): PublishPlanVerdict {
  const blockers: PublishPlanIssue[] = [];
  const platform = label(plan.platform);

  if (!supportsFormat(plan.platform, plan.format)) {
    blockers.push({
      reason: 'unsupported_format',
      message: `${platform} cannot publish a ${plan.format.toLowerCase()} — choose another format`,
      fix: 'format',
    });
  }

  if (plan.unsupportedOptions.length > 0) {
    blockers.push({
      reason: 'unsupported_format',
      message: `${plan.unsupportedOptions.join(' and ')} cannot be set on a ${platform} ${plan.format.toLowerCase()}`,
      fix: 'options',
    });
  }

  const count = plan.media.length;
  if (plan.mediaPending === 'hyperframe_rendering') {
    blockers.push({
      reason: 'hyperframe_mp4_not_ready',
      message: 'Hyperframe video is still rendering — it will be publishable once its MP4 is ready',
      fix: 'media',
    });
  } else if (plan.mediaPending === 'generating') {
    blockers.push({
      reason: 'media_missing',
      // 'pending' (planned, not yet made) and 'generating' (in flight) both land here.
      message: "This post's media is not made yet — generate it, or attach your own, to publish",
      fix: 'media',
    });
  } else if (plan.verb === 'reel' && count === 0) {
    blockers.push({
      reason: 'media_missing',
      message:
        plan.platform === 'youtube'
          ? 'YouTube publishes video only — attach a video'
          : 'This reel has no video yet — its images cannot publish as a reel',
      fix: 'media',
    });
  } else if (plan.verb === 'story' && count === 0) {
    blockers.push({
      reason: 'media_missing',
      message: 'This story has no image or video yet',
      fix: 'media',
    });
  } else if (plan.verb === 'post' && count === 0) {
    blockers.push({
      reason: 'media_missing',
      message: 'A post needs an image — attach one, or switch the format to Reel for a video',
      fix: 'media',
    });
  } else if (plan.verb === 'carousel') {
    const { min, max, videoSlides } = PLATFORM_CAPABILITIES[plan.platform].carousel;
    // Over the limit is refused, never cut: publishing a subset is not what the user chose
    // (Airtable 397/400).
    if (plan.media.some((item) => !item.url && !item.storagePath)) {
      blockers.push({
        reason: 'media_missing',
        message:
          'Every selected carousel item needs a media source. Reattach or remove the missing items before publishing.',
        fix: 'media',
      });
    }
    if (count > max) {
      blockers.push({
        reason: 'unsupported_format',
        message: `Carousel has ${count} selected items; ${platform} supports at most ${max}. Remove items before publishing.`,
        fix: 'media',
      });
    }
    if (count < min) {
      blockers.push({
        reason: 'media_missing',
        message: `Carousel needs at least ${min} slides before it can be published — this draft has ${count}`,
        fix: 'media',
      });
    }
    const videoAt = plan.media.findIndex((item) => item.kind === 'video');
    if (!videoSlides && videoAt >= 0) {
      blockers.push({
        reason: 'unsupported_format',
        message: `${platform} carousels take images only — slide ${videoAt + 1} is a video`,
        fix: 'media',
      });
    }
  }

  if (!plan.caption.text && plan.verb !== 'story') {
    blockers.push({
      reason: 'caption_missing',
      message: 'This draft has no caption — add copy before publishing',
      fix: 'caption',
    });
  }

  // Refused, never cut: a caption the clamp would shorten is not the one the user approved.
  if (plan.caption.truncated) {
    blockers.push({
      reason: 'caption_too_long',
      message: captionTooLongMessage(
        plan.platform,
        plan.caption.limit,
        unclampedCaptionLength(plan.caption),
      ),
      fix: 'caption',
    });
  }

  if (plan.account.status !== 'resolved') {
    blockers.push({
      reason: 'account_missing',
      message: plan.account.message ?? `Choose a ${platform} account to publish this draft`,
      fix: 'account',
    });
  }

  return { publishable: blockers.length === 0, blockers, warnings: [] };
}

// ── Dry run ───────────────────────────────────────────────────────────────────

/** One provider request the publisher would make, captured without sending it. */
export const publishWireRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
  /** Credentials removed. Some requests carry content here — a Facebook reel's video is `file_url`. */
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
});
export type PublishWireRequest = z.infer<typeof publishWireRequestSchema>;

/** GET /api/organic/calendar/drafts/:id/publish-plan */
export const publishPlanDryRunResponseSchema = z.object({
  plan: publishPlanSchema,
  publishable: z.boolean(),
  /** The plan gate plus the backend's content-review rules. */
  blockers: z.array(publishPlanIssueSchema.extend({ reason: z.string() })),
  warnings: z.array(publishPlanIssueSchema.extend({ reason: z.string() })),
  /** The brand's candidates for the plan's platform — feed both back to resolve locally. */
  accounts: z.array(publishAccountCandidateSchema),
  /** The draft's one stamp, `platform_account_id`. */
  boundAccountId: z.string().nullable(),
  /** The exact provider requests, in order. Null unless asked for (`?wire=1`) or when the plan is blocked. */
  wire: z.array(publishWireRequestSchema).nullable(),
});
export type PublishPlanDryRunResponse = z.infer<typeof publishPlanDryRunResponseSchema>;
