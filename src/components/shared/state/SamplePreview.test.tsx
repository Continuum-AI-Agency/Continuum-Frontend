import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"

;(
  globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }
).window.SyntaxError = SyntaxError

import { SamplePreview } from "./SamplePreview"

afterEach(cleanup)

describe("SamplePreview", () => {
  it("renders the overlay CTA as the real, reachable content", () => {
    const { getByRole } = render(
      <SamplePreview
        overlay={<button type="button">Connect to see yours</button>}
      >
        <div>sample chart</div>
      </SamplePreview>,
    )
    expect(
      getByRole("button", { name: "Connect to see yours" }),
    ).toBeTruthy()
  })

  it("hides the decorative sample from assistive tech and makes it inert", () => {
    const { getByText } = render(
      <SamplePreview overlay={<span>overlay</span>}>
        <div>sample chart</div>
      </SamplePreview>,
    )
    const sample = getByText("sample chart").parentElement
    expect(sample?.getAttribute("aria-hidden")).toBe("true")
    expect(sample?.hasAttribute("inert")).toBe(true)
  })

  it("applies the requested blur intensity variant", () => {
    const { getByText } = render(
      <SamplePreview overlay={<span>overlay</span>} blur="lg">
        <div>sample chart</div>
      </SamplePreview>,
    )
    const sample = getByText("sample chart").parentElement
    expect(sample?.className).toContain("blur-md")
  })
})
