import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Trend } from "@/lib/organic/trends"
import { TrendWorkbench } from "./TrendWorkbench"

const trends: Trend[] = [
  {
    id: "trend-rising",
    title: "AI Video Breakthroughs",
    summary: "Video tooling is accelerating content production cycles.",
    momentum: "rising",
    platforms: ["instagram", "linkedin"],
    tags: ["ai", "video"],
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
        selectedTrendIds={["trend-rising"]}
        activePlatforms={["instagram", "linkedin"]}
        maxSelections={5}
        isGenerating={false}
        onToggleTrend={onToggleTrend}
        onSeedSelected={vi.fn()}
        onSeedAndFill={vi.fn()}
        onSeedSingleTrend={vi.fn()}
        onSeedAndFillFromTrend={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("AI Video Breakthroughs"))
    expect(onToggleTrend).toHaveBeenCalledWith("trend-rising")

    fireEvent.change(screen.getByPlaceholderText("Search trends, events, and questions..."), {
      target: { value: "missing topic" },
    })

    expect(screen.getByText("No trends match this search.")).toBeTruthy()
  })

  it("runs seed actions from top controls", () => {
    const onSeedSelected = vi.fn()
    const onSeedAndFill = vi.fn()

    render(
      <TrendWorkbench
        trends={trends}
        selectedTrendIds={["trend-rising"]}
        activePlatforms={["instagram", "linkedin"]}
        maxSelections={5}
        isGenerating={false}
        onToggleTrend={vi.fn()}
        onSeedSelected={onSeedSelected}
        onSeedAndFill={onSeedAndFill}
        onSeedSingleTrend={vi.fn()}
        onSeedAndFillFromTrend={vi.fn()}
      />
    )

    screen.getAllByTestId("trend-workbench-seed").forEach((button) => {
      fireEvent.click(button)
    })
    screen.getAllByTestId("trend-workbench-seed-fill").forEach((button) => {
      fireEvent.click(button)
    })

    expect(onSeedSelected.mock.calls.length).toBeGreaterThan(0)
    expect(onSeedAndFill.mock.calls.length).toBeGreaterThan(0)
  })
})
