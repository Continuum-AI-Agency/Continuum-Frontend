import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

import { WorkspacePanel } from "./WorkspacePanel";

vi.mock("@/components/organic/TrendSelector", () => ({
  TrendSelector: () => <div data-testid="trend-selector">TrendSelector</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
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

vi.mock("./DraggableDraftCard", () => ({
  DraggableDraftCard: () => <div data-testid="draft-card">DraftCard</div>,
}));

vi.mock("./OrganicDraftPreview", () => ({
  OrganicDraftPreview: () => <div data-testid="draft-preview">DraftPreview</div>,
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

describe("WorkspacePanel", () => {
  const defaultProps = {
    trends: [],
    selectedTrendIds: [],
    activePlatforms: ["instagram", "facebook", "linkedin"],
    maxTrendSelections: 5,
    onToggleTrend: vi.fn(),
    onGenerateGrid: vi.fn(),
    onAutoSort: vi.fn(),
    onClearAll: vi.fn(),
    onSelectDraft: vi.fn(),
    onToggleSelection: vi.fn(),
    selectedDraftId: null,
    selectedDraftIds: [],
    seedCount: 0,
    gridStatus: "idle" as const,
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders generation controls", () => {
    render(<WorkspacePanel {...defaultProps} />);

    expect(screen.getByText("Weekly Content Initiation")).toBeDefined();
    expect(screen.getByText("Generate Weekly Grid")).toBeDefined();
    expect(screen.getByTestId("trend-selector")).toBeDefined();
  });

  it("shows seed count when seeded drafts exist", () => {
    render(<WorkspacePanel {...defaultProps} seedCount={3} />);

    expect(screen.getByText("3 seeded drafts in queue")).toBeDefined();
  });

  it("disables actions while generating", () => {
    render(<WorkspacePanel {...defaultProps} gridStatus="running" />);

    expect(screen.getByText("Generating").closest("button")).toHaveProperty("disabled", true);
    expect(screen.getByText("Auto-seed").closest("button")).toHaveProperty("disabled", true);
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

  it("calls onAutoSort and onClearAll", () => {
    render(<WorkspacePanel {...defaultProps} />);

    fireEvent.click(screen.getByText("Auto-seed"));
    fireEvent.click(screen.getByText("Clear"));
    fireEvent.click(screen.getByText("Clear Week"));

    expect(defaultProps.onAutoSort).toHaveBeenCalled();
    expect(defaultProps.onClearAll).toHaveBeenCalled();
  });
});
