import { classifyLibraryFile, type MediaAsset } from '@continuum/contracts';

type Previewable = Pick<MediaAsset, 'fileName' | 'mimeType' | 'preview'>;

export function formatUsesCompanionPreview(fileName: string, mimeType?: string | null): boolean {
  const format = classifyLibraryFile({ fileName, mimeType });
  return (
    format.accepted &&
    (format.previewStrategy === 'companion' || format.previewStrategy === 'proxy_transcode')
  );
}

/** MXF / AEP / PSD — play the companion or proxy, never the original bytes. */
export function assetShowsCompanionStage(asset: Previewable): boolean {
  if (asset.preview?.state === 'ready') return false;
  return formatUsesCompanionPreview(asset.fileName, asset.mimeType);
}

export type OfficeDocumentType = 'document' | 'spreadsheet' | 'presentation';

const OFFICE_DOCUMENT_TYPES: Record<string, OfficeDocumentType> = {
  docx: 'document',
  doc: 'document',
  xlsx: 'spreadsheet',
  xls: 'spreadsheet',
  pptx: 'presentation',
  ppt: 'presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-powerpoint': 'presentation',
};

/** Office files have no converter: null for anything else, else which icon to draw. */
export function officeDocumentType(
  fileName: string,
  mimeType?: string | null,
): OfficeDocumentType | null {
  const format = classifyLibraryFile({ fileName, mimeType });
  if (!format.accepted || format.family !== 'office_document') return null;
  const extension = fileName.trim().toLowerCase().split('.').pop() ?? '';
  return (
    OFFICE_DOCUMENT_TYPES[extension] ??
    OFFICE_DOCUMENT_TYPES[mimeType?.trim().toLowerCase() ?? ''] ??
    'document'
  );
}
