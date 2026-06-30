import { describe, expect, it } from "bun:test";

import {
  deltaTone,
  formatCompactNumber,
  formatNumber,
  formatPercentChange,
  formatRate,
  trendDirection,
} from "./organic-format";

describe("formatNumber", () => {
  it("groups full numbers and dashes when absent", () => {
    expect(formatNumber(12431)).toBe("12,431");
    expect(formatNumber(undefined)).toBe("-");
    expect(formatNumber(Number.NaN)).toBe("-");
  });
});

describe("formatCompactNumber", () => {
  it("renders compact notation", () => {
    expect(formatCompactNumber(12400)).toBe("12.4K");
    expect(formatCompactNumber(undefined)).toBe("-");
  });
});

describe("formatRate", () => {
  it("renders a 0-100 rate as a percent", () => {
    expect(formatRate(68)).toBe("68%");
    expect(formatRate(undefined)).toBe("-");
  });
});

describe("formatPercentChange", () => {
  it("signs the change without a hardcoded window suffix", () => {
    expect(formatPercentChange(12.34)).toBe("+12.3%");
    expect(formatPercentChange(-4)).toBe("-4.0%");
    expect(formatPercentChange(undefined)).toBe("--");
  });
});

describe("trendDirection / deltaTone", () => {
  it("classifies sign", () => {
    expect(trendDirection(5)).toBe("up");
    expect(trendDirection(-5)).toBe("down");
    expect(trendDirection(0)).toBe("flat");
    expect(trendDirection(undefined)).toBe("flat");
  });

  it("maps direction to a chart tone", () => {
    expect(deltaTone(5)).toBe("positive");
    expect(deltaTone(-5)).toBe("negative");
    expect(deltaTone(0)).toBe("flat");
  });
});
