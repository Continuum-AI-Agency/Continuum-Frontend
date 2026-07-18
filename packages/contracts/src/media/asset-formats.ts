export type LibraryFormatFamily =
  | 'raster_image'
  | 'video'
  | 'design_source'
  | 'document'
  | 'after_effects'
  | 'after_effects_package';

export type LibraryPreviewStrategy =
  | 'native'
  | 'browser_video'
  | 'browser_raster'
  | 'companion';

export type LibraryFormatDefinition = {
  family: LibraryFormatFamily;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  originalKind: 'image' | 'video' | 'file';
  previewStrategy: LibraryPreviewStrategy;
};

export const LIBRARY_FORMATS: readonly LibraryFormatDefinition[] = [
  {
    family: 'raster_image',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    originalKind: 'image',
    previewStrategy: 'native',
  },
  {
    family: 'video',
    extensions: ['mp4', 'mov', 'webm', 'm4v'],
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
    originalKind: 'video',
    previewStrategy: 'browser_video',
  },
  {
    family: 'design_source',
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml'],
    originalKind: 'file',
    previewStrategy: 'browser_raster',
  },
  {
    family: 'design_source',
    extensions: ['tif', 'tiff'],
    mimeTypes: ['image/tiff'],
    originalKind: 'file',
    previewStrategy: 'browser_raster',
  },
  {
    family: 'design_source',
    extensions: ['heic', 'heif'],
    mimeTypes: ['image/heic', 'image/heif'],
    originalKind: 'file',
    previewStrategy: 'browser_raster',
  },
  {
    family: 'design_source',
    extensions: ['psd'],
    mimeTypes: ['image/vnd.adobe.photoshop', 'image/x-photoshop'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  {
    family: 'document',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  {
    family: 'design_source',
    extensions: ['ai'],
    mimeTypes: ['application/illustrator', 'application/postscript'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  {
    family: 'after_effects',
    extensions: ['aep', 'aepx', 'aet'],
    mimeTypes: ['application/vnd.adobe.aftereffects.project'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  {
    family: 'after_effects_package',
    extensions: ['zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
] as const;

export type LibraryFileClassification =
  | ({ accepted: true } & LibraryFormatDefinition)
  | { accepted: false; reason: 'unsupported_extension_and_mime' };

function extensionOf(fileName: string): string {
  const name = fileName.trim().toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1) : '';
}

export function classifyLibraryFile(input: {
  fileName: string;
  mimeType?: string | null;
}): LibraryFileClassification {
  const extension = extensionOf(input.fileName);
  const mimeType = input.mimeType?.trim().toLowerCase() ?? '';
  const byExtension = LIBRARY_FORMATS.find((format) => format.extensions.includes(extension));
  if (byExtension) return { accepted: true, ...byExtension };
  const byMime = LIBRARY_FORMATS.find((format) => format.mimeTypes.includes(mimeType));
  return byMime
    ? { accepted: true, ...byMime }
    : { accepted: false, reason: 'unsupported_extension_and_mime' };
}

export const LIBRARY_ACCEPT_ATTRIBUTE = Array.from(
  new Set(LIBRARY_FORMATS.flatMap((format) => format.extensions.map((extension) => `.${extension}`))),
).join(',');
