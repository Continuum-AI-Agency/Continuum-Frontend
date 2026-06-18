import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { InputHTMLAttributes, ReactNode } from "react"

;(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError = SyntaxError

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

mock.module("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

mock.module("@/components/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

mock.module("@/lib/organic/scheduling", () => ({
  normalizeTimeLabel: (value: string) => value,
}))

afterAll(() => mock.restore())

import { PostMetaChips } from "./PostMetaChips"

function setup(overrides: Partial<Parameters<typeof PostMetaChips>[0]> = {}) {
  const props = {
    platform: "instagram" as const,
    format: "Post",
    timeLabel: "9:00 AM",
    onPlatformChange: mock(),
    onFormatChange: mock(),
    onTimeChange: mock(),
    ...overrides,
  }
  render(<PostMetaChips {...props} />)
  return props
}

describe("PostMetaChips", () => {
  beforeEach(() => cleanup())

  it("renders the glanceable platform · format · time chips", () => {
    setup()
    expect(screen.getByLabelText("Change platform").textContent).toContain("Instagram")
    expect(screen.getByLabelText("Change format").textContent).toContain("Post")
    expect(screen.getByLabelText("Edit posting time").textContent).toContain("9:00 AM")
  })

  it("changes platform from the chip menu", () => {
    const { onPlatformChange } = setup()
    fireEvent.click(screen.getByText("Facebook"))
    expect(onPlatformChange).toHaveBeenCalledWith("facebook")
  })

  it("changes format from the chip menu", () => {
    const { onFormatChange } = setup()
    fireEvent.click(screen.getByText("Reel"))
    expect(onFormatChange).toHaveBeenCalledWith("Reel")
  })

  it("changes time from a quick option", () => {
    const { onTimeChange } = setup()
    fireEvent.click(screen.getByText("1:00 PM"))
    expect(onTimeChange).toHaveBeenCalledWith("1:00 PM")
  })

  it("renders the trailing actions slot", () => {
    setup({ actions: <button type="button">Menu</button> })
    expect(screen.getByText("Menu")).toBeTruthy()
  })
})
