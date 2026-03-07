import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { CalendarDraftCard } from "./CalendarDraftCard";
import type { OrganicCalendarDraft } from "./types";

const store = {
  updateDraft: vi.fn(),
  bulkDeleteDrafts: vi.fn(),
};

vi.mock("@/lib/organic/store", () => ({
  useCalendarStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({
    children,
    onSelect,
    className,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    className?: string;
    disabled?: boolean;
  }) => (
    <button className={className} disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: () => <div data-testid="progress" />,
}));

vi.mock("./DraftHoverCardContent", () => ({
  DraftHoverCardContent: () => <div data-testid="hover-preview" />,
}));

vi.mock("./DraftCardBadges", () => ({
  PlatformBadge: ({ platform }: { platform: string }) => <span>{platform}</span>,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

const draft: OrganicCalendarDraft = {
  id: "draft-1",
  title: "Draft title",
  summary: "Draft summary",
  timeLabel: "9:00 AM",
  dateLabel: "Mon, Jan 1",
  status: "draft",
  platforms: ["instagram"],
  format: "Post",
  objective: "Engagement",
  captionPreview: "Caption text",
  tags: [],
  mediaCount: 1,
};

describe("CalendarDraftCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("clicking the card focuses the side editor via onSelect", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={vi.fn()}
      />
    );

    const cardButton = container.querySelector("button[aria-pressed]");
    expect(cardButton).toBeTruthy();
    if (!cardButton) return;

    fireEvent.click(cardButton);
    expect(onSelect).toHaveBeenCalledWith("draft-1");
  });

  it("quick platform edit updates draft and keeps editor focused", () => {
    const onSelect = vi.fn();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText("Platform: LinkedIn")[0]);

    expect(store.updateDraft).toHaveBeenCalledTimes(1);
    expect(store.updateDraft.mock.calls[0]?.[0]).toBe("draft-1");
    const updater = store.updateDraft.mock.calls[0]?.[1] as (
      currentDraft: OrganicCalendarDraft
    ) => OrganicCalendarDraft;
    expect(updater(draft).platforms).toEqual(["linkedin"]);
    expect(onSelect).toHaveBeenCalledWith("draft-1");
  });

  it("retry generation action calls onRegenerate", () => {
    const onSelect = vi.fn();
    const onRegenerate = vi.fn();
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={vi.fn()}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.click(screen.getAllByText("Regenerate")[0]);

    expect(onRegenerate).toHaveBeenCalledWith("draft-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("allows custom posting time edits from quick actions", () => {
    const onSelect = vi.fn();
    const originalPrompt = (window as unknown as { prompt?: unknown }).prompt;
    (window as unknown as { prompt: () => string }).prompt = vi.fn(() => "11:15 AM");
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={onSelect}
        onToggleSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText("Time: Custom...")[0]);

    expect(store.updateDraft).toHaveBeenCalledTimes(1);
    const updater = store.updateDraft.mock.calls[0]?.[1] as (
      currentDraft: OrganicCalendarDraft
    ) => OrganicCalendarDraft;
    expect(updater(draft).timeLabel).toBe("11:15 AM");
    expect(onSelect).toHaveBeenCalledWith("draft-1");
    (window as unknown as { prompt?: unknown }).prompt = originalPrompt;
  });

  it("ignores invalid custom posting time edits", () => {
    const originalPrompt = (window as unknown as { prompt?: unknown }).prompt;
    (window as unknown as { prompt: () => string }).prompt = vi.fn(() => "9 AM");
    render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText("Time: Custom...")[0]);

    expect(store.updateDraft).not.toHaveBeenCalled();
    (window as unknown as { prompt?: unknown }).prompt = originalPrompt;
  });

  it("only allows marking as scheduled when the time is valid", () => {
    const invalidTimeDraft: OrganicCalendarDraft = {
      ...draft,
      id: "draft-2",
      timeLabel: "9 AM",
    };

    const { rerender } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText("Mark as scheduled")[0]);
    expect(store.updateDraft).toHaveBeenCalledTimes(1);

    rerender(
      <CalendarDraftCard
        draft={invalidTimeDraft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText("Mark as scheduled")[0]);
    expect(store.updateDraft).toHaveBeenCalledTimes(1);
  });

  it("clear failure button invokes onClearFailure for failed drafts", () => {
    const failedDraft: OrganicCalendarDraft = {
      ...draft,
      id: "draft-failed",
      status: "failed",
      generationError: "Failed to generate post",
    };
    const onClearFailure = vi.fn();

    render(
      <CalendarDraftCard
        draft={failedDraft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onClearFailure={onClearFailure}
      />
    );

    fireEvent.click(screen.getByText("Clear"));
    expect(onClearFailure).toHaveBeenCalledWith("draft-failed");
  });

  it("mouseover expands card into a quick preview state", () => {
    const { container } = render(
      <CalendarDraftCard
        draft={draft}
        isSelected={false}
        isMultiSelected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
      />
    );
    const cardButton = container.querySelector("button[aria-pressed]");
    expect(cardButton).toBeTruthy();
    if (!cardButton) return;

    fireEvent.mouseEnter(cardButton);
    expect(cardButton.className).toContain("scale-[1.015]");
  });
});
