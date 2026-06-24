import { describe, expect, it } from "bun:test"

import { parseOrganicStreamEvent } from "./streamEventParser"

// ui.post_card and ui.trend_chart payloads are now typed in @continuum/contracts;
// the parser consumes those schemas instead of hand-normalizing. These lock the
// real Backend emit shapes (cards/postCard.ts, cards/trendChart.ts) through the parser.

describe("parseOrganicStreamEvent — typed ui.post_card", () => {
  it("parses a full PostCardData into a postCard", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.post_card",
      data: {
        draftId: "d1",
        jobId: "j1",
        brandId: "b1",
        platform: "instagram",
        scheduledAt: "2026-06-20T12:00:00Z",
        caption: "hi",
        hashtags: ["#a"],
        imageUrl: null,
        format: "post",
        topic: "launch",
        quality: { score: 91, passed: true },
        trendId: null,
      },
    })
    expect(parsed.kind).toBe("postCard")
    if (parsed.kind === "postCard") {
      expect(parsed.card.draftId).toBe("d1")
      expect(parsed.card.quality?.score).toBe(91)
      expect(parsed.card.hashtags).toEqual(["#a"])
    }
  })

  it("drops a post_card missing required ids", () => {
    const parsed = parseOrganicStreamEvent({ type: "ui.post_card", data: { platform: "instagram" } })
    expect(parsed.kind).toBe("invalid")
  })
})

describe("parseOrganicStreamEvent — typed ui.trend_chart", () => {
  it("parses TrendChartData into a trend_chart uiCard", () => {
    const parsed = parseOrganicStreamEvent({
      type: "ui.trend_chart",
      data: {
        chartType: "bar",
        title: "Brand Trend Signals",
        windows: [7, 30],
        series: [{ label: "Trends", data: [{ window: 7, value: 4 }] }],
        topSignals: [
          { id: "t1", title: "AI", type: "trend", confidence: 0.8, platform: null, windowDays: 7 },
        ],
      },
    })
    expect(parsed.kind).toBe("uiCard")
    if (parsed.kind === "uiCard" && parsed.card.type === "trend_chart") {
      expect(parsed.card.data.title).toBe("Brand Trend Signals")
      expect(parsed.card.data.series[0]!.label).toBe("Trends")
      expect(parsed.card.data.topSignals[0]!.id).toBe("t1")
    }
  })
})
