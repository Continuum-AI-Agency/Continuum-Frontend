import { describe, expect, it } from "bun:test"

import {
  CLIP_QUALITY_OPTIONS,
  CLIP_QUALITY_STORAGE_KEY,
  DEFAULT_CLIP_QUALITY,
  clipQualityToShortEdge,
  isClipQuality,
  readClipQuality,
  writeClipQuality,
} from "./clipQuality"

describe("clipQualityToShortEdge", () => {
  it("maps each quality to its short-edge pixel cap", () => {
    expect(clipQualityToShortEdge("1080p")).toBe(1080)
    expect(clipQualityToShortEdge("720p")).toBe(720)
  })
})

describe("isClipQuality", () => {
  it("accepts the known qualities and rejects anything else", () => {
    expect(isClipQuality("1080p")).toBe(true)
    expect(isClipQuality("720p")).toBe(true)
    expect(isClipQuality("480p")).toBe(false)
    expect(isClipQuality(720)).toBe(false)
    expect(isClipQuality(null)).toBe(false)
  })
})

describe("options + default", () => {
  it("lists 1080p then 720p with 1080p as the default", () => {
    expect(CLIP_QUALITY_OPTIONS).toEqual(["1080p", "720p"])
    expect(DEFAULT_CLIP_QUALITY).toBe("1080p")
  })
})

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

describe("readClipQuality", () => {
  it("returns the stored quality when valid", () => {
    expect(readClipQuality(fakeStorage({ [CLIP_QUALITY_STORAGE_KEY]: "720p" }))).toBe("720p")
  })

  it("falls back to the default for missing, invalid, or absent storage", () => {
    expect(readClipQuality(fakeStorage())).toBe("1080p")
    expect(readClipQuality(fakeStorage({ [CLIP_QUALITY_STORAGE_KEY]: "nope" }))).toBe("1080p")
    expect(readClipQuality(null)).toBe("1080p")
  })
})

describe("writeClipQuality", () => {
  it("persists the quality under the storage key", () => {
    const storage = fakeStorage()
    writeClipQuality(storage, "720p")
    expect(storage.map.get(CLIP_QUALITY_STORAGE_KEY)).toBe("720p")
  })

  it("never throws when storage is absent", () => {
    expect(() => writeClipQuality(null, "720p")).not.toThrow()
  })
})
