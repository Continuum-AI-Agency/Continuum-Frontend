import { describe, expect, it } from "bun:test"

import { restoreSessionFromMessages } from "./restoreSession"
import type { OrganicSessionMessage } from "@/lib/organic/agent-sessions"

function message(partial: Partial<OrganicSessionMessage>): OrganicSessionMessage {
  return {
    id: "m1",
    sessionId: "s1",
    role: "assistant",
    content: "",
    uiCardFrames: [],
    createdAt: "",
    ...partial,
  }
}

describe("restoreSessionFromMessages", () => {
  it("keeps plain messages untouched and attaches no cards", () => {
    const { messages, pipelineCards, bulkRuns } = restoreSessionFromMessages([
      message({ id: "u1", role: "user", content: "hi" }),
      message({ id: "a1", role: "assistant", content: "hello" }),
    ])

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ id: "u1", role: "user", content: "hi", metadata: undefined })
    expect(messages[1]!.uiCards).toBeUndefined()
    expect(pipelineCards).toHaveLength(0)
    expect(bulkRuns).toHaveLength(0)
  })

  it("re-attaches a persisted plan card frame to its message", () => {
    // Full ProposedPlan — parseUiPlanCard strictly validates proposedPlanSchema
    // (items.min(1) + required fields), so the persisted frame must be complete.
    const planItem = {
      itemId: "item_1",
      kind: "create_post",
      platform: "instagram",
      scheduledAt: "2026-06-15T12:00:00Z",
      format: "post",
      trendId: null,
      trendTitle: null,
      angle: "Test angle",
      objective: "follow",
      audienceSegment: "everyone",
      rationale: "because evidence",
      guidancePrompt: null,
      draftId: null,
      jobId: null,
      dependsOn: [],
      status: "pending",
      creativeBrief: null,
    }
    const { messages } = restoreSessionFromMessages([
      message({
        content: "Here is a plan",
        uiCardFrames: [
          {
            type: "ui.plan_card",
            data: {
              planId: "plan_1",
              sessionId: "s1",
              brandId: "b1",
              userId: "u1",
              weekStart: "2026-06-15",
              title: "IG week",
              summary: "A test plan",
              items: [planItem],
              evidence: [],
              estimatedDurationSeconds: 60,
              status: "proposed",
              createdAt: "2026-06-12T00:00:00Z",
            },
          },
        ],
      }),
    ])

    expect(messages[0]!.uiCards).toHaveLength(1)
    expect(messages[0]!.uiCards![0]).toMatchObject({ type: "plan_card", data: { planId: "plan_1" } })
  })

  it("routes a bulk_run frame to bulkRuns", () => {
    const { bulkRuns } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "ui.bulk_run", data: { runId: "run_bulk_1", planId: "bulk_1", brandId: "b1", total: 12 } },
        ],
      }),
    ])

    expect(bulkRuns).toEqual([{ runId: "run_bulk_1", planId: "bulk_1", total: 12 }])
  })

  it("seeds pipeline cards from persisted pipeline frames", () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: "ui.pipeline_card",
            data: { jobId: "job_1", brandId: "b1", status: "completed", planId: "plan_1" },
          },
        ],
      }),
    ])

    expect(pipelineCards).toHaveLength(1)
    expect(pipelineCards[0]).toMatchObject({ jobId: "job_1", status: "completed" })
  })

  it("ignores unparseable frames without throwing", () => {
    const { messages, pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [{ type: "ui.plan_card", data: {} }, null, "garbage", 42] as unknown as OrganicSessionMessage["uiCardFrames"],
      }),
    ])

    expect(messages[0]!.uiCards).toBeUndefined()
    expect(pipelineCards).toHaveLength(0)
  })

  it("rehydrates a tool call + its result into the message thinking trace", () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "tool.call", data: { toolCallId: "tc1", toolName: "listTrends", args: { q: "x" } } },
          { type: "tool.result", data: { toolCallId: "tc1", toolName: "listTrends", ok: true, result: { ok: true } } },
        ],
      }),
    ])

    expect(messages[0]!.toolCalls).toHaveLength(1)
    expect(messages[0]!.toolCalls![0]).toMatchObject({
      toolCallId: "tc1",
      toolName: "listTrends",
      result: { ok: true },
    })
  })

  it("synthesizes a post_list card from a post-fetching tool result", () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "tool.call", data: { toolCallId: "tc2", toolName: "listDrafts", args: {} } },
          {
            type: "tool.result",
            data: {
              toolCallId: "tc2",
              toolName: "listDrafts",
              ok: true,
              result: { drafts: [{ draftId: "d1", platform: "instagram", caption: "Hi" }] },
            },
          },
        ],
      }),
    ])

    const cards = messages[0]!.uiCards ?? []
    expect(cards.some((c) => c.type === "post_list")).toBe(true)
  })

  it("rehydrates media search results onto the message", () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "media.search_results", data: { query: "navy suits", mode: "text", items: [] } },
        ],
      }),
    ])

    expect(messages[0]!.mediaSearchResults).toHaveLength(1)
    expect(messages[0]!.mediaSearchResults![0]).toMatchObject({ type: "media.search_results" })
  })

  it("collects ui.plan_status frames so the reducer can reseed per-item status", () => {
    const { planStatuses } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "ui.plan_status", data: { planId: "plan_1", itemId: "item_1", status: "completed" } },
          { type: "ui.plan_status", data: { planId: "plan_1", itemId: "item_2", status: "executing" } },
        ],
      }),
    ])

    expect(planStatuses).toEqual([
      { planId: "plan_1", itemId: "item_1", status: "completed", jobId: undefined, draftId: undefined },
      { planId: "plan_1", itemId: "item_2", status: "executing", jobId: undefined, draftId: undefined },
    ])
  })

  it("merges a draft.blueprint_ready storyboard onto its pipeline card by draftId", () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: "ui.pipeline_card", data: { jobId: "job_1", brandId: "b1", status: "running", draftId: "d1" } },
          {
            type: "draft.blueprint_ready",
            data: {
              jobId: "blueprint_job",
              brandId: "b1",
              draftId: "d1",
              previews: [{ role: "scene_1", signedUrl: "https://cdn/scene_1.png" }],
            },
          },
        ],
      }),
    ])

    expect(pipelineCards).toHaveLength(1)
    expect(pipelineCards[0]!.preview?.images).toEqual(["https://cdn/scene_1.png"])
    expect(pipelineCards[0]!.checkpoint?.blueprintReady).toBe(true)
  })
})
