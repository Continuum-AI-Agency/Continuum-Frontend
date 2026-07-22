import type { AdFormat, CreativeAssetType } from './index';

export const DEFAULT_AD_FORMAT: AdFormat = 'IMAGE';
export const DEFAULT_CREATIVE_ASSET_TYPE: CreativeAssetType = 'image';

const AD_FORMAT_TO_CREATIVE_TYPES: Record<AdFormat, readonly CreativeAssetType[]> = {
  IMAGE: ['image'],
  VIDEO: ['video'],
  CAROUSEL: ['image', 'video'],
  COLLECTION: ['image', 'video'],
};

const CREATIVE_TYPE_TO_AD_FORMATS: Record<CreativeAssetType, readonly AdFormat[]> = {
  image: ['IMAGE', 'CAROUSEL', 'COLLECTION'],
  video: ['VIDEO', 'CAROUSEL', 'COLLECTION'],
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

export function isAdFormatCompatibleWithCreativeType(
  adFormat: AdFormat | undefined,
  assetType: CreativeAssetType | undefined,
): boolean {
  const allowedCreativeTypes = getAllowedCreativeTypesForAdFormat(adFormat);
  const creativeType = assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  return allowedCreativeTypes.includes(creativeType);
}
