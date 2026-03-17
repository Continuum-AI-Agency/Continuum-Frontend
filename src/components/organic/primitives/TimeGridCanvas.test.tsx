import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { TimeGridCanvas } from "./TimeGridCanvas"
import type { OrganicCalendarDay } from "./types"

const store = {
  ghosts: {},
}

vi.mock("@/lib/organic/store", () => ({
  useCalendarStore: (selector: (state: typeof store) => unknown) => selector(store),
}))

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

function buildWeekDays(): OrganicCalendarDay[] {
  return [
    {
      id: "2026-02-23",
      label: "Mon",
      dateLabel: "Feb 23",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-02-24",
      label: "Tue",
      dateLabel: "Feb 24",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-02-25",
      label: "Wed",
      dateLabel: "Feb 25",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-02-26",
      label: "Thu",
      dateLabel: "Feb 26",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-02-27",
      label: "Fri",
      dateLabel: "Feb 27",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-02-28",
      label: "Sat",
      dateLabel: "Feb 28",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
    {
      id: "2026-03-01",
      label: "Sun",
      dateLabel: "Mar 1",
      suggestedTimes: ["9:00 AM"],
      slots: [],
    },
  ]
}

describe("TimeGridCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("calls onCreatePost from header plus button", () => {
    const onCreatePost = vi.fn()

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={vi.fn()}
        onPreviousWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onCreatePost={onCreatePost}
        onSelectDraft={vi.fn()}
        onToggleSelection={vi.fn()}
        onRegenerate={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /add placeholder/i }))

    expect(onCreatePost).toHaveBeenCalledWith({ status: "placeholder" })
  })

  it("calls onCreatePost with day and platform when clicking an empty cell", () => {
    const onCreatePost = vi.fn()

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={vi.fn()}
        onPreviousWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onCreatePost={onCreatePost}
        onSelectDraft={vi.fn()}
        onToggleSelection={vi.fn()}
        onRegenerate={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Add placeholder for 2026-02-23 Instagram" })
    )

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: "2026-02-23",
      platform: "instagram",
      status: "placeholder",
    })
  })

  it("updates planner view mode from the segmented controls", () => {
    const onViewModeChange = vi.fn()

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={onViewModeChange}
        onPreviousWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onCreatePost={vi.fn()}
        onSelectDraft={vi.fn()}
        onToggleSelection={vi.fn()}
        onRegenerate={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Month" }))

    expect(onViewModeChange).toHaveBeenCalledWith("month")
  })

  it("still allows adding posts when a cell already has a draft", () => {
    const onCreatePost = vi.fn()
    const days = buildWeekDays()
    days[0] = {
      ...days[0],
      slots: [
        {
          id: "draft-1",
          title: "Existing post",
          summary: "Summary",
          timeLabel: "9:00 AM",
          dateLabel: "Mon, Feb 23",
          status: "draft",
          platforms: ["instagram"],
          format: "Post",
          objective: "Engagement",
          captionPreview: "Caption",
          tags: [],
          mediaCount: 1,
        },
      ],
    }

    render(
      <TimeGridCanvas
        days={days}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={vi.fn()}
        onPreviousWeek={vi.fn()}
        onNextWeek={vi.fn()}
        onCreatePost={onCreatePost}
        onSelectDraft={vi.fn()}
        onToggleSelection={vi.fn()}
        onRegenerate={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Add placeholder for 2026-02-23 Instagram" })
    )

    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: "2026-02-23",
      platform: "instagram",
      status: "placeholder",
    })
  })
})
