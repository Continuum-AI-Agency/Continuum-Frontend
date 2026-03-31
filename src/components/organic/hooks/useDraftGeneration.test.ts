import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";

import { useDraftGeneration, mapWeeklyGridToCalendarPlacements } from "./useDraftGeneration";
import { useCalendarStore } from "@/lib/organic/store";
import { streamCalendarGeneration } from "../primitives/organic-calendar-api";
import type { CalendarGenerationEvent } from "@/lib/organic/calendar-generation";

mock.module("@/lib/organic/store", () => ({
  useCalendarStore: mock(),
}));

mock.module("../primitives/organic-calendar-api", () => ({
  streamCalendarGeneration: mock(),
}));

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: mock().mockResolvedValue({ data: { session: { access_token: "test-token" } } }),
    },
  }),
}));

describe("useDraftGeneration", () => {
  type HookProps = Parameters<typeof useDraftGeneration>[0];

  const mockStore = {
    gridStatus: "idle",
    setGridStatus: mock(),
    setGridProgress: mock(),
    setGridError: mock(),
    addDraft: mock(),
    bulkDeleteDrafts: mock(),
    updateDraft: mock(),
    setGhosts: mock(),
    addEvent: mock(),
    setDays: mock(),
  };

  const defaultProps: HookProps = {
    brandProfileId: "brand-123",
    calendarDays: [
      {
        id: "2026-01-26",
        label: "Mon",
        dateLabel: "Jan 26",
        suggestedTimes: ["9:00 AM", "1:00 PM"],
        slots: [
          {
            id: "seed-1",
            title: "Seeded topic",
            summary: "Ready",
            timeLabel: "9:00 AM",
            dateLabel: "Mon, Jan 26",
            status: "placeholder",
            platforms: ["instagram"],
            format: "Post",
            objective: "Generation Seed",
            captionPreview: "Generate me",
            tags: [],
            mediaCount: 1,
            seedTrendId: "trend-1",
          },
        ],
      },
    ],
    drafts: [
      {
        id: "seed-1",
        title: "Seeded topic",
        summary: "Ready",
        timeLabel: "9:00 AM",
        dateLabel: "Mon, Jan 26",
        status: "placeholder",
        platforms: ["instagram"],
        format: "Post",
        objective: "Generation Seed",
        captionPreview: "Generate me",
        tags: [],
        mediaCount: 1,
        seedTrendId: "trend-1",
      },
    ],
    selectedTrendIds: ["trend-1"],
    platformAccountIds: { instagram: "acc-123" },
    activePlatforms: ["instagram"],
    weekStartId: "2026-01-26",
  };

  beforeEach(() => {
    mock.restore();
    Object.values(mockStore).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) {
        (value as ReturnType<typeof mock>).mockClear();
      }
    });
    mockStore.gridStatus = "idle";
    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockClear();
    (useCalendarStore as unknown as ReturnType<typeof mock>).mockImplementation(
      (selector?: (state: typeof mockStore) => unknown) =>
        selector ? selector(mockStore) : mockStore
    );
  });

  afterEach(() => {
    mock.restore();
  });

  it("handles generation success flow", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({ type: "progress", completed: 1, total: 2, message: "Drafting..." });
        onEvent({ type: "slot_started", placementId: "p1", message: "Building post..." });
        onEvent({
          type: "slot_completed",
          placement: {
            placementId: "p1",
            schedule: { dayId: "2026-01-26", scheduledAt: "2026-01-26T09:00:00Z" },
            platform: { name: "instagram" },
            content: { titleTopic: "Test Title", format: "Post" },
            creative: { creativeIdea: "Test Idea" },
            copy: { caption: "Test Caption", hashtags: { high: ["#test"] } },
          },
        });
        onEvent({ type: "complete", summary: { total: 1, succeeded: 1, failed: 0 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("running");
    expect(mockStore.setGridProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 10 })
    );
    expect(mockStore.addDraft).toHaveBeenCalledWith(
      "2026-01-26",
      expect.objectContaining({
        id: "seed-1",
        title: "Test Title",
        captionPreview: "Test Caption\n\n#test",
      })
    );
    expect(mockStore.setGridStatus).toHaveBeenCalledWith("complete");
  });

  it("replaces seeded draft in place when backend emits a new placement id", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({
          type: "slot_completed",
          placement: {
            placementId: "draft-remote-1",
            schedule: { dayId: "2026-01-26", scheduledAt: "2026-01-26T09:00:00.000Z" },
            platform: { name: "instagram" },
            seed: { source: "trend", trendId: "trend-1" },
            content: { titleTopic: "Generated Title", format: "Post" },
            creative: {
              creativeIdea: "Generated idea",
              mediaSuggestion: {
                kind: "carousel",
                assetBase64: "iVBORw0KGgoAAAANSUhEUgAA",
                generationContext: {
                  sourceAgent: "asset_producer",
                  strategist: {
                    objective: "Engagement",
                    funnelStage: "middle",
                    targetAudience: "Families",
                  },
                  creativeDirection: {
                    conceptTitle: "Family-first dinner",
                    storyHook: "Dinner together",
                    visualMode: "carousel",
                    productionNotes: ["Use warm tones"],
                  },
                },
              },
            },
            copy: { caption: "Generated caption" },
          },
        });
        onEvent({ type: "complete", summary: { total: 1, succeeded: 1, failed: 0 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.bulkDeleteDrafts).toHaveBeenCalledWith(["seed-1", "draft-remote-1"]);
    expect(mockStore.addDraft).toHaveBeenCalledWith(
      "2026-01-26",
      expect.objectContaining({
        id: "seed-1",
        title: "Generated Title",
        mediaSuggestion: expect.objectContaining({
          assetBase64: "iVBORw0KGgoAAAANSUhEUgAA",
          assetUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
          generationContext: expect.objectContaining({
            strategist: expect.objectContaining({
              funnelStage: "middle",
              targetAudience: "Families",
            }),
            creativeDirection: expect.objectContaining({
              conceptTitle: "Family-first dinner",
              storyHook: "Dinner together",
            }),
          }),
        }),
      })
    );
  });

  it("uses mediaSuggestion.assets primary image when top-level assetBase64 is missing", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({
          type: "slot_completed",
          placement: {
            placementId: "draft-remote-2",
            schedule: { dayId: "2026-01-26", scheduledAt: "2026-01-26T09:00:00.000Z" },
            platform: { name: "instagram" },
            seed: { source: "trend", trendId: "trend-1" },
            content: { titleTopic: "Carousel Title", format: "Carousel" },
            creative: {
              creativeIdea: "Carousel idea",
              mediaSuggestion: {
                kind: "carousel",
                assetBase64: null,
                assets: [
                  {
                    role: "slide_1",
                    order: 1,
                    assetBase64: "firstslidebase64",
                    mimeType: "image/webp",
                    prompt: "Slide 1 prompt",
                  },
                  {
                    role: "slide_2",
                    order: 2,
                    error: "generation failed",
                  },
                ],
              },
            },
            copy: { caption: "Generated caption" },
          },
        });
        onEvent({ type: "complete", summary: { total: 1, succeeded: 1, failed: 0 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.addDraft).toHaveBeenCalledWith(
      "2026-01-26",
      expect.objectContaining({
        id: "seed-1",
        mediaSuggestion: expect.objectContaining({
          assetBase64: "firstslidebase64",
          assetUrl: "data:image/webp;base64,firstslidebase64",
          assets: expect.arrayContaining([
            expect.objectContaining({ role: "slide_1", order: 1 }),
            expect.objectContaining({ role: "slide_2", order: 2, error: "generation failed" }),
          ]),
        }),
      })
    );
  });

  it("sends all placeholder slots in the request payload", async () => {
    const props: HookProps = {
      ...defaultProps,
      calendarDays: [
        {
          id: "2026-01-26",
          label: "Mon",
          dateLabel: "Jan 26",
          suggestedTimes: ["9:00 AM", "1:00 PM"],
          slots: [
            {
              id: "seed-1",
              title: "Seed 1",
              summary: "Ready",
              timeLabel: "9:00 AM",
              dateLabel: "Mon, Jan 26",
              status: "placeholder",
              platforms: ["instagram"],
              format: "Post",
              objective: "Generation Seed",
              captionPreview: "Generate me",
              tags: [],
              mediaCount: 1,
              seedTrendId: "trend-1",
            },
            {
              id: "already-generated",
              title: "Existing",
              summary: "Done",
              timeLabel: "1:00 PM",
              dateLabel: "Mon, Jan 26",
              status: "draft",
              platforms: ["instagram"],
              format: "Post",
              objective: "Awareness",
              captionPreview: "Already generated",
              tags: [],
              mediaCount: 1,
            },
          ],
        },
        {
          id: "2026-01-27",
          label: "Tue",
          dateLabel: "Jan 27",
          suggestedTimes: ["9:00 AM", "1:00 PM"],
          slots: [
            {
              id: "seed-2",
              title: "Seed 2",
              summary: "Ready",
              timeLabel: "1:00 PM",
              dateLabel: "Tue, Jan 27",
              status: "placeholder",
              platforms: ["instagram"],
              format: "Carousel",
              objective: "Generation Seed",
              captionPreview: "Generate me too",
              tags: [],
              mediaCount: 1,
              seedTrendId: "trend-2",
            },
          ],
        },
      ],
      drafts: [
        ...defaultProps.drafts,
        {
          id: "seed-2",
          title: "Seed 2",
          summary: "Ready",
          timeLabel: "1:00 PM",
          dateLabel: "Tue, Jan 27",
          status: "placeholder",
          platforms: ["instagram"],
          format: "Carousel",
          objective: "Generation Seed",
          captionPreview: "Generate me too",
          tags: [],
          mediaCount: 1,
          seedTrendId: "trend-2",
        },
      ],
      selectedTrendIds: ["trend-1", "trend-2"],
    };

    const { result } = renderHook(() => useDraftGeneration(props));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({ type: "complete", summary: { total: 2, succeeded: 2, failed: 0 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    const streamCalls = (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mock.calls;
    expect(streamCalls).toHaveLength(1);
    const firstPayload = streamCalls[0][0] as { placements: Array<{ placementId: string }> };
    expect(firstPayload.placements).toHaveLength(2);
    expect(firstPayload.placements.map((placement) => placement.placementId).sort()).toEqual([
      "seed-1",
      "seed-2",
    ]);
  });

  it("sends creative direction and thumbnail metadata with each placeholder", async () => {
    const props: HookProps = {
      ...defaultProps,
      calendarDays: [
        {
          id: "2026-01-26",
          label: "Mon",
          dateLabel: "Jan 26",
          suggestedTimes: ["9:00 AM", "1:00 PM"],
          slots: [
            {
              id: "seed-meta",
              title: "Seeded topic",
              summary: "Ready",
              timeLabel: "9:00 AM",
              dateLabel: "Mon, Jan 26",
              status: "placeholder",
              platforms: ["instagram"],
              format: "Post",
              objective: "Generation Seed",
              captionPreview: "Generate me",
              tags: [],
              mediaCount: 1,
              seedTrendId: "trend-1",
              creativeDirectionPrompt: "Use a bright, playful opener",
              thumbnailPrompt: "Minimal white product shot",
            },
          ],
        },
      ],
      drafts: [
        {
          id: "seed-meta",
          title: "Seeded topic",
          summary: "Ready",
          timeLabel: "9:00 AM",
          dateLabel: "Mon, Jan 26",
          status: "placeholder",
          platforms: ["instagram"],
          format: "Post",
          objective: "Generation Seed",
          captionPreview: "Generate me",
          tags: [],
          mediaCount: 1,
          seedTrendId: "trend-1",
          creativeDirectionPrompt: "Use a bright, playful opener",
          thumbnailPrompt: "Minimal white product shot",
        },
      ],
      selectedTrendIds: ["trend-1"],
    };

    const { result } = renderHook(() => useDraftGeneration(props));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({ type: "complete", summary: { total: 1, succeeded: 1, failed: 0 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    const streamCalls = (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mock.calls;
    expect(streamCalls).toHaveLength(1);
    const firstPayload = streamCalls[0][0] as {
      placements: Array<{ placementId: string; metadata?: Record<string, string> }>;
    };
    expect(firstPayload.placements[0]?.metadata).toMatchObject({
      creativeDirectionPrompt: "Use a bright, playful opener",
      thumbnailPrompt: "Minimal white product shot",
    });
  });

  it("does not auto-sort when no trends are selected", () => {
    const props: HookProps = {
      ...defaultProps,
      selectedTrendIds: [],
    };
    const { result } = renderHook(() => useDraftGeneration(props));

    result.current.handleAutoSort();

    expect(mockStore.addDraft).not.toHaveBeenCalled();
  });

  it("handles generation error flow", async () => {
    const { result } = renderHook(() => useDraftGeneration(defaultProps));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockRejectedValue(
      new Error("API Error")
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("error");
    expect(mockStore.setGridError).toHaveBeenCalledWith("API Error");
  });

  it("validates missing brand profile", async () => {
    const props: HookProps = { ...defaultProps, brandProfileId: undefined };
    const { result } = renderHook(() => useDraftGeneration(props));

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.setGridStatus).toHaveBeenCalledWith("error");
    expect(mockStore.setGridError).toHaveBeenCalledWith(
      expect.stringContaining("Missing brand context")
    );
    expect(streamCalendarGeneration).not.toHaveBeenCalled();
  });

  it("marks failed placements and keeps run as complete_with_errors", async () => {
    const props: HookProps = {
      ...defaultProps,
      calendarDays: [
        {
          id: "2026-01-26",
          label: "Mon",
          dateLabel: "Jan 26",
          suggestedTimes: ["9:00 AM", "1:00 PM"],
          slots: [
            {
              id: "seed-1",
              title: "Seeded topic",
              summary: "Ready",
              timeLabel: "9:00 AM",
              dateLabel: "Mon, Jan 26",
              status: "placeholder",
              platforms: ["instagram"],
              format: "Post",
              objective: "Generation Seed",
              captionPreview: "Generate me",
              tags: [],
              mediaCount: 1,
              seedTrendId: "trend-1",
            },
          ],
        },
      ],
      drafts: [
        {
          id: "seed-1",
          title: "Seeded topic",
          summary: "Ready",
          timeLabel: "9:00 AM",
          dateLabel: "Mon, Jan 26",
          status: "placeholder",
          platforms: ["instagram"],
          format: "Post",
          objective: "Generation Seed",
          captionPreview: "Generate me",
          tags: [],
          mediaCount: 1,
          seedTrendId: "trend-1",
        },
      ],
      selectedTrendIds: ["trend-1"],
    };
    const { result } = renderHook(() => useDraftGeneration(props));

    (streamCalendarGeneration as unknown as ReturnType<typeof mock>).mockImplementation(
      async (_payload: unknown, onEvent: (event: CalendarGenerationEvent) => void) => {
        onEvent({
          type: "slot_failed",
          placementId: "seed-1",
          message: "Trend not found",
          retryable: true,
          attempts: 1,
        });
        onEvent({ type: "complete", summary: { total: 1, succeeded: 0, failed: 1 } });
      }
    );

    await act(async () => {
      await result.current.handleGenerateDrafts();
    });

    expect(mockStore.updateDraft).toHaveBeenCalled();
    expect(mockStore.setGridStatus).toHaveBeenCalledWith("complete_with_errors");
  });
});

describe("mapWeeklyGridToCalendarPlacements", () => {
  it("maps weekly grid rows to day slots with platform rotation", () => {
    const placements = mapWeeklyGridToCalendarPlacements({
      weeklyGrid: {
        grid: [
          {
            day: "Monday",
            type: "Post",
            format: "Reel",
            tone: "Educational",
            title_topic: "Trend A",
            objective: "Awareness",
            target: "Founders",
            cta: "Comment below",
            num_slides: 1,
          },
          {
            day: "Monday",
            type: "Post",
            format: "Carousel",
            tone: "Confident",
            title_topic: "Trend B",
            objective: "Engagement",
            target: "Marketers",
            cta: "Share this",
            num_slides: 3,
          },
        ],
      },
      calendarDays: [
        {
          id: "2026-01-26",
          label: "Mon",
          dateLabel: "Jan 26",
          suggestedTimes: ["9:00 AM", "1:00 PM"],
          slots: [],
        },
      ],
      selectedTrendIds: ["trend-1", "trend-2"],
      activePlatforms: ["instagram", "linkedin"],
      platformAccountIds: {
        instagram: "ig-1",
        linkedin: "li-1",
      },
    });

    expect(placements).toHaveLength(2);
    expect(placements[0]).toEqual(
      expect.objectContaining({
        dayId: "2026-01-26",
        draft: expect.objectContaining({
          timeLabel: "9:00 AM",
          platforms: ["instagram"],
          seedTrendId: "trend-1",
        }),
      })
    );
    expect(placements[1]).toEqual(
      expect.objectContaining({
        dayId: "2026-01-26",
        draft: expect.objectContaining({
          timeLabel: "1:00 PM",
          platforms: ["linkedin"],
          seedTrendId: "trend-2",
        }),
      })
    );
  });
});
