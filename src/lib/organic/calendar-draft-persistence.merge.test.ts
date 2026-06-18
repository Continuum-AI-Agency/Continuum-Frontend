import { describe, expect, it } from "bun:test"

import { mergeUnsavedLocalDrafts } from "./calendar-draft-persistence"
import type { OrganicCalendarDay, OrganicCalendarDraft } from "@/components/organic/primitives/types"

const draft = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: "x", ...over }) as unknown as OrganicCalendarDraft

const day = (id: string, slots: OrganicCalendarDraft[]): OrganicCalendarDay =>
  ({ id, slots } as unknown as OrganicCalendarDay)

describe("mergeUnsavedLocalDrafts", () => {
  it("preserves a never-persisted local draft the server hasn't echoed", () => {
    const server = [day("2026-06-18", [draft({ id: "be-1", backendDraftId: "be-1" })])]
    const local = [
      day("2026-06-18", [
        draft({ id: "be-1", backendDraftId: "be-1" }),
        draft({ id: "manual-local", backendDraftId: undefined, origin: "manual" }),
      ]),
    ]
    const merged = mergeUnsavedLocalDrafts(server, local)
    expect(merged[0].slots.map((s) => s.id)).toEqual(["be-1", "manual-local"])
  })

  it("does NOT resurrect a persisted draft the server dropped (deleted/out-of-range)", () => {
    const server = [day("2026-06-18", [])]
    const local = [day("2026-06-18", [draft({ id: "gone", backendDraftId: "be-gone" })])]
    const merged = mergeUnsavedLocalDrafts(server, local)
    expect(merged[0].slots).toEqual([])
  })

  it("does not duplicate an unsaved local draft once the server echoes its FE id", () => {
    const server = [day("2026-06-18", [draft({ id: "manual-local", backendDraftId: "be-new" })])]
    const local = [day("2026-06-18", [draft({ id: "manual-local", backendDraftId: undefined })])]
    const merged = mergeUnsavedLocalDrafts(server, local)
    expect(merged[0].slots).toHaveLength(1)
  })

  it("returns the server set unchanged when there are no unsaved local drafts", () => {
    const server = [day("2026-06-18", [draft({ id: "be-1", backendDraftId: "be-1" })])]
    const merged = mergeUnsavedLocalDrafts(server, server)
    expect(merged).toBe(server)
  })

  it("ignores local drafts whose day is absent from the server set", () => {
    const server = [day("2026-06-18", [])]
    const local = [day("2026-06-19", [draft({ id: "manual-local", backendDraftId: undefined })])]
    const merged = mergeUnsavedLocalDrafts(server, local)
    expect(merged[0].slots).toEqual([])
  })
})
