"use client"

import * as React from "react"

import {
  DEFAULT_CLIP_QUALITY,
  readClipQuality,
  writeClipQuality,
  type ClipQuality,
} from "@/lib/clips/clipQuality"

// Remembers the user's clip-quality choice across cards and sessions via
// localStorage (non-critical UI preference). SSR-safe: renders the default first,
// then hydrates from storage in an effect to avoid a hydration mismatch.
export function useClipQualityPreference(): {
  quality: ClipQuality
  setQuality: (quality: ClipQuality) => void
} {
  const [quality, setQualityState] = React.useState<ClipQuality>(DEFAULT_CLIP_QUALITY)

  React.useEffect(() => {
    setQualityState(readClipQuality(typeof window !== "undefined" ? window.localStorage : null))
  }, [])

  const setQuality = React.useCallback((next: ClipQuality) => {
    setQualityState(next)
    writeClipQuality(typeof window !== "undefined" ? window.localStorage : null, next)
  }, [])

  return { quality, setQuality }
}
