import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import type { Competitor } from "@continuum/contracts"

;(
  globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }
).window.SyntaxError = SyntaxError

import { CompetitorHealthBadge } from "./CompetitorHealthBadge"

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    brandId: "00000000-0000-0000-0000-000000000002",
    name: "Acme Co",
    slug: "acme-co",
    source: "user",
    metaPageId: null,
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

afterEach(cleanup)

describe("CompetitorHealthBadge", () => {
  it("renders the Healthy label for a resolved, synced, ad-producing competitor", () => {
    const { getByText } = render(
      <CompetitorHealthBadge
        competitor={competitor({
          organicStatus: "ready",
          metaPageResolutionStatus: "resolved",
          metaPageResolvedAt: "2026-07-01T00:00:00.000Z",
        })}
        adsFound={3}
      />,
    )
    expect(getByText("Healthy")).toBeTruthy()
  })

  it("labels a missing Instagram handle as Needs handle and exposes guidance", () => {
    const { getByText, container } = render(
      <CompetitorHealthBadge competitor={competitor({ organicStatus: "needs_instagram" })} />,
    )
    expect(getByText("Needs handle")).toBeTruthy()
    const described = container.querySelector("[aria-describedby]")
    const descriptionId = described?.getAttribute("aria-describedby") ?? ""
    expect(descriptionId).not.toBe("")
    const description = document.getElementById(descriptionId)
    expect(description?.textContent).toMatch(/Instagram handle/)
  })
})
