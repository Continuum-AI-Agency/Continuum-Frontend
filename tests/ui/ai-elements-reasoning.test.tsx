import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";

test("Reasoning renders trigger and content", () => {
  const html = renderToStaticMarkup(
    <Reasoning defaultOpen>
      <ReasoningTrigger>Thoughts</ReasoningTrigger>
      <ReasoningContent>Progress updates</ReasoningContent>
    </Reasoning>
  );

  expect(html).toContain("Thoughts");
  expect(html).toContain("Progress updates");
});
