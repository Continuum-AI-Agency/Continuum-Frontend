// The Export node's format vocabulary — the ids only, and which modality each applies to.
//
// It lives here rather than beside the encoders because two callers need it and only one
// of them can run in a browser: `Continuum-Frontend/src/lib/export/transcode.ts` owns the
// OffscreenCanvas / Mediabunny / gifenc engines and imports these ids, and the agent node
// vocabulary (agent-vocabulary.ts) renders them as the legal values of `export.format`.
// A second hand-kept copy of the list on this side is exactly the drift that makes an
// agent-facing prompt lie about what the Export node accepts.
//
// Data only — the encoders, MIME types, extensions and picker copy stay in the Frontend,
// where the platform APIs that produce them live.

export type ExportKind = 'image' | 'video';

/** Stills. The platform encodes all three from an `OffscreenCanvas`. */
export const IMAGE_EXPORT_FORMATS = ['png', 'jpg', 'webp'] as const;

/** Clips. `video-original` is the no-re-encode passthrough. */
export const VIDEO_EXPORT_FORMATS = [
  'video-original',
  'mp4-h264',
  'mp4-h265',
  'mov-h264',
  'gif',
] as const;

export type ExportFormatId =
  | (typeof IMAGE_EXPORT_FORMATS)[number]
  | (typeof VIDEO_EXPORT_FORMATS)[number];

/** The formats legal for one upstream modality. An image pool cannot be written as MP4. */
export const exportFormatsForKind = (kind: ExportKind): readonly ExportFormatId[] =>
  kind === 'image' ? IMAGE_EXPORT_FORMATS : VIDEO_EXPORT_FORMATS;
