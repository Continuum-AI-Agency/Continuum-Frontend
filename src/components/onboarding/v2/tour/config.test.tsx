import { describe, expect, it } from "bun:test";
import {
  TOUR_DASHBOARD,
  TOUR_AI_CANVAS,
  TOUR_ORGANIC,
  TOUR_PAID_MEDIA,
  TOUR_NAMES,
  seenFlagBase,
  allTours,
  type TourName,
} from "./config";

describe("tour config", () => {
  const expectedNames: readonly TourName[] = [
    TOUR_DASHBOARD,
    TOUR_AI_CANVAS,
    TOUR_ORGANIC,
    TOUR_PAID_MEDIA,
  ];

  it("exposes exactly one tour per surface", () => {
    expect(allTours).toHaveLength(expectedNames.length);
    expect(allTours.map((tour) => tour.tour).sort()).toEqual([...expectedNames].sort());
  });

  it("TOUR_NAMES lists every tour name", () => {
    expect([...TOUR_NAMES].sort()).toEqual([...expectedNames].sort());
  });

  it("every step targets a selector so the spotlight never lands on nothing", () => {
    for (const tour of allTours) {
      expect(tour.steps.length).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.selector).toBeTruthy();
      }
    }
  });

  it("no step uses nextRoute — each tour stays on a single surface", () => {
    for (const tour of allTours) {
      for (const step of tour.steps) {
        expect(step.nextRoute).toBeUndefined();
      }
    }
  });

  it("seenFlagBase namespaces the localStorage base key per tour", () => {
    expect(seenFlagBase(TOUR_AI_CANVAS)).toBe(`walkthrough-seen:${TOUR_AI_CANVAS}`);
    expect(seenFlagBase(TOUR_ORGANIC)).toBe(`walkthrough-seen:${TOUR_ORGANIC}`);
  });
});
