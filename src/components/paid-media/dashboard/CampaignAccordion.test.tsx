import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CampaignAccordion } from "./CampaignAccordion";

const mockInvoke = mock((endpoint: string) => {
  if (endpoint.includes("fetch-meta-adsets")) {
    return Promise.resolve({ data: { adsets: [] }, error: null });
  }

  if (endpoint.includes("fetch-meta-ads")) {
    return Promise.resolve({ data: { ads: [] }, error: null });
  }

  return Promise.resolve({ data: {}, error: null });
});

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: mockInvoke,
    },
  }),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
global.getComputedStyle = global.getComputedStyle || (() => ({}) as CSSStyleDeclaration);
global.requestAnimationFrame = global.requestAnimationFrame || ((cb: FrameRequestCallback) => setTimeout(cb, 0));
global.cancelAnimationFrame = global.cancelAnimationFrame || ((id: number) => clearTimeout(id));

describe("CampaignAccordion", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockInvoke.mockClear();
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ metrics: { spend: 0, roas: 0, ctr: 0, cpc: 0, cpa: 0, impressions: 0, clicks: 0 } }),
      } as Response)
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("keeps only one campaign expanded at a time", async () => {
    render(
      <CampaignAccordion
        campaigns={[
          { id: "campaign-1", name: "Campaign One", status: "ACTIVE" },
          { id: "campaign-2", name: "Campaign Two", status: "ACTIVE" },
        ]}
        brandId="brand-1"
        accountId="act_1"
        timeRange={{ preset: "last_7d" }}
        resolution="daily"
      />
    );

    const firstTrigger = screen.getByRole("button", { name: /Campaign One/i });
    const secondTrigger = screen.getByRole("button", { name: /Campaign Two/i });

    await waitFor(() => {
      expect(firstTrigger.getAttribute("data-state")).toBe("open");
      expect(secondTrigger.getAttribute("data-state")).toBe("closed");
    });

    fireEvent.click(secondTrigger);

    await waitFor(() => {
      expect(firstTrigger.getAttribute("data-state")).toBe("closed");
      expect(secondTrigger.getAttribute("data-state")).toBe("open");
    });
  });
});
