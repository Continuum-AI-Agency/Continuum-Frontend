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
    expect(next.streamingMessageId).toBeNull()
    expect(next.isHydrated).toBe(false)
    expect(next.sessionId).toBe("s1")  // sessionId is preserved
  })
})
