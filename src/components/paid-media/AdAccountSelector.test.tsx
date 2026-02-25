import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, waitFor, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";

import { AdAccountSelector } from "./AdAccountSelector";

const mockUseBrandIntegrations = mock(() => ({
  integrations: {
    facebook: {
      accounts: [
        {
          integrationAccountId: "integration-1",
          externalAccountId: "act_9530520017061961",
          name: "Parsed Inc",
        },
      ],
    },
  },
  isLoading: false,
  isError: false,
}));

mock.module("@/hooks/useBrandIntegrations", () => ({
  useBrandIntegrations: (...args: unknown[]) => mockUseBrandIntegrations(...args),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const ThemeWrapper = ({ children }: { children: React.ReactNode }) => <Theme>{children}</Theme>;

describe("AdAccountSelector", () => {
  const originalFetch = global.fetch;
  const mockSelect = mock(() => {});

  beforeEach(() => {
    mockSelect.mockClear();
    mockUseBrandIntegrations.mockClear();

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            accounts: [
              { id: "act_1034406624919675", name: "SMB_PRACTIHOGAR_ARS" },
              { id: "act_9530520017061961", name: "Parsed Inc" },
            ],
          }),
      } as Response)
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("fetches timeline accounts and auto-selects first merged account", async () => {
    render(
      <ThemeWrapper>
        <AdAccountSelector brandId="brand_123" selectedAccountId={null} onSelect={mockSelect} />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/paid-media/timeline/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: "brand_123" }),
        cache: "no-store",
      });
    });

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith("act_1034406624919675");
    });
  });

  it("falls back to integration accounts when timeline accounts fetch fails", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "failed" }),
      } as Response)
    );

    render(
      <ThemeWrapper>
        <AdAccountSelector brandId="brand_123" selectedAccountId={null} onSelect={mockSelect} />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith("act_9530520017061961");
    });
  });
});
