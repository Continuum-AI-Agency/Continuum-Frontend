import { describe, expect, it, beforeEach } from "bun:test";
import * as storeRegistry from "@/lib/storage/storeRegistry";
import { getItem } from "@/lib/storage/brandScopedStorage";
import { TOUR_AI_CANVAS, TOUR_ORGANIC, TOUR_PAID_MEDIA, seenFlagBase } from "./config";
import { isTourSeen, markTourSeen, clearTourSeen } from "./seenFlags";

describe("seenFlags", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("isTourSeen is false before the tour has been marked", () => {
    expect(isTourSeen(TOUR_AI_CANVAS, "brand-a")).toBe(false);
  });

  it("markTourSeen makes isTourSeen return true for the same brand", () => {
    markTourSeen(TOUR_AI_CANVAS, "brand-a");
    expect(isTourSeen(TOUR_AI_CANVAS, "brand-a")).toBe(true);
  });

  it("seen state is isolated per brand", () => {
    markTourSeen(TOUR_ORGANIC, "brand-a");
    expect(isTourSeen(TOUR_ORGANIC, "brand-a")).toBe(true);
    expect(isTourSeen(TOUR_ORGANIC, "brand-b")).toBe(false);
  });

  it("seen state is isolated per tour", () => {
    markTourSeen(TOUR_ORGANIC, "brand-a");
    expect(isTourSeen(TOUR_ORGANIC, "brand-a")).toBe(true);
    expect(isTourSeen(TOUR_PAID_MEDIA, "brand-a")).toBe(false);
  });

  it("clearTourSeen resets the flag back to unseen", () => {
    markTourSeen(TOUR_PAID_MEDIA, "brand-a");
    clearTourSeen(TOUR_PAID_MEDIA, "brand-a");
    expect(isTourSeen(TOUR_PAID_MEDIA, "brand-a")).toBe(false);
  });

  it("registers a storeRegistry teardown that clears all three tour flags for the previous brand", () => {
    markTourSeen(TOUR_AI_CANVAS, "brand-a");
    markTourSeen(TOUR_ORGANIC, "brand-a");
    markTourSeen(TOUR_PAID_MEDIA, "brand-a");
    markTourSeen(TOUR_AI_CANVAS, "brand-b");

    storeRegistry.teardown("brand-a");

    expect(getItem(seenFlagBase(TOUR_AI_CANVAS), "brand-a")).toBeNull();
    expect(getItem(seenFlagBase(TOUR_ORGANIC), "brand-a")).toBeNull();
    expect(getItem(seenFlagBase(TOUR_PAID_MEDIA), "brand-a")).toBeNull();
    expect(getItem(seenFlagBase(TOUR_AI_CANVAS), "brand-b")).toBe("1");
  });
});
