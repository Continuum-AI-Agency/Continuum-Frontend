// Technical metadata: what a probe (Mediabunny for audio/video, sharp for stills, XMP for
// InDesign) read out of a file. The full result is stored on the version
// (media.asset_versions.media_info); media.assets carries typed copies of the HEAD
// version's probe, written by media.record_media_info, so browse can sort, filter and
// range-query them. The jsonb keys below ARE the contract with that SQL: it reads
// `probe.info->>'videoCodec'` etc., one key per typed column (MEDIA_ASSET_TECHNICAL_COLUMNS).

import { z } from 'zod';

export const DYNAMIC_RANGES = [
  'sdr',
  'hdr10',
  'hlg',
  'dolby_vision',
  'hdr10plus',
  'unknown',
] as const;
export const dynamicRangeSchema = z.enum(DYNAMIC_RANGES);
export type DynamicRange = z.infer<typeof dynamicRangeSchema>;

const positiveInt = () => z.number().int().positive();
const nonNegativeInt = () => z.number().int().nonnegative();
const label = () => z.string().min(1).max(200);

/** Typed copies on media.assets, camelCase. Null = not probed, or the probe could not tell. */
export const mediaAssetTechnicalFieldsSchema = z.object({
  videoCodec: label().nullable().optional(),
  // numeric(8,3): 29.97002997 is stored as 29.970.
  frameRate: z.number().positive().max(99_999).nullable().optional(),
  bitRate: nonNegativeInt().nullable().optional(),
  videoBitRate: nonNegativeInt().nullable().optional(),
  colorSpace: label().nullable().optional(),
  dynamicRange: dynamicRangeSchema.nullable().optional(),
  bitDepth: z.number().int().min(1).max(32).nullable().optional(),
  hasAlpha: z.boolean().nullable().optional(),
  // SMPTE, e.g. 01:00:00:00 (or 01:00:00;00 drop-frame).
  startTimecode: z.string().min(1).max(32).nullable().optional(),
  endTimecode: z.string().min(1).max(32).nullable().optional(),
  audioCodec: label().nullable().optional(),
  audioBitRate: nonNegativeInt().nullable().optional(),
  audioChannels: z.number().int().min(1).max(64).nullable().optional(),
  audioSampleRate: positiveInt().nullable().optional(),
  audioBitDepth: z.number().int().min(1).max(64).nullable().optional(),
  pageCount: positiveInt().nullable().optional(),
  // Whether the file carries GPS. The coordinates themselves are never stored.
  hasLocation: z.boolean().nullable().optional(),
  mediaProbedAt: z.string().nullable().optional(),
  mediaProbeError: z.string().nullable().optional(),
});
export type MediaAssetTechnicalFields = z.infer<typeof mediaAssetTechnicalFieldsSchema>;

/** camelCase field → media.assets column, for select lists, sorts and range filters. */
export const MEDIA_ASSET_TECHNICAL_COLUMNS = {
  videoCodec: 'video_codec',
  frameRate: 'frame_rate',
  bitRate: 'bit_rate',
  videoBitRate: 'video_bit_rate',
  colorSpace: 'color_space',
  dynamicRange: 'dynamic_range',
  bitDepth: 'bit_depth',
  hasAlpha: 'has_alpha',
  startTimecode: 'start_timecode',
  endTimecode: 'end_timecode',
  audioCodec: 'audio_codec',
  audioBitRate: 'audio_bit_rate',
  audioChannels: 'audio_channels',
  audioSampleRate: 'audio_sample_rate',
  audioBitDepth: 'audio_bit_depth',
  pageCount: 'page_count',
  hasLocation: 'has_location',
  mediaProbedAt: 'media_probed_at',
  mediaProbeError: 'media_probe_error',
} as const satisfies Record<keyof MediaAssetTechnicalFields, string>;

/**
 * media.asset_versions.media_info. Each typed key maps to its column; `probedAt` →
 * media_probed_at and `error` → media_probe_error. width/height/durationMs fill the asset's
 * own columns only where those are null. The rest is kept for the info panel.
 */
export const mediaInfoSchema = z
  .object({
    /** Who read it, e.g. `mediabunny@1.21.0`, `sharp@0.34.2`, `indd-xmp`. */
    prober: z.string().min(1).max(100),
    /** Stamped by record_media_info when absent. */
    probedAt: z.string().datetime({ offset: true }).optional(),
    /** The probe ran but could not read everything; whatever it did read is kept. */
    error: z.string().min(1).max(2000).optional(),
    container: label().optional(),
    width: positiveInt().optional(),
    height: positiveInt().optional(),
    durationMs: nonNegativeInt().max(2_147_483_647).optional(),
    bitRate: nonNegativeInt().optional(),
    videoCodec: label().optional(),
    videoProfile: label().optional(),
    frameRate: z.number().positive().max(99_999).optional(),
    videoBitRate: nonNegativeInt().optional(),
    colorSpace: label().optional(),
    colorPrimaries: label().optional(),
    colorTransfer: label().optional(),
    colorMatrix: label().optional(),
    dynamicRange: dynamicRangeSchema.optional(),
    bitDepth: z.number().int().min(1).max(32).optional(),
    hasAlpha: z.boolean().optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    startTimecode: z.string().min(1).max(32).optional(),
    endTimecode: z.string().min(1).max(32).optional(),
    dropFrame: z.boolean().optional(),
    audioCodec: label().optional(),
    audioBitRate: nonNegativeInt().optional(),
    audioChannels: z.number().int().min(1).max(64).optional(),
    audioSampleRate: positiveInt().optional(),
    audioBitDepth: z.number().int().min(1).max(64).optional(),
    pageCount: positiveInt().optional(),
    hasLocation: z.boolean().optional(),
    /** Anything else the prober read (EXIF camera fields, per-track detail). Never GPS. */
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type MediaInfo = z.infer<typeof mediaInfoSchema>;

/** media.record_media_info's answer. */
export const recordMediaInfoResultSchema = z
  .object({ assetId: z.string().uuid(), versionId: z.string().uuid(), isHead: z.boolean() })
  .strict();
export type RecordMediaInfoResult = z.infer<typeof recordMediaInfoResultSchema>;
