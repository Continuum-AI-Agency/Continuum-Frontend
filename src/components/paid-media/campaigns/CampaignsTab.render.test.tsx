import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { type ScaleEntityPage, scaleEntitiesKey } from './campaignsClient';

// Spread the real modules: `mock.module` replaces them for the whole PROCESS.
const realOptimizerData = await import('../optimizer/useOptimizerData');
mock.module('../optimizer/useOptimizerData', () => ({
  ...realOptimizerData,
  useAdAccountCurrency: () => 'USD',
}));
const realSheet = await import('./EntityStatusSheet');
mock.module('./EntityStatusSheet', () => ({ ...realSheet, EntityStatusSheet: () => null }));

const { CampaignsTab } = await import('./CampaignsTab');

const scope = { brandId: 'brand-1', adAccountId: 'act_1' };
let queryClient = new QueryClient();

function renderWith(page: ScaleEntityPage) {
  queryClient.setQueryData(scaleEntitiesKey('campaign', scope, null), page);
  return render(
    <QueryClientProvider client={queryClient}>
      <CampaignsTab brandId={scope.brandId} adAccountId={scope.adAccountId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(cleanup);

describe('CampaignsTab', () => {
  it('heads the table with the count, the paused count and a quiet Refresh, unframed', () => {
    renderWith({
      fetchedAt: new Date().toISOString(),
      rows: [
        {
          id: 'c1',
          name: 'Leads',
          status: 'ACTIVE',
          effectiveStatus: 'ACTIVE',
          dailyBudget: '180000',
          lifetimeBudget: null,
        },
        {
          id: 'c2',
          name: 'Black Friday',
          status: 'PAUSED',
          effectiveStatus: 'PAUSED',
          dailyBudget: null,
          lifetimeBudget: null,
        },
      ],
    });
    const section = screen.getByTestId('scale-campaigns-table');
    expect(section.getAttribute('data-state')).toBe('ready');
    expect(section.className).not.toContain('border');
    expect(screen.getByRole('heading', { name: '2 campaigns' })).toBeTruthy();
    expect(section.textContent).toContain('1 paused');
    expect(screen.getByTestId('scale-campaigns-cache-age').textContent).toBe('Live');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('renders each campaign as a hairline row with its budget and a text action', () => {
    renderWith({
      fetchedAt: null,
      rows: [
        {
          id: 'c1',
          name: 'Leads',
          status: 'ACTIVE',
          effectiveStatus: 'ACTIVE',
          dailyBudget: '180000',
          lifetimeBudget: null,
        },
        {
          id: 'c2',
          name: 'Black Friday',
          status: 'PAUSED',
          effectiveStatus: 'PAUSED',
          dailyBudget: null,
          lifetimeBudget: null,
        },
      ],
    });
    const [active, paused] = screen.getAllByTestId('scale-campaign-row');
    expect(active.getAttribute('data-status')).toBe('ACTIVE');
    expect(active.textContent).toContain('$1,800');
    const pause = within(active).getByTestId('scale-row-pause');
    expect(pause.textContent).toBe('Pause');
    expect(pause.getAttribute('aria-label')).toBe('Pause campaign Leads');
    expect(within(paused).getByTestId('scale-row-unpause').textContent).toBe('Unpause');
    expect(within(active).getByRole('button', { name: 'Show ad sets' })).toBeTruthy();
  });

  it('shows the empty copy as quiet text', () => {
    renderWith({ fetchedAt: null, rows: [] });
    expect(screen.getByTestId('scale-campaigns-table').getAttribute('data-state')).toBe('empty');
    expect(screen.getByText('No active or paused campaigns')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
