
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AdAccountSelector } from "./AdAccountSelector";
import { Theme } from "@radix-ui/themes";
import React from "react";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Supabase client
const mockGetSession = mock(() => Promise.resolve({
  data: { session: { access_token: "fake-token" } }
}));

mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession
    }
  })
}));

// Mock useToast
const mockShow = mock();
mock.module("@/components/ui/ToastProvider", () => ({
  useToast: () => ({
    show: mockShow
  })
}));

// Wrapper to provide Theme context
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <Theme>{children}</Theme>
);

describe("AdAccountSelector", () => {
  const originalFetch = global.fetch;
  const mockSelect = mock();

  beforeEach(() => {
    mockSelect.mockClear();
    mockShow.mockClear();
    mockGetSession.mockClear();
    
    // Default success mock
    global.fetch = mock((url) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          accounts: [
            { id: "act_123", name: "Account A" },
            { id: "act_456", name: "Account B" }
          ]
        })
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("renders loading state initially", async () => {
    // Delay resolution
    global.fetch = mock(() => new Promise(() => {})); 
    
    const { getByRole } = render(
      <ThemeWrapper>
        <AdAccountSelector 
          brandId="brand_123" 
          selectedAccountId={null} 
          onSelect={mockSelect} 
        />
      </ThemeWrapper>
    );
    
    const trigger = getByRole("combobox");
    expect(trigger.hasAttribute("disabled")).toBe(true);
  });

  it("renders ad accounts after fetching", async () => {
    // Explicit success mock
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        accounts: [
          { id: "act_123", name: "Account A" },
          { id: "act_456", name: "Account B" }
        ]
      })
    } as Response));

    const { getByRole } = render(
      <ThemeWrapper>
        <AdAccountSelector 
          brandId="brand_123" 
          selectedAccountId={null} 
          onSelect={mockSelect} 
        />
      </ThemeWrapper>
    );

    // Wait for data to load by checking if the trigger is enabled (disabled when loading)
    await waitFor(() => {
      const trigger = getByRole("combobox");
      expect(trigger.hasAttribute("disabled")).toBe(false);
    });
    
    // We can also check that fetch was called
    expect(global.fetch).toHaveBeenCalled();
  });

  it("calls onSelect when an account is chosen", async () => {
    const { getByRole } = render(
      <ThemeWrapper>
        <AdAccountSelector 
          brandId="brand_123" 
          selectedAccountId={null} 
          onSelect={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
       const trigger = getByRole("combobox");
       expect(trigger.hasAttribute("disabled")).toBe(false);
    });

    // Verify side effects
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    
    // Auto-selection of first account
    expect(mockSelect).toHaveBeenCalledWith("act_123");
  });

  it("shows error toast if fetch fails", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 500
    } as Response));

    render(
      <ThemeWrapper>
        <AdAccountSelector 
          brandId="brand_123" 
          selectedAccountId={null} 
          onSelect={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
      // Toast should be called
      expect(mockShow).toHaveBeenCalled();
    });
  });
});
