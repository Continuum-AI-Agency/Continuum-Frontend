import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, waitFor, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";

import { AdAccountSelector } from "./AdAccountSelector";

mock.module("@/hooks/useBrandIntegrations", () => ({
  useBrandIntegrations: () => ({
    integrations: {
      googleAds: {
        accounts: [
          {
            integrationAccountId: "ia-1",
            externalAccountId: "123-456-7890",
            name: "Brand Google Ads",
          },
        ],
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const ThemeWrapper = ({ children }: { children: React.ReactNode }) => <Theme>{children}</Theme>;

describe("AdAccountSelector (google-ads)", () => {
  const originalFetch = global.fetch;
  const mockSelect = mock(() => {});

  beforeEach(() => {
    mockSelect.mockClear();
    global.fetch = mock(async () =>
      ({ ok: true, json: async () => ({ accounts: [] }) }) as Response
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("surfaces Google Ads accounts and skips the Meta timeline fetch", async () => {
    render(
      <ThemeWrapper>
        <AdAccountSelector
          brandId="brand_123"
          platform="google-ads"
          selectedAccountId={null}
          onSelect={mockSelect}
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith("123-456-7890");
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
