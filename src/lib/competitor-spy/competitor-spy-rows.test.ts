import { describe, expect, it } from "bun:test";

import { adStatusBadge, formatRelativeDay, isRecentlyIdentified } from "./competitor-spy-rows";

const NOW = Date.parse("2026-06-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("isRecentlyIdentified", () => {
  it("is true within the default 7-day window", () => {
    expect(isRecentlyIdentified(new Date(NOW - 3 * DAY_MS).toISOString(), NOW)).toBe(true);
  });

  it("is false once older than the window", () => {
    expect(isRecentlyIdentified(new Date(NOW - 10 * DAY_MS).toISOString(), NOW)).toBe(false);
  });

  it("is false for an unparseable date", () => {
    expect(isRecentlyIdentified("nope", NOW)).toBe(false);
  });
});

describe("adStatusBadge", () => {
  it("flags paused ads regardless of recency", () => {
    expect(adStatusBadge("paused", new Date(NOW).toISOString(), NOW)).toEqual({
      label: "Paused",
      tone: "paused",
    });
  });

  it("flags a recently identified active ad as New", () => {
    expect(adStatusBadge("active", new Date(NOW - 2 * DAY_MS).toISOString(), NOW)).toEqual({
      label: "New",
      tone: "new",
    });
  });

  it("flags a long-running active ad as Active", () => {
    expect(adStatusBadge("active", new Date(NOW - 40 * DAY_MS).toISOString(), NOW)).toEqual({
      label: "Active",
      tone: "active",
    });
  });
});

describe("formatRelativeDay", () => {
  it("formats recent days", () => {
    expect(formatRelativeDay(new Date(NOW).toISOString(), NOW)).toBe("today");
    expect(formatRelativeDay(new Date(NOW - DAY_MS).toISOString(), NOW)).toBe("1d ago");
    expect(formatRelativeDay(new Date(NOW - 5 * DAY_MS).toISOString(), NOW)).toBe("5d ago");
  });

  it("returns empty for nullish or invalid input", () => {
    expect(formatRelativeDay(null, NOW)).toBe("");
    expect(formatRelativeDay("bad", NOW)).toBe("");
  });
});
