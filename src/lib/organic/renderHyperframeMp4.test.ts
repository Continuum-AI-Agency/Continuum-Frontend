import { describe, expect, it } from "bun:test"

import {
  HyperframeCaptureError,
  createHyperframeMp4Renderer,
  resolveFrameCount,
  resolveRenderPlan,
} from "./renderHyperframeMp4"

describe("resolveFrameCount", () => {
  it("multiplies duration by fps and rounds", () => {
    expect(resolveFrameCount(15, 30)).toBe(450)
    expect(resolveFrameCount(2, 24)).toBe(48)
    expect(resolveFrameCount(1.5, 30)).toBe(45)
  })

  it("rounds fractional frame counts", () => {
    expect(resolveFrameCount(1.01, 30)).toBe(30)
    expect(resolveFrameCount(0.99, 30)).toBe(30)
  })

  it("clamps a positive duration to at least one frame", () => {
    expect(resolveFrameCount(0.001, 1)).toBe(1)
  })

  it("returns 0 for invalid duration or fps", () => {
    expect(resolveFrameCount(0, 30)).toBe(0)
    expect(resolveFrameCount(-5, 30)).toBe(0)
    expect(resolveFrameCount(10, 0)).toBe(0)
    expect(resolveFrameCount(Number.NaN, 30)).toBe(0)
  })
})

describe("resolveRenderPlan", () => {
  it("defaults fps to 30 when unset", () => {
    const plan = resolveRenderPlan({ htmlUrl: "x", width: 1280, height: 720, durationSec: 10 })
    expect(plan.fps).toBe(30)
    expect(plan.frameCount).toBe(300)
    expect(plan.frameDuration).toBeCloseTo(1 / 30)
  })

  it("honors an explicit fps and clamps tiny dimensions", () => {
    const plan = resolveRenderPlan({ htmlUrl: "x", width: 1, height: 0, durationSec: 4, fps: 24 })
    expect(plan.fps).toBe(24)
    expect(plan.frameCount).toBe(96)
    expect(plan.width).toBe(2)
    expect(plan.height).toBe(2)
  })
})

describe("createHyperframeMp4Renderer", () => {
  it("throws HyperframeCaptureError for a zero-length composition without touching mediabunny", async () => {
    const render = createHyperframeMp4Renderer({
      htmlUrl: "https://example.com/comp.html",
      width: 1280,
      height: 720,
      durationSec: 0,
    })
    await expect(render()).rejects.toBeInstanceOf(HyperframeCaptureError)
  })
})
