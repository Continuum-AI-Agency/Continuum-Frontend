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
