/**
 * Shared shaping for USER-SUPPLIED media — the single source of truth so the
 * Frontend picker, the agent assign tool, and any backend writer all turn a
 * library creative into IDENTICAL, publishable draft media.
 *
 * It populates BOTH:
 *  - `publishingAssets[]` — the durable, re-signable handles the FE renders, and
 *  - the `mediaSuggestion` fields the publish path reads (`assertPublishable` +
 *    `stageMediaForPublish`): top-level `url`(=storagePath)+`bucket` for a single
 *    image, `assets[].url`(=storagePath)+`bucket` for a carousel, and `reel` for a
 *    video — so a user creative both renders AND publishes without drift.
 *
 * Every output is stamped `mediaStatus: 'user_supplied'`.
 */

import { z } from 'zod';
import type { PublishFormat } from '../organic/publishing';
import type { OrganicMediaSuggestion, OrganicPublishingAsset } from '../streaming/organic-pipeline';
import { type MediaAsset, mediaKindSchema } from './asset';

/**
 * A library creative selected to become a post's media. `assetId` is the
 * canonical handle (re-signed via /api/library/sign); `bucket`+`storagePath` are
 * the durable location; `signedUrl` is the optional upload-time URL for
 * immediate render (may expire — never the durable source).
 */
export const creativeRefSchema = z
  .object({
    assetId: z.string().min(1),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    kind: mediaKindSchema,
    mimeType: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    signedUrl: z.string().optional(),
    durationSec: z.number().optional(),
    /**
     * Poster frame for a video creative (the library's derived thumbnail). Without
     * it a video preview has nothing to paint before the first frame decodes, which
     * is why the schema carries it explicitly rather than letting the boundary drop it.
     */
    thumbnailUrl: z.string().optional(),
  })
  .strict();
export type CreativeRef = z.infer<typeof creativeRefSchema>;

/**
 * The media the headless generation produced. A user-supplied creative must CLEAR these, not
 * merely sit alongside them — the patch is spread over the existing mediaSuggestion (and, on the
 * backend, merged into content_json), so a key that is merely absent leaves the old generation
 * in place. `null` is what survives JSON, which `undefined` does not.
 *
 * Every media slot lives here, including the single-image trio (`url`/`assetUrl`/`signedUrl`):
 * a video attach that only sets `reel` leaves a previously generated image behind those keys,
 * and every image resolver in the app reads them — that is a stale creative rendering over the
 * user's video.
 */
type ClearedMediaOutputs = {
  url?: string | null;
  assetUrl?: string | null;
  signedUrl?: string | null;
  assets?: OrganicMediaSuggestion['assets'] | null;
  assetBase64?: string | null;
  reel?: OrganicMediaSuggestion['reel'] | null;
  hyperframe?: OrganicMediaSuggestion['hyperframe'] | null;
};

export type ShapedUserSuppliedMedia = {
  mediaSuggestionPatch: Omit<Partial<OrganicMediaSuggestion>, keyof ClearedMediaOutputs> &
    ClearedMediaOutputs;
  publishingAssets: OrganicPublishingAsset[];
  /**
   * The draft's `content.format`, restated from what was actually attached. Callers MUST apply it
   * onto `content_json.content` — the attached media IS the answer, exactly as `publishingAssets`
   * is replaced wholesale rather than appended to.
   *
   * Without it, `content.format` keeps whatever the generator wrote and drifts from the media:
   * three images landing on a "Reel" draft left a reel with no video, which the kind-blind publish
   * gate passed and `stageMediaForPublish` then died on ("reel: no signable media source") once
   * per scheduler tick, forever.
   */
  contentPatch: { format: PublishFormat };
};

/**
 * The post format a set of asset kinds can actually publish as — one video → REEL, several images
 * → CAROUSEL, otherwise POST. The single rule behind both `shapeUserSuppliedMedia`'s `contentPatch`
 * and the planner attach path, which shapes its own assets but must reach the same verdict.
 */
export function publishFormatForAssetKinds(kinds: ReadonlyArray<'image' | 'video'>): PublishFormat {
  if (kinds[0] === 'video') return 'REEL';
  return kinds.length > 1 ? 'CAROUSEL' : 'POST';
}

/**
 * `slot_data` with its cached `draftSnapshot.format` brought in line with a format just written
 * onto `content_json.content` — or `null` when there is no snapshot to update.
 *
 * Load-bearing: `resolveDraftPublishFormat` reads the snapshot BEFORE `content.format`, so an
 * attach that rewrites only `content.format` leaves a stale snapshot outranking it, trading the
 * old drift for a subtler one. Only an EXISTING snapshot is rewritten — minting one would invent
 * browser-autosave state the row never had, and the resolver falls through to `content.format`
 * quite happily when there is no snapshot to consult.
 */
export function syncDraftSnapshotFormat(
  slotData: unknown,
  format: PublishFormat,
): Record<string, unknown> | null {
  if (!slotData || typeof slotData !== 'object' || Array.isArray(slotData)) return null;
  const snapshot = (slotData as { draftSnapshot?: unknown }).draftSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return {
    ...(slotData as Record<string, unknown>),
    draftSnapshot: { ...(snapshot as Record<string, unknown>), format },
  };
}

