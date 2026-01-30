
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignList } from "./CampaignList";
import { Theme } from "@radix-ui/themes";
import React from "react";

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

// Wrapper
const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
  <Theme>{children}</Theme>
);

describe("CampaignList", () => {
  const originalFetch = global.fetch;
  const mockSelect = mock();

  beforeEach(() => {
    mockSelect.mockClear();
    mockGetSession.mockClear();
    
    // Default success mock
    global.fetch = mock((url) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          campaigns: [
            { id: "cmp_1", name: "Summer Sale", status: "ACTIVE", spend: 1000, roas: 3.5 },
            { id: "cmp_2", name: "Winter Promo", status: "PAUSED", spend: 500, roas: 2.0 }
          ]
        })
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading state when adAccountId is present", async () => {
    // Delay resolution
    global.fetch = mock(() => new Promise(() => {})); 
    
    render(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_123" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );
    
    expect(screen.getByText("Loading campaigns...")).toBeTruthy();
  });

  it("renders empty state when no campaigns found", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ campaigns: [] })
    } as Response));

    render(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_123" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("No campaigns found")).toBeTruthy();
    });
  });

  it("renders campaigns table", async () => {
    render(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_123" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Summer Sale")).toBeTruthy();
      expect(screen.getByText("Winter Promo")).toBeTruthy();
      expect(screen.getByText("3.50")).toBeTruthy(); // ROAS
    });
  });

  it("calls onSelectCampaign when row is clicked", async () => {
    render(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_123" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Summer Sale")).toBeTruthy();
    });

    const row = screen.getByText("Summer Sale");
    fireEvent.click(row);

    expect(mockSelect).toHaveBeenCalledWith("cmp_1");
  });

  it("fetches new campaigns when adAccountId changes", async () => {
    const { rerender } = render(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_123" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Change prop
    rerender(
      <ThemeWrapper>
        <CampaignList 
          brandId="brand_123" 
          adAccountId="act_456" 
          onSelectCampaign={mockSelect} 
        />
      </ThemeWrapper>
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
