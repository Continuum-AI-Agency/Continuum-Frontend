import { describe, expect, it } from "bun:test";

import {
  type AudienceBreakdown,
  type AudienceDemographics,
  formatAudienceDemographicsDigest,
  hasAudienceDemographics,
} from "./audience";

const seg = (label: string, value: number) => ({ key: label.toLowerCase(), label, value });

const fullDemographics: AudienceDemographics = {
  age: [seg("25-34", 42), seg("35-44", 28), seg("18-24", 30)],
  gender: [seg("Female", 61), seg("Male", 39)],
  country: [seg("United States", 55), seg("United Kingdom", 12), seg("Canada", 8)],
};

const coldReach: AudienceBreakdown = { followers: 32, nonFollowers: 68 };
const warmReach: AudienceBreakdown = { followers: 70, nonFollowers: 30 };

describe("formatAudienceDemographicsDigest", () => {
  it("renders age, gender, geo and reach lines with an adaptive directive for full IG data", () => {
    const digest = formatAudienceDemographicsDigest(fullDemographics, coldReach);
    expect(digest).toContain("<audience_demographics>");
    // age ranked by share, top two shown
    expect(digest).toContain("Core age: 25-34 (42%), then 18-24 (30%)");
    expect(digest).toContain("Gender skew: 61% female / 39% male");
    expect(digest).toContain("Top geo: United States (55%), United Kingdom (12%)");
    expect(digest).toContain("Reach split: 68% non-followers / 32% followers");
    // non-follower-heavy reach -> cold directive
    expect(digest).toContain("earn the cold viewer's first 2 seconds");
    expect(digest.trim().endsWith("</audience_demographics>")).toBe(true);
  });

  it("uses the follower-heavy directive when reach skews to followers", () => {
    const digest = formatAudienceDemographicsDigest(fullDemographics, warmReach);
    expect(digest).toContain("Reach split: 30% non-followers / 70% followers");
    expect(digest).toContain("reward the existing community");
  });

  it("degrades to the reach line only when age/gender are absent (Facebook case)", () => {
    const digest = formatAudienceDemographicsDigest(null, coldReach);
    expect(digest).toContain("Reach split: 68% non-followers / 32% followers");
    expect(digest).not.toContain("Core age");
    expect(digest).not.toContain("Gender skew");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(formatAudienceDemographicsDigest(null, null)).toBe("");
    expect(
      formatAudienceDemographicsDigest({ age: [], gender: [] }, { followers: 0, nonFollowers: 0 }),
    ).toBe("");
  });

  it("normalizes raw counts and pre-percentaged values to the same shares", () => {
    const asCounts: AudienceDemographics = { age: [seg("25-34", 4200), seg("35-44", 2800)], gender: [] };
    const asPercents: AudienceDemographics = { age: [seg("25-34", 60), seg("35-44", 40)], gender: [] };
    const fromCounts = formatAudienceDemographicsDigest(asCounts, null);
    const fromPercents = formatAudienceDemographicsDigest(asPercents, null);
    expect(fromCounts).toContain("Core age: 25-34 (60%), then 35-44 (40%)");
    expect(fromCounts).toBe(fromPercents);
  });
});

describe("hasAudienceDemographics", () => {
  it("is true when any dimension carries entries", () => {
    expect(hasAudienceDemographics({ age: [seg("25-34", 1)] })).toBe(true);
    expect(hasAudienceDemographics({ gender: [], country: [seg("US", 1)] })).toBe(true);
  });

  it("is false for empty, missing, or non-object input", () => {
    expect(hasAudienceDemographics({ age: [], gender: [] })).toBe(false);
    expect(hasAudienceDemographics(null)).toBe(false);
    expect(hasAudienceDemographics("nope")).toBe(false);
  });
});
