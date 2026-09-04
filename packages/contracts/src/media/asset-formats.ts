export type LibraryFormatFamily =
  | 'raster_image'
  | 'video'
  | 'design_source'
  | 'document'
  | 'after_effects'
  | 'after_effects_package'
  | 'font';

export type LibraryPreviewStrategy =
  | 'native'
  | 'browser_video'
  | 'browser_raster'
  | 'companion'
  /**
   * Nothing is ever drawn. A brand face is licensed to the brand and the font store never
   * mints a URL for one, so a browser cannot have the file — `fontFamily` would silently
   * fall through to the app's own typeface under a label carrying the brand's name. See
   * `components/brand/typefaceHonesty.tsx`.
   */
  | 'none';

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
  {
    // Accepted by the Library so a designer can drop a template and the faces it needs in one
    // gesture — but NOT stored like one. A font never becomes a media.assets row: that would
    // hand it search, share links and signed-URL minting, every one of which publishes a
    // licensed file. `isLibraryFontFile` routes it to the private brand font store instead.
    family: 'font',
    extensions: ['ttf', 'otf', 'woff', 'woff2'],
    mimeTypes: [
      'font/ttf',
      'font/otf',
      'font/woff',
      'font/woff2',
      'application/font-sfnt',
      'application/x-font-ttf',
      'application/x-font-otf',
      'application/vnd.ms-opentype',
    ],
    originalKind: 'file',
    previewStrategy: 'none',
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

/**
 * Does this file belong in the brand font store rather than the media library?
 *
 * The one branch that keeps licensed faces out of `media.assets`. Callers that upload must
 * check it BEFORE `uploadMediaAsset`, not after.
 */
export function isLibraryFontFile(input: { fileName: string; mimeType?: string | null }): boolean {
  const format = classifyLibraryFile(input);
  return format.accepted && format.family === 'font';
}

export const LIBRARY_ACCEPT_ATTRIBUTE = Array.from(
  new Set(
    LIBRARY_FORMATS.flatMap((format) => format.extensions.map((extension) => `.${extension}`)),
  ),
).join(',');
