import { describe, expect, it } from "bun:test"

import { initialPanelState, panelReducer } from "./useOrganicAgentReducer"
import type { AgentJobState } from "./types"

describe("useOrganicAgentReducer", () => {
  it("hydrates jobs from a valid array payload", () => {
    const state = initialPanelState()
    const next = panelReducer(state, {
      type: "HYDRATE_JOBS",
      jobs: [
        {
          jobId: "job-1",
          brandId: "brand-1",
          status: "queued",
        },
      ],
    })

    expect(next.isHydrated).toBe(true)
    expect(Object.keys(next.jobs)).toEqual(["job-1"])
  })

  it("advances a queued job to running when a pipeline.stage arrives for it", () => {
    const queued = panelReducer(initialPanelState(), {
      type: "HYDRATE_JOBS",
      jobs: [{ jobId: "job-1", brandId: "brand-1", status: "queued" }],
    })

    const next = panelReducer(queued, {
      type: "PIPELINE_STAGE",
      event: { jobId: "job-1", brandId: "brand-1", planId: null, planItemId: null, stage: "concept", status: "active", agentName: "creative" },
    })

    expect(next.jobs["job-1"].status).toBe("running")
    expect(next.jobs["job-1"].stage).toBe("concept")
  })

  it("does not regress a completed job back to running on a late pipeline.stage", () => {
    const completed = panelReducer(initialPanelState(), {
      type: "HYDRATE_JOBS",
      jobs: [{ jobId: "job-1", brandId: "brand-1", status: "completed" }],
    })

    const next = panelReducer(completed, {
      type: "PIPELINE_STAGE",
      event: { jobId: "job-1", brandId: "brand-1", planId: null, planItemId: null, stage: "merge", status: "active" },
    })

    expect(next.jobs["job-1"].status).toBe("completed")
  })

  it("does not create a phantom job for a pipeline.stage with no matching job", () => {
    const next = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: { jobId: "ghost", brandId: "brand-1", planId: null, planItemId: null, stage: "concept", status: "active" },
    })

    expect(next.jobs).toEqual({})
    expect(next.pipeline.ghost).toBeDefined()
  })

  it("does not throw when hydrate payload is not iterable", () => {
    const state = initialPanelState()
    const next = panelReducer(state, {
      type: "HYDRATE_JOBS",
      jobs: { bad: true } as unknown as AgentJobState[],
    })

    expect(next.isHydrated).toBe(true)
    expect(next.jobs).toEqual({})
  })

  it("ignores malformed jobs without a string jobId", () => {
    const state = initialPanelState()
    const next = panelReducer(state, {
      type: "HYDRATE_JOBS",
      jobs: [{ brandId: "brand-1", status: "queued" }] as unknown as AgentJobState[],
    })

    expect(next.isHydrated).toBe(true)
    expect(next.jobs).toEqual({})
  })
})

describe("SESSION_SWITCH", () => {
  it("resets transient state and populates new session messages", () => {
    const dirty = panelReducer(
      {
        ...initialPanelState(),
        sessionId: "old-session",
        streamingMessageId: "msg-123",
        jobs: { "job-1": { jobId: "job-1", brandId: "b", status: "running" } as AgentJobState },
      },
      { type: "SESSION_SWITCH", sessionId: "new-session", messages: [{ id: "m1", role: "user", content: "Hello" }] }
    )
    expect(dirty.sessionId).toBe("new-session")
    expect(dirty.messages).toHaveLength(1)
    expect(dirty.messages[0].content).toBe("Hello")
    expect(dirty.streamingMessageId).toBeNull()
    expect(dirty.jobs).toEqual({})
    expect(dirty.isHydrated).toBe(true)
    expect(dirty.inputValue).toBe("")
  })

  it("works with empty messages array for new session", () => {
    const state = panelReducer(initialPanelState(), {
      type: "SESSION_SWITCH",
      sessionId: "fresh-session",
      messages: [],
    })
    expect(state.sessionId).toBe("fresh-session")
    expect(state.messages).toHaveLength(0)
    expect(state.isHydrated).toBe(true)
  })
})

