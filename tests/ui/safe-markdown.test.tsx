import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SafeMarkdown } from "@/components/ui/SafeMarkdown";

test("SafeMarkdown renders markdown and hardens links", () => {
  const html = renderToStaticMarkup(
    <SafeMarkdown
      content={"Hello **world**\n\n[ok](https://example.com)\n\n[bad](javascript:alert(1))"}
      mode="static"
    />
  );

  expect(html).toContain("Hello");
  expect(html).toContain("data-streamdown=\"strong\"");
  expect(html).toContain("world");
  expect(html).toContain("href=\"https://example.com/\"");
  expect(html).not.toContain("href=\"javascript");
});
