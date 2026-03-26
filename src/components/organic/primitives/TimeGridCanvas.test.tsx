import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { TimeGridCanvas } from "./TimeGridCanvas"
import type { OrganicCalendarDay } from "./types"

const store = {
  ghosts: {},
}

mock.module("@/lib/organic/store", () => ({
  useCalendarStore: (selector: (state: typeof store) => unknown) => selector(store),
}))

mock.module("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: mock(),
    isOver: false,
  }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: mock(),
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
    mock.restore()
  })

  afterEach(() => {
    cleanup()
  })

  it("calls onCreatePost from header plus button", () => {
    const onCreatePost = mock()

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={mock()}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /add placeholder/i }))

    expect(onCreatePost).toHaveBeenCalledWith({ status: "placeholder" })
  })

  it("calls onCreatePost with day and platform when clicking an empty cell", () => {
    const onCreatePost = mock()

    render(
      <TimeGridCanvas
        days={buildWeekDays()}
        selectedDraftId={null}
        selectedDraftIds={[]}
        activePlatforms={["instagram", "linkedin"]}
        rangeTitle="February 23 – March 1, 2026"
        rangeSubtitle="Week 9"
        viewMode="week"
        onViewModeChange={mock()}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
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
    const onViewModeChange = mock()

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
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={mock()}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Month" }))

    expect(onViewModeChange).toHaveBeenCalledWith("month")
  })

  it("still allows adding posts when a cell already has a draft", () => {
    const onCreatePost = mock()
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
        onViewModeChange={mock()}
        onPreviousWeek={mock()}
        onNextWeek={mock()}
        onCreatePost={onCreatePost}
        onSelectDraft={mock()}
        onToggleSelection={mock()}
        onRegenerate={mock()}
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
