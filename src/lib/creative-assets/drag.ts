export const CREATIVE_ASSET_DRAG_TYPE = "application/vnd.continuum.asset";

export type CreativeAssetDragPayload = {
  name: string;
  path: string;
  contentType?: string | null;
};
