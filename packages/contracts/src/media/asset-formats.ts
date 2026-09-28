export type LibraryFormatFamily =
  | 'raster_image'
  | 'video'
  | 'audio'
  | 'broadcast_video'
  | 'container_video'
  | 'design_source'
  | 'document'
  | 'office_document'
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
  originalKind: 'image' | 'video' | 'audio' | 'file';
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
    // The browser's own <audio> element plays every one of these; the waveform is
    // decoded client-side, so no rendition is ever needed.
    family: 'audio',
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac'],
    mimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      'audio/x-flac',
    ],
    originalKind: 'audio',
    previewStrategy: 'native',
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
    // Containers no browser <video> element plays reliably (WMV never, AVI/MKV only by luck
    // of codec). The server transcodes a 720p H.264 playback proxy; the original stays the
    // download. Under the 500 MB viewer cap like any other video, so it lives there.
    family: 'container_video',
    extensions: ['mkv', 'avi', 'wmv'],
    mimeTypes: [
      'video/x-matroska',
      'video/x-msvideo',
      'video/avi',
      'video/msvideo',
      'video/x-ms-wmv',
      'video/x-ms-asf',
    ],
    originalKind: 'video',
    previewStrategy: 'proxy_transcode',
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
    // The browser's built-in PDF viewer renders a signed URL directly, so a PDF
    // needs no companion preview to be readable in the Library.
    family: 'document',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    originalKind: 'file',
    previewStrategy: 'native',
  },
  {
    // No converter runs on these: the card and the stage say so and offer the download,
    // rather than inventing a thumbnail or waiting on a companion that never comes.
    family: 'office_document',
    extensions: ['docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.ms-excel',
    ],
    originalKind: 'file',
    previewStrategy: 'none',
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
  'container_video',
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
 * MP4/MOV, or `{stem}_preview`. Applies to After Effects, Premiere, MXF and MKV/AVI/WMV.
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

const STORED_IMAGE_PREVIEW_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const STORED_IMAGE_PREVIEW_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/**
 * The share-safe preview a file gets: a WebP still for a JPEG/PNG/WebP/AVIF photo, a 720p
 * proxy for any video (small browser MP4s included — a share never signs the original), none
 * for anything else (GIF keeps its animation, documents and audio have their own viewers).
 * A known extension decides; a name with none, or an unknown one ('gemini-file-…' — 325 of
 * prod's 8,634 photos), falls back to the MIME type. HEIC is not a Library image format, and
 * the Backend's image decoder (prebuilt sharp/libvips) has no HEVC to read it.
 */
export function sharePreviewRoleFor(file: {
  fileName: string;
  mimeType?: string | null;
}): 'preview_image' | 'preview_video' | null {
  const format = classifyLibraryFile({
    fileName: file.fileName,
    mimeType: file.mimeType ?? undefined,
  });
  if (!format.accepted) return null;
  if (format.originalKind === 'video') return 'preview_video';
  if (format.family !== 'raster_image') return null;
  if (classifyLibraryFile({ fileName: file.fileName }).accepted) {
    const extension = file.fileName.toLowerCase().split('.').pop() ?? '';
    return STORED_IMAGE_PREVIEW_EXTENSIONS.has(extension) ? 'preview_image' : null;
  }
  const mimeType = file.mimeType?.trim().toLowerCase() ?? '';
  return STORED_IMAGE_PREVIEW_MIME_TYPES.has(mimeType) ? 'preview_image' : null;
}
