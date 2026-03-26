import { describe, it, expect, afterEach, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

import { WorkspacePanel } from "./WorkspacePanel";

mock.module("@/components/organic/TrendSelector", () => ({
  TrendSelector: () => <div data-testid="trend-selector">TrendSelector</div>,
}));

mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

mock.module("./DraggableDraftCard", () => ({
  DraggableDraftCard: () => <div data-testid="draft-card">DraftCard</div>,
}));

mock.module("./OrganicDraftPreview", () => ({
  OrganicDraftPreview: () => <div data-testid="draft-preview">DraftPreview</div>,
}));

mock.module("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: mock(),
    isOver: false,
  }),
}));

describe("WorkspacePanel", () => {
  const defaultProps = {
    trends: [],
    selectedTrendIds: [],
    activePlatforms: ["instagram", "facebook", "linkedin"],
    maxTrendSelections: 5,
    onToggleTrend: mock(),
    onGenerateGrid: mock(),
    onClearAll: mock(),
    onSelectDraft: mock(),
    onToggleSelection: mock(),
    selectedDraftId: null,
    selectedDraftIds: [],
    seedCount: 0,
    gridStatus: "idle" as const,
  };

  afterEach(() => {
    mock.restore();
  });

  it("renders generation controls", () => {
    render(<WorkspacePanel {...defaultProps} />);

    expect(screen.getByText("Weekly Content Initiation")).toBeDefined();
    expect(screen.getByText("Generate Weekly Grid")).toBeDefined();
    expect(screen.getByTestId("trend-selector")).toBeDefined();
  });

  it("shows placeholder count when placeholders exist", () => {
    render(<WorkspacePanel {...defaultProps} seedCount={3} />);

    expect(screen.getByText("3 placeholders in queue")).toBeDefined();
  });

  it("disables actions while generating", () => {
    render(<WorkspacePanel {...defaultProps} gridStatus="running" />);

    expect(screen.getByText("Generating").closest("button")).toHaveProperty("disabled", true);
    expect(screen.getByText("Clear").closest("button")).toHaveProperty("disabled", true);
  });

  it("calls onGenerateGrid with control values", () => {
    render(<WorkspacePanel {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText("English"), {
      target: { value: "Spanish" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional focus for this week"), {
      target: { value: "Focus on product launch" },
    });

    fireEvent.click(screen.getByText("Generate Weekly Grid"));

    expect(defaultProps.onGenerateGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "Spanish",
        userPrompt: "Focus on product launch",
      })
    );
  });

  it("calls onClearAll", () => {
    render(<WorkspacePanel {...defaultProps} />);

    fireEvent.click(screen.getByText("Clear"));
    fireEvent.click(screen.getByText("Clear Week"));

    expect(defaultProps.onClearAll).toHaveBeenCalled();
  });

  it("renders preview-only mode without generation controls", () => {
    render(<WorkspacePanel {...defaultProps} mode="preview" />);

    expect(screen.queryByText("Weekly Content Initiation")).toBeNull();
    expect(screen.getByText("Selected Post")).toBeDefined();
    expect(screen.queryByText("Unscheduled Pool")).toBeNull();
  });

  it("renders config mode with assignment days", () => {
    render(
      <WorkspacePanel
        {...defaultProps}
        mode="config"
        assignmentDays={[
          { id: "2026-02-16", label: "Mon", dateLabel: "Feb 16", draftCount: 2 },
          { id: "2026-02-17", label: "Tue", dateLabel: "Feb 17", draftCount: 0 },
        ]}
      />
    );

    expect(screen.getByText("Day Assignments")).toBeDefined();
    expect(screen.getByText("2 posts")).toBeDefined();
    expect(screen.getByText("0 posts")).toBeDefined();
  });
});