describe("LOAD_MESSAGES_START", () => {
  it("clears messages, jobs, and streaming state", () => {
    const withData = {
      ...initialPanelState(),
      sessionId: "s1",
      messages: [{ id: "m1", role: "user" as const, content: "hi" }],
      jobs: { "j1": { jobId: "j1", brandId: "b", status: "completed" as const } as AgentJobState },
      streamingMessageId: "msg-streaming",
      isHydrated: true,
    }
    const next = panelReducer(withData, { type: "LOAD_MESSAGES_START" })
    expect(next.messages).toHaveLength(0)
    expect(next.jobs).toEqual({})
    expect(next.pipeline).toEqual({})
    expect(next.planItemStatus).toEqual({})
    expect(next.pendingToolApprovals).toEqual([])
    expect(next.streamingMessageId).toBeNull()
    expect(next.isHydrated).toBe(false)
    expect(next.sessionId).toBe("s1")  // sessionId is preserved
  })
})

describe("PIPELINE_STAGE", () => {
  it("builds the timeline with prior stages done and the current stage active", () => {
    const next = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: {
        jobId: "job-1",
        brandId: "brand-1",
        planId: "plan-1",
        planItemId: "item-1",
        stage: "draft",
        agentName: "creative",
        pct: 45,
        status: "active",
      },
    })
    const card = next.pipeline["job-1"]
    expect(card.status).toBe("running")
    expect(card.currentStage).toBe("draft")
    expect(card.pct).toBe(45)
    expect(card.planId).toBe("plan-1")
    const byStage = Object.fromEntries(card.stages.map((s) => [s.stage, s.status]))
    expect(byStage.strategist).toBe("done")
    expect(byStage.concept).toBe("done")
    expect(byStage.draft).toBe("active")
    expect(byStage.quality).toBe("pending")
    expect(byStage.merge).toBe("pending")
  })

  it("advances the timeline across successive stage frames", () => {
    let state = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: { jobId: "j", brandId: "b", planId: null, planItemId: null, stage: "strategist", status: "active" },
    })
    state = panelReducer(state, {
      type: "PIPELINE_STAGE",
      event: { jobId: "j", brandId: "b", planId: null, planItemId: null, stage: "quality", status: "active" },
    })
    const byStage = Object.fromEntries(state.pipeline["j"].stages.map((s) => [s.stage, s.status]))
    expect(byStage.strategist).toBe("done")
    expect(byStage.assets).toBe("done")
    expect(byStage.quality).toBe("active")
  })
})

describe("PIPELINE_CARD", () => {
  it("on completed, marks all stages done and merges preview + quality", () => {
    const start = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: { jobId: "j", brandId: "b", planId: "p", planItemId: "i", stage: "draft", status: "active" },
    })
    const next = panelReducer(start, {
      type: "PIPELINE_CARD",
      card: {
        jobId: "j",
        status: "completed",
        currentStage: "merge",
        preview: { caption: "hi", imageUrl: null, format: "carousel" },
        quality: { passed: true, overallScore: 88 },
        draftId: "draft-1",
      },
    })
    const card = next.pipeline["j"]
    expect(card.status).toBe("completed")
    expect(card.pct).toBe(100)
    expect(card.stages.every((s) => s.status === "done")).toBe(true)
    expect(card.preview?.caption).toBe("hi")
    expect(card.quality?.overallScore).toBe(88)
    expect(card.draftId).toBe("draft-1")
  })

  it("on failed, marks the current stage failed", () => {
    const start = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: { jobId: "j", brandId: "b", planId: null, planItemId: null, stage: "assets", status: "active" },
    })
    const next = panelReducer(start, {
      type: "PIPELINE_CARD",
      card: { jobId: "j", status: "failed", currentStage: "assets", error: { message: "boom" } },
    })
    const card = next.pipeline["j"]
    expect(card.status).toBe("failed")
    expect(card.stages.find((s) => s.stage === "assets")?.status).toBe("failed")
    expect(card.error?.message).toBe("boom")
  })

  it("keeps interleaved job and draft identity on the matching pipeline cards", () => {
    let state = panelReducer(initialPanelState(), {
      type: "PIPELINE_STAGE",
      event: {
        jobId: "job-a",
        brandId: "brand-1",
        planId: "plan-1",
        planItemId: "item-a",
        stage: "draft",
        status: "active",
      },
    })
    state = panelReducer(state, {
      type: "PIPELINE_STAGE",
      event: {
        jobId: "job-c",
        brandId: "brand-1",
        planId: "plan-1",
        planItemId: "item-c",
        stage: "draft",
        status: "active",
      },
    })
    state = panelReducer(state, {
      type: "PIPELINE_CARD",
      card: {
        jobId: "job-c",
        planId: "plan-1",
        planItemId: "item-c",
        status: "running",
        draftId: "draft-c",
        checkpoint: { textReady: true },
      },
    })
    state = panelReducer(state, {
      type: "PIPELINE_CARD",
      card: {
        jobId: "job-a",
        planId: "plan-1",
        planItemId: "item-a",
        status: "running",
        draftId: "draft-a",
        checkpoint: { textReady: true },
      },
    })
    state = panelReducer(state, {
      type: "DRAFT_BLUEPRINT",
      draftId: "draft-c",
      previews: ["https://cdn.example/c.png"],
    })

    expect(state.pipeline["job-a"].planItemId).toBe("item-a")
    expect(state.pipeline["job-a"].draftId).toBe("draft-a")
    expect(state.pipeline["job-a"].preview?.images).toBeUndefined()
    expect(state.pipeline["job-c"].planItemId).toBe("item-c")
    expect(state.pipeline["job-c"].draftId).toBe("draft-c")
    expect(state.pipeline["job-c"].preview?.images).toEqual(["https://cdn.example/c.png"])
    expect(state.pipeline["job-c"].checkpoint?.blueprintReady).toBe(true)
  })
})

