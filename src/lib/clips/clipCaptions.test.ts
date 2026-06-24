import { describe, expect, it } from "bun:test";

import {
  DEFAULT_CLIP_CAPTIONS_ENABLED,
  readClipCaptionsEnabled,
  writeClipCaptionsEnabled,
} from "./clipCaptions";

const storageWith = (value: string | null) => ({
  getItem: () => value,
});

describe("readClipCaptionsEnabled", () => {
  it("reads explicit on/off", () => {
    expect(readClipCaptionsEnabled(storageWith("on"))).toBe(true);
    expect(readClipCaptionsEnabled(storageWith("off"))).toBe(false);
  });

  it("falls back to the default for missing/garbage/null storage", () => {
    expect(readClipCaptionsEnabled(storageWith(null))).toBe(DEFAULT_CLIP_CAPTIONS_ENABLED);
    expect(readClipCaptionsEnabled(storageWith("maybe"))).toBe(DEFAULT_CLIP_CAPTIONS_ENABLED);
    expect(readClipCaptionsEnabled(null)).toBe(DEFAULT_CLIP_CAPTIONS_ENABLED);
  });
});

describe("writeClipCaptionsEnabled", () => {
  it("persists on/off and never throws on a failing storage", () => {
    const writes: Array<[string, string]> = [];
    const storage = { setItem: (k: string, v: string) => writes.push([k, v]) };
    writeClipCaptionsEnabled(storage, true);
    writeClipCaptionsEnabled(storage, false);
    expect(writes.map(([, v]) => v)).toEqual(["on", "off"]);

    const throwing = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeClipCaptionsEnabled(throwing, true)).not.toThrow();
  });
});
