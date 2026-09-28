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
  | 'font'
  | 'model_3d'
  | 'html_bundle'
  /** Anything no other family claims: stored, versioned, shared and downloaded, never drawn. */
  | 'generic';

export type LibraryPreviewStrategy =
  | 'native'
  | 'browser_video'
  | 'browser_raster'
  | 'companion'
  /**
   * Server writes a playable proxy into `media-previews`: an H.264 `preview_video` for
   * video, an `audio_proxy` for audio. The original (MXF, oversized ProRes, AIFF) stays
   * the download and is not the player source.
   */
  | 'proxy_transcode'
  /** A 3D viewer draws the original (glTF/GLB/OBJ/STL…) or its converted `model_glb`. */
  | 'model_viewer'
  /** An unzipped HTML bundle served from an isolated origin into a sandboxed iframe. */
  | 'html_sandbox'
  /** The file carries its own page previews (InDesign XMP thumbnails) → `page_N`. */
  | 'embedded_pages'
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

// By extension every ZIP is this; classifyZipEntries tells it apart once the entries are read.
const AFTER_EFFECTS_PACKAGE_FORMAT: LibraryFormatDefinition = {
  family: 'after_effects_package',
  extensions: ['zip'],
  mimeTypes: ['application/zip', 'application/x-zip-compressed'],
  originalKind: 'file',
  previewStrategy: 'companion',
};

