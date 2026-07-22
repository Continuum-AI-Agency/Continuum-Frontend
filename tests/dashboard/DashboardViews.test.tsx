import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type React from 'react';
import { OrganicDashboardView } from '@/components/dashboard/views/OrganicDashboardView';
import { PaidDashboardView } from '@/components/dashboard/views/PaidDashboardView';

// Mock child widgets to avoid deep rendering and network calls
mock.module('@/components/paid-media/PaidMediaReportingWidget', () => ({
  PaidMediaReportingWidget: () => <div data-testid="paid-media-widget">Paid Media Widget</div>,
}));

mock.module('@/components/dashboard/DCOActionsWidget', () => ({
  DCOActionsWidget: () => <div data-testid="dco-actions-widget">DCO Actions Widget</div>,
}));

mock.module('@/components/dashboard/InstagramOrganicReportingWidget', () => ({
  InstagramOrganicReportingWidget: () => <div data-testid="organic-widget">Organic Widget</div>,
}));

mock.module('@/components/dashboard/DashboardWarmOnMount', () => ({
  DashboardWarmOnMount: () => null,
}));

mock.module('@/components/dashboard/SendPulseButton', () => ({
  SendPulseButton: () => null,
}));

mock.module('@/components/dashboard/competitor/CompetitorOrganicTable', () => ({
  CompetitorOrganicTable: () => <div data-testid="competitor-organic">Competitor Organic</div>,
}));

mock.module('@/components/dashboard/competitor/CompetitorAdsTable', () => ({
  CompetitorAdsTable: () => <div data-testid="competitor-ads">Competitor Ads</div>,
}));

mock.module('@/components/dashboard/briefing/PaidMetricStrip', () => ({
  PaidMetricStrip: () => <div data-testid="paid-metric-strip">Paid Metrics</div>,
}));

mock.module('@/components/dashboard/briefing/PaidInsightsList', () => ({
  PaidInsightsList: () => <div data-testid="paid-insights">Paid Insights</div>,
}));

mock.module('@/components/dashboard/briefing/PaidEntityTable', () => ({
  PaidEntityTable: () => <div data-testid="paid-entities">Paid Entities</div>,
}));

mock.module('@/components/approvals/PendingActivityTabs', () => ({
  PendingActivityTabs: () => null,
}));

mock.module('@/components/dashboard/briefing/OrganicMetricStrip', () => ({
  OrganicMetricStrip: () => <div data-testid="organic-metric-strip">Metric Strip</div>,
}));

mock.module('@/components/dashboard/briefing/OrganicInsightsList', () => ({
  OrganicInsightsList: () => <div data-testid="organic-insights">Insights</div>,
}));

mock.module('@/components/dashboard/briefing/OrganicCreativesTable', () => ({
  OrganicCreativesTable: () => <div data-testid="organic-creatives">Creatives</div>,
}));

mock.module('@/components/brand-insights/BrandTrendsPanel', () => ({
  BrandTrendsPanel: ({ statusSlot }: { statusSlot?: React.ReactNode }) => (
    <div data-testid="trends-panel">
      Trends Panel
      {statusSlot}
    </div>
  ),
}));

mock.module('@/components/brand-insights/BrandInsightsGenerateButton', () => ({
  BrandInsightsGenerateButton: () => (
    <button type="button" data-testid="generate-btn">
      Refresh Trends
    </button>
  ),
}));

describe('DashboardViews', () => {
  beforeEach(() => {
    cleanup();
  });

  describe('PaidDashboardView', () => {
    test('renders paid overview and DCO actions rail', () => {
      render(<PaidDashboardView brandId="test-brand-id" />);

      expect(screen.getByText('Overview')).toBeTruthy();
      expect(screen.getByLabelText('Hide DCO actions')).toBeTruthy();
    });
  });

  describe('OrganicDashboardView', () => {
    test('renders Trends Panel with Refresh Trends control', () => {
      const mockTrendsData = {
        trends: [],
        events: [],
        country: 'US',
        status: 'completed',
        generatedAt: new Date().toISOString(),
        weekAnalyzed: '2023-01-01',
      };

      const mockAccounts = [
        {
          integrationAccountId: '1',
          name: 'Test Account',
          externalAccountId: '123',
        },
      ];

      render(
        <OrganicDashboardView
          brandId="test-brand-id"
          instagramAccounts={mockAccounts}
          trendsAndEvents={mockTrendsData}
          questionsByNiche={{ questionsByNiche: {} }}
        />,
      );

      expect(screen.getByTestId('trends-panel')).toBeTruthy();
      // Overview header + BrandTrendsPanel statusSlot both mount the control.
      expect(screen.getAllByTestId('generate-btn').length).toBeGreaterThanOrEqual(2);
    });
  });
});
