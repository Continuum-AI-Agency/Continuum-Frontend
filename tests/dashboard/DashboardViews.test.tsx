import { describe, expect, test, mock, beforeEach } from "bun:test";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { PaidDashboardView } from "@/components/dashboard/views/PaidDashboardView";
import { OrganicDashboardView } from "@/components/dashboard/views/OrganicDashboardView";

// Mock child widgets to avoid deep rendering and network calls
mock.module("@/components/paid-media/PaidMediaReportingWidget", () => ({
  PaidMediaReportingWidget: () => <div data-testid="paid-media-widget">Paid Media Widget</div>,
}));

mock.module("@/components/dashboard/DCOActionsWidget", () => ({
  DCOActionsWidget: () => <div data-testid="dco-actions-widget">DCO Actions Widget</div>,
}));

mock.module("@/components/dashboard/InstagramOrganicReportingWidget", () => ({
  InstagramOrganicReportingWidget: () => <div data-testid="organic-widget">Organic Widget</div>,
}));

mock.module("@/components/brand-insights/BrandTrendsPanel", () => ({
  BrandTrendsPanel: () => <div data-testid="trends-panel">Trends Panel</div>,
}));

mock.module("@/components/brand-insights/BrandInsightsGenerateButton", () => ({
  BrandInsightsGenerateButton: () => <button data-testid="generate-btn">Generate</button>,
}));

describe("DashboardViews", () => {
  beforeEach(() => {
    cleanup();
  });

  describe("PaidDashboardView", () => {
    test("renders PaidMediaReportingWidget and DCOActionsWidget", () => {
      render(<PaidDashboardView brandId="test-brand-id" />);

      expect(screen.getByTestId("paid-media-widget")).toBeTruthy();
      expect(screen.getByTestId("dco-actions-widget")).toBeTruthy();
    });
  });

  describe("OrganicDashboardView", () => {
    test("renders Organic Widget and Trends Panel", () => {
      const mockTrendsData = {
        trends: [],
        events: [],
        country: "US",
        status: "completed",
        generatedAt: new Date().toISOString(),
        weekAnalyzed: "2023-01-01",
      };

      const mockAccounts = [
        {
          integrationAccountId: "1",
          name: "Test Account",
          externalAccountId: "123",
        },
      ];

      render(
        <OrganicDashboardView
          brandId="test-brand-id"
          instagramAccounts={mockAccounts}
          trendsAndEvents={mockTrendsData}
          questionsByNiche={{ questionsByNiche: {} }}
        />
      );

      expect(screen.getByTestId("organic-widget")).toBeTruthy();
      expect(screen.getByTestId("trends-panel")).toBeTruthy();
    });
  });
});
