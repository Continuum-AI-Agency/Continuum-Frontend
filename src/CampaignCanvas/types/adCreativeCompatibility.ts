import type { AdFormat, CarouselCard, CreativeAssetType, CreativeData } from './index';

export const DEFAULT_AD_FORMAT: AdFormat = 'IMAGE';
export const DEFAULT_CREATIVE_ASSET_TYPE: CreativeAssetType = 'image';

// A carousel is its own format on both sides: a CAROUSEL ad builds `child_attachments`
// and only a carousel creative has cards for them. COLLECTION leads with one hero image
// or video, so it takes either single-asset creative and never a carousel.
const AD_FORMAT_TO_CREATIVE_TYPES: Record<AdFormat, readonly CreativeAssetType[]> = {
  IMAGE: ['image'],
  VIDEO: ['video'],
  CAROUSEL: ['carousel'],
  COLLECTION: ['image', 'video'],
};

const CREATIVE_TYPE_TO_AD_FORMATS: Record<CreativeAssetType, readonly AdFormat[]> = {
  image: ['IMAGE', 'COLLECTION'],
  video: ['VIDEO', 'COLLECTION'],
  carousel: ['CAROUSEL'],
};

const AD_FORMAT_BY_CREATIVE_TYPE: Record<CreativeAssetType, AdFormat> = {
  image: 'IMAGE',
  video: 'VIDEO',
  carousel: 'CAROUSEL',
};

const CREATIVE_TYPE_BY_AD_FORMAT: Record<AdFormat, CreativeAssetType> = {
  IMAGE: 'image',
  VIDEO: 'video',
  CAROUSEL: 'carousel',
  COLLECTION: 'image',
};

export function getAllowedCreativeTypesForAdFormat(
  adFormat: AdFormat | undefined,
): readonly CreativeAssetType[] {
  return AD_FORMAT_TO_CREATIVE_TYPES[adFormat ?? DEFAULT_AD_FORMAT];
}

export function getAllowedAdFormatsForCreativeType(
  assetType: CreativeAssetType | undefined,
): readonly AdFormat[] {
  return CREATIVE_TYPE_TO_AD_FORMATS[assetType ?? DEFAULT_CREATIVE_ASSET_TYPE];
}

/** The ad format a creative implies: what an ad reads its format from. */
export function adFormatForCreativeType(assetType: CreativeAssetType | undefined): AdFormat {
  return AD_FORMAT_BY_CREATIVE_TYPE[assetType ?? DEFAULT_CREATIVE_ASSET_TYPE];
}

/** The creative a new node under an ad of this format should start as. */
export function creativeTypeForAdFormat(adFormat: AdFormat | undefined): CreativeAssetType {
  return CREATIVE_TYPE_BY_AD_FORMAT[adFormat ?? DEFAULT_AD_FORMAT];
}

export function isAdFormatCompatibleWithCreativeType(
  adFormat: AdFormat | undefined,
  assetType: CreativeAssetType | undefined,
): boolean {
  const allowedCreativeTypes = getAllowedCreativeTypesForAdFormat(adFormat);
  const creativeType = assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  return allowedCreativeTypes.includes(creativeType);
}

/**
 * A creative's data re-cut for a new format, so a format switch never leaves an asset
 * the format cannot hold: a video is not an image, and a carousel keeps its assets as
 * cards. The single asset seeds the first card; the first matching card becomes the
 * single asset on the way back.
 */
export function retargetCreativeData(
  data: CreativeData,
  assetType: CreativeAssetType,
): Partial<CreativeData> {
  const current = data.assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  if (current === assetType) return {};
  const cleared = { mediaId: undefined, assetUrl: undefined, thumbnailUrl: undefined };

  if (assetType === 'carousel') {
    const seed: CarouselCard[] =
      data.mediaId && current !== 'carousel'
        ? [
            {
              mediaId: data.mediaId,
              kind: current,
              ...(data.thumbnailUrl ? { thumbnailUrl: data.thumbnailUrl } : {}),
            },
          ]
        : [];
    return { ...cleared, assetType, cards: data.cards?.length ? data.cards : seed };
  }

  if (current === 'carousel') {
    const card = data.cards?.find((entry) => entry.kind === assetType);
    return {
      ...cleared,
      assetType,
      cards: undefined,
      ...(card
        ? {
            mediaId: card.mediaId,
            ...(card.thumbnailUrl ? { thumbnailUrl: card.thumbnailUrl } : {}),
          }
        : {}),
    };
  }

  return { ...cleared, assetType };
}
