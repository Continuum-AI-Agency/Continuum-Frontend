import { z } from 'zod';

// Playback renditions (Frame.io's proxy spec): an H.264 ladder, an H.265 Main 10 proxy for
// HDR sources, a scrub sprite, and an AAC proxy for audio. Continuum-Render makes them (it
// keeps its own copy of these numbers — it takes no workspace dependency), the Backend stores
// them, and the Frontend's /api/library/playback signs the ready ones.

/**
 * The SDR ladder, largest first. Each rung bounds the SHORT side and caps the bitrate
 * (Frame.io: 4K averages ≤14 Mbps, HD 4 Mbps, SD 2.2 Mbps). `preview_video` is the 720 rung:
 * it is what shares and the stage play by default. A rung above the source is never made.
 */
export const LIBRARY_PROXY_LADDER = [
  { role: 'proxy_2160', shortSide: 2160, maxKbps: 14_000, label: '2160p' },
  { role: 'proxy_1080', shortSide: 1080, maxKbps: 4_000, label: '1080p' },
  { role: 'preview_video', shortSide: 720, maxKbps: 4_000, label: '720p' },
  { role: 'proxy_540', shortSide: 540, maxKbps: 2_200, label: '540p' },
  { role: 'proxy_360', shortSide: 360, maxKbps: 2_200, label: '360p' },
] as const;
export type LibraryLadderRole = (typeof LIBRARY_PROXY_LADDER)[number]['role'];

/** H.265 Main 10, BT.2020 with PQ or HLG, for HDR10/HLG sources only. */
export const LIBRARY_HDR_PROXY_SHORT_SIDE = 1080;

/** Every role a video's playback owns; one row each, `ready` or `unsupported` (not applicable). */
export const LIBRARY_VIDEO_PLAYBACK_ROLES = [
  ...LIBRARY_PROXY_LADDER.map((rung) => rung.role),
  'hdr_proxy',
  'scrub_sprite',
] as const;
export const LIBRARY_AUDIO_PLAYBACK_ROLES = ['audio_proxy'] as const;
export type LibraryPlaybackRole =
  | (typeof LIBRARY_VIDEO_PLAYBACK_ROLES)[number]
  | (typeof LIBRARY_AUDIO_PLAYBACK_ROLES)[number];

/** AAC 128 kbps stereo; a source with more than 8 channels is download-only. */
export const LIBRARY_AUDIO_PROXY_KBPS = 128;
export const LIBRARY_AUDIO_PROXY_MAX_SOURCE_CHANNELS = 8;

/**
 * The scrub sprite is always a GRID × GRID sheet of equal tiles in time order: tile i shows
 * the moment i/(GRID²) of the way through. Fixed, so the sheet's own width and height are its
 * whole layout and no metadata column is needed.
 */
export const SCRUB_SPRITE_GRID = 10;
export const SCRUB_SPRITE_TILES = SCRUB_SPRITE_GRID * SCRUB_SPRITE_GRID;

/** The tile under a pointer at `fraction` (0…1) of the clip, as a CSS background position. */
export function scrubSpriteTile(fraction: number): {
  index: number;
  column: number;
  row: number;
  /** background-position in percent of the (sheet - tile) span, for background-size 1000%. */
  backgroundPosition: string;
} {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const index = Math.min(SCRUB_SPRITE_TILES - 1, Math.floor(clamped * SCRUB_SPRITE_TILES));
  const column = index % SCRUB_SPRITE_GRID;
  const row = Math.floor(index / SCRUB_SPRITE_GRID);
  const step = 100 / (SCRUB_SPRITE_GRID - 1);
  return {
    index,
    column,
    row,
    backgroundPosition: `${(column * step).toFixed(4)}% ${(row * step).toFixed(4)}%`,
  };
}

export const libraryPlaybackRungSchema = z
  .object({
    role: z.enum([
      'proxy_2160',
      'proxy_1080',
      'preview_video',
      'proxy_540',
      'proxy_360',
      'hdr_proxy',
    ] satisfies (LibraryLadderRole | 'hdr_proxy')[]),
    label: z.string().min(1),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    sizeBytes: z.number().int().nonnegative().nullable(),
    mimeType: z.string().min(1),
    /** True only for `hdr_proxy`; every H.264 rung is SDR (tone-mapped for an HDR source). */
    hdr: z.boolean(),
    signedUrl: z.string().url(),
  })
  .strict();
export type LibraryPlaybackRung = z.infer<typeof libraryPlaybackRungSchema>;

/** GET /api/library/playback — the ready playback renditions of one version, signed. */
export const libraryPlaybackSchema = z
  .object({
    assetId: z.string().uuid(),
    assetVersionId: z.string().uuid(),
    /** The version's own file name — what a saved still or proxy is named after. */
    fileName: z.string().min(1).optional(),
    /** Largest first, `hdr_proxy` last. Empty until the ladder is made. */
    rungs: z.array(libraryPlaybackRungSchema),
    sprite: z
      .object({
        signedUrl: z.string().url(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        durationMs: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    audioProxy: z
      .object({
        signedUrl: z.string().url(),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type LibraryPlayback = z.infer<typeof libraryPlaybackSchema>;