export const LIBRARY_FORMATS: readonly LibraryFormatDefinition[] = [
  {
    family: 'raster_image',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'],
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'image/bmp',
      'image/x-ms-bmp',
    ],
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
    // No browser plays these, so the server writes an `audio_proxy`.
    family: 'audio',
    extensions: ['aiff', 'aif', 'wma'],
    mimeTypes: ['audio/aiff', 'audio/x-aiff', 'audio/x-ms-wma'],
    originalKind: 'audio',
    previewStrategy: 'proxy_transcode',
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
    // Containers no browser <video> element plays reliably (WMV/FLV never, AVI/MKV/3GP only
    // by luck of codec). The server transcodes a 720p H.264 playback proxy; the original stays
    // the download. Under the 500 MB viewer cap like any other video, so it lives there.
    family: 'container_video',
    extensions: ['mkv', 'avi', 'wmv', '3gp', '3g2', 'flv'],
    mimeTypes: [
      'video/x-matroska',
      'video/x-msvideo',
      'video/avi',
      'video/msvideo',
      'video/x-ms-wmv',
      'video/x-ms-asf',
      'video/3gpp',
      'video/3gpp2',
      'video/x-flv',
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
    // EPS by extension too: browsers send it with an empty MIME type.
    family: 'design_source',
    extensions: ['ai', 'eps'],
    mimeTypes: ['application/illustrator', 'application/postscript'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  {
    // Camera/VFX stills no browser decodes. Stored and downloadable; no preview yet.
    family: 'design_source',
    extensions: ['tga', 'exr'],
    mimeTypes: ['image/x-tga', 'image/x-targa', 'image/x-exr'],
    originalKind: 'file',
    previewStrategy: 'none',
  },
  {
    // InDesign stores page thumbnails in its own XMP; ingest writes them as `page_N`.
    family: 'design_source',
    extensions: ['indd'],
    mimeTypes: ['application/x-indesign'],
    originalKind: 'file',
    previewStrategy: 'embedded_pages',
  },
  {
    // STEP/IGES are converted to a stored `model_glb`; the rest load in the viewer directly.
    family: 'model_3d',
    extensions: [
      'glb',
      'gltf',
      'obj',
      'stl',
      'fbx',
      'ply',
      'dae',
      '3ds',
      'usdz',
      'step',
      'stp',
      'iges',
      'igs',
    ],
    mimeTypes: [
      'model/gltf-binary',
      'model/gltf+json',
      'model/obj',
      'model/stl',
      'model/x.stl-binary',
      'model/vnd.usdz+zip',
      'model/step',
      'model/iges',
      'model/vnd.collada+xml',
    ],
    originalKind: 'file',
    previewStrategy: 'model_viewer',
  },
  {
    family: 'after_effects',
    extensions: ['aep', 'aepx', 'aet'],
    mimeTypes: ['application/vnd.adobe.aftereffects.project'],
    originalKind: 'file',
    previewStrategy: 'companion',
  },
  AFTER_EFFECTS_PACKAGE_FORMAT,
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

/**
 * What an unclassified file becomes, so the Library can accept anything: a plain file in
 * `media-source` with an icon, versions, share and download — never a preview.
 */
export const LIBRARY_GENERIC_FORMAT: LibraryFormatDefinition = {
  family: 'generic',
  extensions: [],
  mimeTypes: [],
  originalKind: 'file',
  previewStrategy: 'none',
  storageBucket: 'media-source',
};

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
 * Accept-anything classification for the upload path: a known format, else
 * LIBRARY_GENERIC_FORMAT. `classifyLibraryFile` keeps refusing unknown files for the
 * callers that only take media (Forge inputs, sidecars, proxies).
 */
export function classifyLibraryFileOrGeneric(input: {
  fileName: string;
  mimeType?: string | null;
}): { accepted: true } & LibraryFormatDefinition {
  const format = classifyLibraryFile(input);
  return format.accepted ? format : { accepted: true, ...LIBRARY_GENERIC_FORMAT };
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

const MB = 1024 * 1024;

/**
 * The Supabase project-GLOBAL Storage upload limit; it overrides every bucket's own cap.
 * Measured 2026-09-27 with TUS creates on media-source: 250 MB + 1 byte → 201, 500 MB + 1 → 413.
 * Raising it is an owner decision (dashboard), so uploads are refused before their bytes move.
 */
export const LIBRARY_UPLOAD_MAX_BYTES = 500 * MB;

/**
 * The largest After Effects project or package the Template Forge parses. Re-exported as
 * FORGE_PROJECT_FILE_MAX_BYTES (template-source.ts documents the ceilings it reconciles).
 */
export const LIBRARY_PROJECT_FILE_MAX_BYTES = 250 * MB;

const PROJECT_FILE_FAMILIES: readonly LibraryFormatFamily[] = [
  'after_effects',
  'after_effects_package',
];

function megabytes(bytes: number): string {
  return (bytes / MB).toFixed(1).replace(/\.0$/, '');
}

/**
 * Why a file cannot go into the Library, as the sentence the upload strip shows — decided
 * before a byte is sent — or null. Anything is accepted: fonts go to the brand font store,
 * every file stops at the Storage cap, and forge-parsed project files at the forge's limit.
 * A caller that does not know the size yet passes none and gets only the font answer.
 */
export function libraryUploadRefusal(file: {
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}): string | null {
  if (isLibraryFontFile(file)) {
    return `${file.fileName} is a font — fonts are kept in the brand font store, not the Library.`;
  }
  const size = file.sizeBytes;
  if (size == null) return null;
  if (size > LIBRARY_UPLOAD_MAX_BYTES) {
    return `${file.fileName} is ${megabytes(size)} MB — uploads are capped at ${LIBRARY_UPLOAD_MAX_BYTES / MB} MB right now.`;
  }
  const format = classifyLibraryFileOrGeneric(file);
  if (PROJECT_FILE_FAMILIES.includes(format.family) && size > LIBRARY_PROJECT_FILE_MAX_BYTES) {
    return `${file.fileName} is ${megabytes(size)} MB — After Effects projects and packages must be ${LIBRARY_PROJECT_FILE_MAX_BYTES / MB} MB or smaller.`;
  }
  return null;
}

/**
 * The Library file pickers' `accept`: empty, because the Library takes any file (an unknown
 * one becomes a generic file). A list here greyed out every type the registry had not named.
 */
export const LIBRARY_ACCEPT_ATTRIBUTE = '';

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

/**
 * What a ZIP holds decides what it is: every ZIP used to be treated as an After Effects
 * package and sent to template parse.
 * - `aep_package`: a Collect Files export (an .aep/.aepx anywhere inside).
 * - `html_bundle`: an `index.html` at the root, or under one wrapping folder.
 * - `archive`: anything else — stored as a generic file.
 */
export type ZipContentKind = 'aep_package' | 'html_bundle' | 'archive';

export const LIBRARY_ZIP_FORMATS: Readonly<Record<ZipContentKind, LibraryFormatDefinition>> = {
  aep_package: AFTER_EFFECTS_PACKAGE_FORMAT,
  html_bundle: {
    family: 'html_bundle',
    extensions: ['zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    originalKind: 'file',
    previewStrategy: 'html_sandbox',
  },
  archive: LIBRARY_GENERIC_FORMAT,
};

function isZipNoise(name: string): boolean {
  return (
    name.startsWith('__MACOSX/') || name.endsWith('/') || name.split('/').pop() === '.DS_Store'
  );
}

/** The bundle's entry page — `index.html` at the root or under one wrapping folder — or null. */
export function htmlBundleEntryPoint(entryNames: readonly string[]): string | null {
  const names = entryNames
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => !isZipNoise(name));
  const isIndex = (path: string) => /^index\.html?$/i.test(path);
  const atRoot = names.find(isIndex);
  if (atRoot) return atRoot;
  const [first] = names;
  const wrapper = first?.includes('/') ? first.slice(0, first.indexOf('/') + 1) : null;
  if (!wrapper || !names.every((name) => name.startsWith(wrapper))) return null;
  return names.find((name) => isIndex(name.slice(wrapper.length))) ?? null;
}

/**
 * The body of an `html_bundle` rendition (a JSON object in media-previews): the entry page
 * and the bundle's file count. The viewer serves files out of the ORIGINAL zip; this only
 * says where to start. Null when the zip is not an HTML bundle.
 */
export function htmlBundleManifest(
  entryNames: readonly string[],
): { entry: string; fileCount: number } | null {
  const entry = htmlBundleEntryPoint(entryNames);
  if (!entry) return null;
  const fileCount = entryNames.filter((name) => !isZipNoise(name.replaceAll('\\', '/'))).length;
  return { entry, fileCount };
}

/**
 * The `html_bundle` rendition for one zip version — the object to store and the row to upsert
 * (on asset_version_id,role). One builder for every writer (library-upload, Drive, the viewer's
 * lazy backfill) so the row fmt-search filters on and the JSON the viewer reads never drift.
 */
export function htmlBundleRendition(input: {
  brandId: string;
  assetId: string;
  versionId: string;
  renditionId: string;
  manifest: { entry: string; fileCount: number };
}) {
  const body = JSON.stringify(input.manifest);
  const storagePath = `${input.brandId}/${input.assetId}/${input.versionId}/html_bundle-${input.renditionId}.json`;
  return {
    bucket: 'media-previews' as const,
    storagePath,
    body,
    row: {
      brand_id: input.brandId,
      asset_id: input.assetId,
      asset_version_id: input.versionId,
      role: 'html_bundle' as const,
      state: 'ready' as const,
      bucket: 'media-previews' as const,
      storage_path: storagePath,
      mime_type: 'application/json',
      size_bytes: new TextEncoder().encode(body).byteLength,
      renderer: 'library-upload',
      renderer_version: '1',
      error_code: null,
      error_message: null,
    },
  };
}

export function classifyZipEntries(entryNames: readonly string[]): ZipContentKind {
  if (entryNames.some((name) => /\.aepx?$/i.test(name) && !isZipNoise(name))) return 'aep_package';
  return htmlBundleEntryPoint(entryNames) ? 'html_bundle' : 'archive';
}
