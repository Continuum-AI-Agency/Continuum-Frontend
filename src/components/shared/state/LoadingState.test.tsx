import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"

;(
  globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }
).window.SyntaxError = SyntaxError

import { LoadingState } from "./LoadingState"

afterEach(cleanup)

describe("LoadingState", () => {
  it("announces itself as busy so it is not mistaken for empty data", () => {
    const { getByRole } = render(<LoadingState />)
    const status = getByRole("status")
    expect(status.getAttribute("aria-busy")).toBe("true")
  })

  it("renders an accessible label", () => {
    const { getByText } = render(<LoadingState label="Loading insights" />)
    expect(getByText("Loading insights")).toBeTruthy()
  })

  it("renders the requested number of skeleton bars by default", () => {
    const { container } = render(<LoadingState lines={4} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(4)
  })

  it("renders custom skeleton children instead of default bars", () => {
    const { container, getByTestId } = render(
      <LoadingState lines={4}>
        <div data-testid="custom-skeleton" />
      </LoadingState>,
    )
    expect(getByTestId("custom-skeleton")).toBeTruthy()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0)
  })
})
