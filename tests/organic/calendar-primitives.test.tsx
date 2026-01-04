import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OrganicCalendarWorkspaceClient } from "@/components/organic/primitives/OrganicCalendarWorkspaceClient";
import {
  organicCalendarDays,
  organicCreationSteps,
  organicEditorSlides,
  organicTrendTypes,
} from "@/components/organic/primitives/mock-data";

test("OrganicCalendarWorkspace renders week canvas and workflow", () => {
  const html = renderToStaticMarkup(
    <OrganicCalendarWorkspaceClient
      days={organicCalendarDays}
      steps={organicCreationSteps}
      editorSlides={organicEditorSlides}
      trendTypes={organicTrendTypes}
      initialSelectedDraftId={null}
    />
  );

  expect(html).toContain("Calendar-first creation");
  expect(html).toContain("Calendar view");
  expect(html).toContain("January 2026");
});
