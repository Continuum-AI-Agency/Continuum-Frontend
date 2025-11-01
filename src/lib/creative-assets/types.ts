export type CreativeAssetKind = "file" | "folder";

export type CreativeAsset = {
  id: string;
  name: string;
  kind: CreativeAssetKind;
  path: string;
  fullPath: string;
  size: number | null;
  updatedAt: string | null;
  contentType: string | null;
  publicUrl?: string;
};

export type CreativeAssetListing = {
  assets: CreativeAsset[];
  path: string;
};

export type UploadResult = {
  asset: CreativeAsset;
};
