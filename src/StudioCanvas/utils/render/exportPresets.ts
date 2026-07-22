// Output presets for the Video Editor render. `Source` keeps the first clip's
// native dimensions (today's behavior); the others letterbox the timeline into a
// fixed frame (aspect conversion) at a preset bitrate. Format stays MP4/H.264 for
// now — WebM/H.265 via canEncode probing is a follow-up. Pure data so it is shared
// by the node UI and the render worker payload.

export interface ExportPreset {
  id: string;
  label: string;
  /** null = keep the source frame's dimensions. */
  width: number | null;
  height: number | null;
  videoBitrate: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'source', label: 'Source resolution', width: null, height: null, videoBitrate: 6_000_000 },
  {
    id: 'vertical-1080',
    label: 'Vertical · 1080×1920',
    width: 1080,
    height: 1920,
    videoBitrate: 9_000_000,
  },
  {
    id: 'vertical-720',
    label: 'Vertical · 720×1280',
    width: 720,
    height: 1280,
    videoBitrate: 5_000_000,
  },
  {
    id: 'square-1080',
    label: 'Square · 1080×1080',
    width: 1080,
    height: 1080,
    videoBitrate: 8_000_000,
  },
  {
    id: 'wide-1080',
    label: 'Widescreen · 1920×1080',
    width: 1920,
    height: 1080,
    videoBitrate: 10_000_000,
  },
];

export const DEFAULT_EXPORT_PRESET_ID = 'source';

export function resolveExportPreset(id: string | undefined): ExportPreset {
  return EXPORT_PRESETS.find((preset) => preset.id === id) ?? EXPORT_PRESETS[0];
}
