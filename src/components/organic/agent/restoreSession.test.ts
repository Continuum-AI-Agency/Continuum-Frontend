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
    const { messages } = restoreSessionFromMessages([
      message({
        content: "Here is a plan",
        uiCardFrames: [
          { type: "ui.plan_card", data: { planId: "plan_1", title: "IG week", items: [] } },
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
      message({ uiCardFrames: [{ type: "ui.plan_card", data: {} }, null, "garbage", 42] as unknown[] }),
    ])

    expect(messages[0]!.uiCards).toBeUndefined()
    expect(pipelineCards).toHaveLength(0)
  })
})
