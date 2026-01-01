import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TrendSelector } from "@/components/organic/TrendSelector";
import { DEFAULT_TRENDS } from "@/lib/organic/trends";

test("TrendSelector renders trend titles", () => {
  const html = renderToStaticMarkup(
    <TrendSelector
      trends={DEFAULT_TRENDS.slice(0, 3)}
      selectedTrendIds={[]}
      onToggleTrend={() => undefined}
      activePlatforms={[]}
      maxSelections={3}
    />
  );

  expect(html).toContain("Trends");
  expect(html).toContain(DEFAULT_TRENDS[0].title);
});
