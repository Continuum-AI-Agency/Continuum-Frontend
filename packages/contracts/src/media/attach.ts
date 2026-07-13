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
  })
  .strict();
export type CreativeRef = z.infer<typeof creativeRefSchema>;

/**
 * The media the headless generation produced. A user-supplied creative must CLEAR these, not
 * merely sit alongside them — the patch is spread over the existing mediaSuggestion (and, on the
 * backend, merged into content_json), so a key that is merely absent leaves the old generation
 * in place. `null` is what survives JSON, which `undefined` does not.
 */
type ClearedMediaOutputs = {
  assets?: OrganicMediaSuggestion['assets'] | null;
  assetBase64?: string | null;
  reel?: OrganicMediaSuggestion['reel'] | null;
  hyperframe?: OrganicMediaSuggestion['hyperframe'] | null;
};

export type ShapedUserSuppliedMedia = {
  mediaSuggestionPatch: Omit<Partial<OrganicMediaSuggestion>, keyof ClearedMediaOutputs> &
    ClearedMediaOutputs;
  publishingAssets: OrganicPublishingAsset[];
};

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
  };
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
 * Shape one or more library creatives into a publishable media patch. A single
 * image → image slot; multiple images → carousel (selection order = slide
 * order); the first video → reel slot (one video per post).
 */
export function shapeUserSuppliedMedia(creatives: CreativeRef[]): ShapedUserSuppliedMedia {
  const list = creatives.filter(Boolean);
  if (list.length === 0) {
    throw new Error('shapeUserSuppliedMedia: at least one creative is required');
  }
  const primary = list[0];

  // VIDEO / REEL — a single user video fills the reel slot.
  if (primary.kind === 'video') {
    return {
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
        kind: 'reel',
        mediaStatus: 'user_supplied',
        mimeType: primary.mimeType,
        reel: {
          generated: true,
          url: primary.storagePath,
          bucket: primary.bucket,
          signedUrl: primary.signedUrl ?? null,
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
      publishingAssets: list.map((creative, index) => imagePublishingAsset(creative, index)),
      mediaSuggestionPatch: {
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
    publishingAssets: [imagePublishingAsset(primary)],
    mediaSuggestionPatch: {
      kind: 'image',
      mediaStatus: 'user_supplied',
      url: primary.storagePath,
      bucket: primary.bucket,
      assetUrl: primary.signedUrl,
      signedUrl: primary.signedUrl,
      mimeType: primary.mimeType,
      width: primary.width,
      height: primary.height,
      // The patch is spread over the existing mediaSuggestion, so any media the headless
      // generation left behind has to be cleared EXPLICITLY — omitting these keys leaves a
      // generated carousel's slides in place, and the assertPublishable gate (and anything
      // else reading mediaSuggestion) still sees the old generation as this draft's media.
      assets: null,
      assetBase64: null,
      reel: null,
      hyperframe: null,
    },
  };
}
