import { describe, expect, it } from "bun:test"

import {
  describeAddPlaceholderBlock,
  describeClearBlock,
  describeComposerBlock,
  describeExportBlock,
  describeGenerateBlock,
  describeRefreshBlock,
} from "./disabledReasons"

describe("describeAddPlaceholderBlock", () => {
  it("blocks while generation is running", () => {
    const hint = describeAddPlaceholderBlock({ isGenerating: true })
    expect(hint?.reason).toContain("Generation is running")
  })

  it("allows adding when idle", () => {
    expect(describeAddPlaceholderBlock({ isGenerating: false })).toBeNull()
  })
})

describe("describeGenerateBlock", () => {
  it("explains that a placeholder is required when none are seeded", () => {
    const hint = describeGenerateBlock({ isGenerating: false, seededDraftCount: 0 })
    expect(hint?.reason).toContain("Add at least one placeholder")
    expect(hint?.unlocks).toContain("Brand Book")
  })

  it("prefers the running message while generating even with placeholders", () => {
    const hint = describeGenerateBlock({ isGenerating: true, seededDraftCount: 3 })
    expect(hint?.reason).toBe("Generation is already running.")
  })

  it("allows generating when placeholders exist and idle", () => {
    expect(
      describeGenerateBlock({ isGenerating: false, seededDraftCount: 2 }),
    ).toBeNull()
  })
})

describe("describeClearBlock", () => {
  it("explains there is nothing to clear when the calendar is empty", () => {
    const hint = describeClearBlock({ isGenerating: false, draftsCount: 0 })
    expect(hint?.reason).toContain("no drafts")
  })

  it("blocks clearing while generation is running", () => {
    const hint = describeClearBlock({ isGenerating: true, draftsCount: 5 })
    expect(hint?.reason).toContain("Generation is running")
  })

  it("allows clearing when drafts exist and idle", () => {
    expect(describeClearBlock({ isGenerating: false, draftsCount: 5 })).toBeNull()
  })
})

describe("describeRefreshBlock", () => {
  it("names the platform when no account is connected", () => {
    const hint = describeRefreshBlock({
      hasAccount: false,
      isLoading: false,
      platformLabel: "Instagram",
    })
    expect(hint?.reason).toContain("Instagram")
    expect(hint?.reason).toContain("refresh analytics")
    expect(hint?.unlocks).toContain("metrics")
  })

  it("explains a refresh is already in flight", () => {
    const hint = describeRefreshBlock({
      hasAccount: true,
      isLoading: true,
      platformLabel: "Instagram",
    })
    expect(hint?.reason).toContain("already refreshing")
  })

  it("allows refresh with a connected account and idle load state", () => {
    expect(
      describeRefreshBlock({ hasAccount: true, isLoading: false, platformLabel: "TikTok" }),
    ).toBeNull()
  })
})

describe("describeExportBlock", () => {
  it("requires a connected account before exporting", () => {
    const hint = describeExportBlock({
      hasAccount: false,
      isLoading: false,
      isExporting: false,
      platformLabel: "Facebook",
    })
    expect(hint?.reason).toContain("Facebook")
    expect(hint?.reason).toContain("export a report")
    expect(hint?.unlocks).toContain("CSV")
  })

  it("explains an export is already in progress before load state", () => {
    const hint = describeExportBlock({
      hasAccount: true,
      isLoading: true,
      isExporting: true,
      platformLabel: "Facebook",
    })
    expect(hint?.reason).toContain("already in progress")
  })

  it("asks the user to wait while analytics load", () => {
    const hint = describeExportBlock({
      hasAccount: true,
      isLoading: true,
      isExporting: false,
      platformLabel: "Facebook",
    })
    expect(hint?.reason).toContain("finish loading")
  })

  it("allows export once loaded with an account and no active export", () => {
    expect(
      describeExportBlock({
        hasAccount: true,
        isLoading: false,
        isExporting: false,
        platformLabel: "YouTube",
      }),
    ).toBeNull()
  })
})

describe("describeComposerBlock", () => {
  it("explains the agent is mid-response", () => {
    const hint = describeComposerBlock({ isStreaming: true, hasSession: true })
    expect(hint?.reason).toContain("agent is responding")
  })

  it("explains the workspace is still warming up before a session exists", () => {
    const hint = describeComposerBlock({ isStreaming: false, hasSession: false })
    expect(hint?.reason).toContain("workspace ready")
  })

  it("allows sending with a live idle session", () => {
    expect(
      describeComposerBlock({ isStreaming: false, hasSession: true }),
    ).toBeNull()
  })
})
