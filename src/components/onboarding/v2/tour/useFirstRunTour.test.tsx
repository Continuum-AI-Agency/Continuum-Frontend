import { describe, expect, it, beforeEach, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { TOUR_AI_CANVAS, seenFlagBase } from "./config";
import { getItem } from "@/lib/storage/brandScopedStorage";

const ACTIVE_BRAND_CONTEXT_PATH = "@/components/providers/ActiveBrandProvider";
const NEXTSTEP_PATH = "nextstepjs";

type MockState = {
  activeBrandId: string;
  currentTour: string | null;
  startNextStep: (tourName: string) => void;
};

const state: MockState = {
  activeBrandId: "brand-a",
  currentTour: null,
  startNextStep: () => {},
};

mock.module(ACTIVE_BRAND_CONTEXT_PATH, () => ({
  useActiveBrandContext: () => ({ activeBrandId: state.activeBrandId }),
}));

mock.module(NEXTSTEP_PATH, () => ({
  useNextStep: () => ({
    currentTour: state.currentTour,
    startNextStep: (tourName: string) => state.startNextStep(tourName),
  }),
}));

const { useFirstRunTour } = await import("./useFirstRunTour");

describe("useFirstRunTour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.activeBrandId = "brand-a";
    state.currentTour = null;
    state.startNextStep = () => {};
  });

  it("starts the tour and marks it seen when unseen, ready, and no tour is running", () => {
    const started = mock(() => {});
    state.startNextStep = started;

    renderHook(() => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready: true }));

    expect(started).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith(TOUR_AI_CANVAS);
    expect(getItem(seenFlagBase(TOUR_AI_CANVAS), "brand-a")).toBe("1");
  });

  it("does not start the tour while the surface is not ready", () => {
    const started = mock(() => {});
    state.startNextStep = started;

    renderHook(() => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready: false }));

    expect(started).not.toHaveBeenCalled();
    expect(getItem(seenFlagBase(TOUR_AI_CANVAS), "brand-a")).toBeNull();
  });

  it("does not start the tour when it has already been seen for this brand", () => {
    window.localStorage.setItem(`${seenFlagBase(TOUR_AI_CANVAS)}:b:brand-a`, "1");
    const started = mock(() => {});
    state.startNextStep = started;

    renderHook(() => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready: true }));

    expect(started).not.toHaveBeenCalled();
  });

  it("does not start the tour when another tour is already running", () => {
    state.currentTour = "some-other-tour";
    const started = mock(() => {});
    state.startNextStep = started;

    renderHook(() => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready: true }));

    expect(started).not.toHaveBeenCalled();
    expect(getItem(seenFlagBase(TOUR_AI_CANVAS), "brand-a")).toBeNull();
  });

  it("does not start the tour before the active brand id is available", () => {
    state.activeBrandId = "";
    const started = mock(() => {});
    state.startNextStep = started;

    renderHook(() => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready: true }));

    expect(started).not.toHaveBeenCalled();
  });

  it("starts the tour only once across re-renders", () => {
    const started = mock(() => {});
    state.startNextStep = started;

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useFirstRunTour({ tourName: TOUR_AI_CANVAS, ready }),
      { initialProps: { ready: true } }
    );
    rerender({ ready: true });
    rerender({ ready: true });

    expect(started).toHaveBeenCalledTimes(1);
  });
});
