export type LibraryFormatFamily =
  | 'raster_image'
  | 'video'
  | 'broadcast_video'
  | 'design_source'
  | 'document'
  | 'after_effects'
  | 'after_effects_package'
  | 'premiere_project'
  | 'font';

export type LibraryPreviewStrategy =
  | 'native'
  | 'browser_video'
  | 'browser_raster'
  | 'companion'
  /**
   * Server writes an H.264 `preview_video` into `media-previews`. The original
   * (MXF, oversized ProRes) stays in `media-source` and is not the player source.
   */
  | 'proxy_transcode'
  /**
   * Nothing is ever drawn. A brand face is licensed to the brand and the font store never
   * mints a URL for one, so a browser cannot have the file — `fontFamily` would silently
   * fall through to the app's own typeface under a label carrying the brand's name. See
   * `components/brand/typefaceHonesty.tsx`.
   */
  | 'none';

export type LibraryStorageBucket = 'media-library' | 'media-source';

export type LibraryFormatDefinition = {
  family: LibraryFormatFamily;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  originalKind: 'image' | 'video' | 'file';
  previewStrategy: LibraryPreviewStrategy;
  /**
   * Broadcast / project files exceed the viewer bucket's 500MB object cap.
   * Omit and the kind decides: `file` → media-source, else media-library.
   */
  storageBucket?: LibraryStorageBucket;
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
    // Premiere / broadcast camera files. Playable only after a proxy; the original
    // is often larger than the viewer bucket, so it lives next to AEP in media-source.
    family: 'broadcast_video',
    extensions: ['mxf'],
    mimeTypes: ['application/mxf', 'video/mxf'],
    originalKind: 'video',
    previewStrategy: 'proxy_transcode',
    storageBucket: 'media-source',
  },
  {
    // Premiere project XML/bin — not a movie. Preview is a sidecar MP4 only.
    family: 'premiere_project',
    extensions: ['prproj'],
    mimeTypes: ['application/vnd.adobe.premierepro.project'],
    originalKind: 'file',
    previewStrategy: 'companion',
    storageBucket: 'media-source',
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

export function libraryStorageBucket(format: LibraryFormatDefinition): LibraryStorageBucket {
  return (
    format.storageBucket ?? (format.originalKind === 'file' ? 'media-source' : 'media-library')
  );
}

const PLAYABLE_SIDECAR_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v']);
const SIDECAR_SOURCE_FAMILIES = new Set([
  'after_effects',
  'after_effects_package',
  'broadcast_video',
  'premiere_project',
]);

function fileStem(fileName: string): string {
  const name = fileName.trim().toLowerCase();
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const base = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * A playable preview for a source that the browser cannot decode: same stem
 * MP4/MOV, or `{stem}_preview`. Applies to After Effects, Premiere, and MXF.
 * Forge/aerender/ffmpeg of the original is a separate worker.
 */
export function isPlayableSidecarPreview(input: {
  sourceFileName: string;
  companionFileName: string;
}): boolean {
  const source = classifyLibraryFile({ fileName: input.sourceFileName });
  const companion = classifyLibraryFile({ fileName: input.companionFileName });
  if (!source.accepted || !SIDECAR_SOURCE_FAMILIES.has(source.family)) return false;
  if (!companion.accepted || companion.family !== 'video') return false;
  const companionExt = extensionOf(input.companionFileName);
  if (!PLAYABLE_SIDECAR_EXTENSIONS.has(companionExt)) return false;
  const sourceStem = fileStem(input.sourceFileName);
  const companionStem = fileStem(input.companionFileName);
  return companionStem === sourceStem || companionStem === `${sourceStem}_preview`;
}
