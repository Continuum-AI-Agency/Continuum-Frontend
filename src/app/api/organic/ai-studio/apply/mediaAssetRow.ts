export type AppliedMediaAssetInput = {
  brandProfileId: string;
  userId: string;
  draftId: string;
  bucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
};

export function buildAppliedMediaAssetRow(params: AppliedMediaAssetInput) {
  return {
    brand_id: params.brandProfileId,
    created_by: params.userId,
    kind: params.kind,
    bucket: params.bucket,
    storage_path: params.storagePath,
    file_name: params.fileName,
    mime_type: params.mimeType,
    size_bytes: params.sizeBytes ?? null,
    width: params.width ?? null,
    height: params.height ?? null,
    source: 'ai_generated' as const,
    origin_ref: { draftId: params.draftId },
    status: 'stored' as const,
  };
}