describe("STREAM_ERROR", () => {
  it("sets the error field on the streaming message without clobbering streamed content", () => {
    const submitted = panelReducer(initialPanelState(), {
      type: "SUBMIT_USER_MESSAGE",
      content: "plan my week",
      messageId: "u1",
    })
    const partial = panelReducer(submitted, { type: "STREAM_DELTA", delta: "Here is a plan" })
    const errored = panelReducer(partial, { type: "STREAM_ERROR", error: "connection lost" })

    const assistant = errored.messages.find((m) => m.role === "assistant")
    expect(assistant?.content).toBe("Here is a plan")
    expect(assistant?.error).toBe("connection lost")
    expect(errored.streamingMessageId).toBeNull()
  })
})

describe("RETRY_FROM_ASSISTANT", () => {
  it("drops the failed assistant turn and re-opens a fresh streaming message", () => {
    const submitted = panelReducer(initialPanelState(), {
      type: "SUBMIT_USER_MESSAGE",
      content: "plan my week",
      messageId: "u1",
    })
    const assistantId = submitted.streamingMessageId!
    const errored = panelReducer(submitted, { type: "STREAM_ERROR", error: "boom" })

    const retried = panelReducer(errored, { type: "RETRY_FROM_ASSISTANT", assistantMessageId: assistantId })

    // The user message is preserved; the stale assistant turn is replaced.
    expect(retried.messages).toHaveLength(2)
    expect(retried.messages[0]).toMatchObject({ id: "u1", role: "user", content: "plan my week" })
    expect(retried.messages[1].role).toBe("assistant")
    expect(retried.messages[1].id).not.toBe(assistantId)
    expect(retried.messages[1].content).toBe("")
    expect(retried.messages[1].error).toBeUndefined()
    expect(retried.streamingMessageId).toBe(retried.messages[1].id)
  })

  it("is a no-op when the assistant message id is unknown", () => {
    const submitted = panelReducer(initialPanelState(), {
      type: "SUBMIT_USER_MESSAGE",
      content: "hi",
      messageId: "u1",
    })
    const next = panelReducer(submitted, { type: "RETRY_FROM_ASSISTANT", assistantMessageId: "missing" })
    expect(next).toBe(submitted)
  })
})

describe("PLAN_STATUS + tool approvals", () => {
  it("records plan item status by itemId", () => {
    const next = panelReducer(initialPanelState(), {
      type: "PLAN_STATUS",
      event: { planId: "p", itemId: "item-1", status: "executing" },
    })
    expect(next.planItemStatus["item-1"]).toBe("executing")
  })

  it("adds and resolves tool approvals without duplicates", () => {
    const approval = { approvalId: "a1", toolCallId: "tc1", toolName: "publishDraft", input: {} }
    let state = panelReducer(initialPanelState(), { type: "TOOL_APPROVAL_ADD", approval })
    state = panelReducer(state, { type: "TOOL_APPROVAL_ADD", approval })
    expect(state.pendingToolApprovals).toHaveLength(1)
    state = panelReducer(state, { type: "TOOL_APPROVAL_RESOLVE", approvalId: "a1" })
    expect(state.pendingToolApprovals).toHaveLength(0)
  })

  it("registers a bulk run by runId (idempotent upsert)", () => {
    const run = { runId: "run_p1", planId: "p1", total: 80 }
    let state = panelReducer(initialPanelState(), { type: "BULK_RUN_START", run })
    expect(state.bulkRuns["run_p1"]).toEqual(run)
    state = panelReducer(state, { type: "BULK_RUN_START", run })
    expect(Object.keys(state.bulkRuns)).toHaveLength(1)
  })
})
