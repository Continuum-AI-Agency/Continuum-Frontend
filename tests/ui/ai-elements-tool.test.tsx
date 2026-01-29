import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

test("Tool renders header, input, and output sections", () => {
  const html = renderToStaticMarkup(
    <Tool type="tool-get_campaigns" state="output-available" defaultOpen>
      <ToolHeader />
      <ToolContent>
        <ToolInput value={{ force_refresh: false }} />
        <ToolOutput value={{ campaigns: [] }} />
      </ToolContent>
    </Tool>
  );

  expect(html).toContain("get campaigns");
  expect(html).toContain("Input");
  expect(html).toContain("Output");
});
