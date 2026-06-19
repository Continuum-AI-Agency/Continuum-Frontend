// User-selectable clip output quality. Purely a browser-encode parameter: it caps
// the splice output's SHORT edge (so both landscape and vertical short-form clips
// downscale conventionally) to keep the on-device WebCodecs encode within the
// user's hardware budget. It never crosses the FE<->BE boundary (the backend cut
// plan is resolution-agnostic), so it stays frontend-local rather than in contracts.

export type ClipQuality = "1080p" | "720p"

export const CLIP_QUALITY_OPTIONS: ClipQuality[] = ["1080p", "720p"]
export const DEFAULT_CLIP_QUALITY: ClipQuality = "1080p"
export const CLIP_QUALITY_STORAGE_KEY = "continuum:clip-quality"

const SHORT_EDGE_PX: Record<ClipQuality, number> = { "1080p": 1080, "720p": 720 }

export function clipQualityToShortEdge(quality: ClipQuality): number {
  return SHORT_EDGE_PX[quality]
}

export function isClipQuality(value: unknown): value is ClipQuality {
  return value === "1080p" || value === "720p"
}

// Persisted as a remembered UI preference (allowed localStorage use: non-critical,
// ephemeral). Storage is passed in so the read/write logic stays pure + testable;
// the hook supplies window.localStorage. Both fail closed to the default.
export function readClipQuality(storage: Pick<Storage, "getItem"> | null | undefined): ClipQuality {
  try {
    const raw = storage?.getItem(CLIP_QUALITY_STORAGE_KEY)
    return isClipQuality(raw) ? raw : DEFAULT_CLIP_QUALITY
  } catch {
    return DEFAULT_CLIP_QUALITY
  }
}

export function writeClipQuality(storage: Pick<Storage, "setItem"> | null | undefined, quality: ClipQuality): void {
  try {
    storage?.setItem(CLIP_QUALITY_STORAGE_KEY, quality)
  } catch {
    // Private mode / quota exceeded — the preference is non-critical, ignore.
  }
}
