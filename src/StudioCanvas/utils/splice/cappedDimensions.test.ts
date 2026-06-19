import { describe, expect, it } from "bun:test"

import { computeCappedDimensions } from "./cappedDimensions"

describe("computeCappedDimensions", () => {
  it("downscales a 4K landscape source to 1080p (short edge 1080)", () => {
    expect(computeCappedDimensions(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it("downscales a 1080x1920 vertical source to 720p (short edge 720)", () => {
    expect(computeCappedDimensions(1080, 1920, 720)).toEqual({ width: 720, height: 1280 })
  })

  it("caps a 1080p landscape source to 720p", () => {
    expect(computeCappedDimensions(1920, 1080, 720)).toEqual({ width: 1280, height: 720 })
  })

  it("never upscales a source already under the cap", () => {
    expect(computeCappedDimensions(1280, 720, 1080)).toEqual({ width: 1280, height: 720 })
  })

  it("returns even dimensions for odd-sized sources", () => {
    const { width, height } = computeCappedDimensions(1081, 607, 720)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })

  it("even-normalizes source dims when no cap is supplied", () => {
    expect(computeCappedDimensions(1920, 1080, undefined)).toEqual({ width: 1920, height: 1080 })
    expect(computeCappedDimensions(1921, 1081, undefined)).toEqual({ width: 1920, height: 1080 })
  })

  it("clamps degenerate dimensions to a safe minimum", () => {
    expect(computeCappedDimensions(0, 0, 1080)).toEqual({ width: 2, height: 2 })
  })
})
