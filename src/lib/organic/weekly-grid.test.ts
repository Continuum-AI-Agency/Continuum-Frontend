import { describe, expect, it } from "vitest";

import { parseWeeklyGridPayload } from "./weekly-grid";

const row = {
  day: "Monday",
  type: "Post",
  format: "Reel",
  tone: "Educational",
  title_topic: "Trend A",
  objective: "Awareness",
  target: "Founders",
  cta: "Comment below",
  num_slides: 1,
};

describe("parseWeeklyGridPayload", () => {
  it("parses a direct weekly grid payload", () => {
    const parsed = parseWeeklyGridPayload({ grid: [row] });

    expect(parsed).toEqual({
      grid: [row],
    });
  });

  it("parses nested envelope payloads and weekly_grid arrays", () => {
    const parsed = parseWeeklyGridPayload({
      data: {
        result: {
          weekly_grid: [row],
        },
      },
    });

    expect(parsed).toEqual({
      grid: [row],
    });
  });

  it("returns null for invalid payloads", () => {
    const parsed = parseWeeklyGridPayload({
      data: {
        result: {
          weekly_grid: "not-a-grid",
        },
      },
    });

    expect(parsed).toBeNull();
  });
});
