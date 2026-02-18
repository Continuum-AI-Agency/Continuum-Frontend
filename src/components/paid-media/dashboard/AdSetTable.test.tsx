import * as React from "react";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AdSetTable, type AdSet, type MetaAd } from "./AdSetTable";

describe("AdSetTable", () => {
  afterEach(() => {
    cleanup();
  });

  const adSets: AdSet[] = [
    {
      id: "adset_1",
      name: "Top Funnel Prospecting",
      status: "ACTIVE",
      metrics: {
        spend: 1250,
        roas: 2.4,
        ctr: 1.2,
        cpc: 2.1,
        impressions: 10000,
        clicks: 120,
      },
    },
  ];

  const ads: MetaAd[] = [
    {
      id: "ad_1",
      name: "Ad One",
      status: "ACTIVE",
      effectiveStatus: "ACTIVE",
      creative: {
        id: "creative_1",
        title: "Creative One",
        body: "Primary text from post copy",
        thumbnailUrl: "https://example.com/creative-1.png",
      },
    },
  ];

  it("expands ad set row and renders creative cards", () => {
    const onAdSetToggle = mock();

    render(
      <AdSetTable
        adSets={adSets}
        adsByAdSet={{
          adset_1: {
            status: "success",
            ads,
          },
        }}
        onAdSetToggle={onAdSetToggle}
      />
    );

    fireEvent.click(screen.getByText("Top Funnel Prospecting"));

    expect(onAdSetToggle).toHaveBeenCalledWith("adset_1", true);
    expect(screen.getByText("Primary text from post copy")).toBeTruthy();
    expect(screen.getByText("Ad ID: ad_1")).toBeTruthy();
  });

  it("shows loading state when ads are being fetched", () => {
    render(
      <AdSetTable
        adSets={adSets}
        adsByAdSet={{
          adset_1: {
            status: "loading",
            ads: [],
          },
        }}
      />
    );

    fireEvent.click(screen.getAllByText("Top Funnel Prospecting")[0]);

    expect(screen.getByText("Loading ads and creatives...")).toBeTruthy();
  });
});
