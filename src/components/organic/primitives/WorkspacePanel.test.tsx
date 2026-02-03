import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspacePanel } from "./WorkspacePanel";

// Mock child components
vi.mock("@/components/organic/TrendSelector", () => ({
  TrendSelector: () => <div data-testid="trend-selector">TrendSelector</div>,
}));

vi.mock("./DraggableDraftCard", () => ({
  DraggableDraftCard: () => <div data-testid="draft-card">DraftCard</div>,
}));

// Mock dnd-kit
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
    activePlatforms: [],
    maxTrendSelections: 5,
    onToggleTrend: vi.fn(),
    onGenerate: vi.fn(),
    viewMode: "week" as const,
    onViewModeChange: vi.fn(),
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

  it("renders correctly in idle state", () => {
    render(<WorkspacePanel {...defaultProps} />);
    
    expect(screen.getByText("Content Direction")).toBeDefined();
    expect(screen.getByText("Generate Drafts")).toBeDefined();
    expect(screen.getByText("Full Week AI Generation")).toBeDefined();
  });

  it("shows seed count when seeds exist", () => {
    render(<WorkspacePanel {...defaultProps} seedCount={3} />);
    
    expect(screen.getByText("3 trends ready")).toBeDefined();
  });

  it("disables buttons when generating", () => {
    render(<WorkspacePanel {...defaultProps} gridStatus="running" />);
    
    const generateBtn = screen.getByText("Processing batch...").closest("button");
    const autoSortBtn = screen.getByText("Auto-Sort").closest("button");
    const clearAllBtn = screen.getByText("Clear All").closest("button");

    expect(generateBtn).toHaveProperty("disabled", true);
    expect(autoSortBtn).toHaveProperty("disabled", true);
    expect(clearAllBtn).toHaveProperty("disabled", true);
  });

  it("calls onGenerate when generate button is clicked", () => {
    render(<WorkspacePanel {...defaultProps} />);
    
    const btn = screen.getByText("Generate Drafts");
    fireEvent.click(btn);
    
    expect(defaultProps.onGenerate).toHaveBeenCalled();
  });

  it("calls onAutoSort when auto-sort button is clicked", () => {
    render(<WorkspacePanel {...defaultProps} />);
    
    const btn = screen.getByText("Auto-Sort");
    fireEvent.click(btn);
    
    expect(defaultProps.onAutoSort).toHaveBeenCalled();
  });

  it("calls onClearAll when clear all button is clicked", () => {
    render(<WorkspacePanel {...defaultProps} />);
    
    const btn = screen.getByText("Clear All");
    fireEvent.click(btn);
    
    expect(defaultProps.onClearAll).toHaveBeenCalled();
  });
});
