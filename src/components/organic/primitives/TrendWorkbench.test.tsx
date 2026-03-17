import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import type { Trend } from "@/lib/organic/trends"
import { TrendWorkbench } from "./TrendWorkbench"

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: ReactNode
    onSelect?: (value: string) => void
    value?: string
  }) => (
    <button type="button" onClick={() => onSelect?.(value ?? "")}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}))

const trends: Trend[] = [
  {
    id: "trend-generic",
    title: "AI Video Breakthroughs",
    summary: "Video tooling is accelerating content production cycles.",
    momentum: "rising",
    platforms: ["instagram", "linkedin"],
    tags: ["ai", "video"],
  },
  {
    id: "trend-question",
    title: "What should marketers automate first?",
    summary: "Audience Q&A around automation priorities.",
    momentum: "stable",
    platforms: ["linkedin"],
    tags: ["question"],
  },
  {
    id: "trend-event",
    title: "Annual Product Summit Event",
    summary: "Major industry event creating campaign opportunities.",
    momentum: "stable",
    platforms: ["instagram"],
    tags: ["event"],
  },
  {
    id: "trend-stable",
    title: "Product-Led Sales Strategies",
    summary: "Teams are doubling down on educational product marketing.",
    momentum: "stable",
    platforms: ["linkedin"],
    tags: ["saas"],
  },
]

describe("TrendWorkbench", () => {
  it("toggles a trend and supports filtering", () => {
    const onToggleTrend = vi.fn()

    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={["trend-generic"]}
        activePlatforms={["instagram", "linkedin"]}
        maxSelections={5}
        onToggleTrend={onToggleTrend}
      />
    )

    fireEvent.click(screen.getByText("AI Video Breakthroughs"))
    expect(onToggleTrend).toHaveBeenCalledWith("trend-generic")

    fireEvent.change(screen.getByPlaceholderText("Search trends • type / for presets"), {
      target: { value: "missing topic" },
    })

    expect(screen.getByText("No trends match this search.")).toBeTruthy()
  })

  it("sorts rows by type: event, question, trend", () => {
    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        maxSelections={5}
        onToggleTrend={vi.fn()}
      />
    )

    const rows = screen.getAllByRole("row")
    expect(rows[1].textContent ?? "").toContain("Annual Product Summit Event")
    expect(rows[2].textContent ?? "").toContain("What should marketers automate first?")
    expect(rows[3].textContent ?? "").toContain("AI Video Breakthroughs")
  })

  it("applies premade filters via slash command presets", () => {
    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={["trend-question"]}
        activePlatforms={["linkedin"]}
        maxSelections={5}
        onToggleTrend={vi.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText("Search trends • type / for presets"), {
      target: { value: "/questions" },
    })
    fireEvent.click(screen.getByText("Preset: questions"))

    expect(screen.getByText("What should marketers automate first?")).toBeTruthy()
    expect(screen.queryByText("Annual Product Summit Event")).toBeNull()
    expect(screen.queryByText("AI Video Breakthroughs")).toBeNull()
  })
})
