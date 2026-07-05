import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render } from "@testing-library/react"

;(
  globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }
).window.SyntaxError = SyntaxError

import { DataState } from "./DataState"

afterEach(cleanup)

const slots = {
  loading: <div data-testid="loading">loading</div>,
  error: <div data-testid="error">error</div>,
  empty: <div data-testid="empty">empty</div>,
}

describe("DataState", () => {
  it("renders the loading slot when status is loading, not the empty slot", () => {
    const { getByTestId, queryByTestId } = render(
      <DataState status="loading" {...slots}>
        <div data-testid="ready">ready</div>
      </DataState>,
    )
    expect(getByTestId("loading")).toBeTruthy()
    expect(queryByTestId("empty")).toBeNull()
    expect(queryByTestId("ready")).toBeNull()
  })

  it("renders the empty slot when status is empty", () => {
    const { getByTestId, queryByTestId } = render(
      <DataState status="empty" {...slots}>
        <div data-testid="ready">ready</div>
      </DataState>,
    )
    expect(getByTestId("empty")).toBeTruthy()
    expect(queryByTestId("loading")).toBeNull()
  })

  it("renders the error slot when status is error", () => {
    const { getByTestId } = render(
      <DataState status="error" {...slots}>
        <div data-testid="ready">ready</div>
      </DataState>,
    )
    expect(getByTestId("error")).toBeTruthy()
  })

  it("renders children when status is ready", () => {
    const { getByTestId, queryByTestId } = render(
      <DataState status="ready" {...slots}>
        <div data-testid="ready">ready</div>
      </DataState>,
    )
    expect(getByTestId("ready")).toBeTruthy()
    expect(queryByTestId("loading")).toBeNull()
  })
})
