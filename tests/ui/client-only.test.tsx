import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientOnly } from "@/components/ui/ClientOnly";

test("ClientOnly renders fallback during SSR", () => {
  const html = renderToStaticMarkup(
    <ClientOnly fallback={<div>fallback</div>}>
      <div>client</div>
    </ClientOnly>
  );

  expect(html).toContain("fallback");
  expect(html).not.toContain("client");
});

