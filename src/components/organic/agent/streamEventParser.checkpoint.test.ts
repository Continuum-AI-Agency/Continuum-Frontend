import { describe, expect, it } from "bun:test"

import { parseOrganicStreamEvent } from "./streamEventParser"

describe("parseOrganicStreamEvent — checkpoint frames", () => {
  it("parses ui.pipeline_card checkpoint into 3-step state", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.pipeline_card",
      data: {
        jobId: "job-1",
        brandId: "brand-1",
        status: "running",
        checkpoint: {
          textReady: true,
          blueprintReady: false,
          mediaStatus: "pending",
          awaitingMediaChoice: false,
        },
      },
    })
    expect(parsed.kind).toBe("pipelineCard")
    if (parsed.kind === "pipelineCard") {
      expect(parsed.card.checkpoint?.textReady).toBe(true)
      expect(parsed.card.checkpoint?.blueprintReady).toBe(false)
      expect(parsed.card.checkpoint?.mediaStatus).toBe("pending")
    }
  })

  it("parses awaiting media choice checkpoint", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.pipeline_card",
      data: {
        jobId: "job-2",
        brandId: "brand-1",
        status: "running",
        checkpoint: {
          textReady: true,
          blueprintReady: true,
          mediaStatus: "pending",
          awaitingMediaChoice: true,
        },
      },
    })
    expect(parsed.kind).toBe("pipelineCard")
    if (parsed.kind === "pipelineCard") {
      expect(parsed.card.checkpoint?.textReady).toBe(true)
      expect(parsed.card.checkpoint?.blueprintReady).toBe(true)
      expect(parsed.card.checkpoint?.awaitingMediaChoice).toBe(true)
    }
  })

  it("parses user_supplied mediaStatus", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.pipeline_card",
      data: {
        jobId: "job-3",
        brandId: "brand-1",
        status: "completed",
        checkpoint: {
          textReady: true,
          blueprintReady: true,
          mediaStatus: "user_supplied",
        },
      },
    })
    expect(parsed.kind).toBe("pipelineCard")
    if (parsed.kind === "pipelineCard") {
      expect(parsed.card.checkpoint?.mediaStatus).toBe("user_supplied")
    }
  })

  it("ignores unknown mediaStatus values", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.pipeline_card",
      data: {
        jobId: "job-4",
        brandId: "brand-1",
        status: "running",
        checkpoint: { mediaStatus: "bogus_status" },
      },
    })
    expect(parsed.kind).toBe("pipelineCard")
    if (parsed.kind === "pipelineCard") {
      expect(parsed.card.checkpoint?.mediaStatus).toBeUndefined()
    }
  })

  it("parses ui.pipeline_card without checkpoint (legacy frame)", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.pipeline_card",
      data: {
        jobId: "job-5",
        brandId: "brand-1",
        status: "completed",
        draftId: "draft-1",
      },
    })
    expect(parsed.kind).toBe("pipelineCard")
    if (parsed.kind === "pipelineCard") {
      expect(parsed.card.checkpoint).toBeUndefined()
      expect(parsed.card.draftId).toBe("draft-1")
    }
  })

  it("parses draft.text_ready as a jobUpdate", () => {
    const parsed = parseOrganicStreamEvent({
      type: "draft.text_ready",
      data: {
        jobId: "job-6",
        brandId: "brand-1",
        draftId: "draft-placeholder-1",
        placement: {
          placementId: "item-1",
          schedule: { dayId: "2026-06-19", scheduledAt: "2026-06-19T16:00:00Z" },
          platform: { name: "facebook", accountId: "fb-1" },
        },
      },
    })
    expect(parsed.kind).toBe("jobUpdate")
    if (parsed.kind === "jobUpdate") {
      expect(parsed.job.jobId).toBe("job-6")
      expect(parsed.job.brandId).toBe("brand-1")
      expect(parsed.job.status).toBe("running")
      expect(parsed.job.draftId).toBe("draft-placeholder-1")
      expect(parsed.job.placement?.platform.name).toBe("facebook")
    }
  })
})
