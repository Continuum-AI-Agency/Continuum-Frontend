import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ScaleEntityPage, type ScaleEntityRow, scaleEntitiesKey } from './campaignsClient';

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

  // PP-L1V-cls-overview-0.865 (Campaigns 0.26 at 375): the status filter arrived with the first
  // page and wrapped the header onto a second line, pushing the table down.
  it('holds the status filter row open while the first page loads, as bars, not controls', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CampaignsTab brandId={scope.brandId} adAccountId={scope.adAccountId} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('scale-campaigns-table').getAttribute('data-state')).toBe('loading');
    const held = screen.getByTestId('scale-campaigns-filter-skeleton');
    expect(held.getAttribute('aria-hidden')).toBe('true');
    expect(held.querySelectorAll('button')).toHaveLength(0);
    expect(held.querySelectorAll('[data-slot="skeleton-text"]')).toHaveLength(4);
  });

  it('shows the empty copy as quiet text', () => {
    renderWith({ fetchedAt: null, rows: [] });
    expect(screen.getByTestId('scale-campaigns-table').getAttribute('data-state')).toBe('empty');
    expect(screen.getByText('No active or paused campaigns')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists active and paused by default, with a quiet status filter that counts each', () => {
    renderWith({
      fetchedAt: null,
      rows: [
        campaign({ id: 'c1', status: 'ACTIVE', dailyBudget: '1000' }),
        campaign({ id: 'c2', status: 'PAUSED' }),
        campaign({ id: 'c3', status: 'ARCHIVED' }),
      ],
    });
    expect(screen.getAllByTestId('scale-campaign-row')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '2 campaigns' })).toBeTruthy();
    const filter = screen.getByTestId('scale-campaigns-filter');
    const archived = within(filter).getByRole('button', { name: 'Archived 1' });
    expect(archived.getAttribute('aria-pressed')).toBe('false');
    const active = within(filter).getByRole('button', { name: 'Active 1' });
    expect(active.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(filter).getByRole('button', { name: 'All 3' }));
    expect(screen.getAllByTestId('scale-campaign-row')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: '3 campaigns' })).toBeTruthy();

    fireEvent.click(within(filter).getByRole('button', { name: 'Paused 1' }));
    fireEvent.click(within(filter).getByRole('button', { name: 'Archived 1' }));
    expect(screen.getAllByTestId('scale-campaign-row')).toHaveLength(1);
    expect(screen.getByTestId('scale-campaigns-table').textContent).not.toContain('paused');
  });

  it('grows each status filter button to a 24px target invisibly, the 19px pill as drawn', () => {
    // PP-L1V tap-target: the status pills paint at py-0.5 text-xs (19px).
    renderWith({ fetchedAt: null, rows: [campaign({ id: 'c1', status: 'ACTIVE' })] });
    const buttons = within(screen.getByTestId('scale-campaigns-filter')).getAllByRole('button');
    expect(buttons.length).toBe(4);
    for (const button of buttons) {
      const classes = button.className.split(' ');
      expect(classes).toContain('hit-area');
      expect(classes).toContain('py-0.5');
    }
  });

  it("sums an active ABO campaign's ad-set budgets and marks a paused one as on its ad sets", () => {
    queryClient.setQueryData(scaleEntitiesKey('adset', scope, 'abo'), {
      fetchedAt: null,
      rows: [
        campaign({ id: 'a1', dailyBudget: '2719', lifetimeBudget: '0' }),
        campaign({ id: 'a2', dailyBudget: '2067', lifetimeBudget: '0' }),
        campaign({ id: 'a3', status: 'PAUSED', dailyBudget: '3347' }),
      ],
    } satisfies ScaleEntityPage);
    renderWith({
      fetchedAt: null,
      rows: [
        campaign({ id: 'abo', status: 'ACTIVE' }),
        campaign({ id: 'abo-paused', status: 'PAUSED' }),
        campaign({ id: 'life', status: 'PAUSED', lifetimeBudget: '24000' }),
      ],
    });
    const [active, paused, lifetime] = screen.getAllByTestId('scale-campaign-row');
    expect(active.textContent).toContain('$47.86');
    expect(active.textContent).toContain('ad sets');
    expect(paused.textContent).toContain('ad sets');
    expect(paused.textContent).not.toContain('—');
    expect(lifetime.textContent).toContain('$240');
    expect(lifetime.textContent).toContain('lifetime');
  });
});

function campaign(over: Partial<ScaleEntityRow> & { id: string }): ScaleEntityRow {
  return {
    name: over.id,
    status: 'ACTIVE',
    effectiveStatus: null,
    dailyBudget: null,
    lifetimeBudget: null,
    ...over,
  };
}
