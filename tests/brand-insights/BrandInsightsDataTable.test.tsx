import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandInsightsDataTable } from "@/components/brand-insights/BrandInsightsDataTable";

test("BrandInsightsDataTable renders semantic table structure", () => {
  const html = renderToStaticMarkup(
    <BrandInsightsDataTable
      rows={[
        {
          id: "row-1",
          title: "Signal spike",
          subtitle: "Detail summary",
          secondaryValue: "Feb 23, 2026",
          platforms: ["instagram"],
        },
      ]}
      emptyTitle="Empty"
      emptyDescription="No rows"
      countLabel="rows"
      searchPlaceholder="Search rows"
      secondaryHeaderLabel="Date"
    />
  );

  expect(html).toContain("<table");
  expect(html).toContain("<thead");
  expect(html).toContain("<tbody");
  expect(html).toContain("Content");
  expect(html).toContain("Date");
});

test("BrandInsightsDataTable renders fixed platform colors", () => {
  const html = renderToStaticMarkup(
    <BrandInsightsDataTable
      rows={[
        {
          id: "row-1",
          title: "Signal spike",
          secondaryValue: "Feb 23, 2026",
          platforms: ["instagram", "x"],
        },
      ]}
      emptyTitle="Empty"
      emptyDescription="No rows"
      countLabel="rows"
      searchPlaceholder="Search rows"
      secondaryHeaderLabel="Date"
    />
  );

  expect(html).toContain("Instagram");
  expect(html).toContain("X");
  expect(html).toContain("bg-pink-500/10");
  expect(html).toContain("bg-zinc-500/10");
});
