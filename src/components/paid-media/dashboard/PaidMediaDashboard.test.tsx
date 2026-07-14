import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';

const loadCampaignPerformance = mock(async (..._args: unknown[]) => []);

mock.module('@/lib/paid-media/performance-store', () => ({
  usePaidMediaPerformanceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ loadCampaignPerformance }),
}));

mock.module('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useReducedMotion: () => true,
}));

mock.module('./CampaignAdSetWorkspace', () => ({
  CampaignAdSetWorkspace: ({ toolbarSlot }: { toolbarSlot?: React.ReactNode }) => (
    <div>{toolbarSlot}</div>
  ),
}));

for (const modulePath of [
  './AccountInsightsPanel',
  './CampaignInsightsPanel',
  './DCOActionAlertsBox',
  './LinkedInInsightsPanel',
  './whats-working/WhatsWorkingAdsCard',
]) {
  mock.module(modulePath, () => ({
    AccountInsightsPanel: () => null,
    CampaignInsightsPanel: () => null,
    DCOActionAlertsBox: () => null,
    LinkedInInsightsPanel: () => null,
    WhatsWorkingAdsCard: () => null,
  }));
}

mock.module('@/components/approvals/PendingActivityTabs', () => ({
  PendingActivityTabs: () => null,
}));

const { PaidMediaDashboard } = await import('./PaidMediaDashboard');

describe('PaidMediaDashboard campaign recovery', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    loadCampaignPerformance.mockReset();
    loadCampaignPerformance.mockRejectedValueOnce(
      new Error('Meta account lookup is temporarily unavailable.'),
    );
    loadCampaignPerformance.mockResolvedValue([]);
    console.error = mock(() => {});
  });

  afterEach(() => {
    cleanup();
    console.error = originalConsoleError;
  });

  it('shows the Edge error and retries with a forced fresh load', async () => {
    render(
      <PaidMediaDashboard
        brandId="brand-1"
        adAccountId="act_12345"
        platform="meta"
        onPlatformChange={() => {}}
      />,
    );

    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert.textContent).toContain('Meta account lookup is temporarily unavailable.');
    expect(errorAlert.getAttribute('aria-live')).toBe('assertive');
    expect(loadCampaignPerformance.mock.calls[0][1]).toEqual({ force: false });

    fireEvent.click(screen.getByRole('button', { name: 'Retry campaigns' }));

    await waitFor(() => expect(loadCampaignPerformance).toHaveBeenCalledTimes(2));
    expect(loadCampaignPerformance.mock.calls[1][1]).toEqual({ force: true });
  });
});
