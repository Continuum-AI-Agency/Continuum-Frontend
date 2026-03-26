import { describe, expect, it, mock } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import type { ReactNode } from "react"

import { DailyTemplatesPanel } from "./DailyTemplatesPanel"
import type { DetailedPostTemplate } from "@/lib/organic/types"

mock.module("@radix-ui/themes", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Flex: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Grid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Separator: () => <hr />,
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TextField: {
    Root: ({ onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} onChange={onChange} />
    ),
  },
}))

mock.module("@radix-ui/react-icons", () => ({
  ClipboardCopyIcon: () => <span>copy</span>,
}))

mock.module("./PlatformPreview", () => ({
  PlatformPreview: () => <div data-testid="platform-preview" />,
}))

function toLocalDateTimeInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const template: DetailedPostTemplate = {
  day_platform: "mon_instagram",
  type: "Post",
  format: "Carousel",
  title_topic: "Topic",
  objective: "Engagement",
  target: "Audience",
  creative_idea: "Creative",
  narrative_script: {
    hook: "Hook",
    interrupt: "Interrupt",
    context: "Context",
    open_loop: "Open",
    explanation: "Explain",
    value: "Value",
    cta: "CTA",
    slide_by_slide_breakdown: [],
  },
  technical_script: {},
  caption_copy: "Caption",
  hashtags: {
    high_competition: ["brand"],
    medium_competition: [],
    low_competition: [],
  },
  media_url: undefined,
  media_urls: undefined,
  num_slides: 3,
}

describe("DailyTemplatesPanel scheduling guardrails", () => {
  it("only emits schedule changes for future datetime-local values", () => {
    const onScheduleChange = mock()
    const { container } = render(
      <DailyTemplatesPanel
        templates={[template]}
        postingState={{ mon_instagram: { ready: false, scheduledAt: "" } }}
        language="English"
        onCopyCaption={mock()}
        onToggleReady={mock()}
        onScheduleChange={onScheduleChange}
        onAssetDrop={mock()}
      />
    )

    const input = container.querySelector('input[type="datetime-local"]')
    expect(input).toBeTruthy()
    if (!input) return

    const now = Date.now()
    const past = toLocalDateTimeInputValue(new Date(now - 60 * 60 * 1000))
    const future = toLocalDateTimeInputValue(new Date(now + 60 * 60 * 1000))

    fireEvent.change(input, { target: { value: past } })
    expect(onScheduleChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: future } })
    expect(onScheduleChange).toHaveBeenCalledWith("mon_instagram", future)
  })

  it("allows clearing scheduled value", () => {
    const onScheduleChange = mock()
    const { container } = render(
      <DailyTemplatesPanel
        templates={[template]}
        postingState={{ mon_instagram: { ready: true, scheduledAt: "2026-03-07T12:00" } }}
        language="English"
        onCopyCaption={mock()}
        onToggleReady={mock()}
        onScheduleChange={onScheduleChange}
        onAssetDrop={mock()}
      />
    )

    const input = container.querySelector('input[type="datetime-local"]')
    expect(input).toBeTruthy()
    if (!input) return

    fireEvent.change(input, { target: { value: "" } })
    expect(onScheduleChange).toHaveBeenCalledWith("mon_instagram", "")
  })
})
