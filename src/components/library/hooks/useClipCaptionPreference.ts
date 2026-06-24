"use client"

import * as React from "react"

import {
  DEFAULT_CLIP_CAPTIONS_ENABLED,
  readClipCaptionsEnabled,
  writeClipCaptionsEnabled,
} from "@/lib/clips/clipCaptions"

// Remembers the user's caption choice across cards and sessions via localStorage
// (non-critical UI preference). SSR-safe: renders the default first, then hydrates
// from storage in an effect to avoid a hydration mismatch.
export function useClipCaptionPreference(): {
  captionsEnabled: boolean
  setCaptionsEnabled: (enabled: boolean) => void
} {
  const [captionsEnabled, setState] = React.useState<boolean>(DEFAULT_CLIP_CAPTIONS_ENABLED)

  React.useEffect(() => {
    setState(readClipCaptionsEnabled(typeof window !== "undefined" ? window.localStorage : null))
  }, [])

  const setCaptionsEnabled = React.useCallback((next: boolean) => {
    setState(next)
    writeClipCaptionsEnabled(typeof window !== "undefined" ? window.localStorage : null, next)
  }, [])

  return { captionsEnabled, setCaptionsEnabled }
}
