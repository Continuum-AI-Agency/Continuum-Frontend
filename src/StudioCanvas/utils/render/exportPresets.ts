// Output presets for the Video Editor render. `Source` keeps the first clip's
// native dimensions (today's behavior); the others letterbox the timeline into a
// fixed frame (aspect conversion) at a preset bitrate. Pure data so it is shared
// by the node UI and the render worker payload.
//
// Three orthogonal axes live here: GEOMETRY (`ExportPreset` — the frame), QUALITY
// (`ExportQuality` — the bitrate ladder, the PRD's Standard/High/Compact profiles),
// and CODEC (`resolveExportCodec` + the capability probe).
//
// HONEST CEILING, and the reason there is no codec picker in the UI yet: the splice
// worker protocol carries `videoBitrate` and nothing else, and `composeTimeline`
// hardcodes `codec: 'avc'`. Both are frozen this wave. So the ladder and the probe
// ship and are real, the encoder still emits MP4/H.264, and offering a codec menu
// before that wiring lands would be a control that quietly does nothing.

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
  const bare = id?.split(EXPORT_SELECTION_SEPARATOR)[0];
  return EXPORT_PRESETS.find((preset) => preset.id === bare) ?? EXPORT_PRESETS[0];
}

// ---- Quality ladder ---------------------------------------------------------

export type ExportQualityId = 'standard' | 'high' | 'compact';

export interface ExportQuality {
  id: ExportQualityId;
  label: string;
  description: string;
  /** Scales the geometry preset's bitrate. */
  bitrateMultiplier: number;
}

export const EXPORT_QUALITIES: readonly ExportQuality[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'The preset bitrate — the balance most posts want.',
    bitrateMultiplier: 1,
  },
  {
    id: 'high',
    label: 'High',
    description: 'Higher bitrate for detailed motion. Larger file.',
    bitrateMultiplier: 1.6,
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Lower bitrate for a smaller upload.',
    bitrateMultiplier: 0.6,
  },
];

export const DEFAULT_EXPORT_QUALITY_ID: ExportQualityId = 'standard';

export function resolveExportQuality(id: string | undefined): ExportQuality {
  const suffix = id?.includes(EXPORT_SELECTION_SEPARATOR)
    ? id.split(EXPORT_SELECTION_SEPARATOR)[1]
    : id;
  return EXPORT_QUALITIES.find((quality) => quality.id === suffix) ?? EXPORT_QUALITIES[0];
}

/**
 * Geometry and quality share the document's ONE `exportPresetId` string, as
 * `"<presetId>@<qualityId>"`.
 *
 * Not a flourish — `timelineAuthoringDocumentSchema` in the frozen contracts package is
 * `.strict()`, so a second document field would throw on the projection's own parse.
 * `exportPresetId` is already free-form (`z.string().min(1).max(100)`), so the suffix
 * rides a field that exists. `@standard` is omitted so every id stored before this
 * change stays byte-identical and needs no migration.
 */
const EXPORT_SELECTION_SEPARATOR = '@';

export function formatExportSelection(presetId: string, qualityId: ExportQualityId): string {
  return qualityId === DEFAULT_EXPORT_QUALITY_ID
    ? presetId
    : `${presetId}${EXPORT_SELECTION_SEPARATOR}${qualityId}`;
}

/** The bitrate the encoder should actually be given: geometry × quality. */
export function videoBitrateFor(preset: ExportPreset, quality: ExportQuality): number {
  return Math.round(preset.videoBitrate * quality.bitrateMultiplier);
}

// ---- Codec capability -------------------------------------------------------

/** The codecs this editor is willing to ask for, in mediabunny's vocabulary. */
export type ExportCodecId = 'hevc' | 'vp9' | 'avc';

export interface ResolvedExportCodec {
  codec: ExportCodecId;
  container: 'mp4' | 'webm';
  /** The codec that was asked for and refused, or null when the request was honoured. */
  fellBackFrom: ExportCodecId | null;
}

const CONTAINER_FOR: Record<ExportCodecId, 'mp4' | 'webm'> = {
  hevc: 'mp4',
  vp9: 'webm',
  avc: 'mp4',
};

// Every chain terminates at avc: it is the one codec the whole pipeline, every target
// platform, and every browser that can run this editor at all will accept.
const FALLBACK_CHAIN: Record<ExportCodecId, readonly ExportCodecId[]> = {
  hevc: ['hevc', 'avc'],
  vp9: ['vp9', 'avc'],
  avc: ['avc'],
};

/**
 * The codec to encode with, given what this machine can actually encode.
 *
 * PURE, and the probe result is an argument rather than something fetched inside —
 * which is the whole point. A machine that happens to have an HEVC encoder can never
 * exercise the fallback arm, so the fallback would be untestable on exactly the
 * hardware most likely to be running the tests. Passing the capability set in makes
 * both arms assertable anywhere.
 */
export function resolveExportCodec(
  requested: ExportCodecId,
  encodable: ReadonlySet<string>,
): ResolvedExportCodec {
  for (const candidate of FALLBACK_CHAIN[requested] ?? FALLBACK_CHAIN.avc) {
    if (encodable.has(candidate)) {
      return {
        codec: candidate,
        container: CONTAINER_FOR[candidate],
        fellBackFrom: candidate === requested ? null : requested,
      };
    }
  }
  // Nothing in the chain probed encodable. Still return avc rather than throwing: the
  // probe can be wrong (a headless container, a stubbed WebCodecs), and refusing to
  // render at all is worse than trying the universal codec.
  return {
    codec: 'avc',
    container: 'mp4',
    fellBackFrom: requested === 'avc' ? null : requested,
  };
}

/** The codecs a picker may offer — never one the probe refused. */
export function availableExportCodecs(encodable: ReadonlySet<string>): ExportCodecId[] {
  return (['avc', 'hevc', 'vp9'] as const).filter((codec) => encodable.has(codec));
}

let encodableProbe: Promise<ReadonlySet<string>> | undefined;

/**
 * What this browser can encode, memoized for the session.
 *
 * Lazily imports mediabunny for the same reason every other call site in this repo
 * does — it is worker-offloaded and must not land in the page bundle. Never rejects: a
 * probe that throws (no WebCodecs at all) reports avc and lets `resolveExportCodec`
 * take the universal path.
 */
export function probeEncodableVideoCodecs(): Promise<ReadonlySet<string>> {
  encodableProbe ??= (async () => {
    try {
      const { getEncodableVideoCodecs } = await import('mediabunny');
      const codecs = await getEncodableVideoCodecs(['hevc', 'vp9', 'avc']);
      return new Set<string>(codecs);
    } catch {
      return new Set<string>(['avc']);
    }
  })();
  return encodableProbe;
}

/** Test seam — drops the memoized probe so a suite can re-run it. */
export function resetExportCodecProbe(): void {
  encodableProbe = undefined;
}
