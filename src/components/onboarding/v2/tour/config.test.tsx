import { describe, expect, it } from "bun:test";
import {
  TOUR_DASHBOARD,
  TOUR_AI_CANVAS,
  TOUR_ORGANIC,
  TOUR_PAID_MEDIA,
  TOUR_NAMES,
  ORGANIC_PLANNER_TOUR_VIEWPORT_ID,
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

  it("every non-centered step targets a selector so the spotlight never lands on nothing", () => {
    for (const tour of allTours) {
      expect(tour.steps.length).toBeGreaterThan(0);
      for (const step of tour.steps) {
        if (!step.selector) {
          expect(step.title).toBe("This is your canvas");
          continue;
        }

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

  it("anchors Organic planner steps inside the planner viewport", () => {
    const organicTour = allTours.find((tour) => tour.tour === TOUR_ORGANIC);

    expect(organicTour?.steps[0]?.selector).toBe("[data-tour-id='organic-calendar-controls']");
    expect(organicTour?.steps[0]?.viewportID).toBe(ORGANIC_PLANNER_TOUR_VIEWPORT_ID);
    expect(organicTour?.steps[1]?.viewportID).toBe(ORGANIC_PLANNER_TOUR_VIEWPORT_ID);
    expect(organicTour?.steps[2]?.selector).toBe("[data-tour-id='organic-list-content']");
    expect(organicTour?.steps[2]?.viewportID).toBe(ORGANIC_PLANNER_TOUR_VIEWPORT_ID);
  });

  it("seenFlagBase namespaces the localStorage base key per tour", () => {
    expect(seenFlagBase(TOUR_AI_CANVAS)).toBe(`walkthrough-seen:${TOUR_AI_CANVAS}`);
    expect(seenFlagBase(TOUR_ORGANIC)).toBe(`walkthrough-seen:${TOUR_ORGANIC}`);
  });
});
