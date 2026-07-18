// User toggle for saving an editable word-synced caption draft alongside generated
// clips. It is a remembered UI preference and defaults on.

export const CLIP_CAPTIONS_STORAGE_KEY = "continuum:clip-captions"
export const DEFAULT_CLIP_CAPTIONS_ENABLED = true

// Storage is passed in so the read/write logic stays pure + testable; the hook
// supplies window.localStorage. Both fail safe to the default.
export function readClipCaptionsEnabled(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    const raw = storage?.getItem(CLIP_CAPTIONS_STORAGE_KEY)
    if (raw === "on") return true
    if (raw === "off") return false
    return DEFAULT_CLIP_CAPTIONS_ENABLED
  } catch {
    return DEFAULT_CLIP_CAPTIONS_ENABLED
  }
}

export function writeClipCaptionsEnabled(
  storage: Pick<Storage, "setItem"> | null | undefined,
  enabled: boolean,
): void {
  try {
    storage?.setItem(CLIP_CAPTIONS_STORAGE_KEY, enabled ? "on" : "off")
  } catch {
    // Private mode / quota exceeded — the preference is non-critical, ignore.
  }
}
