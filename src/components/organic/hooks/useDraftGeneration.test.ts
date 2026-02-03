import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftGeneration } from "./useDraftGeneration";
import { useCalendarStore } from "@/lib/organic/store";
import { streamCalendarGeneration } from "../primitives/organic-calendar-api";

vi.mock("@/lib/organic/store", () => ({
  useCalendarStore: vi.fn(),
}));

vi.mock("../primitives/organic-calendar-api", () => ({
  streamCalendarGeneration: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } } }),
    },
  }),
}));

describe("useDraftGeneration", () => {
  const mockStore = {
    gridStatus: "idle",
    setGridStatus: vi.fn(),
    setGridProgress: vi.fn(),
    setGridError: vi.fn(),
    addDraft: vi.fn(),
    updateDraft: vi.fn(),
    setGhosts: vi.fn(),
  };

  const defaultProps = {
    brandProfileId: "brand-123",
    calendarDays: [{ id: "2026-01-26", label: "Monday", dateLabel: "Jan 26", suggestedTimes: [], slots: [] }],
    drafts: [],
    selectedTrendIds: [],
    trends: [],
    platformAccountIds: { instagram: "acc-123" },
    activePlatforms: ["instagram"],
    weekStartId: "2026-01-26",
  };

  beforeEach(() => {
    (useCalendarStore as any).mockReturnValue(mockStore);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles generation success flow", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps as any));

    (streamCalendarGeneration as any).mockImplementation(async (_payload: any, onEvent: any) => {
      onEvent({ type: "progress", completed: 1, total: 2, message: "Drafting..." });
      onEvent({
        type: "placement",
        placement: {
          placementId: "p1",
          schedule: { dayId: "2026-01-26", scheduledAt: "2026-01-26T09:00:00Z" },
          platform: { name: "instagram" },
          content: { titleTopic: "Test Title", format: "Post" },
          creative: { creativeIdea: "Test Idea" },
          copy: { caption: "Test Caption", hashtags: { high: ["#test"] } },
        },
      });
      onEvent({ type: "complete" });
    });

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("running");
    expect(mockStore.setGridProgress).toHaveBeenCalledWith(expect.objectContaining({ percent: 50 }));
    expect(mockStore.addDraft).toHaveBeenCalledWith("2026-01-26", expect.objectContaining({
      id: "p1",
      title: "Test Title",
      captionPreview: "Test Caption\n\n#test",
    }));
    expect(mockStore.setGridStatus).toHaveBeenCalledWith("complete");
  });

  it("handles generation error flow", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps as any));

    (streamCalendarGeneration as any).mockRejectedValue(new Error("API Error"));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("error");
    expect(mockStore.setGridError).toHaveBeenCalledWith("API Error");
  });

  it("validates missing brand profile", async () => {
    const props = { ...defaultProps, brandProfileId: undefined };
    const { result } = renderHook(() => useDraftGeneration(props as any));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("error");
    expect(mockStore.setGridError).toHaveBeenCalledWith(expect.stringContaining("Missing brand context"));
    expect(streamCalendarGeneration).not.toHaveBeenCalled();
  });
});
