import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { InsightLeaderboard, type LeaderboardRow } from "./InsightLeaderboard";

describe("InsightLeaderboard", () => {
  it("renders rank, name, and metric for a minimal row (back-compat)", () => {
    const rows: LeaderboardRow[] = [{ id: "a", name: "Matcha trend", metricValue: "92%" }];

    const { container } = render(<InsightLeaderboard title="Top trend signals" rows={rows} />);

    expect(container.textContent).toContain("Matcha trend");
    expect(container.textContent).toContain("92%");
    expect(container.textContent).toContain("1");
    expect(container.getElementsByTagName("img").length).toBe(0);
    expect(container.getElementsByTagName("button").length).toBe(0);
  });

  it("renders thumbnail, example insight line, and actions when provided", () => {
    const rows: LeaderboardRow[] = [
      {
        id: "b",
        name: "Founder POV reel",
        subLabel: "Reel · Jun 12",
        insightLine: "32% hook rate · 2.1× your average",
        metricValue: "48.0K",
        thumbnailUrl: "https://cdn.example.com/x.jpg",
        actions: <button type="button">Inspire</button>,
      },
    ];

    const { container } = render(
      <InsightLeaderboard title="Top creatives" metricLabel="Reach" rows={rows} />,
    );

    expect(container.textContent).toContain("32% hook rate · 2.1× your average");
    expect(container.getElementsByTagName("img").length).toBe(1);
    const buttons = container.getElementsByTagName("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0]?.textContent).toBe("Inspire");
  });
});
