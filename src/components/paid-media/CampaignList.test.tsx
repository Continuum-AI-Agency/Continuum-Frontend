import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CampaignList } from './CampaignList';

// Mock Supabase client
const mockGetSession = mock(() =>
  Promise.resolve({
    data: { session: { access_token: 'fake-token' } },
  }),
);

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

describe('CampaignList', () => {
  const originalFetch = global.fetch;
  const mockSelect = mock();

  beforeEach(() => {
    mockSelect.mockClear();
    mockGetSession.mockClear();

    // Default success mock
    global.fetch = mock((url) => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            campaigns: [
              { id: 'cmp_1', name: 'Summer Sale', status: 'ACTIVE', spend: 1000, roas: 3.5 },
              { id: 'cmp_2', name: 'Winter Promo', status: 'PAUSED', spend: 500, roas: 2.0 },
            ],
          }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('renders loading state when adAccountId is present', async () => {
    // Delay resolution
    global.fetch = mock(() => new Promise(() => {}));

    render(
      <CampaignList brandId="brand_123" adAccountId="act_123" onSelectCampaign={mockSelect} />,
    );

    expect(screen.getByText('Loading campaigns...')).toBeTruthy();
  });

  it('renders empty state when no campaigns found', async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ campaigns: [] }),
      } as Response),
    );

    render(
      <CampaignList brandId="brand_123" adAccountId="act_123" onSelectCampaign={mockSelect} />,
    );

    await waitFor(() => {
      expect(screen.getByText('No campaigns found')).toBeTruthy();
    });
  });

  it('renders campaigns table', async () => {
    render(
      <CampaignList brandId="brand_123" adAccountId="act_123" onSelectCampaign={mockSelect} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Summer Sale')).toBeTruthy();
      expect(screen.getByText('Winter Promo')).toBeTruthy();
      expect(screen.getByText('3.50')).toBeTruthy(); // ROAS
    });
  });

  it('calls onSelectCampaign when row is clicked', async () => {
    render(
      <CampaignList brandId="brand_123" adAccountId="act_123" onSelectCampaign={mockSelect} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Summer Sale')).toBeTruthy();
    });

    const row = screen.getByText('Summer Sale');
    fireEvent.click(row);

    expect(mockSelect).toHaveBeenCalledWith('cmp_1');
  });

  it('fetches new campaigns when adAccountId changes', async () => {
    const { rerender } = render(
      <CampaignList brandId="brand_123" adAccountId="act_123" onSelectCampaign={mockSelect} />,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Change prop
    rerender(
      <CampaignList brandId="brand_123" adAccountId="act_456" onSelectCampaign={mockSelect} />,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
