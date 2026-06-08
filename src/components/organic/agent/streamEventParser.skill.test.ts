import { describe, expect, it } from "bun:test"

import { parseOrganicStreamEvent } from "./streamEventParser"

describe("parseOrganicStreamEvent — ui.skill_proposal", () => {
  it("parses a skill proposal into a uiCard", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.skill_proposal",
      data: {
        proposalId: "skill_prop_1",
        brandId: "brand-1",
        name: "On-brand caption voice",
        kind: "creative_direction",
        description: "How captions read.",
        directives: "- Lead with a hook",
        tags: ["voice"],
      },
    })
    expect(parsed.kind).toBe("uiCard")
    if (parsed.kind === "uiCard" && parsed.card.type === "skill_proposal") {
      expect(parsed.card.data.proposalId).toBe("skill_prop_1")
      expect(parsed.card.data.name).toBe("On-brand caption voice")
      expect(parsed.card.data.directives).toBe("- Lead with a hook")
      expect(parsed.card.data.kind).toBe("creative_direction")
    }
  })

  it("defaults an unknown kind to creative_direction", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.skill_proposal",
      data: { proposalId: "p", brandId: "b", name: "n", kind: "weird", directives: "d" },
    })
    expect(parsed.kind).toBe("uiCard")
    if (parsed.kind === "uiCard" && parsed.card.type === "skill_proposal") {
      expect(parsed.card.data.kind).toBe("creative_direction")
      expect(parsed.card.data.tags).toEqual([])
    }
  })

  it("rejects a proposal missing required fields", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.skill_proposal",
      data: { proposalId: "p", brandId: "b", name: "n" },
    })
    expect(parsed.kind).toBe("invalid")
  })
})
