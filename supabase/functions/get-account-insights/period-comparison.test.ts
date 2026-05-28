import { describe, expect, it } from "bun:test";

import {
  computePeriodComparison,
  hasSanePeriodComparison,
} from "./period-comparison";

describe("computePeriodComparison", () => {
  it("calculates spend_delta_pct as percent change instead of absolute dollar delta", () => {
    const comparison = computePeriodComparison(
      {
        placements: [
          {
            spend: 975425.52,
            impressions: 100000,
            clicks: 2000,
            conversions: 100,
            conversion_value: 1950851.04,
          },
        ],
      },
      {
        placements: [
          {
            spend: 1020244.9,
            impressions: 100000,
            clicks: 2000,
            conversions: 100,
            conversion_value: 2040489.8,
          },
        ],
      }
    );

    expect(comparison.spend_delta_pct).toBe(-4.39);
    expect(comparison.spend_delta_pct).not.toBe(44819.38);
  });
});

describe("hasSanePeriodComparison", () => {
  it("rejects cached payloads that carry absolute deltas in *_delta_pct fields", () => {
    expect(
      hasSanePeriodComparison({
        period_comparison: {
          spend_delta_pct: 44819.38,
          roas_delta_pct: 1.2,
          ctr_delta_pct: -3.4,
          conversions_delta_pct: 0,
        },
      })
    ).toBe(false);
  });

  it("accepts large but plausible percentage deltas", () => {
    expect(
      hasSanePeriodComparison({
        period_comparison: {
          spend_delta_pct: 128,
          roas_delta_pct: 1900.5,
          ctr_delta_pct: 8.2,
          conversions_delta_pct: 15.1,
        },
      })
    ).toBe(true);
  });
});