/** Map a unified-library `MediaAsset` (FE list / BE media.assets row) → `CreativeRef`. */
export function creativeRefFromAsset(asset: MediaAsset): CreativeRef {
  return {
    assetId: asset.id,
    bucket: asset.bucket,
    storagePath: asset.storagePath,
    kind: asset.kind,
    mimeType: asset.mimeType,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    signedUrl: asset.signedUrl ?? undefined,
    durationSec: asset.durationMs != null ? Math.round(asset.durationMs / 1000) : undefined,
    thumbnailUrl: asset.thumbnailUrl ?? undefined,
  };
}

/**
 * A post carries at most one video (`reel` is a single slot), so a selection with two
 * or more videos loses everything past the first. Callers ask before shaping, and the
 * picker refuses the selection — silently truncating is what made an attach look
 * successful while discarding the user's other picks.
 */
export function findMultiVideoSelectionError(creatives: CreativeRef[]): string | null {
  const videoCount = creatives.filter((creative) => creative.kind === 'video').length;
  return videoCount > 1 ? 'Only one video per post' : null;
}

function imagePublishingAsset(creative: CreativeRef, slideIndex?: number): OrganicPublishingAsset {
  return {
    role: 'primary',
    kind: 'image',
    ...(slideIndex !== undefined ? { slideIndex } : {}),
    assetId: creative.assetId,
    bucket: creative.bucket,
    storagePath: creative.storagePath,
    storageUrl: creative.signedUrl ?? '',
    mimeType: creative.mimeType,
    width: creative.width,
    height: creative.height,
  };
}

/**
 * Every media slot cleared. Each branch below starts from this and re-sets only the
 * slots it fills, so no branch can forget one: the patch is spread over the existing
 * mediaSuggestion, and an omitted key leaves the previous generation's media in place.
 */
const ALL_MEDIA_SLOTS_CLEARED: Required<ClearedMediaOutputs> = {
  url: null,
  assetUrl: null,
  signedUrl: null,
  assets: null,
  assetBase64: null,
  reel: null,
  hyperframe: null,
};

/**
 * Shape one or more library creatives into a publishable media patch. A single
 * image → image slot; multiple images → carousel (selection order = slide
 * order); the first video → reel slot (one video per post).
 *
 * Two or more videos is a caller error — ask `findMultiVideoSelectionError` first.
 */
export function shapeUserSuppliedMedia(creatives: CreativeRef[]): ShapedUserSuppliedMedia {
  const list = creatives.filter(Boolean);
  if (list.length === 0) {
    throw new Error('shapeUserSuppliedMedia: at least one creative is required');
  }
  const multiVideo = findMultiVideoSelectionError(list);
  if (multiVideo) {
    throw new Error(`shapeUserSuppliedMedia: ${multiVideo}`);
  }
  const primary = list[0];

  // VIDEO / REEL — a single user video fills the reel slot.
  if (primary.kind === 'video') {
    return {
      contentPatch: { format: 'REEL' },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'video',
          assetId: primary.assetId,
          bucket: primary.bucket,
          storagePath: primary.storagePath,
          storageUrl: primary.signedUrl ?? '',
          mimeType: primary.mimeType,
          width: primary.width,
          height: primary.height,
        },
      ],
      mediaSuggestionPatch: {
        ...ALL_MEDIA_SLOTS_CLEARED,
        kind: 'reel',
        mediaStatus: 'user_supplied',
        mimeType: primary.mimeType,
        reel: {
          generated: true,
          url: primary.storagePath,
          bucket: primary.bucket,
          signedUrl: primary.signedUrl ?? null,
          thumbnailUrl: primary.thumbnailUrl ?? null,
          mimeType: primary.mimeType ?? null,
          durationSec: primary.durationSec ?? 0,
          scenes: [],
        },
      },
    };
  }

  // CAROUSEL — multiple images, selection order = slide order.
  if (list.length > 1) {
    return {
      contentPatch: { format: 'CAROUSEL' },
      publishingAssets: list.map((creative, index) => imagePublishingAsset(creative, index)),
      mediaSuggestionPatch: {
        ...ALL_MEDIA_SLOTS_CLEARED,
        kind: 'carousel',
        mediaStatus: 'user_supplied',
        assets: list.map((creative, index) => ({
          role: `slide_${index + 1}`,
          order: index + 1,
          url: creative.storagePath,
          bucket: creative.bucket,
          assetUrl: creative.signedUrl,
          mimeType: creative.mimeType,
          width: creative.width,
          height: creative.height,
          generated: true,
        })),
      },
    };
  }

  // SINGLE IMAGE.
  return {
    contentPatch: { format: 'POST' },
    publishingAssets: [imagePublishingAsset(primary)],
    mediaSuggestionPatch: {
      ...ALL_MEDIA_SLOTS_CLEARED,
      kind: 'image',
      mediaStatus: 'user_supplied',
      url: primary.storagePath,
      bucket: primary.bucket,
      assetUrl: primary.signedUrl,
      signedUrl: primary.signedUrl,
      mimeType: primary.mimeType,
      width: primary.width,
      height: primary.height,
    },
  };
}
