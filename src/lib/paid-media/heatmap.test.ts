import { describe, expect, it } from "bun:test";

import {
  MATRIX_METRICS,
  deltaTone,
  formatDeltaPct,
  formatMetric,
  getMetric,
  heatmapPaint,
  percentile,
} from "./heatmap";

describe("percentile", () => {
  it("returns 0.5 for empty or single-element sets", () => {
    expect(percentile([], 5)).toBe(0.5);
    expect(percentile([10], 10)).toBe(0.5);
  });

  it("ranks values monotonically across a known set", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 10)).toBe(0);
    expect(percentile(values, 30)).toBeCloseTo(0.5, 5);
    expect(percentile(values, 50)).toBe(1);
  });

  it("clamps out-of-range values", () => {
    const values = [10, 20, 30];
    expect(percentile(values, -5)).toBe(0);
    expect(percentile(values, 999)).toBe(1);
  });
});

describe("heatmapPaint direction inversion", () => {
  const roas = getMetric("roas");
  const cpc = getMetric("cpc");
  const spend = getMetric("spend");

  it("higher-is-better metrics color the top percentile green", () => {
    const paint = heatmapPaint(roas, 0.9);
    expect(paint.light).toContain("154");
    expect(paint.dark).toContain("154");
  });

  it("higher-is-better metrics color the bottom percentile red", () => {
    const paint = heatmapPaint(roas, 0.05);
    expect(paint.light).toContain("28");
    expect(paint.dark).toContain("28");
  });

  it("lower-is-better metrics invert: top percentile colors red", () => {
    const paint = heatmapPaint(cpc, 0.9);
    expect(paint.light).toContain("28");
    expect(paint.dark).toContain("28");
  });

  it("lower-is-better metrics invert: bottom percentile colors green", () => {
    const paint = heatmapPaint(cpc, 0.05);
    expect(paint.light).toContain("154");
    expect(paint.dark).toContain("154");
  });

  it("neutral metrics use lightness ramp, no green/red hue", () => {
    const paint = heatmapPaint(spend, 0.9);
    expect(paint.light).toContain("250");
    expect(paint.light).not.toContain("154");
    expect(paint.light).not.toContain("28");
  });
});

describe("deltaTone", () => {
  const roas = getMetric("roas");
  const cpc = getMetric("cpc");
  const spend = getMetric("spend");

  it("returns flat for tiny or undefined deltas", () => {
    expect(deltaTone(roas, undefined)).toBe("flat");
    expect(deltaTone(roas, 0.2)).toBe("flat");
  });

  it("returns positive when higher-is-better metric goes up", () => {
    expect(deltaTone(roas, 5)).toBe("positive");
  });

  it("returns negative when higher-is-better metric goes down", () => {
    expect(deltaTone(roas, -5)).toBe("negative");
  });

  it("inverts for lower-is-better metrics", () => {
    expect(deltaTone(cpc, 5)).toBe("negative");
    expect(deltaTone(cpc, -5)).toBe("positive");
  });

  it("treats neutral metric movement as raw direction", () => {
    expect(deltaTone(spend, 5)).toBe("positive");
    expect(deltaTone(spend, -5)).toBe("negative");
  });
});

describe("formatters", () => {
  it("formats currency metrics with dollar sign", () => {
    expect(formatMetric("spend", 1500)).toContain("$");
    expect(formatMetric("cpc", 2.5)).toBe("$2.50");
  });

  it("formats roas to two decimals", () => {
    expect(formatMetric("roas", 3.14159)).toBe("3.14");
  });

  it("formats ctr as percent with two decimals", () => {
    expect(formatMetric("ctr", 4.2)).toBe("4.20%");
  });

  it("compacts large impression counts", () => {
    expect(formatMetric("impressions", 1_500_000)).toContain("M");
  });

  it("renders em dash for undefined / NaN", () => {
    expect(formatMetric("roas", undefined)).toBe("—");
    expect(formatMetric("roas", Number.NaN)).toBe("—");
  });

  it("formats delta percentage with sign and dash for missing", () => {
    expect(formatDeltaPct(undefined)).toBe("—");
    expect(formatDeltaPct(12.5)).toBe("+13%");
    expect(formatDeltaPct(-3.7)).toBe("-3.7%");
  });
});

describe("MATRIX_METRICS catalog", () => {
  it("contains the seven canonical metrics in expected order", () => {
    expect(MATRIX_METRICS.map((metric) => metric.key)).toEqual([
      "spend",
      "roas",
      "ctr",
      "cpc",
      "cpa",
      "impressions",
      "clicks",
    ]);
  });

  it("tags cost metrics as lower-is-better", () => {
    expect(getMetric("cpc").direction).toBe("lower");
    expect(getMetric("cpa").direction).toBe("lower");
  });

  it("tags efficiency metrics as higher-is-better", () => {
    expect(getMetric("roas").direction).toBe("higher");
    expect(getMetric("ctr").direction).toBe("higher");
  });
});
