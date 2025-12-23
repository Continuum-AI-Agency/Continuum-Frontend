import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Tabs } from "@/components/ui/StableTabs";

test("StableTabs only renders the active tab content", () => {
  const html = renderToStaticMarkup(
    <Tabs.Root value="step-1">
      <Tabs.List>
        <Tabs.Trigger value="step-0">Step 0</Tabs.Trigger>
        <Tabs.Trigger value="step-1">Step 1</Tabs.Trigger>
        <Tabs.Trigger value="step-2">Step 2</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="step-0">Content 0</Tabs.Content>
      <Tabs.Content value="step-1">Content 1</Tabs.Content>
      <Tabs.Content value="step-2">Content 2</Tabs.Content>
    </Tabs.Root>
  );

  expect(html).toContain("Content 1");
  expect(html).not.toContain("Content 0");
  expect(html).not.toContain("Content 2");
});
